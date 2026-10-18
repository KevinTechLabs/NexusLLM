// Nexus HQ · agents that use tools on their own (web, notes, lab, calculator, code sandbox),
// live tool lines in the console, and memory suggestions after you tell it something about yourself.
// Loaded after app.js.

const prefOn = (k, d = true) => { try { const v = localStorage.getItem(k); return v == null ? d : v === "on"; } catch { return d; } };
const prefSet = (k, on) => { try { localStorage.setItem(k, on ? "on" : "off"); } catch {} };

// ---------- which tools an agent gets ----------
function toolsFor(agent, modelId) {
  if (!prefOn("hq.tools") || !D?.tools?.names?.length) return [];
  if (idx.model[modelId]?.provider !== "ollama") return []; // Opus/GPT answer without the local tool loop
  let names = [...D.tools.names];
  if (webMode() === "off" || agent?.id === "private") names = names.filter((n) => n !== "web_search");
  return names;
}

// ---------- tool lines in the console ----------
const TOOL_ICON = { web_search: "🌐", search_notes: "📓", read_note: "📓", lab_status: "🖥", calculate: "🧮", run_code: "▶" };
function toolLines() {
  const open = [];
  return {
    start(ev) {
      const it = { k: "sys", cls: "sys dim tool", html: `${TOOL_ICON[ev.name] || "🔧"} ${esc(ev.label || ev.name)} <span class="tl-wait">…</span>` };
      const el = addItem(it);
      open.push({ it, el, name: ev.name });
    },
    end(ev) {
      const o = open.find((x) => x.name === ev.name && !x.done) || open[open.length - 1];
      if (!o) return;
      o.done = true;
      let extra = "";
      if (ev.run) {
        const out = [ev.run.stdout && `<b>output</b>\n${esc(ev.run.stdout)}`, ev.run.stderr && `<b>errors</b>\n${esc(ev.run.stderr)}`].filter(Boolean).join("\n") || "(no output)";
        extra = `<details class="tl-run"><summary>show code and output</summary><pre><code>${esc(ev.run.code)}</code></pre><pre class="${ev.run.exitCode === 0 ? "" : "bad"}">${out}</pre></details>`;
      } else if (ev.notes?.length) {
        extra = ` ${ev.notes.map((n) => `<button class="linkbtn" data-note="${esc(n.path)}">${esc(n.title)}</button>`).join(", ")}`;
      }
      o.it.html = o.it.html.replace(/ <span class="tl-wait">…<\/span>$/, "") + ` <span class="${ev.ok ? "tl-ok" : "tl-bad"}">· ${esc(ev.notes?.length ? "found" : ev.summary || "done")}</span>${extra}`;
      const tx = o.el?.querySelector(".tx");
      if (tx) tx.innerHTML = o.it.html;
    },
  };
}

// ---------- memory suggestions ----------
const words = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9]+/g) || []);
function similar(a, b) {
  const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
let memBusy = false;
// facts you said No to aren't offered again
const declined = () => { try { return JSON.parse(localStorage.getItem("hq.memno") || "[]"); } catch { return []; } };
async function suggestMemory(userText, modelId) {
  if (!prefOn("hq.automem") || memBusy) return;
  const t = String(userText || "").trim();
  if (t.length < 15 || t.length > 2000 || /^[\/@]/.test(t) || !/\b(i (have|had|got|use|used|run|own|bought|built|made|work|live|prefer|like|love|hate|want|need|plan|switched|moved|set up|installed)|i've (got|been|set|switched|moved|built)|i'm (a|an|using|running|building|planning|working|learning|studying|moving|getting)|i am (a|an|using|running|building|planning|working|learning)|my \w+( \w+)? (is|are|was|runs|has|uses)|we (have|use|run)|our \w+ (is|are)|call(ed)? (it|him|her|them)|my name is)\b/i.test(t) || looksLikeCode(t)) return;
  let mid = idx.model[modelId]?.provider === "ollama" && idx.model[modelId]?.ready ? modelId : routerModel()?.id;
  if (!mid || idx.model[mid]?.provider !== "ollama") return; // only ever local: this runs after every chat
  memBusy = true;
  try {
    const known = (D.memory || []).map((m) => m.text);
    const r = await streamChat(mid, "You pick out lasting facts about a user so their assistant can remember them. Reply with a JSON array only.",
      [{ role: "user", content: `Things already remembered:\n${known.map((k) => `- ${k}`).join("\n") || "(nothing yet)"}\n\nThe user just wrote:\n"""${t.slice(0, 1500)}"""\n\nList up to 2 NEW facts worth remembering for future chats: their setup and devices, names of their machines/projects/people, preferences, goals, or plans. Write each one short, in their own voice, the way they'd say "remember that ..." (e.g. "My NAS is called backup-nas", "I prefer answers with tables").\nDon't include: questions they asked, one-off tasks, things that will be out of date in a few days, passwords or keys, or anything already remembered.\nReply [] if there's nothing. Reply with the JSON array only.` }],
      null, () => {}, { quick: true, maxTokens: 300 });
    if (r.error) return;
    let list = [];
    try { list = JSON.parse((r.text.replace(/<think>[\s\S]*?<\/think>/g, "").match(/\[[\s\S]*\]/) || ["[]"])[0]); } catch { return; }
    list = list.filter((x) => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim().replace(/^remember (that )?/i, "")).filter((x) => x.length > 5 && x.length < 200)
      .filter((x) => !/password|passwd|token|api key|secret|\bpin\b/i.test(x))
      .filter((x) => !known.some((k) => similar(k, x) > 0.7) && !declined().some((k) => similar(k, x) > 0.7)).slice(0, 2);
    for (const fact of list) {
      conLine(`💡 Remember this? “${esc(fact)}”<span class="lab-act"><button class="btn-sm go" data-memyes="${esc(fact)}">Remember</button><button class="btn-sm" data-memnope>No</button></span>`, "sys");
    }
    if (list.length) saveSession();
  } finally { memBusy = false; }
}
document.addEventListener("click", async (e) => {
  const no = e.target.closest("[data-memnope]");
  if (no) {
    const fact = no.parentElement.querySelector("[data-memyes]")?.dataset.memyes;
    if (fact) try { localStorage.setItem("hq.memno", JSON.stringify([...declined(), fact].slice(-100))); } catch {}
    no.parentElement.innerHTML = `<span class="dim">ok, not saved</span>`; return;
  }
  const yes = e.target.closest("[data-memyes]");
  if (!yes) return;
  const box = yes.parentElement, text = yes.dataset.memyes;
  try {
    const r = await jfetch("/api/memory", { method: "POST", body: JSON.stringify({ text }) });
    D.memory = r.items;
    box.innerHTML = `<span class="ok">✓ remembered</span>`;
  } catch (err) { box.innerHTML = `<span class="err">✕ ${esc(err.message)}</span>`; }
  // keep the saved state in the chat history
  const item = [...session.items].reverse().find((i) => i.k === "sys" && i.html?.includes(`data-memyes="${esc(text)}"`));
  if (item) item.html = item.html.replace(/<span class="lab-act">[\s\S]*<\/span>$/, box.outerHTML);
  saveSession();
});

// ---------- commands: /tools, /automemory ----------
async function smartCommand(q) {
  const t = q.trim().toLowerCase();
  let m;
  if ((m = t.match(/^\/tools(?:\s+(on|off))?$/))) {
    if (m[1]) prefSet("hq.tools", m[1] === "on");
    const tl = D.tools || { names: [] }, on = prefOn("hq.tools");
    const sb = tl.sandbox || {};
    conLine(`🔧 Agent tools are <b>${on ? "on" : "off"}</b>${on ? `: ${tl.names.map((n) => `${TOOL_ICON[n] || ""} ${n.replace(/_/g, " ")}`).join(", ") || "none available"}` : ""}.<br>
      <span class="dim">Code sandbox: ${sb.enabled ? "ready (Docker, no internet, 20 s, 512 MB)" : esc(sb.reason || "off")}. Local models pick tools themselves; Opus answers without them. Turn off with /tools off.</span>`, "sys");
    return true;
  }
  if ((m = t.match(/^\/auto-?memory(?:\s+(on|off))?$/))) {
    if (m[1]) prefSet("hq.automem", m[1] === "on");
    conLine(`💡 Memory suggestions are <b>${prefOn("hq.automem") ? "on" : "off"}</b>. When you mention something lasting about yourself, Nexus HQ offers to remember it. Nothing is saved unless you tap Remember.`, "sys");
    return true;
  }
  return false;
}
