// Nexus HQ · chat comforts: a growing message box (Enter sends, Shift+Enter new line), edit & resend,
// retry, copy, automatic chat titles, running summaries for long chats, follow-up suggestions,
// chat search and a chat-bubble view on the PC. Loaded after app.js, lab.js and smart.js.

const ux = { edit: null, ac: null };
const uxPref = (k, d = true) => { try { const v = localStorage.getItem(k); return v == null ? d : v === "on"; } catch { return d; } };
const uxSet = (k, on) => { try { localStorage.setItem(k, on ? "on" : "off"); } catch {} };

// ---------- the message box ----------
const box = $("#conInput");
const touch = matchMedia("(pointer: coarse)");
function fitBox() { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 220) + "px"; }
box.addEventListener("input", fitBox);
box.addEventListener("keydown", (e) => {
  // PC: Enter sends, Shift+Enter adds a line. Phone: Return adds a line, the arrow button sends.
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !touch.matches) { e.preventDefault(); $("#conForm").requestSubmit(); }
  if (e.key === "Escape" && ux.edit) { e.stopPropagation(); endEdit(true); }
});
const keyHint = () => (touch.matches ? box.removeAttribute("enterkeyhint") : box.setAttribute("enterkeyhint", "send"));
keyHint(); touch.addEventListener?.("change", keyHint);

// ---------- which saved item a log line belongs to ----------
function itemIndexOf(el) {
  const rows = [...$("#conLog").children].filter((c) => !c.classList.contains("fu") && !c.classList.contains("stream"));
  const i = rows.indexOf(el);
  return i >= 0 && i < session.items.length ? i : -1;
}
// Remove an exchange (and everything after it) from the chat, including what the agents remember of it
function cutFrom(idx) {
  const it = session.items[idx];
  const later = session.items.slice(idx).filter((x) => x.k === "cmd" && typeof x.hl === "number");
  session.items.length = idx;
  if (typeof it.hl === "number") session.history.length = Math.min(session.history.length, it.hl);
  else if (later.length === 0) session.history.length = Math.max(0, session.history.length - 2);
  if (session.summarized && session.summarized > session.history.length) { session.summary = ""; session.summarized = 0; }
  session.pending = null;
  renderLog();
}
const laterQuestions = (idx) => session.items.slice(idx + 1).some((x) => x.k === "cmd");

// ---------- edit, retry, copy ----------
function startEdit(idx) {
  const it = session.items[idx];
  ux.edit = { idx };
  box.value = it.text; fitBox(); box.focus(); box.setSelectionRange(box.value.length, box.value.length);
  let bar = $("#editBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "editBar"; bar.className = "edit-bar"; $("#conForm").before(bar); }
  bar.innerHTML = `✎ Editing your message${laterQuestions(idx) ? " · everything after it will be replaced" : ""} <button type="button" data-ux="cancel-edit">Cancel</button>`;
  bar.hidden = false;
  (it.images || []).forEach((n) => attachExisting(n));
}
function endEdit(clearBox) {
  ux.edit = null;
  const bar = $("#editBar"); if (bar) bar.hidden = true;
  if (clearBox) { box.value = ""; fitBox(); con.att = []; renderTray(); }
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    const a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0";
    document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand("copy"); } catch {} a.remove(); return ok;
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ux]"); if (!b) return;
  const act = b.dataset.ux;
  if (act === "view") return setView(!$("#console").classList.contains("bubbles"));
  if (act === "cancel-edit") return endEdit(true);
  if (act === "fu") { clearFollowups(); return dispatch(b.dataset.q); }
  const row = b.closest(".ln, .out"); const idx = row ? itemIndexOf(row) : -1;
  if (idx < 0) return;
  const it = session.items[idx];
  if (act === "copy") {
    const ok = await copyText(it.text || "");
    b.textContent = ok ? "✓ Copied" : "Couldn't copy"; setTimeout(() => (b.textContent = "⧉ Copy"), 1500);
    return;
  }
  if (con.busy) return;
  if (act === "edit") return startEdit(idx);
  if (act === "regen") {
    let j = idx; while (j >= 0 && session.items[j].k !== "cmd") j--;
    if (j < 0) return;
    if (laterQuestions(idx) && !confirm("Retrying this answer removes the messages after it. Continue?")) return;
    const q = session.items[j].text, imgs = session.items[j].images || [];
    cutFrom(j);
    imgs.forEach((n) => attachExisting(n));
    return dispatch(q);
  }
});

// Sending while editing replaces the old message and everything after it
const _dispatchUX = dispatch;
dispatch = async function (raw) {
  ux.ac?.abort(); clearFollowups();
  const t = String(raw || "").trim();
  const fm = t.match(/^\/follow-?ups(?:\s+(on|off))?$/i);
  if (fm) {
    if (fm[1]) uxSet("hq.followups", fm[1].toLowerCase() === "on");
    addItem({ k: "cmd", text: t });
    conLine(`💬 Follow-up suggestions are <b>${uxPref("hq.followups") ? "on" : "off"}</b>.`, "sys");
    return saveSession();
  }
  if (ux.edit && t) { const i = ux.edit.idx; endEdit(false); cutFrom(i); }
  return _dispatchUX.apply(this, arguments);
};

// ---------- after each answer: follow-ups, a title, and a summary for long chats ----------
function localModelFor(agent) {
  const id = agent ? effModelId(agent) : null;
  if (id && idx.model[id]?.provider === "ollama" && idx.model[id]?.ready) return id;
  const r = routerModel(); return r && r.provider === "ollama" ? r.id : null;
}
async function quick(mid, system, prompt, maxTokens, signal) {
  const r = await streamChat(mid, system, [{ role: "user", content: prompt }], signal, () => {}, { quick: true, maxTokens });
  return r.error ? "" : r.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
function clearFollowups() { document.querySelectorAll("#conLog .fu").forEach((x) => x.remove()); }
async function afterAnswer(question, answer, agent, task) {
  const mid = localModelFor(agent); if (!mid) return;
  const sid = session.id;
  ux.ac?.abort(); const ac = (ux.ac = new AbortController());
  try {
    // 1. follow-up questions you might ask next
    if (uxPref("hq.followups") && answer.length > 160 && !labQuick(question) && agent?.id !== "private") {
      const t = await quick(mid, "You suggest what a user might ask next. Reply with a JSON array only.",
        `The user asked:\n"""${question.slice(0, 800)}"""\n\nThe answer was:\n"""${answer.slice(0, 2500)}"""\n\nSuggest 3 short follow-up questions the user is likely to ask next, in their own voice (max 9 words each, no numbering). They must make sense on their own. Reply with a JSON array of strings only.`, 160, ac.signal);
      let qs = [];
      try { qs = JSON.parse((t.match(/\[[\s\S]*\]/) || ["[]"])[0]).filter((x) => typeof x === "string" && x.length > 3 && x.length < 120).slice(0, 3); } catch {}
      if (qs.length && session.id === sid && !con.busy && !ac.signal.aborted) {
        const log = $("#conLog"), near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
        const d = document.createElement("div"); d.className = "fu";
        d.innerHTML = qs.map((q) => `<button type="button" data-ux="fu" data-q="${esc(q)}">${esc(q)}</button>`).join("");
        log.append(d); if (near) log.scrollTop = log.scrollHeight;
      }
    }
    // 2. a real title for a new chat
    if (session.id === sid && !session.titled && !session.renamed && session.items.filter((i) => i.k === "cmd").length <= 3 && !ac.signal.aborted) {
      let t = await quick(mid, "You name chat conversations. Reply with the title only.",
        `Write a short title (3 to 6 words) for a chat that starts like this. No quotes, no ending period.\n\nUser: ${question.slice(0, 600)}\n\nAssistant: ${answer.slice(0, 1200)}`, 40, ac.signal);
      t = t.split("\n")[0].replace(/^(title:\s*)/i, "").replace(/^["'*#\s]+|["'*.\s]+$/g, "").slice(0, 60);
      if (t.length > 2 && session.id === sid && !session.renamed) {
        session.title = t; session.titled = true;
        $("#conTitle").textContent = t;
        await saveSession();
        if (!$("#conDrawer").hidden) refreshList();
      }
    }
    // 3. long chats: fold older turns into a running summary
    const keep = 12, done = session.summarized || 0;
    if (session.id === sid && session.history.length - done > keep + 8 && !ac.signal.aborted) {
      const upto = session.history.length - keep;
      const chunk = session.history.slice(done, upto).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 1500)}`).join("\n\n");
      const s = await quick(mid, "You keep a running summary of a conversation so an assistant can remember it. Reply with the summary only.",
        `${session.summary ? `Summary so far:\n${session.summary}\n\n` : ""}Newer messages to add:\n${chunk.slice(0, 12000)}\n\nWrite an updated summary in at most 200 words of short bullet points: what the user wants, decisions made, facts about their setup, names of files/repos/machines, and open questions. Reply with the bullet points only.`, 450, ac.signal);
      if (s.length > 20 && session.id === sid) { session.summary = s.slice(0, 2500); session.summarized = upto; saveSession(); }
    }
  } catch {}
}

// ---------- search saved chats ----------
let searchT = null;
$("#conSearch").addEventListener("input", () => {
  clearTimeout(searchT);
  searchT = setTimeout(async () => {
    const q = $("#conSearch").value.trim();
    if (!q) return refreshList();
    let res = [];
    try { res = (await jfetch(`/api/sessions/search?q=${encodeURIComponent(q)}`)).results; } catch {}
    const fmt = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const mark = (s) => { let h = esc(s); for (const w of q.split(/\s+/).filter((x) => x.length > 1)) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>"); return h; };
    $("#conList").innerHTML = res.length
      ? res.map((s) => `<div class="dr-item ${s.id === session.id ? "on" : ""}">
          <button class="dr-open" data-sid="${esc(s.id)}"><span class="dr-t">${mark(s.title || "Untitled")}</span><span class="dr-m">${fmt(s.updated)} · ${s.count} message${s.count === 1 ? "" : "s"}</span>${s.snippet ? `<span class="dr-snip">${mark(s.snippet)}</span>` : ""}</button>
          <button class="dr-ren" data-ren="${esc(s.id)}" aria-label="Rename" title="Rename">✎</button>
          <button class="dr-del" data-del="${esc(s.id)}" aria-label="Delete">✕</button></div>`).join("")
      : `<div class="dr-empty">No chats mention “${esc(q)}”.</div>`;
  }, 220);
});
const _drawerOpenUX = drawerOpen;
drawerOpen = function (on) { if (on) $("#conSearch").value = ""; _drawerOpenUX(on); if (on && !touch.matches) setTimeout(() => $("#conSearch").focus(), 50); };

// ---------- chat bubbles on the PC ----------
function setView(bubbles) {
  $("#console").classList.toggle("bubbles", bubbles);
  $("#conView").textContent = bubbles ? "⌨" : "💬";
  $("#conView").title = bubbles ? "Switch to the terminal view" : "Switch to chat bubbles";
  uxSet("hq.bubbles", bubbles);
  const log = $("#conLog"); log.scrollTop = log.scrollHeight;
}
setView(uxPref("hq.bubbles", false));

// starting a new chat or opening another one ends an edit
const _startNewChatUX = startNewChat;
startNewChat = function () { endEdit(true); return _startNewChatUX.apply(this, arguments); };
const _openSessionUX = openSession;
openSession = function () { endEdit(true); return _openSessionUX.apply(this, arguments); };
