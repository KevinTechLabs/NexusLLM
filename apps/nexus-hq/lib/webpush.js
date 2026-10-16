// Web Push for Nexus HQ (iPhone home-screen app, Chrome, Firefox): VAPID (RFC 8292) + aes128gcm
// message encryption (RFC 8291 / RFC 8188), using only Node's built-in crypto.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// RFC 8291: encrypt one push message for a subscription's p256dh + auth keys
function encrypt(payload, p256dh, authSecret, { salt = crypto.randomBytes(16), asKeys = null } = {}) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  const ecdh = crypto.createECDH("prime256v1");
  if (asKeys) ecdh.setPrivateKey(asKeys.privateKey); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last record, no padding
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

function makePush({ dataDir, subject = "mailto:nexus-hq@localhost", log = () => {} }) {
  const keyFile = path.join(dataDir, "vapid.json"), subFile = path.join(dataDir, "push-subscriptions.json");
  fs.mkdirSync(dataDir, { recursive: true });
  let vapid;
  try { vapid = JSON.parse(fs.readFileSync(keyFile, "utf8")); } catch {}
  if (!vapid?.publicKey) {
    const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
    vapid = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
    fs.writeFileSync(keyFile, JSON.stringify(vapid), { mode: 0o600 });
  }
  // the private key as a KeyObject for ES256 signing
  const pub = unb64u(vapid.publicKey);
  const signKey = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });

  let subs = [];
  try { subs = JSON.parse(fs.readFileSync(subFile, "utf8")); } catch {}
  const saveSubs = () => fs.writeFileSync(subFile, JSON.stringify(subs, null, 2), { mode: 0o600 });

  function jwt(audience) {
    const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
    const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
    const sig = crypto.sign("sha256", Buffer.from(`${head}.${claims}`), { key: signKey, dsaEncoding: "ieee-p1363" });
    return `${head}.${claims}.${b64u(sig)}`;
  }

  async function sendOne(sub, message, urgency = "normal") {
    const body = encrypt(JSON.stringify(message), sub.keys.p256dh, sub.keys.auth);
    const aud = new URL(sub.endpoint).origin;
    const r = await fetch(sub.endpoint, {
      method: "POST", body, signal: AbortSignal.timeout(15000),
      headers: { TTL: "86400", Urgency: urgency, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: `vapid t=${jwt(aud)}, k=${vapid.publicKey}` },
    });
    if (r.status === 404 || r.status === 410) return "gone";
    if (!r.ok) throw new Error(`push service ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return "sent";
  }

  // Send to every subscribed device. message: { title, body, url, tag }
  async function send(message, { urgency = "normal" } = {}) {
    if (!subs.length) return { sent: 0 };
    let sent = 0, removed = 0;
    await Promise.all(subs.map(async (s) => {
      try { const r = await sendOne(s, message, urgency); if (r === "gone") { s.gone = true; removed++; } else sent++; }
      catch (e) { log(`push to ${new URL(s.endpoint).host} failed: ${e.message}`); }
    }));
    if (removed) { subs = subs.filter((s) => !s.gone); saveSubs(); }
    return { sent, removed };
  }

  function subscribe(sub, label) {
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("That isn't a valid push subscription");
    subs = subs.filter((s) => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, label: String(label || "").slice(0, 60), at: new Date().toISOString() });
    saveSubs();
  }
  function unsubscribe(endpoint) { subs = subs.filter((s) => s.endpoint !== endpoint); saveSubs(); }

  return { publicKey: vapid.publicKey, send, subscribe, unsubscribe, count: () => subs.length, has: (endpoint) => subs.some((s) => s.endpoint === endpoint) };
}

module.exports = { makePush, encrypt, b64u, unb64u };
