// Nexus HQ · phone layout: a slim top bar, a bottom tab bar (HQ · Ask · Vault · Photos),
// a one-line ask bar on the HQ tab, a "+" menu for photos and web search, and a status sheet.
// Everything here only shows at phone width; the PC layout is unchanged. Loaded after app.js.

const PHONE = matchMedia("(max-width:760px)");
let lastHq = ["map", "chat", "code"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "map";
let peekT = null, wasBusy = false;

const curTab = () => (con.full ? "ask" : view === "vault" ? "vault" : view === "photos" ? "photos" : "hq");
function syncTabs() {
  const t = curTab();
  if (["map", "chat", "code"].includes(view)) lastHq = view;
  document.body.dataset.tab = t;
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  document.querySelectorAll("#hqSeg [data-hqview]").forEach((b) => b.classList.toggle("on", b.dataset.hqview === view));
  if (t === "ask") { $("#askDot").hidden = true; hidePeek(); }
}
function updatePill() {
  if (!D) return;
  const ms = D.models || [], ok = ms.filter((m) => m.ready && m.enabled !== false).length;
  const gh = D.github?.enabled ? (D.github.error ? "bad" : "ok") : "";
  const warn = ok < ms.filter((m) => m.enabled !== false).length || gh === "bad";
  $("#statusTxt").textContent = `${ok}/${ms.length} models${gh ? " · git" : ""}`;
  $("#statusPill").classList.toggle("warn", warn);
}

// ----- tabs -----
function goTab(t) {
  closePlus();
  if (t === "ask") { if (!con.full) conFull(true); syncTabs(); setTimeout(() => { const l = $("#conLog"); l.scrollTop = l.scrollHeight; }, 30); return; }
  if (con.full) conFull(false);
  const v = t === "hq" ? lastHq : t;
  if (view !== v) go(v); else { renderChrome(); renderView(); }
  syncTabs();
}
document.addEventListener("click", (e) => {
  const tb = e.target.closest("#tabbar [data-tab]"); if (tb) return goTab(tb.dataset.tab);
  const hv = e.target.closest("[data-hqview]"); if (hv) { lastHq = hv.dataset.hqview; return go(hv.dataset.hqview); }
  if (e.target.closest("#askPeek")) return goTab("ask");
  if (e.target.closest("#statusPill")) return openSheet();
  if (e.target.closest("#sheetBack") || e.target.closest("[data-sheet='close']")) return closeSheet();
  const sh = e.target.closest("[data-sheet]");
  if (sh?.dataset.sheet === "logout") { closeSheet(); return $("#logoutBtn").click(); }
  if (e.target.closest("#conPlus")) { const m = $("#plusMenu"); m.hidden = !m.hidden; $("#plusWeb").textContent = `Web search: ${webMode()}`; return; }
  const pl = e.target.closest("[data-plus]");
  if (pl) {
    if (pl.dataset.plus === "library") { closePlus(); return $("#conFile").click(); }
    if (pl.dataset.plus === "camera") { closePlus(); return $("#conCamFile").click(); }
    if (pl.dataset.plus === "web") { $("#conWeb").click(); $("#plusWeb").textContent = `Web search: ${webMode()}`; return; }
  }
  if (!e.target.closest("#plusMenu")) closePlus();
});
function closePlus() { const m = $("#plusMenu"); if (m) m.hidden = true; }

// ----- status sheet (models, GitHub, compare, log out) -----
function openSheet() {
  const s = $("#sheet");
  s.innerHTML = `<div class="sh-grip"></div>
    <div class="sh-head"><b>Status</b><button class="con-btn icon" data-sheet="close" aria-label="Close">✕</button></div>
    <div class="sh-sec"><span class="kicker">models &amp; services</span><div class="sh-chips">${$("#models").innerHTML}</div><p class="dim">Tap a model to see details or switch Opus on and off.</p></div>
    <div class="sh-sec"><span class="kicker">tools</span>
      <a class="sh-row" href="/compare">Compare models side by side <span>›</span></a>
      <button class="sh-row" data-sheet="close" onclick="dispatch('/help')">Commands &amp; tips <span>›</span></button>
      ${$("#logoutBtn").hidden ? "" : `<button class="sh-row bad" data-sheet="logout">Log out <span>›</span></button>`}
    </div>`;
  $("#sheetBack").hidden = s.hidden = false;
  requestAnimationFrame(() => s.classList.add("open"));
}
function closeSheet() { const s = $("#sheet"); s.classList.remove("open"); $("#sheetBack").hidden = true; setTimeout(() => (s.hidden = true), 200); }
document.addEventListener("click", (e) => { if (e.target.closest("#sheet [data-open]")) closeSheet(); }, true);

// ----- "working…" / "answer ready" peek above the ask bar on the HQ tab -----
function showPeek(html, ready) {
  const p = $("#askPeek"); p.innerHTML = html; p.classList.toggle("ready", !!ready); p.hidden = false;
  clearTimeout(peekT); if (ready) peekT = setTimeout(hidePeek, 15000);
}
function hidePeek() { const p = $("#askPeek"); if (p) p.hidden = true; }

// ----- hook into app.js -----
const _renderChrome = renderChrome;
renderChrome = function () { _renderChrome.apply(this, arguments); updatePill(); syncTabs(); };
const _conFull = conFull;
conFull = function (on) { _conFull(on); syncTabs(); };
const _conStatus = conStatus;
conStatus = function (text, busy = false) {
  _conStatus(text, busy);
  if (!PHONE.matches) return;
  if (busy) { wasBusy = true; if (!con.full) showPeek(`<i class="pk-dot"></i>${esc(text)}`); }
  else if (wasBusy) { wasBusy = false; if (!con.full) { showPeek(`✓ Answer ready <b>· tap to read</b>`, true); $("#askDot").hidden = false; } }
};
// Asking about a photo from the Photos tab jumps to the Ask tab
const _attachExisting = attachExisting;
attachExisting = function (name) { _attachExisting(name); if (PHONE.matches) goTab("ask"); };
addEventListener("hashchange", () => setTimeout(syncTabs));
PHONE.addEventListener?.("change", () => { syncTabs(); renderView(); });
syncTabs();
const setPh = () => { $("#conInput").placeholder = PHONE.matches ? "Ask anything…" : "ask anything… HQ picks the agent (/help)"; };
setPh(); PHONE.addEventListener?.("change", setPh);
// Picking a photo from the HQ tab opens the Ask tab, where the attached photos show
document.addEventListener("change", (e) => { if ((e.target.id === "conFile" || e.target.id === "conCamFile") && PHONE.matches && !con.full) goTab("ask"); }, true);
