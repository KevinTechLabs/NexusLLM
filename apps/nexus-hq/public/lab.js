// Nexus HQ · homelab awareness, phone notifications, faster replies and chat renaming.
// Loaded after app.js (uses its globals: D, $, esc, conLine, conOpen, dispatch, session, ...).

// ---------- homelab ----------
const LAB_WORDS = /\b(home ?lab|my lab|the lab|servers?|machines?|devices?|pi-?hole|raspberry|containers?|docker|alerts?|sentinel|soc|siem|firewall|pfsense|wazuh|uptime|offline|online|(is )?(anything|something|everything) (down|ok|okay|running|broken)|power (use|usage|draw)|energy|watts?|kwh|electric(ity)?|temps?|temperature|vram|gpu|cpu|ram|disk space|storage|nexuslab|blocked|attacks?|threats?)\b/i;
function labAsk(q) { return LAB_WORDS.test(q); }

async function labContext() {
  try {
    const j = await jfetch("/api/homelab/context");
    if (!j.text) return "";
    D.homelab = j.chip; renderChrome();
    conLine(`🖥 using live data from your lab <span class="dim">(${j.chip.up}/${j.chip.machines} machines up · ${j.chip.alerts} open alert${j.chip.alerts === 1 ? "" : "s"})</span>`, "sys dim");
    return `Live data from the user's own homelab, fetched just now. Answer from it, be specific (name the machine, container or alert ID), and say plainly if something looks wrong. You can't run commands yourself; if a container needs restarting, tell the user they can say e.g. "restart pihole" and Nexus HQ will ask them to confirm.\n\n${j.text}\n\n`;
  } catch (e) { conLine(`<span class="dim">couldn't reach the lab: ${esc(e.message)}</span>`, "sys"); return ""; }
}

function labChip(h) {
  if (!h?.configured) return "";
  const nl = h.machines > 0, bad = (h.offline?.length || 0) > 0 || h.critical > 0, warn = h.high > 0;
  const parts = [nl ? `${h.up}/${h.machines} up` : null, h.alerts != null ? `${h.alerts} alert${h.alerts === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  const tip = bad ? `${h.offline?.length ? `Offline: ${h.offline.join(", ")}. ` : ""}${h.critical ? `${h.critical} critical alert(s).` : ""} Tap for details.` : "Your lab. Tap for a quick status, or just ask \"is anything down?\"";
  return `<button class="mchip lab ${bad ? "off" : ""}" data-lab title="${esc(tip)}"><span class="d" style="${warn && !bad ? "background:#f5b84c" : ""}"></span>Lab <span class="m">${esc(parts || "connecting…")}</span></button>`;
}

// "restart pihole", "stop the jellyfin container", "ack alert A-1043", "/lab"
async function labCommand(q) {
  const t = q.trim();
  if (/^\/lab\b|^(lab|homelab) status$/i.test(t)) { await labStatus(); return true; }
  const c = t.match(/^(?:please\s+)?(restart|reboot|stop|start)\s+(?:the\s+)?([\w.-]+)(?:\s+container)?(?:\s+on\s+(?:the\s+)?([\w .-]+))?[.!]?$/i);
  if (c) {
    let list = [];
    try { list = (await jfetch("/api/homelab/context")).containers || []; } catch { return false; }
    const want = c[2].toLowerCase(), on = (c[3] || "").toLowerCase().trim();
    let hits = list.filter((x) => x.name.toLowerCase() === want);
    if (!hits.length) hits = list.filter((x) => x.name.toLowerCase().includes(want));
    if (on) hits = hits.filter((x) => x.deviceName.toLowerCase().includes(on) || x.device.toLowerCase() === on);
    if (!hits.length) return false; // not a container; let the agents handle it
    const action = c[1].toLowerCase() === "reboot" ? "restart" : c[1].toLowerCase();
    if (hits.length > 1) { conLine(`More than one match: ${hits.map((h) => `<b>${esc(h.name)}</b> on ${esc(h.deviceName)}`).join(", ")}. Say e.g. <b>${esc(action)} ${esc(hits[0].name)} on ${esc(hits[0].deviceName)}</b>.`, "sys"); return true; }
    const h = hits[0];
    if (!h.control) { conLine(`<b>${esc(h.name)}</b> on ${esc(h.deviceName)} is view-only in NexusLab (Docker control is off for that machine), so I can't ${esc(action)} it from here.`, "sys"); return true; }
    labConfirm(`${action[0].toUpperCase() + action.slice(1)} <b>${esc(h.name)}</b> on <b>${esc(h.deviceName)}</b>? <span class="dim">(it's ${esc(h.status)} now)</span>`, { kind: "container", device: h.device, name: h.name, action });
    return true;
  }
  const a = t.match(/^(?:please\s+)?(ack|acknowledge|close|resolve|escalate|reopen)\s+(?:the\s+)?(?:alert\s+)?#?([A-Za-z]*-?\d[\w-]*)[.!]?$/i);
  if (a) {
    const action = { acknowledge: "ack", resolve: "close" }[a[1].toLowerCase()] || a[1].toLowerCase();
    labConfirm(`${{ ack: "Acknowledge", close: "Close", escalate: "Escalate", reopen: "Reopen" }[action]} alert <b>${esc(a[2])}</b> in Sentinel?`, { kind: "alert", id: a[2], action });
    return true;
  }
  return false;
}
function labConfirm(html, act) {
  conLine(`⚠ ${html}<span class="lab-act"><button class="btn-sm go" data-labgo='${esc(JSON.stringify(act))}'>Yes, do it</button><button class="btn-sm" data-labno>Cancel</button></span>`, "sys");
}
async function labStatus() {
  try {
    const j = await jfetch("/api/homelab?fresh");
    D.homelab = j; renderChrome();
    const lines = [];
    if (j.machines) lines.push(`🖥 <b>${j.up}/${j.machines}</b> machines online${j.offline?.length ? ` · <span class="err">offline: ${j.offline.map(esc).join(", ")}</span>` : ""}`);
    if (j.alerts != null) lines.push(`🛡 <b>${j.alerts}</b> open alert${j.alerts === 1 ? "" : "s"}${j.critical ? ` · <span class="err">${j.critical} critical</span>` : ""}${j.high ? ` · ${j.high} high` : ""}`);
    for (const [k, v] of Object.entries(j.errors || {})) if (v) lines.push(`<span class="err">${esc(k)}: ${esc(v)}</span>`);
    conLine(`${lines.join("<br>") || "No lab data yet."}<br><span class="dim">Ask things like "is anything down?", "how hot is the GPU?", "any new alerts?", or "restart pihole".</span>`, "sys");
  } catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); }
}
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-lab]")) { conOpen(true); addItem({ k: "cmd", text: "/lab" }); await labStatus(); return saveSession(); }
  const no = e.target.closest("[data-labno]");
  if (no) { no.parentElement.innerHTML = `<span class="dim">cancelled</span>`; return; }
  const go = e.target.closest("[data-labgo]");
  if (!go) return;
  const act = JSON.parse(go.dataset.labgo), box = go.parentElement;
  box.innerHTML = `<span class="dim">working…</span>`;
  try {
    const r = await jfetch("/api/homelab/action", { method: "POST", body: JSON.stringify(act) });
    box.innerHTML = `<span class="ok">✓ done</span>`;
    conLine(act.kind === "container" ? `✓ ${esc(act.action)} sent to <b>${esc(act.name)}</b>${r.status ? ` · now ${esc(r.status)}` : ""}` : `✓ alert <b>${esc(act.id)}</b> ${esc({ ack: "acknowledged", close: "closed", escalate: "escalated", reopen: "reopened" }[act.action])}`, "sys ok");
    if (typeof rememberTurn === "function") rememberTurn(`${act.action} ${act.name || act.id}`, "Done.");
  } catch (err) { box.innerHTML = `<span class="err">✕ ${esc(err.message)}</span>`; }
  saveSession();
});
setInterval(async () => {
  if (!D?.homelab?.configured || document.hidden) return;
  try { D.homelab = await jfetch("/api/homelab"); renderChrome(); } catch {}
}, 60e3);

// ---------- phone notifications ----------
const pushState = () => { try { return localStorage.getItem("hq.push") === "on"; } catch { return false; } };
const isiOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function bellChip() {
  if (!D?.push?.enabled) return "";
  const on = pushState() && "Notification" in window && Notification.permission === "granted";
  return `<button class="mchip bell ${on ? "" : "off"}" data-bell title="${on ? "Notifications are on: finished answers while you're away, new critical/high alerts, machines going offline. Tap to turn off." : "Tap to get notifications on this device."}"><span class="d"></span>🔔 Notify <span class="m">${on ? "on" : "off"}</span></button>`;
}
function b64uToBytes(s) { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
async function swReg() { return navigator.serviceWorker.register("/sw.js"); }
async function toggleNotify() {
  conOpen(true);
  if (!window.isSecureContext) {
    return conLine(`🔔 Notifications need the secure (https) address. On the Nexus HQ PC run <b>sudo tailscale serve --bg 3100</b>, then open <b>https://nexus-ai.&lt;your-tailnet&gt;.ts.net</b>${isiOS ? ", tap Share → Add to Home Screen, and open Nexus HQ from that icon" : ""}.`, "sys");
  }
  if (isiOS && !standalone) return conLine(`🔔 On iPhone, notifications only work from the Home Screen app: tap <b>Share → Add to Home Screen</b>, open Nexus HQ from that icon, then tap <b>🔔 Notify</b> again.`, "sys");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return conLine("🔔 This browser can't receive notifications.", "sys");
  try {
    const reg = await swReg();
    let sub = await reg.pushManager.getSubscription();
    if (pushState() && sub && Notification.permission === "granted") {
      await jfetch("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe(); try { localStorage.setItem("hq.push", "off"); } catch {}
      renderChrome(); return conLine("🔕 Notifications are off on this device.", "sys");
    }
    if ((await Notification.requestPermission()) !== "granted") return conLine("🔔 Notifications were blocked. Allow them in Settings → Notifications → Nexus HQ, then try again.", "sys");
    const { key } = await jfetch("/api/push/key");
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
    const label = isiOS ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : /Mac/.test(navigator.userAgent) ? "Mac" : /Windows/.test(navigator.userAgent) ? "Windows PC" : "Browser";
    const r = await jfetch("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON(), label }) });
    try { localStorage.setItem("hq.push", "on"); } catch {}
    D.push.devices = r.devices; renderChrome();
    await jfetch("/api/push/test", { method: "POST" });
    conLine(`🔔 Notifications are on (${r.devices} device${r.devices === 1 ? "" : "s"}). You'll get one when an answer finishes while you're away, when a critical or high alert comes in, and when a machine goes offline. A test one is on its way.`, "sys ok");
  } catch (e) { conLine(`<span class="err">Couldn't turn on notifications: ${esc(e.message)}</span>`, "sys"); }
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-bell]")) toggleNotify(); });
// Tell the server whether you're looking at Nexus HQ, so it only notifies when you're not
function presence() {
  fetch("/api/push/presence", { method: "POST", headers: headers(), keepalive: true, body: JSON.stringify({ cid: clientId, visible: !document.hidden }) }).catch(() => {});
}
document.addEventListener("visibilitychange", presence);
addEventListener("pagehide", () => { fetch("/api/push/presence", { method: "POST", headers: headers(), keepalive: true, body: JSON.stringify({ cid: clientId, visible: false }) }).catch(() => {}); });
presence();
if ("serviceWorker" in navigator && window.isSecureContext && pushState()) swReg().catch(() => {});

// ---------- faster replies ----------
// Start loading the model while you're still typing, so it's ready by the time you hit send
const warmed = {};
let warmT = null;
function prewarm() {
  clearTimeout(warmT);
  warmT = setTimeout(() => {
    const v = $("#conInput").value;
    const id = typeof looksLikeCode === "function" && looksLikeCode(v) ? "qwencoder" : "gemma";
    if (!D?.models?.some((m) => m.id === id && m.ready && m.provider === "ollama")) return;
    if (Date.now() - (warmed[id] || 0) < 120e3) return;
    warmed[id] = Date.now();
    fetch("/api/warm", { method: "POST", headers: headers(), body: JSON.stringify({ model: id }) }).catch(() => {});
  }, 500);
}
$("#conInput").addEventListener("focus", prewarm);
$("#conInput").addEventListener("input", prewarm);
// Say so when a model has to load into GPU memory first (that's why some answers start slowly)
async function loadingNotice(modelId) {
  const m = idx.model[modelId];
  if (!m || m.provider !== "ollama") return;
  try {
    const { loaded } = await (await fetch("/api/models/loaded", { headers: headers() })).json();
    if (loaded.length && !loaded.some((n) => n === m.model || n === `${m.model}:latest`)) conLine(`⏳ loading ${esc(m.label)} into GPU memory first, so this answer takes a few extra seconds`, "sys dim");
  } catch {}
}

// ---------- rename chats ----------
async function renameChat(id, name) {
  const cur = id === session.id ? session.title : sessionList.find((s) => s.id === id)?.title || "";
  name = (name ?? prompt("Rename this chat", cur === "New chat" ? "" : cur))?.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name || name === cur) return;
  try {
    if (id === session.id) {
      session.title = name; session.renamed = true;
      $("#conTitle").textContent = name;
      conLine(`✎ renamed to <b>${esc(name)}</b>`, "sys dim");
      await saveSession();
    } else {
      const s = await api("GET", `/api/sessions/${id}`);
      s.title = name; s.renamed = true;
      await api("PUT", `/api/sessions/${id}`, s);
    }
    if (!$("#conDrawer").hidden) refreshList();
  } catch (e) { conLine(`<span class="err">Couldn't rename: ${esc(e.message)}</span>`, "sys"); }
}
$("#conTitle").addEventListener("click", () => { if (session.items.length) renameChat(session.id); });
$("#conTitle").title = "Tap to rename this chat";
