// Tools the local agents can use on their own while answering (Ollama tool calling):
// search the web, search and read your vault, check the lab, do math, and run code in the sandbox.
// Each tool returns text for the model, plus a short summary (and sources) for the console.

function makeTools({ webSearch, semantic, vault, homelab, sandbox }) {
  const T = {};

  if (webSearch) T.web_search = {
    def: { description: "Search the web. Use it for anything that changes over time or that you aren't sure of: prices, releases, versions, news, specs, docs, error messages. Returns the top results with page text.", parameters: { type: "object", properties: { query: { type: "string", description: "A short search query" } }, required: ["query"] } },
    say: (a) => `searching the web: “${a.query}”`,
    async run(a) {
      const results = await webSearch(String(a.query || "").slice(0, 300));
      if (!results.length) return { text: "No results.", summary: "no results" };
      const text = results.map((x, i) => `[${i + 1}] ${x.title}\n${x.url}\n${(x.text || x.snippet || "").slice(0, 1800)}`).join("\n\n");
      return { text: `${text}\n\n(Use these facts in your answer. Don't put [1]-style markers in the text; the app lists the sources.)`, summary: `${results.length} results`, sources: results };
    },
  };

  if (vault) T.search_notes = {
    def: { description: "Search the user's own notes (their Obsidian vault: notes, repo notes, memory) by meaning. Use it when the question is about the user's own setup, projects, repos, plans or anything they may have written down.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
    say: (a) => `searching your notes: “${a.query}”`,
    async run(a) {
      const { results } = semantic ? await semantic.search(String(a.query || ""), 4) : { results: vault.search(String(a.query || ""), 4) };
      if (!results.length) return { text: "No matching notes.", summary: "nothing found" };
      return { text: results.map((r) => `### ${r.title} (path: ${r.path})\n${(r.text || r.snippet || "").slice(0, 1500)}`).join("\n\n"), summary: results.map((r) => r.title).join(", "), notes: results.map((r) => ({ path: r.path, title: r.title })) };
    },
  };

  if (vault) T.read_note = {
    def: { description: "Read one whole note from the user's vault, by the path that search_notes gave you.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    say: (a) => `reading note ${a.path}`,
    async run(a) {
      const p = String(a.path || "");
      if (/^private\//i.test(p) || /(^|\/)\.\.(\/|$)/.test(p)) return { text: "That note is private.", summary: "private, not read" };
      try { const n = vault.read(p); return { text: n.body.slice(0, 12000), summary: n.title || p, notes: [{ path: p, title: n.title || p }] }; }
      catch { return { text: "No note at that path. Use search_notes first.", summary: "not found" }; }
    },
  };

  if (homelab) T.lab_status = {
    def: { description: "Live status of the user's homelab: machines online/offline, CPU/RAM/disk/GPU and temperatures, Docker containers, Pi-hole, power use and cost, and open security alerts from Sentinel. Use it for any question about their servers, lab, network or alerts.", parameters: { type: "object", properties: {} } },
    say: () => "checking your lab",
    async run() { await homelab.refresh(true); const c = homelab.chip(); return { text: homelab.text(), summary: `${c.up}/${c.machines} machines up · ${c.alerts} open alerts` }; },
  };

  T.calculate = {
    def: { description: "Evaluate a math expression exactly, e.g. \"(1499*0.85)+42\" or \"sqrt(2)*pi\". Supports + - * / % ^ ( ) and sqrt, pow, abs, round, floor, ceil, min, max, log, log10, exp, sin, cos, tan, pi, e.", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
    say: (a) => `calculating ${a.expression}`,
    async run(a) {
      const ex = String(a.expression || "").replace(/\^/g, "**").replace(/,(?=\d{3}\b)/g, "");
      const names = ["sqrt", "pow", "abs", "round", "floor", "ceil", "min", "max", "log", "log10", "exp", "sin", "cos", "tan", "pi", "e"];
      const words = ex.match(/[a-z_]\w*/gi) || [];
      if (words.some((w) => !names.includes(w.toLowerCase())) || /[^\d\s+\-*/%().,a-z_]/i.test(ex) || ex.length > 300) return { text: "That isn't a plain math expression.", summary: "not math" };
      const M = { sqrt: Math.sqrt, pow: Math.pow, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, log: Math.log, log10: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan, pi: Math.PI, e: Math.E };
      try {
        const v = Function(...names, `"use strict"; return (${ex.replace(/[a-z_]\w*/gi, (w) => w.toLowerCase())});`)(...names.map((n) => M[n]));
        if (typeof v !== "number" || !isFinite(v)) return { text: `Result isn't a finite number (${v}).`, summary: "no number" };
        const out = Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
        return { text: out, summary: `= ${out}` };
      } catch (e) { return { text: `Couldn't evaluate: ${e.message}`, summary: "error" }; }
    },
  };

  if (sandbox) T.run_code = {
    def: { description: "Run code in a locked sandbox (no internet, no access to the user's files, 20 s, 512 MB) and get stdout, stderr and the exit code. Use it to test code you wrote before giving it to the user, to check an answer, or to compute something. Include small test calls or prints so the output shows it works. Only the standard library is available (no pip/npm installs).", parameters: { type: "object", properties: { language: { type: "string", enum: ["python", "javascript", "bash"] }, code: { type: "string" } }, required: ["language", "code"] } },
    say: (a) => `running ${a.language || "code"} in the sandbox`,
    async run(a) {
      const r = await sandbox.run(a.language || "python", a.code);
      if (r.error) return { text: r.error, summary: r.error, ok: false };
      const text = `exit code ${r.exitCode}\n--- stdout ---\n${r.stdout || "(empty)"}\n--- stderr ---\n${r.stderr || "(empty)"}`;
      return { text, summary: r.exitCode === 0 ? `✓ ran in ${(r.ms / 1000).toFixed(1)}s` : `✕ exit ${r.exitCode}`, ok: r.exitCode === 0, run: { language: r.language, code: String(a.code).slice(0, 8000), stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode } };
    },
  };

  // Tools that exist right now (the sandbox and lab can come and go)
  async function available() {
    const names = Object.keys(T);
    if (sandbox && !(await sandbox.ready())) names.splice(names.indexOf("run_code"), 1);
    return names;
  }
  const defs = (names) => names.filter((n) => T[n]).map((n) => ({ type: "function", function: { name: n, ...T[n].def } }));
  async function run(name, args) {
    const t = T[name];
    if (!t) return { text: `There's no tool called ${name}.`, summary: "unknown tool" };
    let a = args;
    if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
    try { return await t.run(a || {}); }
    catch (e) { return { text: `The tool failed: ${e.message}`, summary: `failed: ${e.message}`, ok: false }; }
  }
  const say = (name, args) => { try { return T[name]?.say(typeof args === "string" ? JSON.parse(args) : args || {}) || name; } catch { return name; } };
  return { available, defs, run, say, names: () => Object.keys(T) };
}

// What to tell the model about its tools
function toolGuide(names) {
  const has = (n) => names.includes(n);
  const lines = ["You can use tools while you answer. Use them instead of guessing, then answer the user normally (never mention tool names or show tool syntax)."];
  if (has("web_search")) lines.push("- web_search for anything current or that you're unsure of.");
  if (has("search_notes")) lines.push("- search_notes / read_note when the question touches the user's own projects, repos, setup or notes.");
  if (has("lab_status")) lines.push("- lab_status for anything about their machines, containers, network, power or security alerts.");
  if (has("calculate")) lines.push("- calculate for any arithmetic you'd otherwise do in your head.");
  if (has("run_code")) lines.push("- run_code: when you write a script or function, run it with a small test first. If it fails, fix it and run it again (up to 3 tries) before answering. Then give the final working code, and say briefly that you tested it and what the test showed. Don't test code that needs the internet, extra packages, the user's files or hardware; say it's untested instead.");
  return lines.join("\n");
}

module.exports = { makeTools, toolGuide };
