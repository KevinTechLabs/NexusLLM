/* Nexus HQ — map of chat and coding agents. Vanilla JS, no build step. */
const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const ICON = {
  agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  dept: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c1-3.2 3.3-5 6-5s5 1.8 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.5.1 4.2 1.8 5 4.3"/></svg>',
  model: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
  task: "",
};
const STATUS = { autonomous: "Fully autonomous", assisted: "Human-assisted", "human-led": "Human-led", building: "In development" };
const RUNG = { autonomous: "auto", assisted: "assisted", "human-led": "led" };

let D = null;                               // org data from the server
const idx = { agent: {}, task: {}, model: {}, dept: {} };
let view = "map";
let panel = null;                           // {kind, id, mode}
const navStack = [];
const chats = store.get("hq.chats", {});
let running = null;

// ---------- data ----------
// Login: a cookie, plus the same token kept here and sent as a header, for phones that block cookies.
let authToken = (() => { try { return localStorage.getItem("hq.token") || ""; } catch { return ""; } })();
function setToken(t) { authToken = t || ""; try { t ? localStorage.setItem("hq.token", t) : localStorage.removeItem("hq.token"); } catch {} }
function headers() {
  const h = { "Content-Type": "application/json" };
  if (authToken) h["x-nhq-token"] = authToken;
  return h;
}
async function load() {
  let r;
  try { r = await fetch("/api/agents", { headers: headers() }); }
  catch { return fail("Can't reach the Nexus HQ server."); }
  if (r.status === 401) { await showLogin(); return load(); }
  const j = await r.json();
  if (!r.ok) return fail(j.error || `Server error ${r.status}`);
  D = j;
  for (const k of Object.keys(idx)) idx[k] = {};
  D.models.forEach((m) => (idx.model[m.id] = m));
  D.departments.forEach((d) => (idx.dept[d.id] = d));
  D.agents.forEach((a) => (idx.agent[a.id] = a));
  D.tasks.forEach((t) => (idx.task[t.id] = t));
  renderChrome();
  renderView();
}
function fail(msg) {
  $("#stage").innerHTML = `<div class="stage-title" style="top:40%;white-space:normal;text-align:center;width:90%;color:var(--bad)">${esc(msg)}</div>`;
}
// ---------- login ----------
function loginLine(text, cls = "") {
  const d = document.createElement("div");
  d.className = `ll ${cls}`; d.textContent = text;
  $("#loginLog").append(d);
  while ($("#loginLog").children.length > 4) $("#loginLog").firstChild.remove();
}
function showLogin() {
  const el = $("#login");
  if (!el.hidden) return el._wait;
  el.hidden = false;
  document.body.classList.add("locked");
  el.querySelector("canvas.core")?.remove();
  const W = el.clientWidth || innerWidth, top = $(".login-card").getBoundingClientRect().top;
  const r = Math.max(70, Math.min(W * 0.36, 190, top * 0.75));
  addCore(el, W / 2, Math.max(r * 0.8, top - r * 0.2), r, "#ff5d73");
  $("#loginLog").innerHTML = "";
  loginLine("› secure uplink established");
  loginLine("› authentication required", "dim");
  setTimeout(() => $("#loginPw").focus(), 60);
  el._wait = new Promise((resolve) => (el._resolve = resolve));
  return el._wait;
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#loginPw").value, btn = $("#loginBtn"), card = $(".login-card");
  if (!pw.trim()) return;
  btn.disabled = true; btn.textContent = "Verifying…";
  loginLine("› verifying access key…", "dim");
  let ok = false;
  try {
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    ok = r.ok;
    if (ok) { const j = await r.json().catch(() => ({})); if (j.token) setToken(j.token); }
  } catch { loginLine("› can't reach Nexus HQ", "bad"); }
  btn.disabled = false; btn.textContent = "Authenticate";
  if (!ok) {
    loginLine("› access denied: wrong key", "bad");
    $("#loginPw").value = ""; $("#loginPw").focus();
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    return;
  }
  loginLine("› ACCESS GRANTED", "good");
  const el = $("#login");
  el.classList.add("granted");
  setTimeout(() => {
    el.hidden = true; el.classList.remove("granted");
    document.body.classList.remove("locked");
    $("#loginPw").value = "";
    el._resolve?.();
  }, 650);
});
async function ensureAuth() {
  try {
    const j = await (await fetch("/api/auth", { cache: "no-store", headers: headers() })).json();
    $("#logoutBtn").hidden = !j.required;
    if (j.required && !j.ok) await showLogin();
  } catch {}
}
async function logout() {
  if (con?.busy) con.ac?.abort();
  try { await fetch("/api/logout", { method: "POST" }); } catch {}
  setToken("");
  location.reload();
}
$("#logoutBtn").addEventListener("click", () => { if (confirm("Log out of Nexus HQ on this device?")) logout(); });
const deptColor = (id) => idx.dept[id]?.color || "#fff";
// The model an agent will actually use: its own, or its fallback when that one isn't available
// (no API key yet, or over today's budget).
function effModelId(agent) {
  const m = idx.model[agent?.model];
  if (m && m.ready && !m.overBudget && m.enabled !== false) return agent.model;
  if (agent?.fallback && idx.model[agent.fallback]) return agent.fallback;
  return agent?.model;
}
const isLean = (agent) => !!idx.model[effModelId(agent)]?.budgeted; // paid model: send it less
const modelOf = (agent) => idx.model[effModelId(agent)] || { id: agent?.model, label: agent?.model || "?", model: "unknown", ready: false, note: `Unknown model "${agent?.model}" in agents.json`, color: "#888" };
const agentsIn = (dept) => D.agents.filter((a) => a.dept === dept);
const tasksIn = (dept) => {
  const order = agentsIn(dept).map((a) => a.id);
  return D.tasks.filter((t) => t.dept === dept).sort((a, b) => order.indexOf(a.agent) - order.indexOf(b.agent));
};

// ---------- chrome ----------
function renderChrome() {
  const online = D.models.filter((m) => m.ready).length;
  const auto = D.tasks.filter((t) => t.status === "autonomous").length;
  $("#stats").innerHTML = [
    [D.agents.length, "agents"], [D.tasks.length, "tasks"], [auto, "autonomous"], [`${online}/${D.models.length}`, "models online"],
  ].map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
  $("#models").innerHTML = D.models.map((m) =>
    `<button class="mchip ${m.ready && !m.overBudget && m.enabled !== false ? "" : "off"}" data-open="model:${m.id}" title="${esc(m.ready && !m.overBudget && m.enabled !== false ? "Ready" : m.note)}"><span class="d"></span>${esc(m.label)} <span class="m">${m.enabled === false ? "off" : esc(m.model)}</span></button>`
  ).join("") + (D.spend && D.models.some((m) => m.budgeted && m.enabled !== false) ? spendChip(D.spend) : "") + ghChip(D.github) + (window.labChip?.(D.homelab) || "") + (window.bellChip?.() || "");
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
}

function spendChip(sp) {
  const parts = [];
  if (sp.monthly != null) parts.push(`month <b>$${sp.month.toFixed(2)}</b> <span class="m">/ $${sp.monthly.toFixed(2)}</span>`);
  if (sp.daily != null) parts.push(`today <b>$${sp.today.toFixed(2)}</b> <span class="m">/ $${sp.daily.toFixed(2)}</span>`);
  if (!parts.length) parts.push(`today <b>$${sp.today.toFixed(2)}</b> <span class="m">(no limit)</span>`);
  return `<span class="mchip spend ${spendOver(sp) ? "off" : ""}" title="What Opus has cost. At the limit it stops and local models stand in until it resets.">Opus ${parts.join(" · ")}</span>`;
}
function ghChip(g) {
  if (!g?.enabled) return "";
  const days = g.expires ? Math.ceil((new Date(g.expires) - Date.now()) / 864e5) : null;
  const bad = !!g.error || (days != null && days <= 0), warn = days != null && days <= 14;
  const tip = g.error ? `GitHub problem: ${g.error}. Make a new token and put it in .env.` : warn ? `Your GitHub token expires in ${days} day(s). Make a new one and put it in .env.` : "GitHub is connected. Just ask, e.g. \"read my NexusLLM repo\" or \"add a FAQ to my NexusLLM repo\".";
  return `<span class="mchip ${bad ? "off" : ""}" title="${esc(tip)}"><span class="d" style="${warn && !bad ? "background:#f5b84c" : ""}"></span>GitHub <span class="m">${esc(g.login || "connecting…")}${warn && !bad ? ` · token ${days}d left` : ""}${bad ? " · reconnect" : ""}</span></span>`;
}
function spendOver(sp) { return (sp.monthly != null && sp.month >= sp.monthly) || (sp.daily != null && sp.today >= sp.daily); }
async function toggleModel(id, want) {
  const mo = idx.model[id]; if (!mo?.switchable) return false;
  const enabled = want ?? mo.enabled === false;
  const r = await fetch(`/api/models/${id}/enabled`, { method: "POST", headers: headers(), body: JSON.stringify({ enabled }) });
  if (!r.ok) return false;
  await load();                    // re-read models so every agent picks its model again
  if (panel?.kind === "model") renderPanel();
  return enabled;
}
function updateSpend(ev) {
  if (!D) return;
  D.spend = { ...(D.spend || {}), today: ev.today, month: ev.month, daily: ev.daily, monthly: ev.monthly };
  const m = D.models.find((x) => x.budgeted);
  if (m) m.overBudget = spendOver(D.spend);
  renderChrome();
}

// ---------- particle core ----------
const cores = [];
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function addCore(stage, x, y, r, color) {
  if (!(r > 4)) return;
  const c = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.className = "core";
  c.width = c.height = Math.round(r * 2 * dpr);
  Object.assign(c.style, { left: `${x - r}px`, top: `${y - r}px`, width: `${r * 2}px`, height: `${r * 2}px` });
  stage.append(c);
  const N = r > 70 ? 240 : 120, pts = [];
  for (let i = 0; i < N; i++) {                              // fibonacci sphere, slightly jittered
    const yy = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - yy * yy), th = i * 2.399963;
    const j = 0.85 + Math.random() * 0.15;
    pts.push([Math.cos(th) * rad * j, yy * j, Math.sin(th) * rad * j]);
  }
  const pairs = [], thr = N > 200 ? 0.24 : 0.34;
  for (let i = 0; i < N; i++) for (let k = i + 1; k < N; k++) {
    const dx = pts[i][0] - pts[k][0], dy = pts[i][1] - pts[k][1], dz = pts[i][2] - pts[k][2];
    if (dx * dx + dy * dy + dz * dz < thr * thr) pairs.push(i, k);
  }
  const core = { c, ctx: c.getContext("2d"), r, dpr, pts, pairs, color, proj: new Float32Array(N * 3) };
  cores.push(core);
  drawCore(core, 0);
}
function drawCore(o, t) {
  const { ctx, r, dpr, pts, pairs, proj, color } = o;
  const a = t * 0.00018, ca = Math.cos(a), sa = Math.sin(a), tilt = 0.4, ct = Math.cos(tilt), st = Math.sin(tilt);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r * 2, r * 2);
  const R = r * 0.86;
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
    const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
    proj[i * 3] = r + x1 * R; proj[i * 3 + 1] = r + y2 * R; proj[i * 3 + 2] = (z2 + 1) / 2;
  }
  ctx.lineWidth = 0.6;
  for (let p = 0; p < pairs.length; p += 2) {
    const i = pairs[p] * 3, k = pairs[p + 1] * 3, d = (proj[i + 2] + proj[k + 2]) / 2;
    ctx.strokeStyle = hexA(color, 0.05 + d * 0.3);
    ctx.beginPath(); ctx.moveTo(proj[i], proj[i + 1]); ctx.lineTo(proj[k], proj[k + 1]); ctx.stroke();
  }
  for (let i = 0; i < pts.length; i++) {
    const d = proj[i * 3 + 2];
    ctx.fillStyle = hexA(color, 0.25 + d * 0.75);
    ctx.beginPath(); ctx.arc(proj[i * 3], proj[i * 3 + 1], 0.6 + d * 1.1, 0, 6.283); ctx.fill();
  }
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, hexA(color, 0.14)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, r * 2, r * 2);
}
let phase = 0, lastT = 0, boost = 1;
function tick(t) {
  const dt = lastT ? Math.min(t - lastT, 50) : 16; lastT = t;
  boost += ((con.busy ? 6 : 1) - boost) * 0.04;
  phase += dt * boost;
  if (!document.hidden) for (const o of cores) if (o.c.isConnected) drawCore(o, phase);
  requestAnimationFrame(tick);
}
if (!reduceMotion) requestAnimationFrame(tick);

// ---------- stage helpers ----------
function node(stage, { kind, id, x, y, color, label, sub, cls = "" }) {
  const b = document.createElement("button");
  b.className = `node ${kind} ${cls}`;
  b.dataset.open = `${kind}:${id}`;
  b.style.cssText = `left:${x}px;top:${y}px;--c:${color}`;
  const txt = `<span class="lbl">${esc(label)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}`;
  b.innerHTML = `<span class="orb">${ICON[kind] || ""}</span>${cls.includes("side") ? `<span class="txt">${txt}</span>` : txt}`;
  b.setAttribute("aria-label", `${label}${sub ? ", " + sub : ""}`);
  stage.append(b);
  return b;
}
function edgesSVG(stage) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "edges");
  stage.prepend(svg);
  return (x1, y1, x2, y2, color, { opacity = 0.6, flow = false, curve = 0, keys = [] } = {}) => {
    const p = document.createElementNS(svg.namespaceURI, "path");
    let d;
    if (curve === "v") { const my = (y1 + y2) / 2; d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`; }
    else if (curve === "h") { const mx = (x1 + x2) / 2; d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`; }
    else d = `M${x1},${y1} L${x2},${y2}`;
    p.setAttribute("d", d);
    p.setAttribute("class", `edge${flow ? " flow" : ""}`);
    p.setAttribute("stroke", color);
    p.setAttribute("stroke-opacity", opacity);
    if (keys.length) p.dataset.keys = keys.join(" ");
    svg.append(p);
  };
}
function markSelected() {
  document.querySelectorAll(".node.sel").forEach((n) => n.classList.remove("sel"));
  if (panel) document.querySelectorAll(`.node[data-open="${panel.kind}:${panel.id}"]`).forEach((n) => n.classList.add("sel"));
  applyHot();
}

// ---------- views ----------
function renderView() {
  if (!D) return;
  cores.length = 0;
  const vp = $("#viewport"), stage = $("#stage");
  stage.innerHTML = "";
  stage.style.width = stage.style.height = "";
  const W = vp.clientWidth, H = vp.clientHeight;
  if (W < 60 || H < 60) return; // map is hidden (e.g. full-screen console); draw it when it comes back
  if (view === "vault") { $("#deptSwitch").hidden = true; return renderVault(stage); }
  if (view === "photos") { $("#deptSwitch").hidden = true; return renderPhotos(stage); }
  if (view === "map") renderMap(stage, W, H); else renderTree(stage, view, W, H);
  $("#deptSwitch").hidden = view === "map";
  if (view !== "map") $("#deptName").textContent = idx.dept[view]?.name || view;
  markSelected();
}

function renderMap(stage, W, H) {
  // Phones get a tall layout: Chat on top, Coding below, agents spread around an oval; the map scrolls.
  const portrait = W < 620 || W < H * 0.95;
  let rx, ry, cx = W / 2, cy, SH = H;
  if (portrait) {
    rx = Math.min(W * 0.34, W / 2 - 62);
    ry = Math.max(rx * 1.7, (H - 290) / 2, 200);
    cy = 70 + ry + 100;
    SH = Math.max(H, cy + ry + 100 + 120);
  } else {
    rx = ry = Math.min(W, H) * 0.29;
    cy = H / 2 + 8;
  }
  stage.style.height = `${SH}px`;
  const add = edgesSVG(stage);
  addCore(stage, cx, cy, Math.min(rx * 0.62, ry * 0.5), "#ff5d73");
  const depts = D.departments, n = depts.length;
  const base = portrait ? -90 : 180;
  const span = Math.min(portrait ? 172 : 150, 360 / n - (portrait ? 8 : 30));
  const onRing = (ang, k = 1) => [cx + Math.cos(ang) * rx * k, cy + Math.sin(ang) * ry * k];
  depts.forEach((d, i) => {
    const mid = base + (i * 360) / n;
    const ags = agentsIn(d.id);
    const dr = (mid * Math.PI) / 180;
    const dx = cx + Math.cos(dr) * rx * 1.6, dy = portrait ? cy + Math.sin(dr) * (ry + 100) : cy + Math.sin(dr) * ry * 1.6;
    ags.forEach((a, k) => {
      const ang = ((mid - span / 2 + (span * (k + 0.5)) / ags.length) * Math.PI) / 180;
      const [x, y] = onRing(ang), [ix, iy] = onRing(ang, 0.5);
      add(ix, iy, x, y, d.color, { opacity: 0.55, flow: true, keys: [`agent:${a.id}`] });
      add(x, y, dx, dy, d.color, { opacity: 0.35, keys: [`agent:${a.id}`] });
      const ml = modelOf(a).label;
      node(stage, { kind: "agent", id: a.id, x, y, color: d.color, label: a.name, sub: portrait ? ml.replace(/^Qwen3-Coder/, "Coder") : ml, cls: "small" });
    });
    const nt = D.tasks.filter((t) => t.dept === d.id).length;
    const dn = node(stage, { kind: "dept", id: d.id, x: dx, y: dy, color: d.color, label: d.name, sub: `${ags.length} agents · ${nt} tasks` });
    dn.dataset.open = `view:${d.id}`;
  });
  // ring (an oval on phones)
  for (let i = 0; i < 72; i++) {
    const [x1, y1] = onRing((i / 72) * 6.283), [x2, y2] = onRing(((i + 0.5) / 72) * 6.283);
    add(x1, y1, x2, y2, "#6f82a8", { opacity: 0.35 });
  }
  stage.insertAdjacentHTML("beforeend",
    `<div class="stage-title">Organization</div>
     <div class="legend">${D.departments.map((d) => `<span><i style="background:${d.color}"></i>${esc(d.name)}</span>`).join("")}<span>tap a department to open it · tap an agent for details</span></div>`);
}

function renderTree(stage, deptId, W, H) {
  const d = idx.dept[deptId];
  if (!d) { view = "map"; return renderView(); }
  const ags = agentsIn(deptId), tks = tasksIn(deptId);
  const mids = [...new Set(ags.map((a) => effModelId(a)))];
  const portrait = W < H * 0.95 || W < 620;
  const add = edgesSVG(stage);
  const pos = {};

  if (!portrait) {
    const w = Math.max(W, tks.length * 120 + 60), h = Math.max(H, 520);
    stage.style.width = `${w}px`; stage.style.height = `${h}px`;
    const yM = h * 0.14, yA = h * 0.37, yT = h * 0.6, yH = h * 0.84;
    const slot = (w - 60) / tks.length;
    tks.forEach((t, i) => (pos["t" + t.id] = [30 + slot * (i + 0.5), yT]));
    ags.forEach((a, i) => {
      const xs = tks.filter((t) => t.agent === a.id).map((t) => pos["t" + t.id][0]);
      pos["a" + a.id] = [xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : (w * (i + 1)) / (ags.length + 1), yA];
    });
    const avgX = (m) => { const xs = ags.filter((a) => effModelId(a) === m).map((a) => pos["a" + a.id][0]); return xs.reduce((s, v) => s + v, 0) / xs.length; };
    mids.sort((a, b) => avgX(a) - avgX(b));
    const mslot = Math.min(200, (w - 60) / mids.length);
    mids.forEach((m, i) => (pos["m" + m] = [w / 2 - (mslot * mids.length) / 2 + mslot * (i + 0.5), yM]));
    pos.hub = [w / 2, yH];
    addCore(stage, w / 2, yH, Math.min(64, h * 0.1), d.color);
    ags.forEach((a) => { const [x1, y1] = pos["m" + effModelId(a)], [x2, y2] = pos["a" + a.id]; add(x1, y1, x2, y2, modelOf(a).color || "#888", { opacity: 0.5, curve: "v", keys: [`agent:${a.id}`] }); });
    tks.forEach((t) => {
      const [ax, ay] = pos["a" + t.agent] || pos.hub, [tx, ty] = pos["t" + t.id];
      add(ax, ay, tx, ty, d.color, { opacity: 0.75, keys: [`task:${t.id}`] });
      add(tx, ty, pos.hub[0], pos.hub[1] - 18, d.color, { opacity: 0.45, flow: true, keys: [`task:${t.id}`] });
    });
    mids.forEach((m) => { const mo = idx.model[m] || modelOf({ model: m }); node(stage, { kind: "model", id: m, x: pos["m" + m][0], y: pos["m" + m][1], color: mo.color, label: mo.label, sub: mo.ready ? mo.model : "offline", cls: mo.ready ? "" : "off" }); });
    ags.forEach((a) => node(stage, { kind: "agent", id: a.id, x: pos["a" + a.id][0], y: pos["a" + a.id][1], color: d.color, label: a.name, sub: modelOf(a).label }));
    tks.forEach((t) => node(stage, { kind: "task", id: t.id, x: pos["t" + t.id][0], y: pos["t" + t.id][1], color: d.color, label: t.name, cls: t.status === "building" ? "building" : "" }));
  } else {
    const row = 62, top = 60;
    const h = Math.max(H, top + tks.length * row + 250);
    stage.style.height = `${h}px`;
    const xA = 26, xT = Math.round(W * 0.52);
    tks.forEach((t, i) => (pos["t" + t.id] = [xT, top + row * (i + 0.5)]));
    ags.forEach((a) => {
      const ys = tks.filter((t) => t.agent === a.id).map((t) => pos["t" + t.id][1]);
      pos["a" + a.id] = [xA, ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : top];
    });
    const yH = top + tks.length * row + 90;
    pos.hub = [W / 2, yH];
    addCore(stage, W / 2, yH, 58, d.color);
    const agentEl = {};
    ags.forEach((a) => (agentEl[a.id] = node(stage, { kind: "agent", id: a.id, x: pos["a" + a.id][0], y: pos["a" + a.id][1], color: d.color, label: a.name, sub: modelOf(a).label, cls: "side" })));
    tks.forEach((t) => {
      const [ax, ay] = pos["a" + t.agent] || pos.hub, [tx, ty] = pos["t" + t.id];
      const x0 = agentEl[t.agent] ? Math.min(ax + agentEl[t.agent].offsetWidth - 6, tx - 30) : ax;
      add(x0, ay, tx, ty, d.color, { opacity: 0.7, curve: "h", keys: [`task:${t.id}`] });
      add(tx, ty, pos.hub[0], pos.hub[1] - 18, d.color, { opacity: 0.3, flow: true, keys: [`task:${t.id}`] });
    });
    tks.forEach((t) => node(stage, { kind: "task", id: t.id, x: pos["t" + t.id][0], y: pos["t" + t.id][1], color: d.color, label: t.name, cls: `side ${t.status === "building" ? "building" : ""}` }));
  }
  const hub = node(stage, { kind: "dept", id: deptId, x: pos.hub[0], y: pos.hub[1], color: d.color, label: d.name, sub: `${ags.length} agents · ${tks.length} tasks` });
  hub.style.transform = "translate(-50%,-28px)";
  stage.insertAdjacentHTML("beforeend", `<div class="stage-title">${esc(d.name)}</div>`);
}

// ---------- panel ----------
function openPanel(kind, id, mode = "info", push = true) {
  if (kind === "view") return go(id);
  if (running) running.abort();
  if (panel && push && !(panel.kind === kind && panel.id === id && panel.mode === mode)) navStack.push(panel);
  if (!push) navStack.length = 0;
  panel = { kind, id, mode };
  renderPanel();
  $("#panel").classList.add("open");
  $("#panel").setAttribute("aria-hidden", "false");
  markSelected();
}
function closePanel() {
  if (running) running.abort();
  panel = null; navStack.length = 0;
  $("#panel").classList.remove("open");
  $("#panel").setAttribute("aria-hidden", "true");
  markSelected();
}
function back() {
  if (running) running.abort();
  panel = navStack.pop() || null;
  if (!panel) return closePanel();
  renderPanel(); markSelected();
}

function pbar(crumb, extra = "") {
  return `<div class="pbar">${navStack.length ? '<button data-act="back">← Back</button>' : ""}
    <span class="crumb">${crumb}</span>${extra}<button class="x" data-act="close" aria-label="Close">✕</button></div>`;
}
const card = (kind, id, color, title, sub, right = "") =>
  `<button class="card" data-open="${kind}:${id}" style="--c:${color}"><span class="orb">${ICON[kind] || ICON.task}</span><span><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></span>${right ? `<span class="r">${esc(right)}</span>` : ""}</button>`;
const sec = (title, body) => `<div class="sec"><h3>${title}</h3>${body}</div>`;
function readyWarn(models) {
  return models.filter((m) => !m.ready).map((m) => `<div class="warnline">⚠ ${esc(m.label)} isn't ready: ${esc(m.note)}</div>`).join("");
}

function renderPanel() {
  const body = $("#panelBody");
  if (!panel) return;
  const { kind, id, mode } = panel;
  if (mode === "chat") return renderChat(body);

  if (kind === "task") {
    const t = idx.task[id], a = idx.agent[t.agent], d = idx.dept[t.dept], mo = modelOf(a);
    const chainAgents = t.chain ? t.chain.map((s) => idx.agent[s.agent]).filter(Boolean) : [a];
    const chainModels = [...new Set(chainAgents.map(modelOf))];
    const rung = RUNG[t.status];
    body.style.setProperty("--c", d.color);
    body.innerHTML = pbar(`${esc(d.name)} · ${esc(a.name)}`) + `<div class="pscroll">
      <h2 class="ptitle">${esc(t.name)}</h2>
      <div class="psub">${esc(d.name)} · ${t.chain ? `${t.chain.length}-agent pipeline` : `${esc(a.name)} · ${esc(mo.model)}`}</div>
      <span class="badge ${t.status}">${STATUS[t.status] || esc(t.status)}</span>
      <div class="actions">
        <button class="btn primary" data-act="run">▶ Run this ${t.chain ? "pipeline" : "task"}</button>
        <button class="btn" data-act="skill">⤓ Skill file (.md)</button>
      </div>
      ${readyWarn(chainModels)}
      ${t.replaces ? sec("What it replaces", `<div class="box">${esc(t.replaces)}</div>`) : ""}
      ${t.ladder ? sec("The ladder", `<div class="ladder">
        ${[["led", "Human-led"], ["assisted", "Human-assisted"], ["auto", "Fully autonomous"]].map(([k, l]) =>
          `<div class="rung ${rung === k ? "on" : ""}"><b>${l}</b><span>${esc(t.ladder[k])}</span></div>`).join("")}</div>`) : ""}
      ${t.human ? sec("The human", `<div>${esc(t.human)}</div>`) : ""}
      ${t.chain ? sec("The pipeline", `<div class="chain">${t.chain.map((s, i) => {
          const sa = idx.agent[s.agent];
          return `<div class="step"><div class="rail"><i></i><u></u></div><div class="body"><b>${String(i + 1).padStart(2, "0")} · ${esc(sa?.name || s.agent)}</b> <span>${esc(modelOf(sa).label)} — ${esc(s.do)}</span></div></div>`;
        }).join("")}</div>`)
        : sec("Done by", `<div class="stack">${card("agent", a.id, d.color, a.name, `${mo.label} · ${mo.provider === "ollama" ? "local" : "cloud"}`, "1:1")}</div>`)}
      ${t.sop?.length ? sec("The SOP, written out", `<ol class="sop">${t.sop.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`) : ""}
      ${t.starters?.length ? sec("Try it", `<div class="starters">${t.starters.map((s, i) => `<button data-starter="${i}">${esc(s)}</button>`).join("")}</div>`) : ""}
    </div>`;
    return;
  }

  if (kind === "agent") {
    const a = idx.agent[id], d = idx.dept[a.dept], mo = modelOf(a);
    const tks = D.tasks.filter((t) => t.agent === a.id || t.chain?.some((s) => s.agent === a.id));
    body.style.setProperty("--c", d.color);
    body.innerHTML = pbar(`${esc(d.name)} · Agent`) + `<div class="pscroll">
      <h2 class="ptitle">${esc(a.name)}</h2>
      <div class="psub">${esc(d.name)} · ${esc(mo.label)} · ${mo.provider === "ollama" ? "runs on your computer" : "cloud API"}</div>
      <div class="actions"><button class="btn primary" data-act="chat">▶ Chat with ${esc(a.name)}</button></div>
      ${readyWarn([mo])}
      ${sec("Role", `<div class="box">${esc(a.role)}</div>`)}
      ${sec("Model", `<div class="stack">${card("model", mo.id, mo.color, mo.label, mo.model, mo.ready ? "online" : "offline")}</div>`)}
      ${sec(`Tasks (${tks.length})`, `<div class="stack">${tks.map((t) => card("task", t.id, d.color, t.name, STATUS[t.status] || t.status, t.chain ? "pipeline" : "")).join("")}</div>`)}
      ${sec("System prompt", `<pre class="prompt">${esc(a.prompt)}</pre><div class="note">Edit it in agents.json, then refresh.</div>`)}
    </div>`;
    return;
  }

  if (kind === "model") {
    const mo = idx.model[id] || modelOf({ model: id });
    const ags = D.agents.filter((a) => a.model === id || effModelId(a) === id);
    body.style.setProperty("--c", mo.color);
    body.innerHTML = pbar("Model") + `<div class="pscroll">
      <h2 class="ptitle">${esc(mo.label)}</h2>
      <div class="psub">${esc(mo.model)} · ${({ ollama: "local (Ollama)", openai: "OpenAI API", anthropic: "Anthropic API", openrouter: "via OpenRouter" })[mo.provider] || mo.provider}</div>
      <span class="badge ${mo.ready && mo.enabled !== false ? "autonomous" : "building"}">${mo.enabled === false ? "Turned off" : mo.ready ? "Online" : "Not ready"}</span>
      ${mo.ready && mo.enabled !== false ? "" : `<div class="warnline">${esc(mo.note)}</div>`}
      ${mo.switchable ? `<div class="toggle-row"><button class="switch ${mo.enabled !== false ? "on" : ""}" data-act="toggle-model" role="switch" aria-checked="${mo.enabled !== false}"><i></i></button>
        <div><b>${mo.enabled !== false ? "On" : "Off"}</b><div class="note">${mo.enabled !== false ? "Agents that use it call it (it costs money)." : "Its agents use their local backup models instead, for free."}</div></div></div>` : ""}
      <div class="actions"><a class="btn" href="/compare">Compare all models side by side →</a></div>
      ${sec(`Agents on this model (${ags.length})`, `<div class="stack">${ags.map((a) => card("agent", a.id, deptColor(a.dept), a.name, idx.dept[a.dept]?.name || "")).join("") || '<div class="note">No agents use this model yet.</div>'}</div>`)}
    </div>`;
    return;
  }

  if (kind === "dept") {
    const d = idx.dept[id];
    body.style.setProperty("--c", d.color);
    body.innerHTML = pbar("Department") + `<div class="pscroll">
      <h2 class="ptitle">${esc(d.name)}</h2>
      <div class="psub">${esc(d.blurb || "")}</div>
      ${sec(`Agents (${agentsIn(id).length})`, `<div class="stack">${agentsIn(id).map((a) => card("agent", a.id, d.color, a.name, modelOf(a).label)).join("")}</div>`)}
      ${sec(`Tasks (${tasksIn(id).length})`, `<div class="stack">${tasksIn(id).map((t) => card("task", t.id, d.color, t.name, STATUS[t.status] || t.status)).join("")}</div>`)}
    </div>`;
  }
}

// ---------- chat ----------
function chatKey() { return `${panel.kind}:${panel.id}`; }
function chatTarget() {
  if (panel.kind === "task") {
    const t = idx.task[panel.id], a = idx.agent[t.agent];
    return { title: t.name, agent: a, task: t, dept: idx.dept[t.dept] };
  }
  const a = idx.agent[panel.id];
  return { title: `Chat with ${a.name}`, agent: a, task: null, dept: idx.dept[a.dept] };
}
function systemFor(agent, task) {
  const st = D.style || {};
  const house = [st.all, agent.dept === "code" ? st.code : st.chat].filter(Boolean).join("\n\n");
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  let s = `Today's date is ${today}.\n\n` + (house ? house + "\n\n" : "") + (agent.prompt || "");
  s += `\n\nYou run inside Nexus HQ, the user's own dashboard. The app itself (not you) handles these when the user phrases them this way, so if one of these requests reaches you, tell them the exact words to use instead of saying you can't:
- GitHub: "read my <repo> repo", "add <something> to my <repo> repo", "show my repos", "add all my repos to my vault", "sync my repos" (repo notes also update on their own every 30 minutes)
- Notes (Obsidian vault): "save this to my notes", "make a note about <topic>"
- Memory: "remember that <fact>", "what do you remember", "forget <n>"
- Photos: the + / photo buttons next to the input
Messages in this conversation marked as app actions really happened; use them to understand follow-ups like "all of them".`;
  const mem = (D.memory || []).map((m) => `- ${m.text}`).join("\n");
  if (mem) s += `\n\nThings the user has asked you to remember (use them whenever relevant; don't recite them unprompted):\n${mem}`;
  if (task) {
    s += `\n\nCurrent task: ${task.name}.`;
    if (task.sop?.length) s += `\nFollow this procedure:\n${task.sop.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
  }
  return s;
}

function renderChat(body) {
  const tg = chatTarget(), mo = modelOf(tg.agent);
  body.style.setProperty("--c", tg.dept.color);
  const note = tg.task?.chain
    ? `Each message runs all ${tg.task.chain.length} steps in order · saved on this device`
    : `${esc(tg.agent.name)} on ${esc(mo.label)} · saved on this device`;
  body.innerHTML = pbar(`${esc(tg.dept.name)} · ${esc(tg.title)}`, '<button data-act="clear" title="Clear this conversation">Clear</button>') + `
    <div class="chat">
      <div class="msgs" id="msgs"></div>
      <div class="composer">
        <textarea id="chatInput" rows="1" placeholder="${tg.task?.chain ? "Describe the feature…" : `Message ${esc(tg.agent.name)}…`}"></textarea>
        <button class="btn primary" id="sendBtn">${running ? "Stop" : "Send"}</button>
      </div>
      <div class="chatnote">${note}</div>
    </div>`;
  renderMsgs();
  const ta = $("#chatInput");
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 150) + "px"; });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); send(); } });
  $("#sendBtn").addEventListener("click", send);
  if (panel.prefill) { ta.value = panel.prefill; ta.dispatchEvent(new Event("input")); delete panel.prefill; }
  if (!matchMedia("(pointer:coarse)").matches) ta.focus();
}

function statsLine(s) {
  if (!s) return "";
  const b = [];
  if (s.ttft != null) b.push(`first ${(s.ttft / 1000).toFixed(1)}s`);
  if (s.ms != null) b.push(`total ${(s.ms / 1000).toFixed(1)}s`);
  if (s.input != null) b.push(`in ${s.input}`);
  if (s.output != null) b.push(`out ${s.output}`);
  if (s.output && s.ms && s.ttft != null && s.ms - s.ttft > 200) b.push(`${Math.round(s.output / ((s.ms - s.ttft) / 1000))} tok/s`);
  if (s.usd != null) b.push(`$${s.usd < 0.01 ? s.usd.toFixed(4) : s.usd.toFixed(3)}`);
  return b.length ? `<div class="stats">${b.map((x) => `<span>${x}</span>`).join("")}</div>` : "";
}
function renderMsgs(streamingIdx = -1) {
  const box = $("#msgs");
  if (!box) return;
  const list = chats[chatKey()] || [];
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const tg = chatTarget();
  if (!list.length) {
    const st = tg.task?.starters || [];
    box.innerHTML = `<div class="empty">${tg.task ? esc(tg.task.human || "") : esc(tg.agent.role)}</div>` +
      (st.length ? `<div class="starters">${st.map((s, i) => `<button data-starter="${i}">${esc(s)}</button>`).join("")}</div>` : "");
    return;
  }
  box.innerHTML = list.map((m, i) => {
    if (m.role === "user") return `<div class="m user">${esc(m.content)}</div>`;
    const ag = idx.agent[m.agent] || tg.agent, mo = modelOf(ag);
    const who = `<div class="who">${m.stage != null ? `Step ${m.stage + 1}/${m.of} · ` : ""}${esc(ag.name)} <span>${esc(mo.label)}</span></div>`;
    if (m.error) return `<div class="m bot err">${who}⚠ ${esc(m.error)}</div>`;
    return `<div class="m bot ${i === streamingIdx ? "stream" : ""}">${who}<div class="body">${md(m.content)}</div>${i === streamingIdx ? "" : statsLine(m.stats)}</div>`;
  }).join("");
  if (near || streamingIdx < 0) box.scrollTop = box.scrollHeight;
}

async function streamChat(model, system, messages, signal, onDelta, opts = {}) {
  const out = { text: "", stats: {}, error: null };
  // Each answer gets an id, so if the phone puts the app to sleep mid-answer the server keeps going
  // and the finished answer is picked up when you come back (plus a notification if they're on)
  const rid = opts.quick ? null : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const stop = () => rid && fetch(`/api/chat/cancel/${rid}`, { method: "POST", headers: headers(), keepalive: true }).catch(() => {});
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: headers(), signal, body: JSON.stringify({ model, system, messages, ...(opts.fallback && opts.fallback !== model ? { fallback: opts.fallback } : {}), ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}), ...(opts.tools?.length ? { tools: opts.tools, verify: !!opts.verify } : {}), ...(opts.quick ? { quick: true } : {}), ...(opts.deep ? { deep: true } : {}), ...(rid ? { rid, cid: clientId, notify: opts.notify || session?.title || "Nexus HQ" } : {}) }) });
    if (!r.ok) throw new Error(r.status === 401 ? "Password required — reload the page." : `Server error ${r.status}`);
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "delta") { out.text += ev.text; onDelta(out.text); }
        else if (ev.type === "usage") Object.assign(out.stats, { input: ev.input, output: ev.output });
        else if (ev.type === "done") { Object.assign(out.stats, { ms: ev.ms, ttft: ev.ttft }); out.model = ev.model; }
        else if (ev.type === "note") { out.note = ev.text; opts.onNote?.(ev.text); }
        else if (ev.type === "cost") { out.stats.usd = ev.usd; updateSpend(ev); }
        else if (ev.type === "error") out.error = ev.message;
        else if (ev.type === "tool") opts.onTool?.(ev);
        else if (ev.type === "reset") { out.text = ""; onDelta(""); } // the answer is being rewritten with fixed code
        else if (ev.type === "toolResult") { if (ev.sources?.length) (out.sources ||= []).push(...ev.sources); opts.onToolResult?.(ev); }
      }
    }
  } catch (e) {
    out.error = e.name === "AbortError" ? (out.text ? null : "Stopped.") : e.message;
    // the connection dropped (phone slept, Wi-Fi blip) but the answer is still being written on the PC
    if (rid && e.name !== "AbortError" && !signal?.aborted) {
      opts.onNote?.("Connection dropped. Picking the answer up from Nexus HQ…");
      for (let i = 0; i < 300 && !signal?.aborted; i++) {
        try {
          const j = await (await fetch(`/api/chat/result/${rid}`, { headers: headers() })).json();
          if (j.text != null && j.text.length >= out.text.length) { out.text = j.text; onDelta(out.text); }
          if (j.done) { out.error = j.error || null; out.model = j.model; out.stats.ms = j.ms; break; }
          if (j.error === "not found") break;
        } catch {}
        await new Promise((ok) => setTimeout(ok, document.hidden ? 4000 : 1500));
      }
    }
  }
  signal?.removeEventListener("abort", stop);
  if (!out.error && !out.text) out.error = "Empty response.";
  return out;
}
const clientId = (() => { try { let id = localStorage.getItem("hq.cid"); if (!id) { id = "c" + Math.random().toString(36).slice(2, 12); localStorage.setItem("hq.cid", id); } return id; } catch { return "c" + Math.random().toString(36).slice(2, 12); } })();

async function runOne(list, entry, model, system, messages, signal) {
  list.push(entry);
  const idxMsg = list.length - 1;
  let raf = null;
  const r = await streamChat(model, system, messages, signal, (text) => {
    entry.content = text;
    if (!raf) raf = requestAnimationFrame(() => { raf = null; renderMsgs(idxMsg); });
  }, { fallback: idx.agent[entry.agent]?.fallback });
  if (raf) cancelAnimationFrame(raf);
  entry.content = r.text; entry.stats = r.stats;
  if (r.error) entry.error = r.error;
  renderMsgs();
  return r;
}

async function send() {
  if (running) { running.abort(); return; }
  const ta = $("#chatInput");
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ""; ta.style.height = "auto";
  const key = chatKey(), tg = chatTarget();
  const list = (chats[key] ||= []);
  list.push({ role: "user", content: text });
  running = new AbortController();
  $("#sendBtn").textContent = "Stop";
  renderMsgs();

  if (tg.task?.chain) {
    const steps = tg.task.chain, outs = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], ag = idx.agent[s.agent];
      let content = `Request:\n${text}`;
      outs.forEach((o, k) => { content += `\n\n--- Step ${k + 1}: ${idx.agent[steps[k].agent].name} (${steps[k].do}) ---\n${isLean(ag) ? o.slice(0, 9000) : o}`; });
      content += `\n\nYour step (${i + 1} of ${steps.length}): ${s.do}`;
      const r = await runOne(list, { role: "assistant", agent: ag.id, stage: i, of: steps.length, content: "" },
        effModelId(ag), systemFor(ag, null), [{ role: "user", content }], running.signal);
      if (r.error || running.signal.aborted) break;
      outs.push(r.text);
    }
  } else {
    const payload = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.role === "user" && list[i + 1]?.error) { i++; continue; }
      if (!m.error && m.stage == null) payload.push({ role: m.role, content: m.content });
    }
    await runOne(list, { role: "assistant", agent: tg.agent.id, content: "" }, effModelId(tg.agent), systemFor(tg.agent, tg.task), isLean(tg.agent) ? payload.slice(-5) : payload, running.signal);
  }
  running = null;
  const b = $("#sendBtn"); if (b) b.textContent = "Send";
  store.set("hq.chats", chats);
}

// ---------- markdown (small, escaped) ----------
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
// A code block's file path, from the fence (```js src/app.js) or a first-line comment (// src/app.js)
const PATHISH = /^[\w@~.-]+(\/[\w@~.-]+)*\.[A-Za-z0-9]{1,8}$|^(Dockerfile|Makefile|Procfile|\.env\.example|\.gitignore)$/;
function codePathHint(info, body) {
  const toks = String(info || "").trim().split(/\s+/).filter(Boolean);
  for (const t of toks) { const c = t.replace(/^(file|title|path)=/, "").replace(/^["']|["']$/g, ""); if (PATHISH.test(c) && (c.includes("/") || c.includes("."))) return c; }
  const first = String(body || "").split("\n", 1)[0].trim();
  const m = first.match(/^(?:\/\/|#|--|;|<!--|\/\*)\s*(?:file(?:name)?\s*:\s*)?([\w@~./-]+)\s*(?:-->|\*\/)?$/i);
  return m && PATHISH.test(m[1]) ? m[1] : null;
}
function stripPathComment(body, p) {
  const lines = String(body).split("\n");
  return (lines[0] && lines[0].includes(p) && /^\s*(\/\/|#|--|;|<!--|\/\*)/.test(lines[0]) ? lines.slice(1).join("\n") : body).replace(/\s*$/, "\n");
}
function md(src) {
  let html = "";
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l) || (l.split("|").length > 2 && !/^\s*[-*+]\s/.test(l));
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  String(src || "").split("```").forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const code = nl === -1 ? part : part.slice(nl + 1);
      const fp = nl === -1 ? null : codePathHint(part.slice(0, nl), code);
      html += `<pre${fp ? ` data-path="${esc(fp)}"` : ""}>${fp ? `<span class="code-path">${esc(fp)}</span>` : ""}<span class="code-btns"><button class="save-code" title="Save into the open project">Save</button><button class="copy">Copy</button></span><code>${esc(code.replace(/\n$/, ""))}</code></pre>`;
      return;
    }
    let list = null, para = [], quote = [];
    const fp = () => { if (para.length) { html += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
    const fl = () => { if (list) { html += `</${list}>`; list = null; } };
    const fq = () => { if (quote.length) { html += `<blockquote>${inline(quote.join("<br>"))}</blockquote>`; quote = []; } };
    const flush = () => { fp(); fl(); fq(); };
    const lines = esc(part).split("\n");
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n];
      let m;
      // table: header row followed by a --- separator row
      if (isRow(line) && n + 1 < lines.length && isSep(lines[n + 1])) {
        flush();
        const head = cells(line);
        const align = cells(lines[n + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : "left"));
        const rows = [];
        n += 2;
        while (n < lines.length && lines[n].trim() && isRow(lines[n]) && !isSep(lines[n])) rows.push(cells(lines[n++]));
        n--;
        const th = head.map((c, k) => `<th style="text-align:${align[k] || "left"}">${inline(c)}</th>`).join("");
        const tb = rows.map((r) => `<tr>${head.map((_, k) => `<td style="text-align:${align[k] || "left"}">${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("");
        html += `<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
      }
      else if ((m = line.match(/^#{1,6}\s+(.*)/))) { flush(); html += `<h4>${inline(m[1])}</h4>`; }
      else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); html += "<hr>"; }
      else if ((m = line.match(/^\s*&gt;\s?(.*)/))) { fp(); fl(); quote.push(m[1]); }
      else if ((m = line.match(/^\s*[-*+]\s+(.*)/))) { fp(); fq(); if (list !== "ul") { fl(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { fp(); fq(); if (list !== "ol") { fl(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else if (!line.trim()) flush();
      else { fl(); fq(); para.push(line); }
    }
    flush();
  });
  return html;
}

// ---------- skill file ----------
function skillMarkdown(t) {
  const a = idx.agent[t.agent], d = idx.dept[t.dept], mo = modelOf(a);
  const L = [`# ${t.name}`, "", `> ${d.name} · ${t.chain ? "pipeline" : `${a.name} (${mo.label}, \`${mo.model}\`)`} · ${STATUS[t.status] || t.status}`, ""];
  if (t.replaces) L.push("## What it replaces", "", t.replaces, "");
  if (t.ladder) L.push("## The ladder", "", `- **Human-led:** ${t.ladder.led}`, `- **Human-assisted:** ${t.ladder.assisted}`, `- **Fully autonomous:** ${t.ladder.auto}`, "");
  if (t.human) L.push("## The human", "", t.human, "");
  if (t.chain) {
    L.push("## Pipeline", "");
    t.chain.forEach((s, i) => { const sa = idx.agent[s.agent]; L.push(`${i + 1}. **${sa.name}** (${modelOf(sa).label}): ${s.do}`); });
    L.push("");
    t.chain.forEach((s) => { const sa = idx.agent[s.agent]; L.push(`### ${sa.name} system prompt`, "", "```", sa.prompt, "```", ""); });
  } else {
    L.push("## System prompt", "", "```", systemFor(a, t), "```", "");
  }
  if (t.sop?.length) L.push("## Procedure", "", ...t.sop.map((s, i) => `${i + 1}. ${s}`), "");
  if (t.starters?.length) L.push("## Example requests", "", ...t.starters.map((s) => `- ${s}`), "");
  return L.join("\n");
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- routing & events ----------
function go(v) {
  if (location.hash !== `#${v}`) location.hash = v; else { view = v; renderChrome(); renderView(); }
}
function fromHash() {
  const h = location.hash.slice(1) || "map";
  view = h === "map" || h === "vault" || h === "photos" || idx.dept[h] || !D ? h : "map";
  if (D) { renderChrome(); renderView(); }
}
addEventListener("hashchange", fromHash);

document.addEventListener("click", (e) => {
  const cp = e.target.closest(".copy");
  if (cp) {
    const text = cp.closest("pre").querySelector("code").textContent;
    const done = () => { cp.textContent = "Copied"; setTimeout(() => (cp.textContent = "Copy"), 1200); };
    if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(text).then(done);
    else { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); done(); }
    return;
  }
  const nv = e.target.closest("#nav button");
  if (nv) return go(nv.dataset.view);
  const op = e.target.closest("[data-open]");
  if (op) { const [k, ...rest] = op.dataset.open.split(":"); return openPanel(k, rest.join(":"), op.dataset.mode || "info", !!e.target.closest("#panel")); }
  const st = e.target.closest("[data-starter]");
  if (st && panel) {
    const t = panel.kind === "task" ? idx.task[panel.id] : null;
    const text = t?.starters?.[+st.dataset.starter] || "";
    const auto = !/[:\s]$/.test(text);
    if (panel.mode !== "chat") openPanel(panel.kind, panel.id, "chat");
    const ta = $("#chatInput");
    ta.value = text; ta.dispatchEvent(new Event("input"));
    if (auto) send(); else { ta.focus(); ta.setSelectionRange(text.length, text.length); }
    return;
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  if (act === "close") closePanel();
  else if (act === "back") back();
  else if (act === "run" || act === "chat") openPanel(panel.kind, panel.id, "chat");
  else if (act === "toggle-model") { toggleModel(panel.id); }
  else if (act === "skill") { const t = idx.task[panel.id]; download(`${t.id}.md`, skillMarkdown(t)); }
  else if (act === "clear") {
    if (running) running.abort();
    if (confirm("Clear this conversation?")) { delete chats[chatKey()]; store.set("hq.chats", chats); renderMsgs(); }
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel && $("#login").hidden) closePanel(); });

function cycleDept(dir) {
  const ids = D.departments.map((d) => d.id);
  go(ids[(ids.indexOf(view) + dir + ids.length) % ids.length]);
}
$("#prevDept").addEventListener("click", () => cycleDept(-1));
$("#nextDept").addEventListener("click", () => cycleDept(1));

let rsz;
new ResizeObserver(() => { clearTimeout(rsz); rsz = setTimeout(renderView, 120); }).observe($("#viewport"));

// ---------- command console: ask HQ, watch it route and work ----------
const con = { busy: false, ac: null, hot: new Set(), open: store.get("hq.console", innerWidth >= 760), full: store.get("hq.conFull", false) };
let session = null;          // the conversation shown in the console
let sessionList = [];        // saved conversations (metadata only)

function applyHot() {
  document.querySelectorAll(".node.working").forEach((n) => n.classList.remove("working"));
  document.querySelectorAll(".edge.hot").forEach((e) => e.classList.remove("hot"));
  for (const k of con.hot) {
    const sel = k.startsWith("dept:") ? `.node[data-open="${k}"],.node[data-open="view:${k.slice(5)}"]` : `.node[data-open="${k}"]`;
    document.querySelectorAll(sel).forEach((n) => n.classList.add("working"));
    document.querySelectorAll(`.edge[data-keys~="${k}"]`).forEach((e) => e.classList.add("hot"));
  }
}
function setHot(keys) {
  con.hot = new Set(keys); applyHot();
  const k = keys.find((x) => x && x.startsWith("agent:"));
  const el = k && !con.full && document.querySelector(`#stage .node[data-open="${k}"]`);
  if (el) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
}

// ----- sessions (saved on the server so phone and computer share them) -----
const newId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const blankSession = () => ({ id: newId(), title: "New chat", created: Date.now(), updated: Date.now(), items: [], history: [], lastTask: null });
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}`);
  return r.status === 204 ? null : r.json();
}
async function saveSession() {
  if (!session.items.some((i) => i.k === "cmd")) return;
  session.updated = Date.now();
  try { await api("PUT", `/api/sessions/${session.id}`, session); } catch (e) { console.warn("save failed", e); }
}
async function openSession(id) {
  if (con.busy) con.ac?.abort();
  try { session = await api("GET", `/api/sessions/${id}`); }
  catch { session = blankSession(); }
  store.set("hq.session", session.id);
  renderLog(); drawerOpen(false);
}
function startNewChat() {
  if (con.busy) con.ac?.abort();
  session = blankSession();
  store.set("hq.session", session.id);
  renderLog(); drawerOpen(false);
  $("#conInput").focus();
}
async function refreshList() {
  try { sessionList = (await api("GET", "/api/sessions")).sessions; } catch { sessionList = []; }
  const fmt = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  $("#conList").innerHTML = sessionList.length
    ? sessionList.map((s) => `<div class="dr-item ${s.id === session.id ? "on" : ""}">
        <button class="dr-open" data-sid="${esc(s.id)}"><span class="dr-t">${esc(s.title)}</span><span class="dr-m">${fmt(s.updated)} · ${s.count} message${s.count === 1 ? "" : "s"}</span></button>
        <button class="dr-ren" data-ren="${esc(s.id)}" aria-label="Rename ${esc(s.title)}" title="Rename">✎</button>
        <button class="dr-del" data-del="${esc(s.id)}" aria-label="Delete ${esc(s.title)}">✕</button></div>`).join("")
    : `<div class="dr-empty">No saved chats yet. Everything you ask in the console is saved here automatically.</div>`;
}
function drawerOpen(on) {
  $("#conDrawer").hidden = !on;
  if (on) { conOpen(true); refreshList(); }
}

// ----- log rendering -----
const tfmt = (t) => new Date(t || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const agentTag = (a) => `<span class="tag" style="--c:${deptColor(a.dept)}">${esc(a.name)}</span> <span class="dim">${esc(modelOf(a).label)}</span>`;
const agentFor = (it) => idx.agent[it.agent] || { name: it.agentName || it.agent || "Agent", dept: "chat", model: "" };

function itemEl(it) {
  if (it.k === "pr") return prItemEl(it);
  if (it.k === "out") {
    const a = agentFor(it), d = document.createElement("div");
    d.className = "out";
    d.style.setProperty("--c", deptColor(a.dept));
    d.innerHTML = `<div class="who">${agentTag(a)}</div><div class="body">${it.error ? `<span class="err">⚠ ${esc(it.error)}</span>` : md(it.text)}</div>${sourcesHTML(it.sources)}${it.error ? "" : statsLine(it.stats)}`;
    if (it.sources?.length) { d._sources = it.sources; linkCitations(d.querySelector(".body"), it.sources); }
    return d;
  }
  const d = document.createElement("div");
  d.className = `ln ${it.k === "cmd" ? "cmd" : it.cls || ""}`;
  const body = it.k === "cmd" ? `<span class="prompt">nexus@hq:~$</span> ${esc(it.text)}${it.images?.length ? `<span class="ln-imgs">${it.images.map((n) => `<button type="button" data-photo="${esc(n)}"><img src="${esc(photoUrl(n, true))}" alt="photo" loading="lazy"></button>`).join("")}</span>` : ""}` : it.html;
  d.innerHTML = `<span class="ts">${tfmt(it.t)}</span><span class="tx">${body}</span>`;
  return d;
}
function renderLog() {
  const log = $("#conLog");
  log.innerHTML = "";
  if (!session.items.length) {
    log.innerHTML = `<div class="ln sys dim"><span class="ts">${tfmt()}</span><span class="tx">New chat. Ask anything, and follow-up questions keep the context. Type <b>/help</b> for commands.</span></div>`;
  } else session.items.forEach((it) => log.append(itemEl(it)));
  log.scrollTop = log.scrollHeight;
  $("#conTitle").textContent = session.title === "New chat" ? "" : session.title;
}
function addItem(it, render = true) {
  it.t ||= Date.now();
  if (!session.items.length) $("#conLog").innerHTML = "";
  session.items.push(it);
  if (!render) return null;
  const log = $("#conLog"), near = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const el = itemEl(it);
  log.append(el);
  if (near || it.k === "cmd") log.scrollTop = log.scrollHeight;
  return el;
}
const conLine = (html, cls = "") => addItem({ k: "sys", html, cls });

function conStatus(text, busy = false) {
  $("#conStatus").textContent = text;
  $("#conStatus").classList.toggle("busy", busy);
  $("#conRun").textContent = busy ? "Stop" : "Run";
}
function conOpen(on) {
  con.open = on || con.full;
  store.set("hq.console", con.open);
  $("#console").classList.toggle("collapsed", !con.open);
  $("#conToggle").textContent = con.open ? "▾" : "▴";
  $("#conToggle").setAttribute("aria-label", con.open ? "Collapse console" : "Expand console");
}
function conFull(on) {
  con.full = on;
  store.set("hq.conFull", on);
  $("#app").classList.toggle("con-full", on);
  $("#conFullBtn").textContent = on ? "⤡" : "⛶";
  $("#conFullBtn").setAttribute("aria-label", on ? "Exit full screen" : "Full screen console");
  $("#conFullBtn").title = on ? "Exit full screen (Esc)" : "Full screen";
  conOpen(on || con.open);
  const log = $("#conLog"); log.scrollTop = log.scrollHeight;
  if (!on) renderView();
}

// Streams one agent's answer into the log, then records it in the session.
function outBlock(agent, sources) {
  const log = $("#conLog");
  if (!session.items.length) log.innerHTML = "";
  const d = document.createElement("div");
  d.className = "out stream";
  d.style.setProperty("--c", deptColor(agent.dept));
  d.innerHTML = `<div class="who">${agentTag(agent)}</div><div class="body"></div>`;
  log.append(d);
  log.scrollTop = log.scrollHeight;
  const body = d.querySelector(".body");
  let raf = null, latest = "";
  return {
    update(text) {
      latest = text;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
        body.innerHTML = md(latest);
        if (sources?.length) linkCitations(body, sources);
        if (near) log.scrollTop = log.scrollHeight;
      });
    },
    done(r, sources) {
      if (raf) cancelAnimationFrame(raf);
      d.remove();
      const slim = sources?.map((x) => ({ title: x.title, url: x.url, snippet: (x.snippet || x.text || "").replace(/\s+/g, " ").trim().slice(0, 260) }));
      addItem({ k: "out", agent: agent.id, agentName: agent.name, text: r.text, stats: r.stats, ...(slim?.length ? { sources: slim } : {}), ...(r.error ? { error: r.error } : {}) });
    },
  };
}
async function work(agent, system, messages, signal, sources, opts = {}) {
  const own = idx.model[agent.model];
  if (!opts.model && agent.fallback && effModelId(agent) !== agent.model) {
    const sp = D.spend || {};
    const why = !own ? "isn't set up (no API key)" : own.overBudget
      ? (sp.monthly != null && sp.month >= sp.monthly ? `hit this month's $${sp.monthly.toFixed(2)} limit` : `hit today's $${(sp.daily ?? 0).toFixed(2)} limit`)
      : "isn't available";
    conLine(`${esc(own?.label || ({ opus: "Claude Opus", gpt: "GPT" }[agent.model] || agent.model))} ${why}, so ${esc(modelOf(agent).label)} is standing in`, "sys dim");
  }
  const mid = opts.model || effModelId(agent);
  loadingNotice(mid);
  const ob = outBlock(agent, sources);
  const tl = window.toolLines?.() || {};
  const r = await streamChat(mid, system, messages, signal, (t) => ob.update(t), { fallback: opts.model ? null : agent.fallback, onNote: (t) => conLine(esc(t), "sys dim"), tools: window.toolsFor?.(agent, mid) || [], verify: agent.dept === "code", deep: !!opts.deep || con.think, onTool: tl.start, onToolResult: tl.end });
  // sources found by the agent's own web searches join the ones searched up front
  const all = [...(sources || [])];
  for (const x of r.sources || []) if (!all.some((y) => y.url === x.url)) all.push(x);
  ob.done(r, all.length ? all : sources);
  return r;
}

const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "#");
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
function sourcesHTML(src) {
  if (!src?.length) return "";
  return `<details class="sources"><summary><span class="sl">Sources</span><span class="favs">${src.slice(0, 4).map((x) => `<i style="--h:${hueOf(x.url)}">${esc(siteName(x.url)[0] || "?")}</i>`).join("")}</span><span class="dim">${src.length}</span></summary>
    <div class="src-list">${src.map((x, i) =>
      `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer"><b>${i + 1}</b><span class="st">${esc(x.title.slice(0, 90))}</span><span class="dim">${esc(hostOf(x.url))}</span></a>`).join("")}</div></details>`;
}
// "gamersnexus.net" -> "gamersnexus", "www.tomshardware.com" -> "tomshardware"
function siteName(u) {
  const h = hostOf(u).split(".");
  const two = ["co", "com", "org", "net", "gov", "ac"].includes(h[h.length - 2]);
  return (h.length > 2 && two ? h[h.length - 3] : h[h.length - 2] || h[0] || "source").toLowerCase();
}
const hueOf = (u) => [...hostOf(u)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

// Remove [1], [1][3] and [1, 3] markers from the answer text; the sources stay in the "Sources" list underneath.
function linkCitations(body, src) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest("pre, code") ? NodeFilter.FILTER_REJECT : /\[\s*\d/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const re = /(?:\s*\[\s*\d+(?:\s*[,;\u2013-]\s*\d+)*\s*\])+/g;
  for (const n of nodes) {
    n.nodeValue = n.nodeValue.replace(re, (m) => ((m.match(/\d+/g) || []).some((k) => k >= 1 && k <= src.length) ? "" : m));
  }
}

// ----- citation preview card -----
const citePop = document.createElement("div");
citePop.className = "cite-pop"; citePop.hidden = true; citePop.setAttribute("role", "dialog");
document.body.append(citePop);
let citeState = null, citeHideT = null;
function showCite(btn, pos = 0) {
  clearTimeout(citeHideT);
  const src = btn.closest(".out")?._sources; if (!src) return;
  const nums = btn.dataset.cite.split(",").map(Number);
  pos = (pos + nums.length) % nums.length;
  citeState = { btn, nums, pos };
  const x = src[nums[pos] - 1];
  citePop.innerHTML = `<div class="cp-top">${nums.length > 1 ? `<button type="button" data-cp="-1" aria-label="Previous source">←</button><button type="button" data-cp="1" aria-label="Next source">→</button><span class="cp-n">${pos + 1}/${nums.length}</span>` : `<span class="cp-n">source ${nums[pos]}</span>`}</div>
    <a class="cp-body" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">
      <div class="cp-site"><i style="--h:${hueOf(x.url)}">${esc(siteName(x.url)[0] || "?")}</i>${esc(hostOf(x.url))}</div>
      <div class="cp-title">${esc(x.title)}</div>
      ${x.snippet ? `<div class="cp-snip">${esc(x.snippet.slice(0, 220))}${x.snippet.length > 220 ? "…" : ""}</div>` : ""}
      <div class="cp-open">Open page ↗</div>
    </a>`;
  citePop.hidden = false;
  const r = btn.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
  citePop.style.width = `${w}px`;
  const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
  citePop.style.left = `${left}px`;
  const h = citePop.offsetHeight, below = r.bottom + 8 + h < innerHeight - 8;
  citePop.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
}
function hideCite(delay = 0) {
  clearTimeout(citeHideT);
  citeHideT = setTimeout(() => { citePop.hidden = true; citeState = null; }, delay);
}
const hoverable = matchMedia("(hover: hover)").matches;
document.addEventListener("pointerover", (e) => {
  if (!hoverable) return;
  const b = e.target.closest(".cite");
  if (b && citeState?.btn !== b) showCite(b);
  else if (b || e.target.closest(".cite-pop")) clearTimeout(citeHideT);
});
document.addEventListener("pointerout", (e) => {
  if (!hoverable || !citeState) return;
  if (e.target.closest(".cite, .cite-pop") && !e.relatedTarget?.closest?.(".cite, .cite-pop")) hideCite(250);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest(".cite");
  if (b) { e.preventDefault(); if (citeState?.btn === b && !hoverable) hideCite(); else showCite(b); return; }
  const step = e.target.closest("[data-cp]");
  if (step && citeState) { showCite(citeState.btn, citeState.pos + Number(step.dataset.cp)); return; }
  if (!e.target.closest(".cite-pop")) hideCite();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && citeState) hideCite(); });
addEventListener("scroll", () => citeState && hideCite(), true);
const webMode = () => store.get("hq.web", "auto");
function renderWebChip() {
  const b = $("#conWeb"); if (!b) return;
  const on = D?.web?.enabled, m = webMode();
  b.textContent = on ? `WEB ${m.toUpperCase()}` : "WEB OFF";
  b.className = `con-web ${on ? m : "unset"}`;
  b.title = !on ? "Web search isn't set up yet (click for how)" : m === "auto" ? "Searches when a question needs current info. Click to change." : m === "on" ? "Searches the web for every question. Click to change." : "Never searches the web. Click to change.";
}
function webBlock(query, results) {
  const body = results.map((x, i) => `[${i + 1}] ${x.title}\n${x.url}\n${(x.text || x.snippet || "").replace(/\s+/g, " ").trim()}`).join("\n\n");
  return `Web search results for "${query}" (retrieved ${todayStr()}):\n\n${body}\n\nUse these results to answer. Prefer them over your own memory for anything current, and say plainly if they don't answer the question. Don't put citation numbers like [1] in your answer and don't list sources at the end; the app shows the sources separately. Don't invent facts the results don't support.\n\n`;
}
async function searchWeb(query, signal) {
  conStatus("searching the web…", true);
  conLine(`🌐 searching the web · <b>${esc(query)}</b>`, "sys");
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { headers: headers(), signal });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    if (!j.results.length) { conLine("no results found, answering from the model's own knowledge", "sys dim"); return []; }
    const read = j.results.filter((x) => x.text).length;
    conLine(`found ${j.results.length} results, read ${read} page${read === 1 ? "" : "s"}`, "sys dim");
    return j.results;
  } catch (e) {
    if (signal.aborted) return [];
    conLine(`<span class="err">web search failed: ${esc(e.message)}</span> · answering without it`, "sys");
    return [];
  }
}

// ----- routing -----
function routerModel() {
  const ready = D.models.filter((m) => m.ready);
  return ready.find((m) => m.id === "gemma") || ready[0] || null;
}
// "I use pfSense", "my NAS is backup-nas": telling, not asking ("I need…", "I want…", "help me…" are requests)
const isStatement = (t) => /^(i|i'm|im|i've|my|we|our)\b/i.test(String(t).trim()) && !/\?\s*$/.test(t) && !/\b(need|want|wanna|would like|how|help|can you|could you|please|trying to|looking for|should|wondering|explain|show|tell me|make|write|fix|build)\b/i.test(t);
// A status check on your own lab: lab words + "my/the lab/anything…" + a status word, and not a decision or a how-to
const labQuick = (q) => !!D.homelab?.configured && !!window.labAsk?.(q) && /\b(my|our|home ?lab|the lab|anything|everything|something|machines?|servers?|containers?|alerts?)\b/i.test(q)
  && /\b(hot|temps?|temperature|down|offline|online|up|running|alerts?|load|usage|using|power|watts?|kwh|cost|bill|status|health|healthy|ok|okay|full|space|uptime|blocked|attacks?)\b/i.test(q)
  && !/\b(should|how (do|can|would|to)|why|setup|set up|install|configure|plan|compare|vs|better|recommend)\b/i.test(q);
const looksLikeCode = (q) => /```|\b(def|function|const|let|var|class|import|return|async|await)\b.*[({=;:]|traceback|exception:|stack trace|\bnpm\b|\bpip install|\.(py|js|ts|tsx|jsx|go|rs|java|cpp|c|sh|sql)\b|\b(write|fix|debug|refactor) (a |the |this |my )?(python|javascript|typescript|bash|sql|rust|go|java|c\+\+)?\s*(code|function|script|class|bug|test)/i.test(q);
function guessTask(q) {
  const s = q.toLowerCase(), has = (re) => re.test(s);
  const code = has(/```|\bcode\b|function|script|bug|error|exception|traceback|stack|python|javascript|typescript|\bjs\b|\bts\b|java\b|rust|golang|c\+\+|sql|api|endpoint|regex|compile|refactor|unit test|pytest|jest|class\b|variable|npm|pip|docker|bash|calculator|app\b|program/);
  const pick = (id) => (idx.task[id] ? id : null);
  if (code) {
    if (has(/ship|end to end|full feature/)) return pick("ship-feature");
    if (has(/error|exception|traceback|doesn'?t work|not working|fails|crash|broken|bug/)) return pick("fix-error");
    if (has(/\btests?\b|pytest|jest|coverage/)) return pick("write-tests");
    if (has(/review|look over|check (my|this)/)) return pick("review-code");
    if (has(/readme|docs|docstring|document|comment/)) return pick("write-docs");
    if (has(/convert|port|translate|rewrite (this|it) in/)) return pick("convert-code");
    if (has(/plan|design|architect|structure|approach/)) return pick("plan-feature");
    return pick("write-code");
  }
  if (has(/email|message|text (my|to)|reply|letter|post|dm\b/)) return pick("draft-message");
  if (has(/rewrite|shorten|tighten|proofread|edit this|make this/)) return pick("tighten-text");
  if (has(/summar|notes|journal|private/)) return pick("private-summary");
  if (has(/should i|\bvs\.?\b|versus|which is better|choose|decide|pros and cons/)) return pick("decide");
  if (has(/explain|what is|what are|how does|how do|why does|eli5/)) return pick("explain-topic");
  return pick("ask-anything") || D.tasks[0].id;
}
const todayStr = () => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
// Keyword guess for "does this need fresh information?"
function webGuess(q) {
  return /\b(price|prices|cost|costs|how much|cheapest|deal|latest|newest|new release|released|release date|current|currently|today|tonight|this week|this year|right now|news|update|version|specs?|benchmark|review|reviews|weather|score|stock|20(2[5-9]|3\d)|look up|search|google|find me)\b/i.test(q);
}
async function routeTask(q, signal) {
  // Code is obvious from the words, and skipping the router here avoids swapping Gemma and Qwen in
  // and out of GPU memory, which is the slowest part of a coding answer
  if (looksLikeCode(q) && !webGuess(q)) return { id: guessTask(q), how: "quick match", web: false, query: q };
  // Quick lab checks ("how hot is my GPU?", "is anything down?", "any new alerts?") go straight to the lab
  if (labQuick(q) && idx.task["ask-anything"]) return { id: "ask-anything", how: "quick match", web: false, query: q };
  const rm = routerModel();
  if (!rm) return { id: guessTask(q), how: "keywords (no model online)", web: webGuess(q), query: q };
  const list = D.tasks.filter((t) => !t.manual).map((t) => `${t.id} — ${t.name} [${idx.dept[t.dept]?.name}]`).join("\n");
  const prevUser = [...session.history].reverse().find((m) => m.role === "user");
  const prev = session.lastTask && prevUser
    ? `\nThis is a follow-up in an ongoing conversation. The previous request was: """${prevUser.content.slice(0, 600)}""" and it was handled by task "${session.lastTask}". Keep that task unless the new request clearly needs a different one.\n` : "";
  const r = await streamChat(rm.id,
    "You are the dispatcher for a team of AI agents. Pick the ONE task that best fits the user's request and decide whether answering it needs a web search. Reply with JSON only.",
    [{ role: "user", content: `Tasks:\n${list}\n${prev}\nRequest: """${q.slice(0, 2000)}"""\n\nToday's date: ${todayStr()}. Your own knowledge stops around 2024.
Reply exactly like: {"task": "<task id>", "web": true, "query": "<short search query>"}
Set "web" to true when a good answer depends on facts that change or that you may not know: prices, product specs or releases, news, recent events, software versions, sports, weather, anything after 2024, or when the user asks you to look something up. Set it to false for writing, explaining stable concepts, math, advice, or coding help on code the user provides.
"query" is a concise web search query that includes any context needed from the previous request; use "" when web is false.` }], signal, () => {}, { quick: true, maxTokens: 200 });
  if (r.error) return { id: session.lastTask || guessTask(q), how: `fallback (router error: ${r.error})`, web: webGuess(q), query: q };
  const raw = r.text.replace(/<think>[\s\S]*?<\/think>/g, "");
  let j = null;
  try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || [""])[0]); } catch {}
  let id = j && idx.task[j.task] && !idx.task[j.task].manual ? j.task : null;
  if (!id) {
    const low = raw.toLowerCase(); let at = Infinity;
    for (const t of D.tasks.filter((x) => !x.manual)) { const i = low.indexOf(t.id); if (i !== -1 && i < at) { at = i; id = t.id; } }
  }
  const web = j && typeof j.web === "boolean" ? j.web : webGuess(q);
  const query = (j && typeof j.query === "string" && j.query.trim()) || q;
  return id ? { id, how: rm.label, web, query } : { id: session.lastTask || guessTask(q), how: "keywords", web, query };
}

// Recent conversation turns, newest last, capped so small models keep their focus.
function contextTurns(maxChars = 24000, maxTurns = 12) {
  const out = []; let total = 0;
  for (const m of [...session.history].reverse().slice(0, maxTurns)) {
    if (total + m.content.length > maxChars) break;
    out.unshift({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) }); total += m.content.length;
  }
  // only the most recent photos travel with the conversation (keeps local models fast and Opus cheap)
  let seen = false;
  for (let i = out.length - 1; i >= 0; i--) if (out[i].images) { if (seen) delete out[i].images; seen = true; }
  return out;
}

const HELP = `Ask anything and HQ routes it to the right agent. Follow-ups keep the context of this chat.
<b>@agent</b> question   send straight to an agent, e.g. <b>@debugger</b> why does this crash?
<b>@opus</b> question   ask Claude Opus directly (a few cents; counts toward your limit)
<b>/opus off</b>  <b>/opus on</b>   switch Opus off (local models take over) or back on
<b>/web</b> question    search the web first, whatever the web setting
GitHub: just ask, e.g. <b>read my NexusLLM repo</b> · <b>add a FAQ to my NexusLLM repo</b> · <b>show my repos</b>
Memory: <b>remember that</b> ... · <b>what do you remember</b> · <b>forget</b> 2 (or forget the one about ...)
Photos: 🖼 attach or 📷 take a photo (phone), paste or drop one on the PC, then ask about it · <b>Photos</b> tab
Repos:  <b>add all my repos to my vault</b> · <b>sync my repos</b> (also runs every 30 min)
Notes:  <b>save this to my notes</b> · <b>make a note about</b> ... · open the <b>Vault</b> tab to browse them
<b>/repos</b>            list your GitHub repos      <b>/repo</b> name    pick the repo to work on
<b>/update</b> what       write a change, show the diff, then <b>Open pull request</b> → <b>Merge now</b>
<b>/review</b>           review the current repo (or <b>/review</b> name)
<b>/project new</b> name  start a project; <b>Save</b> on code blocks or <b>/save</b> adds files
<b>/files</b>            list the project's files    <b>/publish</b> repo  put the project in a GitHub repo
<b>/ship</b> feature     run the 4-step Ship-a-feature pipeline
<b>/new</b>              start a new chat (the current one stays saved)
<b>/chats</b>            open saved chats
<b>/rename</b> new name     rename this chat (or tap its title, or ✎ in saved chats)
<b>/think</b> question     let Gemma think it through first (slower, more careful)
<b>/tools</b> on|off       agents search, check your lab and test code on their own
<b>/automemory</b> on|off  offer to remember things you mention about yourself
<b>/agents</b>           list agents and their models
<b>/full</b>             toggle full-screen console
<b>/logout</b>           sign this device out            <b>/help</b>  show this`;

async function dispatch(raw) {
  const images = (con.att || []).filter((a) => a.name).map((a) => a.name);
  let q = raw.trim();
  if (!q && images.length) q = images.length > 1 ? "What's in these photos?" : "What's in this photo?";
  if (!q || !D) return;
  if (images.length) { con.att = []; renderTray(); }
  conOpen(true); drawerOpen(false);

  if (q === "/new" || q === "/clear" || q === "clear") return startNewChat();
  if (q === "/chats") return drawerOpen(true);
  if (q === "/full") return conFull(!con.full);
  if (q === "/logout") return logout();
  const om = q.match(/^\/opus\s+(on|off)$/i);
  if (om) {
    addItem({ k: "cmd", text: q });
    if (!idx.model.opus) return conLine("Claude Opus isn't set up yet (no API key in .env), so there's nothing to switch.", "sys");
    const on = await toggleModel("opus", om[1].toLowerCase() === "on");
    conLine(on ? "Claude Opus is <b>on</b>. Architect, Reviewer and Advisor use it again." : "Claude Opus is <b>off</b>. Architect and Reviewer use Qwen3-Coder 30B and Advisor uses Gemma 4 12B.", "sys ok");
    return saveSession();
  }
  addItem({ k: "cmd", text: q, ...(images.length ? { images } : {}) });
  if (q === "/help" || q === "help") return conLine(`<pre class="help">${HELP}</pre>`, "sys");
  if (/^\/(github|repos|repo|review|update|project|files|save|publish)\b/.test(q)) {
    try { await ghCommand(q); } catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); }
    return saveSession();
  }
  // An answer to a question Nexus HQ just asked ("Which repo?" -> "all of them" / "NexusLLM")
  if (session.pending && !images.length && !/^[\/@]/.test(q)) {
    const p = session.pending; session.pending = null;
    const t = q.toLowerCase().trim();
    try {
      if (/^(all|all of (them|em|my repos)|them all|every\s?(one|thing)|each( one)?|both|(yes,? )?(do )?all( of them| repos| my repos)?)\b/.test(t)) {
        if (p.want === "read" || /\b(vault|notes?|obsidian|remember|memor)/i.test(p.q)) { await repoNotesAll(`${p.q} (all of them)`); return saveSession(); }
        conLine("I make repo changes one repo at a time, so you can check each diff. Name one to start with, e.g. <b>NexusLLM</b>.", "sys");
        session.pending = p; rememberTurn(q, "Asked which single repo to change first."); return saveSession();
      }
      const pick = (await Promise.all(t.split(/[\s,]+/).map((w) => knownRepo(w)))).find(Boolean);
      if (pick) {
        store.set("hq.repo", pick); session.repo = pick; session.ghTurn = session.items.filter((i) => i.k === "cmd").length; session.ghLast = p.q;
        conLine(`GitHub → <b>${esc(pick)}</b> · ${p.want === "read" ? "reading" : "preparing a change"}`, "sys");
        await (p.want === "read" ? ghReview(pick, p.q) : ghUpdate(pick, p.q));
        return saveSession();
      }
    } catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); return saveSession(); }
  }
  if (!images.length && await window.smartCommand?.(q)) return saveSession();
  if (!images.length && D.homelab?.configured && await labCommand(q)) return saveSession();
  const memCmd = images.length ? false : await memoryCommand(q);
  if (memCmd) return saveSession();
  if (!images.length && vaultOn() && await noteCommand(q)) return saveSession();
  if (!images.length && !/^[\/@]/.test(q) && ghEnabled()) {
    const gi = await ghIntent(q);
    if (gi) {
      try {
        if (gi.kind === "ask") { conLine(gi.msg, "sys"); session.pending = { want: gi.want || "add", q: gi.q || q }; rememberTurn(q, gi.msg); }
        else if (gi.kind === "allnotes") await repoNotesAll(q);
        else if (gi.kind === "list") { await ghCommand("/repos"); rememberTurn(q, `Listed your repos: ${(ghRepoList || []).map((r) => r.name).join(", ")}`); }
        else { store.set("hq.repo", gi.repo);
          // A follow-up carries the earlier request with it, so "you didn't remove the readme" makes sense to the Builder
          const ask = gi.follow && session.ghLast ? `Earlier request: ${session.ghLast}\nFollow-up (do this now, on the current files): ${q}` : q;
          session.repo = gi.repo; session.ghTurn = session.items.filter((i) => i.k === "cmd").length; session.ghLast = ask.slice(0, 600);
          conLine(`GitHub → <b>${esc(gi.repo)}</b>${gi.follow ? " <span class='dim'>(same repo as before)</span>" : ""} · ${gi.kind === "read" ? "reading" : "preparing a change"}`, "sys");
          await (gi.kind === "read" ? ghReview(gi.repo, ask) : ghUpdate(gi.repo, ask)); }
      } catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); }
      return saveSession();
    }
  }
  const rn = q.match(/^\/rename\s+(.+)/i);
  if (rn) { await renameChat(session.id, rn[1]); return; }
  if (q === "/agents") return conLine(D.agents.map((a) => `${agentTag(a)} <span class="dim">@${esc(a.id)}</span>`).join("<br>"), "sys");
  if (session.title === "New chat" && !session.renamed) { session.title = q.replace(/\s+/g, " ").slice(0, 70); $("#conTitle").textContent = session.title; }

  con.busy = true; con.ac = new AbortController();
  const signal = con.ac.signal, t0 = Date.now();
  conStatus("routing…", true);
  setHot(D.departments.map((d) => `dept:${d.id}`));

  let task = null, agent = null, text = q, routed = null, forceWeb = false;
  if (/^\/web\s+/.test(q)) { forceWeb = true; text = q.replace(/^\/web\s+/, ""); }
  // "/think question" (or a decision/planning task) lets Gemma think it through first: slower, more careful
  con.think = false;
  if (/^\/think\s+/.test(text)) { con.think = true; text = text.replace(/^\/think\s+/, ""); }
  const at = text.match(/^@([\w-]+)\s+([\s\S]+)/);
  if (at) {
    const alias = { opus: "advisor", claude: "advisor" }[at[1].toLowerCase()];
    agent = idx.agent[alias || at[1].toLowerCase()] || D.agents.find((a) => a.name.toLowerCase().replace(/\s+/g, "") === at[1].toLowerCase());
    if (!agent) { conLine(`<span class="err">No agent called @${esc(at[1])}. Try /agents.</span>`, "sys"); return finish(); }
    text = at[2];
    conLine(`direct → ${agentTag(agent)}`, "sys");
  } else if (/^\/ship\s+/.test(text) && idx.task["ship-feature"]) {
    task = idx.task["ship-feature"]; text = text.replace(/^\/ship\s+/, "");
    conLine(`direct → <b>${esc(task.name)}</b>`, "sys");
  } else {
    const r = routed = await routeTask(text, signal);
    if (signal.aborted) return finish("stopped");
    task = idx.task[r.id];
    if (["decide", "plan-feature"].includes(task?.id)) con.think = true; // weighing options and planning are worth the extra seconds
    const d = idx.dept[task.dept];
    conLine(`routed → <span style="color:${d.color}">${esc(d.name.toUpperCase())}</span> / <b>${esc(task.name)}</b> <span class="dim">(by ${esc(r.how)})</span>`, "sys");
  }
  const dept = task ? task.dept : agent.dept;
  if (!con.full && view !== "map" && view !== dept) go(dept);

  // ----- web search: forced with /web, always when WEB ON, router's call when WEB AUTO -----
  let sources = [], webText = "";
  const mode = webMode();
  // On AUTO, questions about your own lab or statements about yourself ("I use pfSense") never need a web search
  const aboutMe = (D.homelab?.configured && window.labAsk?.(text) && /\b(my|our|home ?lab|the lab|anything|everything|something|machines?|servers?|containers?|alerts?)\b/i.test(text)) || isStatement(text);
  const wantWeb = forceWeb || mode === "on" || (mode === "auto" && !aboutMe && (routed ? routed.web : webGuess(text)));
  if (wantWeb && !D.web?.enabled) {
    if (forceWeb) conLine(`web search isn't set up yet · run <b>bash setup-web-search.sh</b> in the nexus-hq folder`, "sys dim");
  } else if (wantWeb) {
    sources = await searchWeb(forceWeb || !routed ? text : routed.query, signal);
    if (signal.aborted) return finish("stopped");
    if (sources.length) webText = webBlock(forceWeb || !routed ? text : routed.query, sources);
  }

  // Notes from your Obsidian vault that match the question (Private/ is never searched)
  // (coding questions only get notes when they're about your own stuff; agents can also search notes themselves)
  const codeTask = (task || agent)?.dept === "code";
  if (vaultOn() && !forceWeb && !labQuick(text) && (!codeTask || /\b(my|our|mine)\b/i.test(text) || (ghRepoList || []).some((r) => text.toLowerCase().includes(r.name.toLowerCase())))) {
    const notes = await vaultContext(text);
    if (notes.text) webText = notes.text + webText;
  }

  // Live homelab data (machines, containers, alerts) for questions about the lab
  if (D.homelab?.configured && labAsk(text)) {
    const lab = await labContext();
    if (lab) webText = lab + webText;
  }

  // Paid models get a short recap instead of the whole chat.
  const ctx = isLean(agent || (task && idx.agent[task.agent])) ? contextTurns(4000, 4) : contextTurns();
  let answer = "";
  if (task?.chain) {
    const outs = [];
    const earlier = ctx.length ? `Earlier in this conversation:\n${ctx.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n").slice(-6000)}\n\n` : "";
    for (let i = 0; i < task.chain.length; i++) {
      const s = task.chain[i], ag = idx.agent[s.agent];
      setHot([`task:${task.id}`, `agent:${ag.id}`, `dept:${task.dept}`]);
      conStatus(`step ${i + 1}/${task.chain.length} · ${ag.name}`, true);
      conLine(`step ${i + 1}/${task.chain.length} · ${agentTag(ag)} — ${esc(s.do)}`, "sys");
      let content = `${earlier}${i === 0 ? webText : ""}Request:\n${text}`;
      outs.forEach((o, k) => { content += `\n\n--- Step ${k + 1}: ${idx.agent[task.chain[k].agent].name} (${task.chain[k].do}) ---\n${isLean(ag) ? o.slice(0, 9000) : o}`; });
      content += `\n\nYour step (${i + 1} of ${task.chain.length}): ${s.do}`;
      const vm = i === 0 && images.length ? visionFor(ag) : null;
      const r = await work(ag, systemFor(ag, null), [{ role: "user", content, ...(i === 0 && images.length ? { images } : {}) }], signal, i === 0 ? sources : null, vm ? { model: vm } : {});
      if (r.error || signal.aborted) break;
      outs.push(r.text);
    }
    answer = outs.map((o, k) => `### Step ${k + 1}: ${idx.agent[task.chain[k].agent].name}\n${o}`).join("\n\n");
  } else {
    agent ||= idx.agent[task.agent];
    setHot([task ? `task:${task.id}` : null, `agent:${agent.id}`, `dept:${agent.dept}`].filter(Boolean));
    conStatus(`${agent.name} working…`, true);
    if (images.length) ctx.forEach((m) => delete m.images); // a new photo replaces the earlier one
    const hasImgs = images.length || ctx.some((m) => m.images);
    const vm = hasImgs ? visionFor(agent) : null;
    if (hasImgs && vm === false) { conLine(`<span class="err">None of your models can see images. Pull a vision model such as gemma4:12b.</span>`, "sys"); return finish(); }
    // a statement about yourself ("I use pfSense") gets an acknowledgement, not a tutorial
    const said = isStatement(text) ? `${text}\n\n(This is the user telling you something about themselves, not a question. Acknowledge it briefly, connect it to what you know about their setup if relevant, and ask at most one short follow-up.)` : text;
    const r = await work(agent, systemFor(agent, task), [...ctx, { role: "user", content: webText ? `${webText}Question: ${said}` : said, ...(images.length ? { images } : {}) }], signal, sources, vm ? { model: vm } : {});
    answer = r.error ? "" : r.text;
  }
  if (answer) {
    session.history.push({ role: "user", content: text, ...(images.length ? { images } : {}) }, { role: "assistant", content: answer.slice(0, 20000) });
    if (task) session.lastTask = task.id;
  }
  const ansAgent = agent || (task && idx.agent[task.agent]);
  conLine(`✓ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, "sys ok done");
  finish();
  // notice lasting facts about you in what you said, and offer to remember them
  if (answer && ansAgent?.id !== "private") window.suggestMemory?.(text, ansAgent ? effModelId(ansAgent) : null);

  function finish(msg) {
    if (msg) conLine(msg, "sys dim");
    con.busy = false; con.ac = null;
    setHot([]);
    conStatus("idle");
    saveSession();
  }
}

// ----- events -----
$("#conForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (con.busy) { con.ac?.abort(); return; }
  const i = $("#conInput"), v = i.value;
  if (!v.trim() && !con.att.length) return;
  if (con.att.some((a) => a.uploading)) { conTrayNote("Still uploading…"); return; }
  i.value = "";
  dispatch(v);
});
$("#conToggle").addEventListener("click", () => conOpen(!con.open));
$("#console").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-con]");
  if (b) {
    const a = b.dataset.con;
    if (a === "new") startNewChat();
    else if (a === "chats") drawerOpen($("#conDrawer").hidden);
    else if (a === "close-drawer") drawerOpen(false);
    else if (a === "full") conFull(!con.full);
    else if (a === "files") { conOpen(true); dispatch("/files"); }
    else if (a === "web") {
      if (!D.web?.enabled) { conOpen(true); conLine(`Web search isn't set up yet. On the Nexus HQ computer run <b>cd ~/Documents/nexus-hq && bash setup-web-search.sh</b>, then refresh this page.`, "sys"); }
      else { const order = ["auto", "on", "off"]; store.set("hq.web", order[(order.indexOf(webMode()) + 1) % 3]); renderWebChip(); }
    }
    return;
  }
  const ren = e.target.closest("[data-ren]");
  if (ren) return renameChat(ren.dataset.ren);
  const o = e.target.closest("[data-sid]");
  if (o) return openSession(o.dataset.sid);
  const del = e.target.closest("[data-del]");
  if (del && confirm("Delete this saved chat?")) {
    try { await api("DELETE", `/api/sessions/${del.dataset.del}`); } catch {}
    if (del.dataset.del === session.id) startNewChat();
    refreshList();
  }
});
document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); conOpen(true); $("#conInput").focus(); }
  if (e.key === "Escape" && con.full && !panel) conFull(false);
}, { capture: true });

async function initConsole() {
  conFull(con.full);
  conOpen(con.open);
  const sid = store.get("hq.session", null);
  if (sid) {
    try { session = await api("GET", `/api/sessions/${sid}`); } catch { session = null; }
  }
  renderWebChip();
  if (proj.name) { try { await setProject(proj.name); } catch { proj.name = ""; } }
  renderProjectChip();
  if (!session) session = blankSession();
  store.set("hq.session", session.id);
  renderLog();
}

// ---------- GitHub + projects (console commands) ----------
const proj = { name: store.get("hq.project", ""), files: 0 };
async function jfetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j;
}
function renderProjectChip() {
  const el = $("#conProject"); if (!el) return;
  el.hidden = !proj.name;
  el.textContent = proj.name ? `▣ ${proj.name} · ${proj.files} file${proj.files === 1 ? "" : "s"}` : "";
  document.body.classList.toggle("has-project", !!proj.name);
}
async function setProject(name) {
  if (!name) { proj.name = ""; proj.files = 0; store.set("hq.project", ""); renderProjectChip(); return; }
  const j = await jfetch(`/api/projects/${encodeURIComponent(name)}`, { method: "POST" });
  proj.name = j.name; proj.files = j.files.length; store.set("hq.project", j.name); renderProjectChip();
  return j;
}
async function saveToProject(filePath, content) {
  if (!proj.name) throw new Error("No project open. Type /project new my-app first.");
  const j = await jfetch(`/api/projects/${encodeURIComponent(proj.name)}/file`, { method: "PUT", body: JSON.stringify({ path: filePath, content }) });
  proj.files = j.files; renderProjectChip();
  return j;
}
// Code blocks labelled with a file path (```js src/app.js, or a first-line comment like // src/app.js)
function labelledBlocks(text) {
  const out = [];
  String(text || "").split("```").forEach((part, i) => {
    if (i % 2 === 0) return;
    const nl = part.indexOf("\n"); if (nl === -1) return;
    const info = part.slice(0, nl).trim(), body = part.slice(nl + 1).replace(/\n$/, "");
    const p = codePathHint(info, body);
    if (p) out.push({ path: p, content: stripPathComment(body, p) });
  });
  return out;
}

const ghEnabled = () => !!D?.github?.enabled;
const GH_SETUP = `GitHub isn't connected yet. Create a fine-grained token at <b>github.com/settings/personal-access-tokens</b> (Contents and Pull requests: read and write), add <b>GITHUB_TOKEN=...</b> to .env, then run <b>sudo systemctl restart nexus-hq</b>.`;

// Simple line diff (LCS) for showing what changed
function lineDiff(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  if (A.length * B.length > 2.5e6) return { add: B.length, del: A.length, rows: null };
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const rows = []; let i = 0, j = 0, add = 0, del = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { rows.push([" ", A[i]]); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { rows.push(["+", B[j++]]); add++; }
    else { rows.push(["-", A[i++]]); del++; }
  }
  return { add, del, rows };
}
function diffHTML(rows) {
  if (!rows) return `<div class="dim">Too large to show line by line.</div>`;
  const keep = new Set();
  rows.forEach((r, k) => { if (r[0] !== " ") for (let d = -2; d <= 2; d++) keep.add(k + d); });
  let html = "", gap = false;
  rows.forEach((r, k) => {
    if (!keep.has(k)) { if (!gap) { html += `<div class="dl gap">⋯</div>`; gap = true; } return; }
    gap = false;
    html += `<div class="dl ${r[0] === "+" ? "add" : r[0] === "-" ? "del" : ""}"><span>${r[0]}</span>${esc(r[1]) || " "}</div>`;
  });
  return `<div class="diff">${html}</div>`;
}
function prCardHTML(it) {
  const files = it.files.map((f) => {
    const d = lineDiff(f.old ?? "", f.content);
    return `<details class="pr-file"><summary><b>${esc(f.path)}</b> <span class="dim">${f.old == null ? "new file" : ""}</span> <span class="plus">+${d.add}</span> <span class="minus">−${d.del}</span></summary>${diffHTML(d.rows)}</details>`;
  }).join("");
  const action = it.merged
    ? `<a class="btn" href="${esc(safeUrl(it.prUrl))}" target="_blank" rel="noopener">✓ Merged into ${esc(it.repo)} (#${esc(it.prNumber)}) ↗</a>`
    : it.prUrl
    ? `<a class="btn" href="${esc(safeUrl(it.prUrl))}" target="_blank" rel="noopener">Pull request #${esc(it.prNumber)} opened ↗</a> <button class="btn primary" data-gh="merge" style="--c:var(--chat)">Merge now</button> <span class="dim">or review it on GitHub first</span>`
    : `<button class="btn primary" data-gh="open-pr" style="--c:var(--chat)">Open pull request on ${esc(it.repo)}</button> <span class="dim">nothing changes on GitHub until you click</span>`;
  return `<div class="pr-card"><div class="pr-h">Proposed changes · <b>${esc(it.repo)}</b></div><div class="pr-t">${esc(it.title)}</div>${files}<div class="pr-a">${action}</div></div>`;
}

// Parse the Builder's "=== FILE: path ===" blocks
function parseFileBlocks(text) {
  const out = [], re = /^=== FILE: (.+?) ===\s*\n([\s\S]*?)\n=== END FILE ===/gm;
  let m;
  while ((m = re.exec(text))) {
    let body = m[2];
    const fence = body.match(/^```[^\n]*\n([\s\S]*?)\n```\s*$/); // tolerate a fenced block inside
    if (fence) body = fence[1];
    body = body.split("\n").filter((l) => !/^#####\s+(BEGIN|END)\s/.test(l)).join("\n");
    out.push({ path: m[1].trim().replace(/\s+\(.*\)$/, ""), content: body.replace(/\s+$/, "") + "\n" });
  }
  return out;
}

// Parse "=== EDIT: path ===" blocks of FIND/REPLACE pairs (small edits inside existing files)
function parseEditBlocks(text) {
  const out = [], re = /^=== EDIT: (.+?) ===\s*\n([\s\S]*?)\n=== END EDIT ===/gm;
  let m;
  while ((m = re.exec(text))) {
    const pairs = [], pr = /<{3,}\s*FIND\s*\n([\s\S]*?)\n={3,}\s*\n([\s\S]*?)\n?>{3,}\s*REPLACE/g;
    let q;
    while ((q = pr.exec(m[2]))) pairs.push({ find: q[1], replace: q[2] });
    if (pairs.length) out.push({ path: m[1].trim(), pairs });
  }
  return out;
}
// Apply FIND/REPLACE pairs; each FIND must match exactly one place (exactly, or ignoring indentation/trailing spaces).
function applyEdits(text, pairs) {
  let cur = text;
  for (const { find, replace } of pairs) {
    if (!find.trim()) return { error: "an edit had nothing to find" };
    const n = cur.split(find).length - 1;
    if (n === 1) { cur = cur.replace(find, () => replace); continue; }
    if (n > 1) return { error: `"${find.trim().split("\n")[0].slice(0, 50)}" appears ${n} times` };
    const lines = cur.split("\n"), fl = find.split("\n").map((l) => l.trim());
    while (fl.length && !fl[fl.length - 1]) fl.pop();
    const hits = [];
    for (let i = 0; i + fl.length <= lines.length; i++) if (fl.every((l, k) => lines[i + k].trim() === l)) hits.push(i);
    if (!hits.length) {
      // Model noise: drop FIND lines that don't exist anywhere in the file, then try once more
      const set = new Set(lines.map((l) => l.trim()));
      const kept = fl.filter((l) => !l || set.has(l));
      while (kept.length && !kept[kept.length - 1]) kept.pop();
      while (kept.length && !kept[0]) kept.shift();
      if (kept.length && kept.length < fl.length) {
        for (let i = 0; i + kept.length <= lines.length; i++) if (kept.every((l, k) => lines[i + k].trim() === l)) hits.push(i);
        if (hits.length === 1) {
          const junk = new Set(fl.filter((l) => l && !set.has(l)));
          const rep = replace.split("\n").filter((l) => !junk.has(l.trim()) || set.has(l.trim()));
          lines.splice(hits[0], kept.length, ...rep); cur = lines.join("\n"); continue;
        }
      }
    }
    if (hits.length !== 1) return { error: hits.length ? `"${fl[0].slice(0, 50)}" appears ${hits.length} times` : `couldn't find "${fl[0].slice(0, 50)}"` };
    lines.splice(hits[0], fl.length, ...replace.split("\n"));
    cur = lines.join("\n");
  }
  return { text: cur };
}

// Remembered repo, so "/update what to change" works without retyping the name
let ghRepoList = null;
const curRepo = () => store.get("hq.repo", "");
async function knownRepo(name) {
  if (!name) return null;
  if (!ghRepoList?.length) { try { ghRepoList = (await jfetch("/api/github/repos")).repos; } catch { ghRepoList = null; } }
  const n = name.toLowerCase().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  return (ghRepoList || []).find((r) => r.name.toLowerCase() === n || r.full_name.toLowerCase() === n)?.name || null;
}

// ----- photos -----
const photoUrl = (name, thumb) => `/api/photos/file/${encodeURIComponent(name)}?${thumb ? "thumb=1&" : ""}${authToken ? `t=${encodeURIComponent(authToken)}` : ""}`;
const modelSees = (id) => !!D?.models?.find((m) => m.id === id && m.ready && m.vision && m.enabled !== false && !m.overBudget);
// The model to use when photos are involved: the agent's own if it can see, otherwise a local one that can (null = keep, false = none)
function visionFor(agent) {
  const own = effModelId(agent);
  if (modelSees(own)) return null;
  const alt = ["gemma", ...D.models.filter((m) => m.provider === "ollama").map((m) => m.id), "opus"].find(modelSees);
  if (!alt) return false;
  conLine(`📷 ${esc(modelOf(agent).label)} can't see images, so ${esc(idx.model[alt]?.label || alt)} looks at the photo for ${esc(agent.name)}`, "sys dim");
  return alt;
}
// Shrink big photos before upload (max 1600px), and make a small thumbnail
async function shrinkImage(file, max = 1600, q = 0.85) {
  const load = () => new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error(/hei[cf]/i.test(file.type + file.name) ? "This browser can't open HEIC photos. On iPhone they're converted automatically; on the PC save it as JPG first." : "That file isn't an image this browser can open.")); img.src = URL.createObjectURL(file); });
  const img = await load();
  const draw = (m, qq) => { const k = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", qq); };
  const out = { data: draw(max, q), thumb: draw(360, 0.75) };
  URL.revokeObjectURL(img.src);
  return out;
}
async function uploadPhoto(file) {
  const { data, thumb } = await shrinkImage(file);
  const r = await jfetch("/api/photos", { method: "POST", body: JSON.stringify({ data, thumb, name: file.name && !/^image\.\w+$/i.test(file.name) ? file.name : "" }) });
  return { name: r.name, preview: thumb };
}
con.att = [];
function renderTray() {
  const t = $("#conTray"); if (!t) return;
  t.hidden = !con.att.length;
  t.innerHTML = con.att.map((a, i) => `<div class="tray-item ${a.uploading ? "up" : ""} ${a.error ? "bad" : ""}" title="${esc(a.error || a.name || "uploading…")}"><img src="${esc(a.preview || "")}" alt=""><button type="button" data-untray="${i}" aria-label="Remove photo">✕</button>${a.uploading ? `<span class="spin"></span>` : ""}</div>`).join("") + (con.att.length ? `<span class="tray-hint dim">${con.att.some((a) => a.uploading) ? "uploading…" : `${con.att.length} photo${con.att.length > 1 ? "s" : ""} attached · ask about ${con.att.length > 1 ? "them" : "it"} or just press Run`}</span>` : "");
}
function conTrayNote(msg) { const h = $("#conTray .tray-hint"); if (h) h.textContent = msg; }
async function attachFiles(files) {
  const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp|gif)$/i.test(f.name)).slice(0, Math.max(0, 4 - con.att.length));
  if (!list.length) return;
  conOpen(true);
  for (const f of list) {
    const a = { uploading: true, preview: "" };
    con.att.push(a); renderTray();
    try { a.preview = (await shrinkImage(f, 160, 0.6)).data; renderTray(); Object.assign(a, await uploadPhoto(f)); }
    catch (e) { a.error = e.message; conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); con.att.splice(con.att.indexOf(a), 1); }
    a.uploading = false; renderTray();
  }
  $("#conInput").focus();
}
function attachExisting(name) {
  if (con.att.length >= 4 || con.att.some((a) => a.name === name)) return;
  con.att.push({ name, preview: photoUrl(name, true) }); renderTray(); conOpen(true); $("#conInput").focus();
}
document.addEventListener("change", (e) => { if (e.target.id === "conFile" || e.target.id === "conCamFile") { attachFiles(e.target.files); e.target.value = ""; } });
document.addEventListener("click", (e) => {
  const u = e.target.closest("[data-untray]"); if (u) { con.att.splice(Number(u.dataset.untray), 1); renderTray(); return; }
  if (e.target.closest("#conAttach")) return $("#conFile").click();
  if (e.target.closest("#conCam")) return $("#conCamFile").click();
});
document.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length && e.target.closest?.("#console")) { e.preventDefault(); attachFiles(f); } });
["dragover", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
  if (!e.target.closest?.("#console") || !e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  if (ev === "drop") attachFiles(e.dataTransfer.files);
}));

// ----- Obsidian vault: notes -----
const vaultOn = () => !!D?.vault?.enabled;
// Condensed from the obsidian-markdown skill in kepano/obsidian-skills (MIT), sized for a 12B local model.
const NOTE_RULES = `Write an Obsidian note in Obsidian Flavored Markdown:
- Start with "# Title". Use "## " headings for sections, short paragraphs, bullet lists, and Markdown tables for comparisons or specs.
- Link related notes with [[Exact Note Title]], but only titles from the list you are given. Use [text](url) only for web links.
- Use callouts for the key takeaway and any caveat, e.g.:
> [!summary] Key takeaway
> one or two lines
> [!warning] Caveat
> one line
- Use ==highlight== for at most two critical facts.
- No frontmatter, no HTML, no "Sources" section (the app adds those). Don't invent facts that aren't in the material.`;

async function vaultContext(q) {
  try {
    const { results } = await jfetch(`/api/vault/search?q=${encodeURIComponent(q)}&k=3`);
    if (!results?.length) return { text: "" };
    conLine(`📓 using ${results.length === 1 ? "a note" : `${results.length} notes`} from your vault: ${results.map((r) => `<button class="linkbtn" data-note="${esc(r.path)}">${esc(r.title)}</button>`).join(", ")}`, "sys dim");
    const body = results.map((r) => `### ${r.title}\n${r.text.slice(0, 1400)}`).join("\n\n").slice(0, 4200);
    return { text: `Notes from the user's own Obsidian vault that may be relevant (use them when they help, prefer them over guesses, and mention the note by its title if you rely on it):\n\n${body}\n\n` };
  } catch { return { text: "" }; }
}

function parseNoteReply(text, fallbackTitle) {
  const t = String(text || "").replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1");
  const title = (t.match(/^\s*TITLE:\s*(.+)$/im) || [])[1]?.trim().replace(/^["'#\s]+|["']$/g, "") || fallbackTitle;
  const tags = ((t.match(/^\s*TAGS:\s*(.+)$/im) || [])[1] || "").split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim()).filter(Boolean);
  let body = t.includes("\n---") ? t.slice(t.indexOf("\n---") + 4) : t.replace(/^\s*(TITLE|TAGS):.*$/gim, "");
  body = body.replace(/^\s*---\s*\n/, "").trim();
  if (!/^#\s/.test(body)) body = `# ${title}\n\n${body}`;
  return { title: title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || fallbackTitle, tags, body };
}

function noteCard(r, note, extra = "") {
  return `📓 ${r.mode === "updated" ? "Updated your existing note" : "Saved a new note"} <button class="linkbtn" data-note="${esc(r.path)}"><b>${esc(r.title)}</b></button> <span class="dim">${esc(r.path)}${r.mode === "updated" ? " · no duplicate made" : ""}</span>${note?.tags?.length ? `<br><span class="dim">${note.tags.map((t) => "#" + esc(t)).join(" ")}</span>` : ""}${extra}`;
}

async function writeNote(agent, ask, fallbackTitle, statusText) {
  const { notes } = await jfetch("/api/vault");
  const titles = notes.filter((n) => !n.private).map((n) => n.title).slice(0, 60);
  setHot([`agent:${agent.id}`, `dept:${agent.dept}`]);
  conStatus(statusText, true);
  const r = await streamChat(effModelId(agent), `${systemFor(agent, null)}\n\n${NOTE_RULES}`,
    [{ role: "user", content: `${ask}\n\nExisting notes you may link to: ${titles.map((t) => `[[${t}]]`).join(", ") || "(none yet)"}\n\nReply in exactly this format and nothing else:\nTITLE: <short title, no : / ? # characters>\nTAGS: <3 to 5 lowercase tags, comma separated>\n---\n<the note body>` }],
    con.ac?.signal, () => {}, { fallback: agent.fallback });
  if (r.error) throw new Error(r.error);
  return parseNoteReply(r.text, fallbackTitle);
}

// Keep app actions (GitHub, notes, memory) in the conversation, so the agents understand follow-ups
function rememberTurn(user, assistant) {
  const plain = String(assistant || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  session.history.push({ role: "user", content: user }, { role: "assistant", content: plain.slice(0, 1500) });
}

// One repo's overview note in Repos/<name>.md (the change log is kept)
async function writeRepoNote(writer, repoName) {
  const snap = await jfetch(`/api/github/snapshot?repo=${encodeURIComponent(repoName)}&budget=16000`);
  if (snap.empty) return { skipped: "empty repo", title: repoName };
  const note = await writeNote(writer, `Write the "Overview" section of a note about the GitHub repository ${snap.repo}: what it is, how it's organized (key folders and files), how to run or use it, and its current state. Base it only on these files.\n\nAll files:\n${snap.paths.slice(0, 150).join("\n")}\n\n${snap.files.map((f) => `--- ${f.path} ---\n${f.text.slice(0, 3000)}`).join("\n\n")}`, repoName, `${writer.name} writing the ${repoName} note…`);
  const overview = note.body.replace(/^#\s.*\n+/, "").replace(/^##\s+Overview\s*\n+/i, "");
  const r = await jfetch("/api/vault/repo", { method: "POST", body: JSON.stringify({ repo: snap.repo, url: snap.url, overview }) });
  return { ...r, note };
}

// "add all my repos to my vault": one note per repo, one after another (Stop ends it early)
async function repoNotesAll(q) {
  if (!vaultOn()) { conLine("The notes vault is turned off (VAULT_DIR=off in .env), so there's nowhere to save repo notes.", "sys"); return; }
  const writer = idx.agent.docs || idx.agent.writer || D.agents.find((a) => a.dept === "chat");
  const { repos } = await jfetch("/api/github/repos");
  const list = repos.filter((r) => r.size > 0), empty = repos.length - list.length;
  conLine(`📚 Adding <b>${list.length}</b> repos to your vault, one note each in <b>Repos/</b>${empty ? ` (${empty} empty repo${empty > 1 ? "s" : ""} skipped)` : ""}. Each takes roughly 20–60 seconds on your GPU · press <b>Stop</b> to end early.`, "sys");
  con.busy = true; con.ac = new AbortController();
  const done = [], failed = [];
  try {
    for (let i = 0; i < list.length; i++) {
      if (con.ac.signal.aborted) break;
      const name = list[i].name;
      conStatus(`${i + 1}/${list.length} · ${name}`, true);
      try {
        const r = await writeRepoNote(writer, name);
        if (con.ac.signal.aborted) break;
        if (r.skipped) { conLine(`– ${esc(name)}: skipped (${esc(r.skipped)})`, "sys dim"); continue; }
        done.push(r);
        conLine(`✓ ${i + 1}/${list.length} <button class="linkbtn" data-note="${esc(r.path)}">${esc(r.title)}</button>`, "sys dim");
      } catch (e) { if (con.ac.signal.aborted) break; failed.push(name); conLine(`✗ ${esc(name)}: ${esc(e.message)}`, "sys dim"); }
    }
  } finally { con.busy = false; con.ac = null; setHot([]); conStatus("idle"); }
  const stopped = done.length + failed.length < list.length;
  conLine(`📚 ${stopped ? "Stopped. " : ""}<b>${done.length}</b> repo note${done.length === 1 ? "" : "s"} in your vault${failed.length ? ` · couldn't read ${failed.map(esc).join(", ")}` : ""}. Open the <b>Vault</b> tab to see them; I'll use them when you ask about your projects.`, "sys ok");
  rememberTurn(q, `Saved overview notes for ${done.length} repos into the vault (Repos/ folder): ${done.map((r) => r.title).join(", ")}.${stopped ? " The user stopped it before the rest." : ""}`);
  try { D.vault.notes = (await jfetch("/api/vault")).notes.length; } catch {}
}

// "sync my repos": refresh the repo notes from GitHub now (it also runs on its own every 30 minutes)
async function repoSyncNow(q) {
  const t0 = Date.now();
  let st = await jfetch("/api/vault/sync", { method: "POST" });
  if (!st.enabled) { conLine(`Repo sync is off: ${esc(st.reason || "")}.`, "sys"); return; }
  conLine("🔄 Checking every repo on GitHub for changes. New commits go into each repo's note, and changed repos get a fresh overview.", "sys");
  con.busy = true; con.ac = new AbortController();
  try {
    while (st.running && !con.ac.signal.aborted && Date.now() - t0 < 20 * 60e3) {
      conStatus(`syncing repos… ${Math.round((Date.now() - t0) / 1000)}s`, true);
      await new Promise((r) => setTimeout(r, 2500));
      st = await jfetch("/api/vault/sync");
    }
  } finally { con.busy = false; con.ac = null; conStatus("idle"); }
  const fresh = (st.events || []).filter((e) => new Date(e.at) >= t0 - 1000);
  conLine(st.running ? "Still syncing in the background; the notes will update when it finishes." : `✓ Repo notes are up to date${fresh.length ? ":<br>" + fresh.map((e) => `· ${esc(e.text)}`).join("<br>") : " (nothing changed since the last check)."}`, "sys ok");
  rememberTurn(q, `Synced the repo notes in the vault with GitHub. ${fresh.map((e) => e.text).join("; ") || "Nothing had changed."}`);
}

// "save this to my notes", "make a note about ...", "note this"
async function noteCommand(q) {
  if (/^(please\s+)?(can you\s+)?(sync|refresh|update|resync)\s+(all\s+)?(my\s+)?(repos?|repo notes|repository notes|github notes|vault with github|notes from github)(\s+notes)?(\s+(now|in my vault|to my vault))?\s*[.!?]*$/i.test(q)) { await repoSyncNow(q); return true; }
  const saveRe = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:save|add|put|store|keep|copy|send)\s+(?:this|that|it|the (?:last )?answer|this answer|that answer)(?:\s+(?:to|in|into|as)\s+(?:a\s+)?(?:my\s+)?(?:notes?|obsidian|vault))?\s*[.!?]*$|^(?:note this|save (?:to|in) (?:my )?(?:notes|obsidian|vault))\s*[.!?]*$/i;
  const makeRe = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:make|write|create|start|add)\s+(?:me\s+)?(?:a|an)?\s*(?:new\s+)?(?:obsidian\s+)?note\s+(?:about|on|for|of)\s+([\s\S]+?)\s*[.!?]*$/i;
  const saving = saveRe.test(q) && /note|obsidian|vault|^save this$|^save that$|note this/i.test(q);
  const mk = q.match(makeRe);
  if (!saving && !mk) return false;
  const writer = idx.agent.docs || idx.agent.writer || D.agents.find((a) => a.dept === "chat");
  con.busy = true; con.ac = new AbortController();
  try {
    if (saving) {
      const items = session.items, oi = items.map((i, k) => [i, k]).reverse().find(([i]) => i.k === "out" && i.text && !i.error);
      if (!oi) { conLine("There's no answer in this chat to save yet. Ask something first, then say <b>save this to my notes</b>.", "sys"); return true; }
      const [out, at] = oi;
      const qItem = [...items.slice(0, at)].reverse().find((i) => i.k === "cmd" && !/^(save|note|remember|forget)/i.test(i.text || ""));
      const question = qItem?.text || out.text.slice(0, 80);
      const note = await writeNote(writer, `Turn this question and answer into a clean, reusable note.\n\nQuestion: ${question}\n\nAnswer:\n${out.text.slice(0, 9000)}`, question.slice(0, 70), `${writer.name} writing note…`);
      if (out.sources?.length) note.body += `\n\n## Sources\n${out.sources.map((x) => `- [${x.title.replace(/[\[\]]/g, "")}](${x.url})`).join("\n")}`;
      const r = await jfetch("/api/vault/note", { method: "POST", body: JSON.stringify({ ...note, key: question + (qItem?.images?.length ? ` ${qItem.images.join(" ")}` : ""), source: "nexus-hq answer", attachments: qItem?.images || [] }) });
      conLine(noteCard(r, note), "sys ok");
      rememberTurn(q, `Saved the last answer as the note "${r.title}" in the vault (${r.mode}).`);
    } else {
      const topic = mk[1].trim();
      if (ghEnabled() && /\b(all|every|each)\b.*\b(repos|repositories|projects)\b/i.test(topic)) { con.busy = false; con.ac = null; await repoNotesAll(q); return true; }
      // "make a note about my X repo" -> the repo's note in Repos/ (overview kept, change log untouched)
      const repoName = ghEnabled() ? (await knownRepo((topic.match(/\b([\w.-]+)\s+repo\b/i) || [])[1]) || (await ghIntent(topic))?.repo) : null;
      if (repoName && /\brepo\b/i.test(topic)) {
        conLine(`📦 reading <b>${esc(repoName)}</b> from GitHub…`, "sys");
        const r = await writeRepoNote(writer, repoName);
        if (r.skipped) conLine(`<b>${esc(repoName)}</b> is empty, so there's nothing to write a note about yet.`, "sys");
        else { conLine(noteCard({ ...r, mode: "updated" }, r.note, `<br><span class="dim">One note per repo: the overview is refreshed and the merge log is kept.</span>`), "sys ok"); rememberTurn(q, `Saved an overview note for the ${repoName} repo in the vault.`); }
      } else {
        const ctxNotes = await vaultContext(topic);
        const recent = contextTurns(6000, 4).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
        const note = await writeNote(writer, `Write a note about: ${topic}\n\n${ctxNotes.text}${recent ? `Recent conversation (use it if it's about this topic):\n${recent.slice(-5000)}\n\n` : ""}If you aren't sure of a fact, leave it out or mark it with a [!question] callout.`, topic.slice(0, 70), `${writer.name} writing note…`);
        const r = await jfetch("/api/vault/note", { method: "POST", body: JSON.stringify({ ...note, key: `note about ${topic}`, source: "nexus-hq note" }) });
        conLine(noteCard(r, note), "sys ok");
      }
    }
    D.vault.notes = (await jfetch("/api/vault")).notes.length;
  } catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); }
  finally { con.busy = false; con.ac = null; setHot([]); conStatus("idle"); }
  return true;
}

// ----- long-term memory -----
// "remember that my main repo is NexusLLM", "what do you remember", "forget the one about X", /remember, /memory, /forget
async function memoryCommand(q) {
  let m;
  const show = async () => {
    const { items } = await jfetch("/api/memory"); D.memory = items;
    conLine(items.length ? `<b>What I remember</b> (every agent sees this):<br>${items.map((x, i) => `${i + 1}. ${esc(x.text)} <button class="linkbtn" data-forget="${esc(x.id)}">forget</button>`).join("<br>")}` : "I'm not remembering anything yet. Say <b>remember that ...</b> to add something.", "sys");
  };
  try {
    if ((m = q.match(/^(?:\/remember\s+|(?:please\s+)?(?:can you\s+)?remember\s+(?:that\s+)?)([\s\S]{3,})$/i))) {
      const text = m[1].replace(/[.?!]+$/, "").trim();
      const r = await jfetch("/api/memory", { method: "POST", body: JSON.stringify({ text }) });
      D.memory = r.items;
      rememberTurn(q, `Remembered: ${r.item.text}`);
      conLine(`🧠 Got it. I'll remember: <b>${esc(r.item.text)}</b> <span class="dim">(every agent, every chat · /memory to see all)</span>`, "sys ok");
      return true;
    }
    if (/^(\/memory|what do you remember\??|show (me )?(your )?memory|what('s| is) in (your )?memory\??)$/i.test(q)) { await show(); return true; }
    if ((m = q.match(/^(?:\/forget|forget)\s+(?:that\s+|the one about\s+|about\s+)?([\s\S]+)$/i))) {
      const { items } = await jfetch("/api/memory"), key = m[1].trim().toLowerCase();
      const hit = /^\d+$/.test(key) ? items[Number(key) - 1] : items.find((x) => x.text.toLowerCase().includes(key));
      if (!hit) { conLine(`I couldn't find a memory matching <b>${esc(m[1])}</b>.`, "sys"); await show(); return true; }
      const r = await jfetch(`/api/memory/${hit.id}`, { method: "DELETE" }); D.memory = r.items;
      conLine(`Forgot: <b>${esc(hit.text)}</b>`, "sys ok");
      return true;
    }
  } catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); return true; }
  return false;
}
document.addEventListener("click", async (e) => {
  const f = e.target.closest("[data-forget]"); if (!f) return;
  try { const r = await jfetch(`/api/memory/${f.dataset.forget}`, { method: "DELETE" }); D.memory = r.items; f.closest(".ln").innerHTML += ` <span class="dim">· forgotten</span>`; f.remove(); } catch {}
});

// Plain-English GitHub requests: "read my NexusLLM repo", "add a FAQ to my NexusLLM repo", "show my repos".
// Only kicks in when you clearly mean YOUR repos, so "how do I create a git repo?" still goes to the agents.
async function ghIntent(q) {
  const t = q.toLowerCase().replace(/\bread\s+me\b/g, "readme");
  const mine = /\b(my|our)\s+(github|repos?|repositor(y|ies))\b|\b(this|the|current|that)\s+repo\b|\bmy\s+[\w.-]+\s+repo\b|\bon (my )?github\b/.test(t);
  if (!ghRepoList?.length) { try { ghRepoList = (await jfetch("/api/github/repos")).repos; } catch { ghRepoList = null; } }
  const named = (ghRepoList || []).filter((r) => r.name.length >= 3 && new RegExp(`(^|[^\\w.-])${r.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w.-]|$)`).test(t))
    .sort((a, b) => b.name.length - a.name.length)[0]?.name;
  // Follow-ups in the same chat: "add an example readme to it", "now fix the readme"
  // Recent = one of your last 3 messages was a GitHub request
  const turn = session.items.filter((i) => i.k === "cmd").length;
  const lastGh = session.ghTurn != null && turn - session.ghTurn <= 3;
  const follow = !mine && !named && session.repo && lastGh &&
    /\b(it|that|this|there|the repo|readme|read ?me|file|section|folder|docs?)\b/.test(t) &&
    /\b(add|update|change|edit|fix|put|write|insert|remove|delete|del|rename|replace|create|append|include|make|improve|rewrite|document|get rid|rid of|clean|clear|strip|keep only|only keep|erase|wipe|undo|revert|reset|trim|shorten|move|set|reword|format|reformat|organi[sz]e|restructure|swap|bump|upgrade|refactor|implement|build|generate|convert|translate|read|review|check|didn'?t|did not|still|again|undo)\b/.test(t);
  if (!mine && !named && !follow) return null;
  const readRe = /\b(read|review|look (at|over|through)|check|summari[sz]e|explain|go (over|through)|analy[sz]e|audit|scan|tell me about|what('s| is) in)\b/;
  const addRe = /\b(add|update|change|edit|fix|put|write|insert|remove|delete|del|rename|replace|create|append|include|make|improve|rewrite|document|get rid|rid of|clean|clear|strip|keep only|only keep|erase|wipe|undo|revert|reset|trim|shorten|move|set|reword|format|reformat|organi[sz]e|restructure|swap|bump|upgrade|refactor|implement|build|generate|convert|translate)\b/;
  const ri = t.search(readRe), ai = t.search(addRe);
  // Neither kind of verb: a question ("what's in my X repo?") reads; anything else is a change request
  const question = /^\s*(what|how|why|is|are|does|do|which|where|who|when|tell me|explain|show)\b/.test(t);
  const kind = ri === -1 && ai === -1 ? ((named || follow) ? (question ? "read" : "add") : null) : ai === -1 ? "read" : ri === -1 ? "add" : ri < ai ? "read" : "add";
  // "add all my repos to my vault", "read all my repos", "remember everything in my repos"
  const allRepos = !named && /\b(all|every|each|everything in)\b[^.?!]{0,24}\b(repos|repositories|projects)\b|\b(repos|repositories)\b[^.?!]{0,12}\ball\b/.test(t);
  const vaultish = /\b(vault|notes?|obsidian|remember|memor\w*|learn|know|index|catalog|import|sync)\b/.test(t);
  if (allRepos && (vaultish || (kind && !/\b(list|show|which|what are|see)\b/.test(t)))) {
    if (vaultish || kind === "read") return { kind: "allnotes" };
    return { kind: "ask", want: "add", q, msg: "I make repo changes one repo at a time, so you can check each diff before it goes in. Which repo first? (To have me read and remember all of them, say <b>add all my repos to my vault</b>.)" };
  }
  if (!named && /\b(repos|repositories)\b/.test(t) && (kind === "read" || /\b(list|show|which|what are|see)\b/.test(t) || !kind)) return { kind: "list" };
  if (!kind) return null;
  const remembered = (D.memory || []).map((m) => m.text.match(/\b(?:main|default|primary)\s+(?:github\s+)?repo(?:sitory)?\s+is\s+([\w.-]+)/i)?.[1]).find(Boolean);
  const repo = named || (follow ? session.repo : null) || curRepo() || (await knownRepo(remembered));
  if (!repo) return { kind: "ask", want: kind, q, msg: `Which repo? Say it by name, e.g. <b>${kind === "read" ? "read my NexusLLM repo" : "add a FAQ to my NexusLLM repo"}</b>. Your repos: ${(ghRepoList || []).slice(0, 14).map((r) => `<b>${esc(r.name)}</b>`).join(", ") || "none found"}. Or say <b>all of them</b>.` };
  return { kind, repo, follow: !!follow && !named };
}

async function ghCommand(q) {
  const [cmd, ...restArr] = q.split(/\s+/); const rest = q.slice(cmd.length).trim();
  const isGh = ["/github", "/repos", "/review", "/update", "/repo"].includes(cmd);
  if (isGh && !ghEnabled()) return conLine(GH_SETUP, "sys");

  if (cmd === "/project") {
    const arg = rest.replace(/^new\s+/, "");
    if (!arg) {
      const { projects } = await jfetch("/api/projects");
      return conLine(`${proj.name ? `Current project: <b>${esc(proj.name)}</b> (${proj.files} files). ` : "No project open. "}Start one with <b>/project new my-app</b>.` +
        (projects.length ? `<br>${projects.map((p) => `<button class="linkbtn" data-proj="${esc(p.name)}">${esc(p.name)}</button> <span class="dim">${p.files} files</span>`).join("<br>")}` : ""), "sys");
    }
    if (arg === "close") { await setProject(""); return conLine("Project closed.", "sys dim"); }
    const j = await setProject(arg);
    return conLine(`Working in project <b>${esc(j.name)}</b> (${j.files.length} files). Code blocks with a file path now get a <b>Save</b> button, and <b>/save</b> saves every labelled block from the last answer.`, "sys ok");
  }
  if (cmd === "/files") {
    if (!proj.name) return conLine("No project open. Type <b>/project new my-app</b>.", "sys");
    const j = await jfetch(`/api/projects/${encodeURIComponent(proj.name)}`);
    return conLine(j.files.length ? `<b>${esc(j.name)}</b>:<br>${j.files.map((f) => `${esc(f.path)} <span class="dim">${f.size} B</span>`).join("<br>")}` : `<b>${esc(j.name)}</b> has no files yet.`, "sys");
  }
  if (cmd === "/save") {
    if (!proj.name) return conLine("No project open. Type <b>/project new my-app</b> first.", "sys");
    const last = [...session.items].reverse().find((i) => i.k === "out" && i.text);
    const blocks = labelledBlocks(last?.text);
    if (!blocks.length) return conLine("The last answer has no code blocks labelled with a file path. Use the <b>Save</b> button on a block to name it yourself.", "sys");
    for (const b of blocks) await saveToProject(b.path, b.content);
    return conLine(`Saved to <b>${esc(proj.name)}</b>: ${blocks.map((b) => esc(b.path)).join(", ")}`, "sys ok");
  }
  if (cmd === "/publish") {
    if (!ghEnabled()) return conLine(GH_SETUP, "sys");
    if (!proj.name) return conLine("No project open. Type <b>/project my-app</b> to pick one.", "sys");
    if (!rest) return conLine("Which repo? e.g. <b>/publish my-new-repo</b> (create the empty repo on GitHub first).", "sys");
    const j = await jfetch(`/api/projects/${encodeURIComponent(proj.name)}`);
    if (!j.files.length) return conLine("This project has no files yet.", "sys");
    return conLine(`Publish <b>${j.files.length} files</b> from <b>${esc(proj.name)}</b> to <b>${esc(rest)}</b>? An empty repo gets them as its first commit; a repo that already has code gets a pull request.<br><button class="btn primary" data-gh="publish" data-repo="${esc(rest)}" style="--c:var(--chat)">Publish to GitHub</button>`, "sys");
  }
  if (cmd === "/github") {
    const s = await jfetch("/api/github/status");
    return conLine(`Connected to GitHub as <b>${esc(s.login)}</b>. Just ask in plain words, e.g. <b>read my NexusLLM repo</b> or <b>add a FAQ to my NexusLLM repo</b>.`, "sys ok");
  }
  if (cmd === "/repos") {
    const { repos } = await jfetch("/api/github/repos");
    if (!repos.length) return conLine("No repos found on your account.", "sys");
    return conLine(repos.slice(0, 40).map((r) => `<b>${esc(r.name)}</b> <span class="dim">${esc(r.language || "")} · ${esc((r.description || "").slice(0, 60))}</span> <button class="linkbtn" data-gh="review" data-repo="${esc(r.full_name)}">review</button>`).join("<br>"), "sys");
  }
  if (cmd === "/repo") {
    if (!rest) return conLine(curRepo() ? `Current repo: <b>${esc(curRepo())}</b>. Now just type <b>/update what to change</b>. Switch with <b>/repo other-name</b>.` : "No repo picked. Type <b>/repo NexusLLM</b> (or any repo from <b>/repos</b>).", "sys");
    const r = await knownRepo(restArr[0]);
    if (!r) return conLine(`I can't find a repo called <b>${esc(restArr[0])}</b> on your account. Type <b>/repos</b> to see them.`, "sys");
    store.set("hq.repo", r);
    return conLine(`Current repo: <b>${esc(r)}</b>. Now just type <b>/update what to change</b> or <b>/review</b>.`, "sys ok");
  }
  if (cmd === "/review") {
    const r = (await knownRepo(restArr[0])) || null;
    const repo = r || curRepo();
    if (!repo) return conLine("Which repo? Type <b>/review repo-name</b>, or pick one first with <b>/repo repo-name</b>.", "sys");
    if (r) store.set("hq.repo", r);
    return ghReview(repo, (r ? restArr.slice(1) : restArr).join(" "));
  }
  if (cmd === "/update") {
    const r = await knownRepo(restArr[0]);
    const repo = r || curRepo(), instruction = (r ? restArr.slice(1) : restArr).join(" ").trim();
    if (!repo) return conLine("Which repo? Type <b>/repo repo-name</b> once, then <b>/update what to change</b>. (Or <b>/update repo-name what to change</b>.)", "sys");
    if (!instruction) return conLine(`What should change in <b>${esc(repo)}</b>? e.g. <b>/update in README.md under AI Models, add a line about Gemma 4 12B</b>`, "sys");
    if (r) store.set("hq.repo", r);
    session.repo = repo; session.ghTurn = session.items.filter((i) => i.k === "cmd").length; session.ghLast = instruction.slice(0, 600);
    return ghUpdate(repo, instruction);
  }
}

// Long-running GitHub jobs share the console's busy state
async function ghJob(label, fn) {
  con.busy = true; con.ac = new AbortController();
  const t0 = Date.now();
  conStatus(label, true);
  try { await fn(con.ac.signal); conLine(`✓ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, "sys ok done"); }
  catch (e) { conLine(`<span class="err">${esc(e.message)}</span>`, "sys"); }
  con.busy = false; con.ac = null; setHot([]); conStatus("idle"); saveSession();
}

function ghReview(repo, focus) {
  if (!repo) return conLine("Usage: <b>/review repo-name</b> (optionally add what to focus on)", "sys");
  return ghJob("reading repo…", async (signal) => {
    const rev = idx.agent.reviewer || D.agents.find((a) => a.dept === "code");
    const budget = isLean(rev) ? 48000 : 36000;
    conLine(`📦 reading <b>${esc(repo)}</b> from GitHub…`, "sys");
    const snap = await jfetch(`/api/github/snapshot?repo=${encodeURIComponent(repo)}&budget=${budget}`);
    if (snap.empty) return conLine(`<b>${esc(snap.repo)}</b> is empty.`, "sys");
    conLine(`read ${snap.files.length} of ${snap.paths.length} files (${snap.skipped} skipped: images, builds, lock files)`, "sys dim");
    setHot([`agent:${rev.id}`, `dept:${rev.dept}`]);
    conStatus(`${rev.name} reviewing…`, true);
    const listing = snap.paths.slice(0, 300).join("\n") + (snap.paths.length > 300 ? `\n… and ${snap.paths.length - 300} more` : "");
    const content = `Review the GitHub repository ${snap.repo} (branch ${snap.branch}).${focus ? ` Focus on: ${focus}.` : ""}

All files:
${listing}

Contents of the most important files:
${snap.files.map((f) => `--- ${f.path} ---\n${f.text}`).join("\n\n")}

Write a review: a 2-3 sentence overview of what the project is and how it's built, then the most important problems ranked by severity (bugs, security, data loss, then maintainability) with file names and the fix, then 3 quick wins, then a suggested next step. Only comment on files you were shown.`;
    session.title === "New chat" && (session.title = `Review ${snap.repo}`);
    await work(rev, systemFor(rev, idx.task["review-code"]), [{ role: "user", content }], signal);
    session.history.push({ role: "user", content: `Review repo ${snap.repo}` });
    const last = [...session.items].reverse().find((i) => i.k === "out");
    if (last?.text) session.history.push({ role: "assistant", content: last.text.slice(0, 12000) });
  });
}

function ghUpdate(repo, instruction) {
  return ghJob("planning change…", async (signal) => {
    const builder = idx.agent.builder || D.agents.find((a) => a.dept === "code");
    const reviewer = idx.agent.reviewer || builder;
    conLine(`📦 reading <b>${esc(repo)}</b> from GitHub…`, "sys");
    const overview = await jfetch(`/api/github/snapshot?repo=${encodeURIComponent(repo)}&budget=6000`);
    if (overview.empty) throw new Error(`${overview.repo} is empty. Use /publish to add a project to it.`);

    // 1. Pick which files to read (cheap, local)
    setHot([`agent:${builder.id}`, `dept:${builder.dept}`]);
    conStatus(`${builder.name} finding files…`, true);
    const pick = await streamChat(effModelId(builder), "You pick files in a code repository. Reply with JSON only.",
      [{ role: "user", content: `Repository ${overview.repo}. Files:\n${overview.paths.slice(0, 400).join("\n")}\n\nREADME and key files:\n${overview.files.map((f) => `--- ${f.path} ---\n${f.text.slice(0, 2500)}`).join("\n\n")}\n\nChange requested: """${instruction}"""\n\nWhich existing files must be read or edited to make this change? Reply exactly like {"files": ["path/one", "path/two"]} with at most 8 paths from the list.` }], signal, () => {});
    let want = [];
    try { want = JSON.parse((pick.text.match(/\{[\s\S]*\}/) || ["{}"])[0]).files || []; } catch {}
    want = want.filter((p) => overview.paths.includes(p)).slice(0, 8);
    conLine(`files to work on: ${want.length ? want.map((p) => `<b>${esc(p)}</b>`).join(", ") : "<span class='dim'>none picked, using the most important files</span>"}`, "sys");

    // 2. Read them and write the change (local)
    const snap = await jfetch(`/api/github/snapshot?repo=${encodeURIComponent(repo)}&budget=36000&focus=${encodeURIComponent(want.join(","))}`);
    const originals = Object.fromEntries(snap.files.filter((f) => !f.cut).map((f) => [f.path, f.text]));
    conStatus(`${builder.name} writing…`, true);
    const ask = `Repository ${snap.repo}. Make this change: """${instruction}"""

Other files in the repo (not shown):
${snap.paths.filter((p) => !originals[p]).slice(0, 200).join("\n") || "(none)"}

Current files, each between BEGIN and END markers (the markers are not part of the file):
${snap.files.map((f) => `##### BEGIN ${f.path}${f.cut ? " (only the start is shown; edit it with small FIND/REPLACE edits)" : ` (${f.text.split("\n").length} lines)`}\n${f.text}\n##### END ${f.path}`).join("\n\n")}

How to write the change:
- For an EXISTING file, output only the parts that change, as edits. Copy the FIND lines exactly from the current file (enough lines to be unique). To add something, FIND the line just before where it goes and REPLACE it with that same line followed by the new lines. Several FIND/REPLACE pairs can go in one block:
=== EDIT: path/from/repo/root.ext ===
<<<<<<< FIND
exact existing lines
=======
new lines
>>>>>>> REPLACE
=== END EDIT ===
- For a NEW file, or a SHORT existing file (under 60 lines) that you are mostly rewriting, output the whole file:
=== FILE: path/from/repo/root.ext ===
<the complete file>
=== END FILE ===
Never rewrite a long existing file in full. Never copy the BEGIN/END markers or these instructions into a file. Never add "Co-authored-by" or similar credit lines anywhere. After the last block, write one short paragraph explaining the change.`;
    const r = await work(builder, systemFor(builder, idx.task["write-code"]), [{ role: "user", content: ask }], signal);
    if (r.error) throw new Error(r.error);
    // Safety: never let a change wipe out code the Builder couldn't fully see, or gut a file by accident.
    const allowShrink = /\b(remove|delete|drop|shorten|trim|clean ?up|simplif|strip|cut|get rid|rid of|except|keep only|only keep|erase|wipe|clear|reset|replace)\b/i.test(instruction);
    const blocked = [];
    // Small edits: apply FIND/REPLACE against the full current file (fetched whole if it was too big to show)
    const edited = [];
    for (const ed of parseEditBlocks(r.text)) {
      if (!snap.paths.includes(ed.path)) { blocked.push(`${ed.path} (not in the repo)`); continue; }
      let base = originals[ed.path];
      if (base == null) { try { base = (await jfetch(`/api/github/file?repo=${encodeURIComponent(snap.repo)}&path=${encodeURIComponent(ed.path)}`)).text; originals[ed.path] = base; } catch (e) { blocked.push(`${ed.path} (couldn't read it: ${e.message})`); continue; } }
      const prev = edited.find((x) => x.path === ed.path);
      const res = applyEdits(prev ? prev.content : base, ed.pairs);
      if (res.error) { blocked.push(`${ed.path} (${res.error})`); continue; }
      if (prev) prev.content = res.text; else edited.push({ path: ed.path, content: res.text });
    }
    const changes = [...edited, ...parseFileBlocks(r.text).filter((c) => !edited.some((x) => x.path === c.path))].filter((c) => {
      if (originals[c.path] === c.content) return false;
      if (originals[c.path] == null && snap.paths.includes(c.path)) { blocked.push(`${c.path} (too big to read in full, so it can't be safely rewritten)`); return false; }
      const old = originals[c.path];
      if (old != null && !allowShrink) {
        const oldLines = old.split("\n").length, newLines = c.content.split("\n").length;
        if (oldLines > 15 && newLines < oldLines * 0.6) { blocked.push(`${c.path} (would shrink from ${oldLines} to ${newLines} lines)`); return false; }
      }
      return true;
    });
    if (blocked.length) conLine(`⚠ Skipped unsafe edits: ${blocked.map((b) => `<b>${esc(b)}</b>`).join(", ")}. Nothing was sent for these files.`, "sys");
    if (!changes.length) throw new Error(blocked.length ? "Every proposed edit was unsafe, so nothing was proposed. Try a more specific request, e.g. name the file and section." : "The Builder didn't produce any file changes in the expected format. Try rephrasing the request.");
    const files = changes.map((c) => ({ path: c.path, content: c.content, old: originals[c.path] ?? (snap.paths.includes(c.path) ? "" : null) }));
    // Show a short summary instead of the raw file dump; the diff card below has the details
    const bItem = [...session.items].reverse().find((i) => i.k === "out" && i.agent === builder.id);
    if (bItem) {
      const note = r.text.split(/=== END FILE ===/).pop().trim();
      bItem.text = `Wrote changes to ${files.map((f) => `\`${f.path}\``).join(", ")}.${note ? `\n\n${note}` : ""}\n\n*Full diff in the proposed changes below.*`;
      renderLog();
    }

    // 3. Review just the changes (this is where Opus is worth it)
    setHot([`agent:${reviewer.id}`, `dept:${reviewer.dept}`]);
    conStatus(`${reviewer.name} checking…`, true);
    const shown = files.map((f) => `--- ${f.path} (${f.old == null ? "new file" : "changed"}) ---\n${f.content.slice(0, 9000)}`).join("\n\n").slice(0, 24000);
    await work(reviewer, systemFor(reviewer, idx.task["review-code"]), [{ role: "user", content: `A change was made to ${snap.repo} for this request: """${instruction}"""\n\nNew versions of the changed files:\n${shown}\n\nStart with "VERDICT: ship" or "VERDICT: fix first", then list only real problems with the fix.` }], signal);

    // 4. Show the proposed pull request
    const shortAsk = instruction.replace(/^Earlier request:[\s\S]*?Follow-up \(do this now, on the current files\): /, "");
    const title = shortAsk.length > 70 ? shortAsk.slice(0, 67) + "…" : shortAsk;
    const card = { k: "pr", repo: snap.repo, title: title[0].toUpperCase() + title.slice(1), instruction, files };
    addItem(card);
    rememberTurn(shortAsk, `Prepared a change to ${snap.repo} (${files.map((f) => f.path).join(", ")}). It's waiting for the user to tap "Open pull request".`);
  });
}

// itemEl hook for PR cards
function prItemEl(it) {
  const d = document.createElement("div");
  d.className = "out"; d.style.setProperty("--c", "var(--code)");
  d.innerHTML = prCardHTML(it);
  d._item = it;
  return d;
}

// Clicks inside the console for GitHub/project actions
document.addEventListener("click", async (e) => {
  const sv = e.target.closest(".save-code");
  if (sv) {
    const pre = sv.closest("pre"), code = pre.querySelector("code").textContent;
    let p = pre.dataset.path;
    if (!p) { p = prompt("Save as (path inside the project):", "src/"); if (!p) return; }
    try { await saveToProject(p, stripPathComment(code, p)); sv.textContent = "Saved ✓"; setTimeout(() => (sv.textContent = "Save"), 1500); conLine(`saved <b>${esc(p)}</b> to ${esc(proj.name)}`, "sys dim"); }
    catch (err) { conLine(`<span class="err">${esc(err.message)}</span>`, "sys"); }
    return;
  }
  const pj = e.target.closest("[data-proj]");
  if (pj) { await setProject(pj.dataset.proj); return conLine(`Working in project <b>${esc(proj.name)}</b> (${proj.files} files).`, "sys ok"); }
  const g = e.target.closest("[data-gh]");
  if (!g) return;
  const act = g.dataset.gh;
  if (act === "review") return ghReview(g.dataset.repo);
  if (act === "publish") {
    g.disabled = true; g.textContent = "Publishing…";
    try {
      const r = await jfetch(`/api/projects/${encodeURIComponent(proj.name)}/publish`, { method: "POST", body: JSON.stringify({ repo: g.dataset.repo }) });
      g.outerHTML = r.mode === "initial-commit"
        ? `<a class="btn" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Published ${r.files} files ↗</a>`
        : `<a class="btn" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Repo already had code, so pull request #${r.number} opened ↗</a>`;
      saveSession();
    } catch (err) { g.disabled = false; g.textContent = "Publish to GitHub"; conLine(`<span class="err">${esc(err.message)}</span>`, "sys"); }
    return;
  }
  if (act === "merge") {
    const host = g.closest(".out"), it = host?._item; if (!it) return;
    g.disabled = true; g.textContent = "Merging…";
    try {
      const r = await jfetch("/api/github/merge", { method: "POST", body: JSON.stringify({ repo: it.repo, number: it.prNumber, title: it.title }) });
      if (!r.merged) throw new Error("GitHub didn't merge it. Open the pull request to see why.");
      it.merged = true; host.innerHTML = prCardHTML(it); saveSession();
      conLine(`✓ Merged into <b>${esc(it.repo)}</b>. The change is live on GitHub.`, "sys ok");
    } catch (err) { g.disabled = false; g.textContent = "Merge now"; conLine(`<span class="err">${esc(err.message)}</span>`, "sys"); }
    return;
  }
  if (act === "open-pr") {
    const host = g.closest(".out"), it = host?._item; if (!it) return;
    g.disabled = true; g.textContent = "Opening pull request…";
    try {
      const body = `${it.instruction}\n\nProposed in Nexus HQ. Review the diff before merging.`;
      const r = await jfetch("/api/github/pr", { method: "POST", body: JSON.stringify({ repo: it.repo, title: it.title, body, files: it.files.map((f) => ({ path: f.path, content: f.content })) }) });
      it.prUrl = r.url; it.prNumber = r.number;
      host.innerHTML = prCardHTML(it);
      saveSession();
    } catch (err) { g.disabled = false; g.textContent = `Open pull request on ${it.repo}`; conLine(`<span class="err">${esc(err.message)}</span>`, "sys"); }
  }
});

(async () => { view = location.hash.slice(1) || "map"; await ensureAuth(); await load(); fromHash(); await initConsole(); })();
