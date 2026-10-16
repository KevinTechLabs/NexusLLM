// Nexus HQ · Photos tab: every photo you've attached or taken, shared by your phone and PC
// (stored in the NexusPhotos folder next to nexus-hq). Loaded after app.js.

const P = { list: null, loading: false, open: -1, sel: new Set() };
const isPhone = () => matchMedia("(pointer:coarse)").matches;
const dayLabel = (iso) => {
  const d = new Date(iso), t = new Date(), y = new Date(Date.now() - 864e5);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};

async function photosLoad() {
  if (P.loading) return;
  P.loading = true;
  try { P.list = (await jfetch("/api/photos")).photos; } catch (e) { P.list = []; P.err = e.message; }
  P.loading = false;
}

function renderPhotos(stage) {
  stage.innerHTML = `<div class="photos" id="photos">
    <div class="p-head">
      <div class="p-title"><span class="kicker">// photos</span><b>Gallery</b><span class="p-count" id="pCount"></span></div>
      <div class="p-actions">
        <button class="btn primary p-cam" data-pact="camera" style="--c:var(--photo)">${CAM_SVG}<span>Take photo</span></button>
        <button class="btn" data-pact="add">${IMG_SVG}<span>Add photos</span></button>
        <button class="con-btn icon" data-pact="refresh" title="Reload" aria-label="Reload photos">↻</button>
      </div>
      <input type="file" id="pFile" accept="image/*" multiple hidden>
      <input type="file" id="pCamFile" accept="image/*" capture="environment" hidden>
    </div>
    <div class="p-sel" id="pSel" hidden></div>
    <div class="p-grid" id="pGrid"><div class="p-skel"></div><div class="p-skel"></div><div class="p-skel"></div><div class="p-skel"></div></div>
    <div class="p-drop" id="pDrop" hidden><div>Drop photos to add them</div></div>
  </div>`;
  photosPaint();
  photosLoad().then(photosPaint);
}

function photosPaint() {
  const g = $("#pGrid"); if (!g) return;
  if (!P.list) return;
  $("#pCount").textContent = P.list.length ? `${P.list.length} photo${P.list.length > 1 ? "s" : ""}` : "";
  if (!P.list.length) {
    g.innerHTML = `<div class="p-empty"><div class="p-lens"></div><b>No photos yet</b><p>${isPhone() ? "Tap <b>Take photo</b> or <b>Add photos</b>." : "Click <b>Add photos</b>, or drop pictures here."} Photos you attach in the console show up here too, and they're saved in your <code>NexusPhotos</code> folder on the PC.</p></div>`;
    return;
  }
  let html = "", day = "";
  P.list.forEach((p, i) => {
    const d = dayLabel(p.time);
    if (d !== day) { day = d; html += `<div class="p-day">${esc(d)}</div>`; }
    html += `<button class="p-tile ${P.sel.has(p.name) ? "on" : ""}" data-pi="${i}" title="${esc(p.name)}">${p.heic ? `<span class="p-heic">HEIC</span>` : `<img src="${esc(photoUrl(p.name, true))}" alt="" loading="lazy">`}<span class="p-check" data-pcheck="${i}" aria-label="Select">✓</span></button>`;
  });
  g.innerHTML = html;
  const s = $("#pSel");
  s.hidden = !P.sel.size;
  s.innerHTML = P.sel.size ? `<b>${P.sel.size} selected</b><button class="btn primary" data-pact="ask-sel" style="--c:var(--photo)">Ask about ${P.sel.size > 1 ? "them" : "it"}</button><button class="btn" data-pact="clear-sel">Clear</button>` : "";
}

// ---------- full-screen viewer ----------
function lightbox(idx) {
  P.open = idx;
  const p = P.list?.[idx]; if (!p) return closeLightbox();
  let lb = $("#pLight");
  if (!lb) { lb = document.createElement("div"); lb.id = "pLight"; lb.className = "p-light"; document.body.append(lb); }
  lb.innerHTML = `
    <div class="pl-top"><span class="dim">${esc(new Date(p.time).toLocaleString())} · ${p.size >= 1048576 ? (p.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(p.size / 1024)) + " KB"}</span><button class="con-btn icon" data-pact="close" aria-label="Close">✕</button></div>
    <div class="pl-stage">${idx > 0 ? `<button class="pl-nav prev" data-pact="prev" aria-label="Previous">‹</button>` : ""}
      ${p.heic ? `<div class="p-empty"><b>HEIC photo</b><p>This browser can't show HEIC. Open it on the PC, or re-add it from your iPhone (it converts automatically).</p></div>` : `<img src="${esc(photoUrl(p.name))}" alt="">`}
      ${idx < P.list.length - 1 ? `<button class="pl-nav next" data-pact="next" aria-label="Next">›</button>` : ""}</div>
    <div class="pl-bar">
      <button class="btn primary" data-pact="ask" style="--c:var(--photo)">Ask about it</button>
      <a class="btn" href="${esc(photoUrl(p.name))}" download="${esc(p.name)}">Download</a>
      <button class="btn danger" data-pact="delete">Delete</button>
    </div>`;
  lb.hidden = false;
}
function closeLightbox() { const lb = $("#pLight"); if (lb) lb.hidden = true; P.open = -1; }

async function photosAdd(files) {
  const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp|gif)$/i.test(f.name));
  if (!list.length) return;
  const g = $("#pGrid");
  for (const f of list) {
    g?.insertAdjacentHTML("afterbegin", `<div class="p-tile up"><span class="spin"></span></div>`);
    try { await uploadPhoto(f); } catch (e) { alert(e.message); }
  }
  await photosLoad(); photosPaint();
}

const CAM_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const IMG_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

// ---------- events ----------
document.addEventListener("click", async (e) => {
  // thumbnails in the console open the viewer
  const cp = e.target.closest("[data-photo]");
  if (cp) {
    let i = (P.list || []).findIndex((p) => p.name === cp.dataset.photo);
    if (i < 0) { await photosLoad(); i = P.list.findIndex((p) => p.name === cp.dataset.photo); }
    if (i >= 0) lightbox(i);
    return;
  }
  const chk = e.target.closest("[data-pcheck]");
  if (chk) { e.stopPropagation(); const n = P.list[Number(chk.dataset.pcheck)].name; P.sel.has(n) ? P.sel.delete(n) : P.sel.size < 4 && P.sel.add(n); return photosPaint(); }
  const tile = e.target.closest("[data-pi]");
  if (tile) { if (P.sel.size) { const n = P.list[Number(tile.dataset.pi)].name; P.sel.has(n) ? P.sel.delete(n) : P.sel.size < 4 && P.sel.add(n); return photosPaint(); } return lightbox(Number(tile.dataset.pi)); }
  const act = e.target.closest("[data-pact]")?.dataset.pact;
  if (!act) { if (e.target.id === "pLight" || e.target.classList?.contains("pl-stage")) closeLightbox(); return; }
  if (act === "camera") return $("#pCamFile").click();
  if (act === "add") return $("#pFile").click();
  if (act === "refresh") { await photosLoad(); return photosPaint(); }
  if (act === "close") return closeLightbox();
  if (act === "prev") return lightbox(P.open - 1);
  if (act === "next") return lightbox(P.open + 1);
  if (act === "ask") { const p = P.list[P.open]; closeLightbox(); attachExisting(p.name); return; }
  if (act === "ask-sel") { [...P.sel].forEach(attachExisting); P.sel.clear(); photosPaint(); return; }
  if (act === "clear-sel") { P.sel.clear(); return photosPaint(); }
  if (act === "delete") {
    const p = P.list[P.open];
    if (!confirm("Delete this photo? It moves to the NexusPhotos/.trash folder on the PC.")) return;
    try { await jfetch(`/api/photos/${encodeURIComponent(p.name)}`, { method: "DELETE" }); } catch (err) { return alert(err.message); }
    const at = P.open; await photosLoad(); photosPaint();
    P.list.length ? lightbox(Math.min(at, P.list.length - 1)) : closeLightbox();
  }
});
document.addEventListener("change", (e) => { if (e.target.id === "pFile" || e.target.id === "pCamFile") { photosAdd(e.target.files); e.target.value = ""; } });
document.addEventListener("keydown", (e) => {
  if (P.open < 0 || $("#pLight")?.hidden) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft" && P.open > 0) lightbox(P.open - 1);
  else if (e.key === "ArrowRight" && P.open < P.list.length - 1) lightbox(P.open + 1);
});
// swipe left/right in the viewer on the phone
let pTouch = null;
document.addEventListener("touchstart", (e) => { if (e.target.closest?.("#pLight")) pTouch = e.touches[0].clientX; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (pTouch == null) return; const dx = e.changedTouches[0].clientX - pTouch; pTouch = null;
  if (Math.abs(dx) > 50) { if (dx < 0 && P.open < P.list.length - 1) lightbox(P.open + 1); else if (dx > 0 && P.open > 0) lightbox(P.open - 1); }
}, { passive: true });
// drag and drop on the PC
["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
  const root = $("#photos"); if (!root || !e.dataTransfer?.types?.includes("Files") || e.target.closest?.("#console")) return;
  e.preventDefault();
  $("#pDrop").hidden = ev === "dragleave" || ev === "drop";
  if (ev === "drop") photosAdd(e.dataTransfer.files);
}));
