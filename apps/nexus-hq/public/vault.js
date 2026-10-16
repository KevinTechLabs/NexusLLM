// Nexus HQ · Vault tab: your Obsidian notes, a live link graph, a note reader, and the memory list.
// Loaded after app.js and uses its helpers (D, $, esc, md, jfetch, go, store).

const V = { data: null, sel: null, note: null, q: "", tag: "", folder: "", pane: "graph", loading: false, at: 0, raf: 0, graph: null };
const FOLDER_COL = { Notes: "var(--chat)", Repos: "var(--code)", Private: "var(--bad)", "": "var(--vault)" };
const folderCol = (f) => FOLDER_COL[f] || "var(--vault)";
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff";
const relTime = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : s < 86400 * 30 ? `${Math.floor(s / 86400)}d ago` : new Date(iso).toLocaleDateString();
};

async function vaultLoad(force) {
  if (V.loading || (!force && V.data && Date.now() - V.at < 4000)) return V.data;
  V.loading = true;
  try { V.data = await jfetch("/api/vault"); V.at = Date.now(); if (D) D.memory = V.data.memory; try { V.sync = await jfetch("/api/vault/sync"); } catch { V.sync = null; } }
  catch (e) { V.data = { error: e.message, notes: [], memory: [] }; }
  V.loading = false;
  return V.data;
}

function renderVault(stage) {
  cancelAnimationFrame(V.raf);
  stage.innerHTML = `<div class="vault" id="vault">
    <div class="v-head">
      <div class="v-title"><span class="kicker">// obsidian vault</span><b id="vName">NexusVault</b><span class="v-stats" id="vStats"></span></div>
      <label class="v-search"><span>⌕</span><input id="vSearch" placeholder="search notes, #tags…" value="${esc(V.q)}" spellcheck="false"></label>
      <div class="v-seg" role="tablist">
        <button data-vpane="list" class="v-only-phone">Notes</button>
        <button data-vpane="graph">Graph</button>
        <button data-vpane="note">Note</button>
        <button data-vpane="memory" class="v-only-phone">Memory</button>
      </div>
      <button class="con-btn icon" data-vact="refresh" title="Reload notes from disk" aria-label="Reload notes">↻</button>
    </div>
    <div class="v-body" data-pane="${V.pane}">
      <aside class="v-list" id="vList"></aside>
      <section class="v-main">
        <div class="v-graph" id="vGraph"><canvas id="vCanvas"></canvas><div class="v-legend"><i style="--c:var(--chat)"></i>Notes <i style="--c:var(--code)"></i>Repos <i style="--c:var(--vault)"></i>Vault <span class="dim">· drag to move · click to open</span></div><div class="v-tip" id="vTip" hidden></div></div>
        <article class="v-note" id="vNote"></article>
      </section>
      <aside class="v-mem" id="vMem"></aside>
    </div>
  </div>`;
  if (!D?.vault?.enabled) {
    $("#vault .v-body").innerHTML = `<div class="v-empty"><div class="v-orb"></div><b>The notes vault is turned off.</b><p>Remove <code>VAULT_DIR=off</code> from <code>.env</code> and restart Nexus HQ to turn it on.</p></div>`;
    return;
  }
  vaultPaint();
  vaultLoad(true).then(() => { vaultPaint(); if (V.sel && V.pane === "note") vaultOpen(V.sel); });
}

function vaultNotes() {
  const d = V.data; if (!d) return [];
  const q = V.q.trim().toLowerCase();
  return d.notes.filter((n) => (!V.folder || n.folder === V.folder) && (!V.tag || n.tags.includes(V.tag)) &&
    (!q || (q.startsWith("#") ? n.tags.some((t) => t.toLowerCase().startsWith(q.slice(1))) : `${n.title} ${n.tags.join(" ")} ${n.excerpt}`.toLowerCase().includes(q))));
}

function vaultPaint() {
  const root = $("#vault"); if (!root) return;
  const d = V.data;
  root.querySelector(".v-body").dataset.pane = V.pane;
  root.querySelectorAll("[data-vpane]").forEach((b) => b.classList.toggle("on", b.dataset.vpane === V.pane));
  if (!d) { $("#vList").innerHTML = `<div class="v-skel"></div><div class="v-skel"></div><div class="v-skel"></div>`; return; }
  if (d.error) { $("#vList").innerHTML = `<div class="err" style="padding:12px">${esc(d.error)}</div>`; return; }
  $("#vName").textContent = d.name;
  const links = d.notes.reduce((a, n) => a + n.linkPaths.length, 0);
  const tagCount = {}; d.notes.forEach((n) => n.tags.forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  $("#vStats").innerHTML = `<span><b>${d.notes.length}</b> notes</span><span><b>${links}</b> links</span><span><b>${Object.keys(tagCount).length}</b> tags</span><span><b>${d.memory.length}</b> facts</span>${V.sync?.enabled ? `<button class="v-sync ${V.sync.running ? "on" : ""}" data-vact="sync" title="Repo notes update from GitHub every ${V.sync.minutes} minutes. Click to check now.">↻ ${V.sync.running ? "syncing repos…" : V.sync.lastRun ? `repos synced ${relTime(V.sync.lastRun)}` : "repo sync starting"}</button>` : ""}`;

  // list
  const folders = ["", ...new Set(d.notes.map((n) => n.folder).filter(Boolean))];
  const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 14);
  const notes = vaultNotes();
  $("#vList").innerHTML = `
    <div class="v-chips">${folders.map((f) => `<button class="v-chip ${V.folder === f ? "on" : ""}" data-vfolder="${esc(f)}" style="--c:${folderCol(f)}">${f ? esc(f) : "All"}</button>`).join("")}</div>
    ${tags.length ? `<div class="v-chips tags">${tags.map(([t, c]) => `<button class="v-tag ${V.tag === t ? "on" : ""}" data-vtag="${esc(t)}">#${esc(t)}<span>${c}</span></button>`).join("")}</div>` : ""}
    <div class="v-cards">${notes.length ? notes.map((n) => `
      <button class="v-card ${V.sel === n.path ? "on" : ""} ${n.private ? "priv" : ""}" data-note="${esc(n.path)}" style="--c:${folderCol(n.folder)}">
        <span class="vc-top"><b>${n.private ? "🔒 " : ""}${esc(n.title)}</b><span class="dim">${relTime(n.updated)}</span></span>
        <span class="vc-ex">${esc(n.excerpt.slice(0, 120)) || "<i class='dim'>empty</i>"}</span>
        <span class="vc-meta">${n.tags.slice(0, 4).map((t) => `<i>#${esc(t)}</i>`).join("")}${n.backlinks.length ? `<em>↩ ${n.backlinks.length}</em>` : ""}</span>
      </button>`).join("") : `<div class="v-none">${d.notes.length ? "No notes match." : "No notes yet.<br><br>Ask something, then say <b>save this to my notes</b>. Or say <b>make a note about</b> anything."}</div>`}</div>`;

  vaultMemory();
  if (V.pane === "note") vaultReader(); else if (!$("#vNote").innerHTML) vaultReaderEmpty();
  vaultGraph();
}

function vaultMemory() {
  const m = V.data?.memory || [];
  $("#vMem").innerHTML = `<div class="vm-head"><span class="kicker">// memory</span><b>Things I remember</b><span class="dim">every agent sees these · stored in <button class="linkbtn" data-note="Memory.md">Memory.md</button></span></div>
    <form class="vm-add" id="vmAdd"><input id="vmInput" placeholder="remember that…" maxlength="300"><button class="btn primary" style="--c:var(--vault)">Add</button></form>
    <ol class="vm-list">${m.map((x) => `<li><span>${esc(x.text)}</span><button data-vforget="${esc(x.id)}" aria-label="Forget">✕</button></li>`).join("") || `<li class="dim"><span>Nothing yet. Add a fact above, or say <b>remember that…</b> in the console.</span></li>`}</ol>`;
}

function vaultReaderEmpty() {
  $("#vNote").innerHTML = `<div class="v-empty"><div class="v-orb"></div><b>Pick a note</b><p>Choose one from the list or click a node in the graph.</p></div>`;
}

async function vaultOpen(p) {
  V.sel = p; V.pane = "note";
  if (!$("#vault")) { go("vault"); return; } // renderVault will open it
  vaultPaint();
  $("#vNote").innerHTML = `<div class="v-skel tall"></div>`;
  try { V.note = await jfetch(`/api/vault/note?path=${encodeURIComponent(p)}`); }
  catch (e) { $("#vNote").innerHTML = `<div class="err" style="padding:16px">${esc(e.message)}</div>`; return; }
  vaultReader();
}

// Render Obsidian-flavored Markdown on top of the app's md(): wikilinks, ==highlights==, #tags and callouts
function obsidianHTML(body) {
  const host = document.createElement("div");
  host.innerHTML = md(body);
  const byName = new Map((V.data?.notes || []).map((n) => [n.name.toLowerCase(), n.path]));
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest("pre, code") ? NodeFilter.FILTER_REJECT : /\[\[|==|#[A-Za-z]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const html = esc(n.nodeValue)
      .replace(/!\[\[([^\]|#^]+\.(?:jpe?g|png|webp|gif))(?:\|[^\]]*)?\]\]/gi, (_, name) =>
        `<img class="v-img" src="/api/vaultfile/${encodeURIComponent("Attachments/" + name.trim().split("/").pop())}${authToken ? `?t=${encodeURIComponent(authToken)}` : ""}" alt="${esc(name)}" loading="lazy">`)
      .replace(/!?\[\[([^\]|#^]+)([#^][^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, name, __, alias) => {
        const p = byName.get(name.trim().split("/").pop().toLowerCase());
        return p ? `<button class="wl" data-note="${esc(p)}">${esc(alias || name)}</button>` : `<span class="wl dead" title="No note called ${esc(name)} yet">${esc(alias || name)}</span>`;
      })
      .replace(/==([^=]+)==/g, "<mark>$1</mark>")
      .replace(/(^|\s)#([A-Za-z][\w/-]*)/g, (_, sp, t) => `${sp}<button class="v-tag inline" data-vtag="${esc(t)}">#${esc(t)}</button>`);
    const span = document.createElement("span"); span.innerHTML = html; n.replaceWith(...span.childNodes);
  }
  host.querySelectorAll("blockquote").forEach((bq) => {
    const m = bq.innerHTML.match(/^\s*\[!(\w+)\]([+-]?)\s*([^<]*)(<br>)?/);
    if (!m) return;
    const type = m[1].toLowerCase(), icon = { tip: "💡", hint: "💡", warning: "⚠", caution: "⚠", danger: "⛔", error: "⛔", bug: "🐞", info: "ℹ", note: "✎", summary: "≡", abstract: "≡", tldr: "≡", success: "✓", check: "✓", question: "?", faq: "?", example: "▸", quote: "❝", todo: "☐", failure: "✕" }[type] || "✎";
    const tone = /warn|caution|attention/.test(type) ? "warn" : /danger|error|bug|fail|missing/.test(type) ? "bad" : /tip|hint|success|check|done|important/.test(type) ? "ok" : /question|faq|help/.test(type) ? "q" : "info";
    const rest = bq.innerHTML.slice(m[0].length);
    bq.outerHTML = `<div class="callout ${tone}"><div class="co-h"><span class="co-i">${icon}</span>${m[3].trim() || type[0].toUpperCase() + type.slice(1)}</div>${rest.trim() ? `<div class="co-b">${rest}</div>` : ""}</div>`;
  });
  host.querySelectorAll(".code-btns .save-code").forEach((b) => b.remove());
  return host.innerHTML;
}

function vaultReader() {
  const n = V.note, el = $("#vNote");
  if (!n) return vaultReaderEmpty();
  const all = V.data?.notes || [], title = (p) => all.find((x) => x.path === p)?.title || p;
  const body = n.body.replace(new RegExp(`^\\s*#\\s+${n.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`), "");
  const props = Object.entries({ created: n.created, updated: n.updated?.slice(0, 10), source: n.source, path: n.path }).filter(([, v]) => v);
  const obs = `obsidian://open?vault=${encodeURIComponent(V.data?.name || "")}&file=${encodeURIComponent(n.path.replace(/\.md$/, ""))}`;
  el.innerHTML = `
    <div class="vn-top" style="--c:${folderCol(n.folder)}">
      <button class="con-btn icon v-only-phone" data-vpane="list" aria-label="Back to notes">‹</button>
      <div class="vn-crumb">${esc(n.folder || V.data?.name || "")}${n.private ? " · 🔒 private" : ""}</div>
      <div class="vn-actions">
        <button class="con-btn" data-vact="ask" title="Ask an agent about this note">Ask about it</button>
        <a class="con-btn" href="${esc(obs)}" title="Open in the Obsidian app on this device">Obsidian ↗</a>
        ${n.path === "Memory.md" ? "" : `<button class="con-btn danger" data-vact="delete" title="Move to the vault's .trash folder">Delete</button>`}
      </div>
    </div>
    <h2 class="vn-title">${esc(n.title)}</h2>
    <div class="vn-props">${n.tags.map((t) => `<button class="v-tag" data-vtag="${esc(t)}">#${esc(t)}</button>`).join("")}${props.map(([k, v]) => `<span><i>${k}</i>${esc(v)}</span>`).join("")}</div>
    <div class="vn-body">${obsidianHTML(body)}</div>
    <div class="vn-links">
      <div><span class="kicker">links to</span>${n.linkPaths.length ? n.linkPaths.map((p) => `<button class="wl" data-note="${esc(p)}">${esc(title(p))}</button>`).join("") : `<span class="dim">none</span>`}</div>
      <div><span class="kicker">linked from</span>${n.backlinks.length ? n.backlinks.map((p) => `<button class="wl" data-note="${esc(p)}">${esc(title(p))}</button>`).join("") : `<span class="dim">none</span>`}</div>
    </div>`;
  el.scrollTop = 0;
}

// ---------- graph: notes as glowing nodes, [[links]] as bright edges, shared tags as faint threads ----------
function vaultGraph() {
  const wrap = $("#vGraph"), cv = $("#vCanvas"); if (!wrap || !cv || !V.data) return;
  const notes = V.data.notes.filter((n) => !n.private);
  const prev = new Map((V.graph?.nodes || []).map((n) => [n.path, n]));
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const nodes = notes.map((n, i) => {
    const p = prev.get(n.path), a = (i / Math.max(1, notes.length)) * Math.PI * 2;
    return { path: n.path, title: n.title, folder: n.folder, deg: n.linkPaths.length + n.backlinks.length, words: n.words,
      x: p?.x ?? W / 2 + Math.cos(a) * Math.min(W, H) * 0.3, y: p?.y ?? H / 2 + Math.sin(a) * Math.min(W, H) * 0.3, vx: 0, vy: 0, mem: n.path === "Memory.md" };
  });
  const at = new Map(nodes.map((n, i) => [n.path, i]));
  const edges = [];
  notes.forEach((n, i) => n.linkPaths.forEach((p) => { if (at.has(p) && at.get(p) !== i) edges.push({ a: i, b: at.get(p), strong: true }); }));
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const shared = notes[i].tags.filter((t) => notes[j].tags.includes(t) && !/^nexus/.test(t)).length;
    if (shared && !edges.some((e) => (e.a === i && e.b === j) || (e.a === j && e.b === i))) edges.push({ a: i, b: j, strong: false, w: shared });
  }
  V.graph = { nodes, edges, hover: -1, drag: -1, t: 0, settle: 0 };
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { cv.width = wrap.clientWidth * dpr; cv.height = wrap.clientHeight * dpr; cv.style.width = wrap.clientWidth + "px"; cv.style.height = wrap.clientHeight + "px"; };
  size();
  const ctx = cv.getContext("2d");
  const col = { chat: cssVar("--chat"), code: cssVar("--code"), vault: cssVar("--vault"), bad: cssVar("--bad"), line: cssVar("--line2"), text: cssVar("--text"), white: cssVar("--white") };
  const nodeCol = (n) => (n.folder === "Notes" ? col.chat : n.folder === "Repos" ? col.code : col.vault);
  const rad = (n) => 4 + Math.min(9, Math.sqrt(n.deg * 6 + n.words / 120)) + (n.mem ? 3 : 0);

  function step() {
    const g = V.graph, w = cv.width / dpr, h = cv.height / dpr;
    if (g.settle >= 500) return;
    const L = Math.max(70, Math.min(w, h) * 0.32), cool = Math.max(0.15, 1 - g.settle / 500);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = a.x - b.x || 0.1, dy = a.y - b.y || 0.1, d2 = Math.max(dx * dx + dy * dy, 120);
      const f = Math.min(12, (L * L * 1.1) / d2) * cool, d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const e of g.edges) {
      const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - (e.strong ? L * 0.75 : L * 1.1)) * (e.strong ? 0.03 : 0.008 * Math.min(2, e.w || 1));
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const [i, n] of nodes.entries()) {
      if (i === g.drag) continue;
      n.vx += (w / 2 - n.x) * 0.006; n.vy += (h / 2 - n.y) * 0.009;
      n.vx *= 0.78; n.vy *= 0.78; n.x += n.vx; n.y += n.vy;
      n.x = Math.max(34, Math.min(w - 34, n.x)); n.y = Math.max(22, Math.min(h - 34, n.y));
    }
    g.settle++;
  }
  function draw() {
    const g = V.graph, w = cv.width / dpr, h = cv.height / dpr; g.t += 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const sel = at.get(V.sel), focus = g.hover >= 0 ? g.hover : sel ?? -1;
    const near = new Set(focus >= 0 ? g.edges.filter((e) => e.a === focus || e.b === focus).flatMap((e) => [e.a, e.b]) : []);
    for (const e of g.edges) {
      const a = nodes[e.a], b = nodes[e.b], on = focus >= 0 && (e.a === focus || e.b === focus);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.strong ? (on ? col.white : nodeCol(a)) : col.line;
      ctx.globalAlpha = e.strong ? (on ? 0.9 : focus >= 0 ? 0.18 : 0.5) : (on ? 0.5 : 0.22);
      ctx.lineWidth = e.strong ? (on ? 1.8 : 1.2) : 1;
      ctx.setLineDash(e.strong ? [] : [2, 4]); ctx.stroke();
      if (e.strong) { // a pulse travelling along each real link
        const t = ((g.t * 0.006 + e.a * 0.37) % 1); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, on ? 2.2 : 1.4, 0, 7); ctx.fillStyle = nodeCol(a); ctx.globalAlpha = on ? 1 : 0.6; ctx.fill();
      }
    }
    ctx.setLineDash([]);
    nodes.forEach((n, i) => {
      const r = rad(n), c = nodeCol(n), dim = focus >= 0 && i !== focus && !near.has(i), pulse = 1 + Math.sin(g.t * 0.04 + i) * 0.08;
      ctx.globalAlpha = dim ? 0.25 : 1;
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2 * pulse);
      grd.addColorStop(0, c + "66"); grd.addColorStop(1, c + "00");
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2 * pulse, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fillStyle = "#08101f"; ctx.fill();
      ctx.lineWidth = i === sel ? 2.6 : 1.6; ctx.strokeStyle = i === sel ? col.white : c; ctx.stroke();
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.42, 0, 7); ctx.fillStyle = c; ctx.fill();
      if (!dim && (i === focus || near.has(i) || nodes.length <= 18 || n.deg >= 2)) {
        ctx.font = `${i === focus ? 700 : 500} 11px ${cssVar("--mono")}`; ctx.textAlign = "center";
        ctx.fillStyle = i === focus ? col.white : col.text; ctx.globalAlpha = dim ? 0.3 : i === focus ? 1 : 0.78;
        ctx.fillText(n.title.length > 26 ? n.title.slice(0, 25) + "…" : n.title, n.x, n.y + r + 13);
      }
    });
    ctx.globalAlpha = 1;
  }
  function loop() {
    if (!document.body.contains(cv)) return;
    step(); if (!document.hidden && cv.offsetParent) draw();
    V.raf = requestAnimationFrame(loop);
  }
  const hit = (ev) => {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = -1, bd = 1e9;
    nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd && d < (rad(n) + 10) ** 2) { bd = d; best = i; } });
    return { i: best, x, y };
  };
  let moved = false;
  cv.onpointerdown = (ev) => { const h = hit(ev); if (h.i >= 0) { V.graph.drag = h.i; moved = false; cv.setPointerCapture(ev.pointerId); } };
  cv.onpointermove = (ev) => {
    const h = hit(ev), g = V.graph;
    if (g.drag >= 0) { const n = nodes[g.drag]; n.x = h.x; n.y = h.y; n.vx = n.vy = 0; moved = true; g.settle = Math.min(g.settle, 380); return; }
    g.hover = h.i; cv.style.cursor = h.i >= 0 ? "pointer" : "default";
    const tip = $("#vTip");
    if (h.i >= 0) { const n = notes[h.i]; tip.hidden = false; tip.innerHTML = `<b>${esc(n.title)}</b><span>${esc(n.folder || "vault")} · ${n.words} words · ${n.linkPaths.length + n.backlinks.length} links</span>`; tip.style.left = Math.min(h.x + 14, cv.clientWidth - 220) + "px"; tip.style.top = h.y + 14 + "px"; }
    else tip.hidden = true;
  };
  cv.onpointerup = (ev) => { const g = V.graph, i = g.drag; g.drag = -1; if (i >= 0 && !moved) vaultOpen(nodes[i].path); };
  cv.onpointerleave = () => { V.graph.hover = -1; $("#vTip").hidden = true; };
  cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(loop);
  (V.ro ||= new ResizeObserver(() => { if (document.body.contains(cv)) { size(); V.graph.settle = Math.min(V.graph.settle, 380); } })).disconnect();
  V.ro.observe(wrap);
}

// ---------- events ----------
document.addEventListener("click", async (e) => {
  const nt = e.target.closest("[data-note]");
  if (nt) { e.preventDefault(); if (view !== "vault") { V.sel = nt.dataset.note; V.pane = "note"; V.openAfter = nt.dataset.note; return go("vault"); } return vaultOpen(nt.dataset.note); }
  if (!e.target.closest("#vault")) return;
  const pane = e.target.closest("[data-vpane]");
  if (pane) { V.pane = pane.dataset.vpane; if (V.pane === "note" && !V.note) V.pane = "graph"; vaultPaint(); if (V.pane === "graph") V.graph && (V.graph.settle = Math.min(V.graph.settle, 380)); return; }
  const f = e.target.closest("[data-vfolder]"); if (f) { V.folder = f.dataset.vfolder; return vaultPaint(); }
  const t = e.target.closest("[data-vtag]"); if (t) { V.tag = V.tag === t.dataset.vtag ? "" : t.dataset.vtag; if (innerWidth < 760) V.pane = "list"; return vaultPaint(); }
  const fg = e.target.closest("[data-vforget]");
  if (fg) { try { const r = await jfetch(`/api/memory/${fg.dataset.vforget}`, { method: "DELETE" }); V.data.memory = r.items; D.memory = r.items; vaultMemory(); vaultPaint(); } catch {} return; }
  const act = e.target.closest("[data-vact]")?.dataset.vact;
  if (act === "sync") { try { V.sync = await jfetch("/api/vault/sync", { method: "POST" }); } catch {} vaultPaint(); const poll = setInterval(async () => { try { V.sync = await jfetch("/api/vault/sync"); } catch { clearInterval(poll); } if (!V.sync?.running) { clearInterval(poll); await vaultLoad(true); } vaultPaint(); }, 3000); return; }
  if (act === "refresh") { await vaultLoad(true); if (V.sel && V.pane === "note") { try { V.note = await jfetch(`/api/vault/note?path=${encodeURIComponent(V.sel)}`); } catch { V.note = null; } } return vaultPaint(); }
  if (act === "ask" && V.note) { const inp = $("#conInput"); conOpen(true); inp.value = `About my note "${V.note.title}": `; inp.focus(); return; }
  if (act === "delete" && V.note) {
    if (!confirm(`Delete "${V.note.title}"? It moves to the vault's .trash folder, so you can still recover it in Obsidian.`)) return;
    try { await jfetch(`/api/vault/note?path=${encodeURIComponent(V.note.path)}`, { method: "DELETE" }); V.note = null; V.sel = null; V.pane = "graph"; await vaultLoad(true); vaultReaderEmpty(); vaultPaint(); }
    catch (err) { alert(err.message); }
  }
});
document.addEventListener("input", (e) => { if (e.target.id === "vSearch") { V.q = e.target.value; if (innerWidth < 760) V.pane = "list"; const pos = e.target.selectionStart; vaultPaint(); const s = $("#vSearch"); s.focus(); s.setSelectionRange(pos, pos); } });
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "vmAdd") return;
  e.preventDefault();
  const inp = $("#vmInput"), text = inp.value.replace(/^remember (that )?/i, "").trim(); if (!text) return;
  try { const r = await jfetch("/api/memory", { method: "POST", body: JSON.stringify({ text }) }); V.data.memory = r.items; D.memory = r.items; inp.value = ""; vaultPaint(); } catch (err) { alert(err.message); }
});
// Pick up edits made in Obsidian: refresh when you come back to the tab, and every 30s while it's open
addEventListener("focus", () => { if (view === "vault") vaultLoad(true).then(vaultPaint); });
const vaultSig = () => (V.data?.notes || []).map((n) => n.path + n.updated).join("|") + (V.data?.memory || []).map((m) => m.id).join();
setInterval(async () => {
  if (view !== "vault" || document.hidden || $("#vSearch:focus") || $("#vmInput:focus")) return;
  const before = vaultSig(); await vaultLoad(true);
  if (vaultSig() !== before) vaultPaint();
}, 30000);
