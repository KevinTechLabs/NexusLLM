// Nexus HQ — a map of chat and coding agents running on GPT-5.6, Claude Opus 5.5 and local Ollama models.
// Zero dependencies. Requires Node 18+ (built-in fetch).
const http = require("http");
const fs = require("fs");
const path = require("path");

// ---------- config ----------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.join(__dirname, ".env"));

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);
const PORT = Number(env("PORT", 3100));
const HOST = env("HOST", "0.0.0.0");
const PASSWORD = env("DASHBOARD_PASSWORD", "").trim();
const crypto = require("crypto");
// Login cookie: derived from the password, so changing the password logs every device out.
const TOKEN = PASSWORD ? crypto.createHash("sha256").update(`nexus-hq:${PASSWORD}`).digest("hex") : "";
// iPhone keyboards can swap in curly quotes and long dashes; treat them as the plain ones.
const norm = (v) => String(v).normalize("NFKC").replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"').replace(/[\u2013\u2014\u2212]/g, "-").replace(/\u2026/g, "...").replace(/\u00A0/g, " ").trim();
const sameText = (a, b) => {
  const x = crypto.createHash("sha256").update(norm(a)).digest(), y = crypto.createHash("sha256").update(norm(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const OLLAMA_URL = env("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/$/, "");
const MAX_TOKENS = Number(env("MAX_TOKENS", 8192));
// Ollama's default context window is small; conversations and pipelines need more room.
const NUM_CTX = Number(env("OLLAMA_NUM_CTX", 16384));
// Optional web search through a self-hosted SearXNG (see setup-web-search.sh)
const SEARXNG_URL = env("SEARXNG_URL", "").replace(/\/$/, "");
const OPENAI_BASE = env("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
const ANTHROPIC_BASE = env("ANTHROPIC_BASE_URL", "https://api.anthropic.com").replace(/\/$/, "");

const ALL_MODELS = [
  { id: "gpt", label: "GPT-5.6 Sol", provider: "openai", model: env("OPENAI_MODEL", "gpt-5.6-sol"), orModel: env("OPENROUTER_GPT_MODEL", "openai/gpt-5.6-sol"), color: "#10a37f" },
  { id: "opus", label: "Claude Opus 5.5", provider: "anthropic", model: env("ANTHROPIC_MODEL", "claude-opus-5-5"), orModel: env("OPENROUTER_OPUS_MODEL", "anthropic/claude-opus-5.5"), color: "#d97757",
    // Opus is the expensive one: short answers, priced per million tokens, and a daily budget.
    maxTokens: Number(env("OPUS_MAX_TOKENS", 1500)), priceIn: Number(env("OPUS_PRICE_IN", 4)), priceOut: Number(env("OPUS_PRICE_OUT", 20)), budgeted: true },
  { id: "gemma", label: "Gemma 4 12B", provider: "ollama", model: env("GEMMA_MODEL", "gemma4:12b"), color: "#4c8bf5" },
  { id: "qwencoder", label: "Qwen3-Coder 30B", provider: "ollama", model: env("QWEN_CODER_MODEL", "qwen3-coder:30b"), color: "#3b82f6" },
];

// ---------- helpers ----------
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      try { yield JSON.parse(data); } catch {}
    }
  }
}

async function* ndjson(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) { try { yield JSON.parse(line); } catch {} }
    }
  }
  if (buf.trim()) { try { yield JSON.parse(buf); } catch {} }
}

async function failText(res) {
  const t = await res.text().catch(() => "");
  try { const j = JSON.parse(t); return j.error?.message || j.error || t; } catch { return t || res.statusText; }
}

// ---------- photos ----------
// Photos live in a "NexusPhotos" folder next to nexus-hq (e.g. ~/Documents/NexusPhotos), so the PC can see them too.
const PHOTOS_DIR = path.resolve(env("PHOTOS_DIR", path.resolve(__dirname, "..", "NexusPhotos")));
const PHOTO_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const PHOTO_MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif" };
try { fs.mkdirSync(path.join(PHOTOS_DIR, ".thumbs"), { recursive: true }); } catch (e) { console.warn(`Photos folder: ${e.message}`); }
const photoPath = (name, thumb) => {
  const n = path.basename(String(name || ""));
  if (!PHOTO_EXT.test(n) || n.startsWith(".")) return null;
  const p = thumb ? path.join(PHOTOS_DIR, ".thumbs", n.replace(/\.[^.]+$/, ".jpg")) : path.join(PHOTOS_DIR, n);
  return p.startsWith(PHOTOS_DIR + path.sep) ? p : null;
};
function photoData(name) {
  const p = photoPath(name);
  if (!p || !fs.existsSync(p)) return null;
  return { mime: PHOTO_MIME[path.extname(p).toLowerCase()] || "image/jpeg", b64: fs.readFileSync(p).toString("base64") };
}
// Turn {role, content, images:[names]} into each provider's own image format
function withImages(provider, messages) {
  return messages.map((x) => {
    const imgs = (x.images || []).map(photoData).filter(Boolean);
    if (!imgs.length || x.role !== "user") return { role: x.role, content: x.content };
    if (provider === "ollama") return { role: x.role, content: x.content, images: imgs.map((i) => i.b64) };
    if (provider === "anthropic") return { role: x.role, content: [...imgs.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.b64 } })), { type: "text", text: x.content }] };
    if (provider === "openai") return { role: x.role, content: [{ type: "input_text", text: x.content }, ...imgs.map((i) => ({ type: "input_image", image_url: `data:${i.mime};base64,${i.b64}` }))] };
    return { role: x.role, content: [{ type: "text", text: x.content }, ...imgs.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.b64}` } }))] };
  });
}
// What each local model can do (asked from Ollama once, then cached): see images, use tools
const capsCache = new Map();
async function ollamaCaps(model) {
  const c = capsCache.get(model);
  if (c && Date.now() - c.at < 10 * 60e3) return c.v;
  let v = { vision: false, tools: false };
  try {
    const r = await fetch(`${OLLAMA_URL}/api/show`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const j = await r.json(), caps = j.capabilities || [];
      v = { vision: caps.includes("vision") || !!j.projector_info || /clip|mllama|vision/i.test(JSON.stringify(j.details || {})), tools: caps.includes("tools") || /\.Tools|tool_call/i.test(String(j.template || "")) };
    }
  } catch {}
  capsCache.set(model, { v, at: Date.now() });
  return v;
}
const ollamaVision = async (model) => (await ollamaCaps(model)).vision;

// ---------- providers ----------
// Each yields {type:"delta", text} and finally {type:"usage", input, output}
async function* streamOpenAI(m, messages, system, signal) {
  const key = env("OPENAI_API_KEY", "");
  if (!key) throw new Error("OPENAI_API_KEY is not set in .env");
  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: m.model, stream: true, max_output_tokens: m.maxTokens || MAX_TOKENS,
      ...(system ? { instructions: system } : {}),
      input: withImages("openai", messages),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await failText(res)}`);
  for await (const ev of sseEvents(res.body)) {
    if (ev.type === "response.output_text.delta") yield { type: "delta", text: ev.delta };
    else if (ev.type === "response.completed") {
      const u = ev.response?.usage || {};
      yield { type: "usage", input: u.input_tokens, output: u.output_tokens };
    } else if (ev.type === "error" || ev.type === "response.failed") {
      throw new Error(ev.error?.message || ev.response?.error?.message || "OpenAI stream error");
    }
  }
}

async function* streamAnthropic(m, messages, system, signal) {
  const key = env("ANTHROPIC_API_KEY", "");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: m.model, max_tokens: m.maxTokens || MAX_TOKENS, stream: true,
      ...(system ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
      messages: withImages("anthropic", messages),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await failText(res)}`);
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for await (const ev of sseEvents(res.body)) {
    if (ev.type === "message_start") { const u = ev.message?.usage || {}; input = u.input_tokens || 0; cacheRead = u.cache_read_input_tokens || 0; cacheWrite = u.cache_creation_input_tokens || 0; }
    else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield { type: "delta", text: ev.delta.text };
    else if (ev.type === "message_delta") output = ev.usage?.output_tokens || output;
    else if (ev.type === "error") throw new Error(ev.error?.message || "Anthropic stream error");
  }
  yield { type: "usage", input, output, cacheRead, cacheWrite };
}

// Keep models loaded between questions so replies start fast (Ollama's default unloads after 5 minutes)
const KEEP_ALIVE = env("OLLAMA_KEEP_ALIVE", "30m");
async function* streamOllama(m, messages, system, signal, opts = {}) {
  // Tools (web search, notes, lab, calculator, code sandbox) if this model supports them
  const names = opts.tools?.length && tools && (await ollamaCaps(m.model)).tools ? opts.tools : [];
  if (names.length) system = `${system ? system + "\n\n" : ""}${toolGuide(names)}`;
  const msgs = system ? [{ role: "system", content: system }, ...withImages("ollama", messages)] : withImages("ollama", messages);
  const body = { model: m.model, stream: true, messages: msgs, keep_alive: KEEP_ALIVE, options: { num_ctx: NUM_CTX, ...(opts.num_predict ? { num_predict: opts.num_predict } : {}) } };
  if (m.think !== undefined) body.think = m.think;
  if (names.length) body.tools = tools.defs(names);
  const MAX_ROUNDS = 6;
  let input = 0, output = 0, ranCode = false, fixes = 0;
  for (let round = 0; ; round++) {
    if (round === MAX_ROUNDS) delete body.tools; // last round: answer with what it has
    let res;
    try {
      res = await fetch(`${OLLAMA_URL}/api/chat`, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new Error(`Can't reach Ollama at ${OLLAMA_URL}. Is it running? (ollama serve)`);
    }
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await failText(res)}`);
    const calls = []; let said = "";
    for await (const ev of ndjson(res.body)) {
      if (ev.error) throw new Error(`Ollama: ${ev.error}`);
      if (ev.message?.content) { said += ev.message.content; yield { type: "delta", text: ev.message.content }; }
      if (ev.message?.tool_calls?.length) calls.push(...ev.message.tool_calls);
      if (ev.done) { input += ev.prompt_eval_count || 0; output += ev.eval_count || 0; }
    }
    if (!calls.length || !body.tools) {
      // Coding answers get checked even if the model didn't test its own code: run the code
      // block in the sandbox, and if it fails, hand the error back and have it fix the answer.
      if (!opts.verify || ranCode || fixes > 2 || !sandbox?.state.enabled) break;
      const v = await checkAnswerCode(said);
      if (!v) break;
      yield { type: "tool", name: "run_code", label: `testing the ${v.language} code from this answer` };
      yield { type: "toolResult", name: "run_code", summary: v.summary, ok: v.ok, run: v.run };
      if (v.ok || v.untestable || fixes === 2) break;
      fixes++;
      body.messages.push({ role: "assistant", content: said });
      body.messages.push({ role: "user", content: `I ran the ${v.language} code from your answer in a sandbox and it failed:\n\n${(v.run.stderr || v.run.stdout).slice(-2500)}\n\nFind the bug, fix it, and write your whole answer again with the corrected code. Don't mention this message or apologize; just give the corrected answer.` });
      yield { type: "reset" };
      continue;
    }
    if (calls.some((c) => c.function?.name === "run_code")) ranCode = true;
    body.messages.push({ role: "assistant", content: said, tool_calls: calls });
    if (said.trim()) yield { type: "delta", text: "\n\n" };
    for (const c of calls.slice(0, 4)) {
      const name = c.function?.name, args = c.function?.arguments || {};
      yield { type: "tool", name, label: tools.say(name, args) };
      const r = await tools.run(name, args);
      yield { type: "toolResult", name, summary: r.summary, ok: r.ok !== false, ...(r.sources ? { sources: r.sources.map((x) => ({ title: x.title, url: x.url, snippet: x.snippet })) } : {}), ...(r.notes ? { notes: r.notes } : {}), ...(r.run ? { run: r.run } : {}) };
      body.messages.push({ role: "tool", content: String(r.text).slice(0, 16000), tool_name: name });
    }
  }
  yield { type: "usage", input, output };
}

// Run the main code block of an answer in the sandbox. Returns null when there's nothing to test.
async function checkAnswerCode(text) {
  const blocks = [...String(text).matchAll(/```(python3?|py|javascript|js|node)[^\n]*\n([\s\S]*?)```/gi)].map((b) => ({ language: /^p/i.test(b[1]) ? "python" : "javascript", code: b[2] }));
  if (!blocks.length) return null;
  const b = blocks.sort((x, y) => y.code.length - x.code.length)[0];
  if (b.code.trim().split("\n").length < 3) return null;
  // things a sandbox with no input, files, internet or extra packages can't fairly test
  if (/\binput\s*\(|sys\.stdin|process\.stdin|readline|argv|open\s*\(|requests\.|urllib|http\.|fetch\s*\(|socket|subprocess|os\.system|tkinter|pygame|flask|fastapi|django|express\(|app\.listen|serve_forever|while\s+True\s*:|setInterval|require\(['"](?!(fs|path|os|util|assert|crypto)['"])/i.test(b.code)) return null;
  const r = await sandbox.run(b.language, b.code, { timeoutS: 10 });
  if (r.error) return null;
  const err = r.stderr || "";
  const run = { language: b.language, code: b.code.slice(0, 8000), stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
  if (r.exitCode === 0) return { ok: true, language: b.language, summary: "✓ it runs", run };
  if (r.exitCode === 137 || /ModuleNotFoundError|No module named|Cannot find module|EOFError|FileNotFoundError|ENOENT|PermissionError|EACCES|ConnectionError|getaddrinfo|ENOTFOUND|Network is unreachable/.test(err))
    return { ok: true, untestable: true, language: b.language, summary: "couldn't be tested here (needs packages, files, input or internet)", run };
  return { ok: false, language: b.language, summary: `✕ failed (exit ${r.exitCode}), fixing it`, run };
}

// OpenRouter: one key for both cloud models (OpenAI-compatible chat completions)
async function* streamOpenRouter(m, messages, system, signal) {
  const key = env("OPENROUTER_API_KEY", "");
  const msgs = system ? [{ role: "system", content: system }, ...withImages("openrouter", messages)] : withImages("openrouter", messages);
  const res = await fetch(`${env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Nexus HQ" },
    body: JSON.stringify({ model: m.orModel, stream: true, max_tokens: m.maxTokens || MAX_TOKENS, messages: msgs, usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await failText(res)}`);
  let usage = null;
  for await (const ev of sseEvents(res.body)) {
    if (ev.error) throw new Error(`OpenRouter: ${ev.error.message || JSON.stringify(ev.error)}`);
    const t = ev.choices?.[0]?.delta?.content;
    if (t) yield { type: "delta", text: t };
    if (ev.usage) usage = ev.usage;
  }
  if (usage) yield { type: "usage", input: usage.prompt_tokens, output: usage.completion_tokens };
}

const PROVIDERS = { openai: streamOpenAI, anthropic: streamAnthropic, ollama: streamOllama, openrouter: streamOpenRouter };
const DIRECT_KEY = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
// Use the provider's own key if set; otherwise fall back to OpenRouter.
function route(m) {
  if (m.provider === "ollama") return { via: "ollama", model: m.model };
  if (env(DIRECT_KEY[m.provider], "")) return { via: m.provider, model: m.model };
  if (env("OPENROUTER_API_KEY", "")) return { via: "openrouter", model: m.orModel };
  return { via: null, model: m.model };
}
// Cloud models only appear once a key for them is set in .env; the Qwen models always appear.
const MODELS = ALL_MODELS.filter((m) => m.provider === "ollama" || route(m).via);

// ---------- settings changed from the dashboard (e.g. turning Opus off) ----------
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch { return {}; } }
// Long-term memory: short facts you ask Nexus HQ to remember, shared by every agent and device.
const MEMORY_FILE = path.join(__dirname, "data", "memory.json");
function readMemory() { if (typeof vault !== "undefined" && vault) return vault.readMemory(); try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch { return []; } }
function writeMemory(m) { if (typeof vault !== "undefined" && vault) return vault.writeMemory(m); fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true }); fs.writeFileSync(MEMORY_FILE, JSON.stringify(m, null, 2)); }
function writeSettings(s) { fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }
const isDisabled = (id) => (readSettings().disabledModels || []).includes(id);

// ---------- Opus budget: a monthly limit, plus an optional daily one ----------
const numOrNull = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const MONTHLY_BUDGET = numOrNull(env("OPUS_MONTHLY_BUDGET", "10"));
const DAILY_BUDGET = numOrNull(env("OPUS_DAILY_BUDGET", ""));
const SPEND_FILE = path.join(__dirname, "data", "spend.json");
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the server's time zone
function readSpend() {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(SPEND_FILE, "utf8")); } catch {}
  const d = today(), m = d.slice(0, 7);
  return {
    date: d, usd: j.date === d ? j.usd || 0 : 0, calls: j.date === d ? j.calls || 0 : 0,
    month: m, monthUsd: j.month === m ? j.monthUsd || 0 : (j.date || "").startsWith(m) ? j.usd || 0 : 0,
  };
}
function addSpend(usd) {
  const j = readSpend(); j.usd += usd; j.calls += 1; j.monthUsd += usd;
  fs.mkdirSync(path.dirname(SPEND_FILE), { recursive: true });
  fs.writeFileSync(SPEND_FILE, JSON.stringify(j));
  return j;
}
function costOf(m, u) {
  if (!m.priceIn) return 0;
  const inp = u.input || 0, cr = u.cacheRead || 0, cw = u.cacheWrite || 0, out = u.output || 0;
  return (inp * m.priceIn + cr * m.priceIn * 0.05 + cw * m.priceIn * 1.25 + out * m.priceOut) / 1e6;
}
// Which limit (if any) has been hit
function limitHit() {
  const sp = readSpend();
  if (MONTHLY_BUDGET != null && sp.monthUsd >= MONTHLY_BUDGET) return `monthly limit of $${MONTHLY_BUDGET.toFixed(2)}`;
  if (DAILY_BUDGET != null && sp.usd >= DAILY_BUDGET) return `daily limit of $${DAILY_BUDGET.toFixed(2)}`;
  return null;
}
const overBudget = () => !!limitHit();
const spendInfo = () => { const sp = readSpend(); return { today: sp.usd, month: sp.monthUsd, calls: sp.calls, daily: DAILY_BUDGET, monthly: MONTHLY_BUDGET }; };

// ---------- status ----------
async function status() {
  let ollamaModels = null;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) ollamaModels = ((await r.json()).models || []).map((x) => x.name);
  } catch {}
  const vis = Object.fromEntries(await Promise.all(MODELS.filter((m) => m.provider === "ollama").map(async (m) => [m.id, await ollamaVision(m.model)])));
  return MODELS.map((m) => {
    let ready = true, note = "";
    const r = route(m);
    if (m.provider !== "ollama" && !r.via) { ready = false; note = "Add OPENROUTER_API_KEY (or this provider's own key) to .env"; }
    if (m.provider === "ollama") {
      if (!ollamaModels) { ready = false; note = "Ollama not reachable"; }
      else if (!ollamaModels.some((n) => n === m.model || n === `${m.model}:latest`)) { ready = false; note = `Run: ollama pull ${m.model}`; }
    }
    const rt = route(m);
    if (ready && m.budgeted && overBudget()) note = `Reached the ${limitHit()}; local models stand in until it resets`;
    const off = m.provider !== "ollama" && isDisabled(m.id);
    if (off) note = "Turned off in Nexus HQ; local models are standing in";
    return { id: m.id, label: m.label, model: rt.model, provider: rt.via || m.provider, color: m.color, ready, note, ...(m.budgeted ? { budgeted: true, overBudget: overBudget() } : {}), ...(m.provider !== "ollama" ? { switchable: true, enabled: !off } : {}), vision: m.provider === "ollama" ? !!vis[m.id] : true };
  });
}

// ---------- GitHub + projects ----------
const { makeClient } = require("./lib/github");
const { makeVault } = require("./lib/vault");
// Obsidian vault (notes + memory). Set VAULT_DIR in .env to move it, or VAULT_DIR=off to turn it off.
// Default: a "NexusVault" folder next to the nexus-hq folder (e.g. ~/Documents/NexusVault), whichever user runs the service.
const VAULT_DIR = env("VAULT_DIR", path.resolve(__dirname, "..", "NexusVault"));
let vault = null;
if (!/^(off|none|false|0)$/i.test(VAULT_DIR)) {
  try {
    vault = makeVault(VAULT_DIR);
    // one-time move of facts saved before the vault existed
    const old = path.join(__dirname, "data", "memory.json");
    if (fs.existsSync(old) && !vault.readMemory().length) {
      try { const items = JSON.parse(fs.readFileSync(old, "utf8")); if (items.length) vault.writeMemory(items); fs.renameSync(old, old + ".moved-to-vault"); } catch {}
    }
  } catch (e) { console.warn(`Vault disabled: ${e.message}`); vault = null; }
}

const GITHUB_TOKEN = env("GITHUB_TOKEN", "");
const github = GITHUB_TOKEN ? makeClient(GITHUB_TOKEN) : null;
// ---- homelab awareness (NexusLab + Sentinel) ----
const { makeHomelab } = require("./lib/homelab");
const homelab = (env("NEXUSLAB_URL", "") || env("SENTINEL_URL", ""))
  ? makeHomelab({ nexuslabUrl: env("NEXUSLAB_URL", ""), nexuslabUser: env("NEXUSLAB_USER", "admin"), nexuslabPassword: env("NEXUSLAB_PASSWORD", ""), sentinelUrl: env("SENTINEL_URL", "") })
  : null;
if (homelab) homelab.refresh(true).catch(() => {});

// ---- phone notifications (Web Push) ----
const { makePush } = require("./lib/webpush");
let push = null;
try { push = makePush({ dataDir: path.join(__dirname, "data"), log: (m) => console.log(m) }); } catch (e) { console.warn(`Notifications disabled: ${e.message}`); }
const presence = new Map(); // device id -> { visible, at }
const chatJobs = new Map(); // answer id -> { text, done } for answers finished while you were away
setInterval(() => { const cut = Date.now() - 15 * 60e3; for (const [k, v] of chatJobs) if (v.at < cut) chatJobs.delete(k); for (const [k, v] of presence) if (v.at < cut - 36e5) presence.delete(k); }, 60e3).unref();
// Watch the lab and push new critical/high alerts and machines going offline (PUSH_LAB_ALERTS=off to stop)
if (homelab && push && !/^(off|0|false|no)$/i.test(env("PUSH_LAB_ALERTS", "on"))) {
  const watch = async () => { try { if (!push.count()) return; for (const c of await homelab.changes()) await push.send({ title: c.title, body: c.body, url: "/", tag: c.kind }, { urgency: c.sev === "critical" ? "high" : "normal" }); } catch {} };
  setTimeout(() => { homelab.changes().catch(() => {}); setInterval(watch, 60e3).unref(); }, 15e3).unref();
}

// ---- smarter vault search (by meaning) ----
const { makeSemantic } = require("./lib/semantic");
const semantic = vault && !/^(off|0|false|no)$/i.test(env("EMBED_MODEL", "nomic-embed-text"))
  ? makeSemantic({ vault, ollamaUrl: OLLAMA_URL, model: env("EMBED_MODEL", "nomic-embed-text"), cacheFile: path.join(__dirname, "data", "vault-embeddings.json"), log: (m) => console.log(m) })
  : null;
if (semantic) setTimeout(() => semantic.ready().then((ok) => ok && semantic.index()).catch(() => {}), 20e3).unref();

// ---- tools the local agents use on their own, including a code sandbox ----
const { makeSandbox } = require("./lib/sandbox");
const { makeTools, toolGuide } = require("./lib/tools");
const sandbox = makeSandbox({ mode: env("SANDBOX", "docker"), log: (m) => console.log(m) });
const tools = /^(off|0|false|no)$/i.test(env("AGENT_TOOLS", "on")) ? null
  : makeTools({ webSearch: SEARXNG_URL ? webSearch : null, semantic, vault, homelab, sandbox: sandbox.state.reason === "turned off (SANDBOX=off)" ? null : sandbox });

// ---- faster first replies: load the chat model when the server starts ----
async function warm(modelId) {
  const m = MODELS.find((x) => x.id === modelId && x.provider === "ollama");
  if (!m) return false;
  try { const r = await fetch(`${OLLAMA_URL}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m.model, keep_alive: KEEP_ALIVE }), signal: AbortSignal.timeout(180000) }); return r.ok; } catch { return false; }
}
setTimeout(() => warm("gemma"), 8e3).unref();

// Keep repo notes in the vault in sync with GitHub (REPO_SYNC_MINUTES=0 turns it off)
const { makeRepoSync } = require("./lib/reposync");
const REPO_SYNC_MINUTES = Number(env("REPO_SYNC_MINUTES", 30));
const repoSync = github && vault && REPO_SYNC_MINUTES > 0
  ? makeRepoSync({ github, vault, ollamaUrl: OLLAMA_URL, model: env("GEMMA_MODEL", "gemma4:12b"), minutes: REPO_SYNC_MINUTES, stateFile: path.join(__dirname, "data", "repo-sync.json"), log: (m) => console.log(m) })
  : null;
repoSync?.start();
// Connect to GitHub as soon as the server starts, and re-check every 6 hours (catches an expired token).
if (github) { const ping = () => github.check().catch((e) => { github.state.error = e.message; }); ping(); setInterval(ping, 6 * 3600e3).unref(); }
const PROJECTS_DIR = path.join(__dirname, "data", "projects");
const slugify = (n) => String(n || "").toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60);
function projectDir(name) { const s = slugify(name); return s ? path.join(PROJECTS_DIR, s) : null; }
// Keep project file paths inside the project folder
function safeRel(p) {
  const clean = path.posix.normalize(String(p || "").replace(/\\/g, "/")).replace(/^(\.\/)+/, "");
  if (!clean || clean.startsWith("..") || clean.startsWith("/") || clean.includes("\0") || clean.split("/").some((x) => x === ".." || x === ".git")) return null;
  return clean;
}
function listFiles(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else { const st = fs.statSync(p); out.push({ path: path.relative(base, p).split(path.sep).join("/"), size: st.size, mtime: st.mtimeMs }); }
  }
  return out;
}
const jsonOut = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

// ---------- web search ----------
function htmlToText(h) {
  const main = h.match(/<(article|main)[\s\S]*?<\/\1>/i);
  if (main && main[0].length > 1500) h = main[0];
  return h
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
function publicUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return false;
    const h = x.hostname;
    return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h) || h.includes(":"));
  } catch { return false; }
}
async function readPage(url) {
  if (!publicUrl(url)) return "";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) NexusHQ/1.0", Accept: "text/html,text/plain" } });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !/text\/(html|plain)/.test(ct)) return "";
    const t = (await r.text()).slice(0, 600000);
    return (/html/.test(ct) ? htmlToText(t) : t).slice(0, 2500);
  } catch { return ""; }
}
async function webSearch(q) {
  const r = await fetch(`${SEARXNG_URL}/search?q=${encodeURIComponent(q)}&format=json&safesearch=1`, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(r.status === 403 ? "SearXNG refused JSON (enable the json format in its settings.yml)" : `SearXNG ${r.status}`);
  const j = await r.json();
  const seen = new Set();
  const results = (j.results || []).filter((x) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 6)
    .map((x) => ({ title: String(x.title || x.url).slice(0, 200), url: x.url, snippet: String(x.content || "").slice(0, 400) }));
  const pages = await Promise.all(results.slice(0, 3).map((x) => readPage(x.url)));
  pages.forEach((t, i) => { if (t) results[i].text = t; });
  return results;
}

// ---------- http ----------
const PUBLIC_DIR = path.join(__dirname, "public");
const AGENTS_FILE = path.join(__dirname, "agents.json");
const SESSIONS_DIR = path.join(__dirname, "data", "sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const sessionFile = (id) => (/^[A-Za-z0-9_-]{6,80}$/.test(id) ? path.join(SESSIONS_DIR, `${id}.json`) : null);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function cookie(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : "";
}
function authed(req) {
  if (!PASSWORD) return true;
  if (TOKEN && sameText(cookie(req, "nhq"), TOKEN)) return true;
  const t = req.headers["x-nhq-token"];
  if (TOKEN && typeof t === "string" && t && sameText(t, TOKEN)) return true;
  const h = req.headers["x-dashboard-password"];
  return typeof h === "string" && sameText(h.trim(), PASSWORD);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 30e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error("Request failed:", e);
    if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String(e.message || e) })); }
    else res.end();
  });
});

async function handle(req, res) {
  const url = new URL(req.url, "http://x");

  if (req.method === "GET" && url.pathname === "/manifest.json") {
    res.writeHead(200, { "Content-Type": "application/manifest+json" });
    return res.end(JSON.stringify({
      name: "Nexus HQ", short_name: "Nexus HQ", start_url: "/", scope: "/", display: "standalone",
      background_color: "#070b14", theme_color: "#070b14",
      icons: [
        { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }));
  }
  if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
    const aliases = { "/": "index.html", "/compare": "compare.html" };
    const rel = aliases[url.pathname] || decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.join(PUBLIC_DIR, rel);
    if (file.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
  }

  // ---- photo files ----
  const pf = url.pathname.match(/^\/api\/photos\/file\/(.+)$/);
  if (pf && req.method === "GET") {
    const qt = url.searchParams.get("t") || "";
    if (!(authed(req) || (TOKEN && qt && sameText(qt, TOKEN)))) { res.writeHead(401); return res.end("login required"); }
    const name = decodeURIComponent(pf[1]);
    let p = photoPath(name, url.searchParams.has("thumb"));
    if (p && !fs.existsSync(p)) p = photoPath(name); // no thumbnail yet: send the photo itself
    if (!p || !fs.existsSync(p)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": PHOTO_MIME[path.extname(p).toLowerCase()] || "image/jpeg", "Cache-Control": "private, max-age=86400" });
    return fs.createReadStream(p).pipe(res);
  }

  // ---- images inside the vault (e.g. Attachments/photo.jpg embedded in a note) ----
  const vf = url.pathname.match(/^\/api\/vaultfile\/(.+)$/);
  if (vf && req.method === "GET" && vault) {
    const qt = url.searchParams.get("t") || "";
    if (!(authed(req) || (TOKEN && qt && sameText(qt, TOKEN)))) { res.writeHead(401); return res.end("login required"); }
    const rel = decodeURIComponent(vf[1]);
    const p = path.resolve(vault.root, rel);
    if (!p.startsWith(vault.root + path.sep) || !PHOTO_EXT.test(p) || /(^|[\\/])private([\\/]|$)/i.test(rel) || !fs.existsSync(p)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": PHOTO_MIME[path.extname(p).toLowerCase()] || "image/jpeg", "Cache-Control": "private, max-age=86400" });
    return fs.createReadStream(p).pipe(res);
  }

  // ---- login ----
  if (url.pathname === "/api/auth" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ required: !!PASSWORD, ok: authed(req) }));
  }
  if (url.pathname === "/api/login" && req.method === "POST") {
    let body = {};
    try { body = await readBody(req); } catch {}
    const pw = String(body.password || "").trim();
    if (!PASSWORD || sameText(pw, PASSWORD)) {
      const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": `nhq=${TOKEN}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}` });
      return res.end(JSON.stringify({ token: TOKEN }));
    }
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "wrong password" }));
  }
  if (url.pathname === "/api/logout" && req.method === "POST") {
    res.writeHead(204, { "Set-Cookie": "nhq=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" });
    return res.end();
  }

  if (url.pathname.startsWith("/api/") && !authed(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "password required" }));
  }

  // ---- saved console chats ----
  if (url.pathname === "/api/sessions" && req.method === "GET") {
    const sessions = [];
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf8"));
        sessions.push({ id: j.id, title: j.title, created: j.created, updated: j.updated, count: (j.items || []).filter((i) => i.k === "cmd").length });
      } catch {}
    }
    sessions.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ sessions }));
  }
  const sm = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sm) {
    const file = sessionFile(sm[1]);
    if (!file) { res.writeHead(400); return res.end("bad id"); }
    if (req.method === "GET") {
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": "application/json" });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === "PUT") {
      let body;
      try { body = await readBody(req); } catch { res.writeHead(400); return res.end("bad json"); }
      body.id = sm[1];
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      fs.writeFileSync(file + ".tmp", JSON.stringify(body));
      fs.renameSync(file + ".tmp", file);
      res.writeHead(204); return res.end();
    }
    if (req.method === "DELETE") {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      res.writeHead(204); return res.end();
    }
  }

  // ---- photos ----
  if (url.pathname === "/api/photos" && req.method === "GET") {
    let files = [];
    try {
      files = fs.readdirSync(PHOTOS_DIR, { withFileTypes: true }).filter((e) => e.isFile() && PHOTO_EXT.test(e.name) && !e.name.startsWith("."))
        .map((e) => { const st = fs.statSync(path.join(PHOTOS_DIR, e.name)); return { name: e.name, size: st.size, time: st.mtime.toISOString(), thumb: fs.existsSync(photoPath(e.name, true)), heic: /\.hei[cf]$/i.test(e.name) }; })
        .sort((a, b) => b.time.localeCompare(a.time));
    } catch {}
    return jsonOut(res, 200, { dir: PHOTOS_DIR, photos: files });
  }
  if (url.pathname === "/api/photos" && req.method === "POST") {
    const b = await readBody(req);
    const m = String(b.data || "").match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return jsonOut(res, 400, { error: "Send a JPEG, PNG, WebP or GIF image" });
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const d = new Date(), z = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`;
    const base = String(b.name || "").replace(/\.[^.]+$/, "").replace(/[^\w -]+/g, "").trim().slice(0, 40);
    let name = `${stamp}${base ? " " + base : ""}.${ext}`, i = 2;
    while (fs.existsSync(path.join(PHOTOS_DIR, name))) name = `${stamp}${base ? " " + base : ""} ${i++}.${ext}`;
    fs.mkdirSync(path.join(PHOTOS_DIR, ".thumbs"), { recursive: true });
    fs.writeFileSync(path.join(PHOTOS_DIR, name), Buffer.from(m[2], "base64"));
    const t = String(b.thumb || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (t) fs.writeFileSync(photoPath(name, true), Buffer.from(t[1], "base64"));
    return jsonOut(res, 200, { name });
  }
  const pd = url.pathname.match(/^\/api\/photos\/(.+)$/);
  if (pd && req.method === "DELETE") {
    const name = decodeURIComponent(pd[1]), p = photoPath(name);
    if (!p || !fs.existsSync(p)) return jsonOut(res, 404, { error: "Photo not found" });
    const trash = path.join(PHOTOS_DIR, ".trash"); fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(p, path.join(trash, path.basename(p)));
    try { fs.unlinkSync(photoPath(name, true)); } catch {}
    return jsonOut(res, 200, { ok: true });
  }

  // ---- memory ----
  if (url.pathname === "/api/memory" && req.method === "GET") return jsonOut(res, 200, { items: readMemory() });
  if (url.pathname === "/api/memory" && req.method === "POST") {
    const b = await readBody(req), text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!text) return jsonOut(res, 400, { error: "Nothing to remember" });
    const m = readMemory();
    if (m.length >= 50) return jsonOut(res, 400, { error: "Memory is full (50 items). Forget some first with /forget." });
    const dup = m.find((x) => x.text.toLowerCase() === text.toLowerCase());
    if (dup) return jsonOut(res, 200, { item: dup, items: m, duplicate: true });
    m.push({ id: Date.now().toString(36), text, at: new Date().toISOString() }); writeMemory(m);
    const items = readMemory();
    return jsonOut(res, 200, { item: items.find((x) => x.text === text) || items[items.length - 1], items });
  }
  const mm = url.pathname.match(/^\/api\/memory\/([\w-]+)$/);
  if (mm && req.method === "DELETE") {
    writeMemory(readMemory().filter((x) => x.id !== mm[1]));
    return jsonOut(res, 200, { items: readMemory() });
  }

  // ---- homelab ----
  if (url.pathname.startsWith("/api/homelab")) {
    if (!homelab) return jsonOut(res, 200, { configured: false });
    try {
      if (url.pathname === "/api/homelab" && req.method === "GET") { await homelab.refresh(url.searchParams.has("fresh")); return jsonOut(res, 200, homelab.chip()); }
      if (url.pathname === "/api/homelab/context") { await homelab.refresh(true); return jsonOut(res, 200, { text: homelab.text(), chip: homelab.chip(), containers: homelab.containers() }); }
      if (url.pathname === "/api/homelab/action" && req.method === "POST") {
        const b = await readBody(req);
        if (b.kind === "container") return jsonOut(res, 200, await homelab.containerAction(String(b.device), String(b.name), String(b.action)));
        if (b.kind === "alert") return jsonOut(res, 200, await homelab.alertAction(String(b.id), String(b.action)));
        return jsonOut(res, 400, { error: "unknown action" });
      }
    } catch (e) { return jsonOut(res, 502, { error: e.message }); }
    return jsonOut(res, 404, { error: "unknown homelab action" });
  }

  // ---- notifications ----
  if (url.pathname === "/api/push/key") return jsonOut(res, 200, { enabled: !!push, key: push?.publicKey || null, devices: push?.count() || 0 });
  if (url.pathname === "/api/push/subscribe" && req.method === "POST" && push) { const b = await readBody(req); push.subscribe(b.subscription, b.label); return jsonOut(res, 200, { ok: true, devices: push.count() }); }
  if (url.pathname === "/api/push/unsubscribe" && req.method === "POST" && push) { const b = await readBody(req); push.unsubscribe(String(b.endpoint || "")); return jsonOut(res, 200, { ok: true, devices: push.count() }); }
  if (url.pathname === "/api/push/test" && req.method === "POST" && push) { const r = await push.send({ title: "🔔 Nexus HQ", body: "Notifications are working.", url: "/", tag: "test" }); return jsonOut(res, 200, r); }
  if (url.pathname === "/api/push/presence" && req.method === "POST") {
    let b = {}; try { b = await readBody(req); } catch {}
    if (/^[\w-]{6,40}$/.test(String(b.cid || ""))) presence.set(b.cid, { visible: !!b.visible, at: Date.now() });
    res.writeHead(204); return res.end();
  }

  // ---- answers finished while you were away; warm-up; which models are loaded ----
  const cr = url.pathname.match(/^\/api\/chat\/result\/([\w-]{6,40})$/);
  if (cr) { const j = chatJobs.get(cr[1]); return jsonOut(res, j ? 200 : 404, j ? { text: j.text, done: j.done, model: j.model, ms: j.ms, error: j.error, events: j.events || [] } : { error: "not found" }); }
  const cc = url.pathname.match(/^\/api\/chat\/cancel\/([\w-]{6,40})$/);
  if (cc && req.method === "POST") { chatJobs.get(cc[1])?.ac?.abort(); res.writeHead(204); return res.end(); }
  if (url.pathname === "/api/warm" && req.method === "POST") { const b = await readBody(req).catch(() => ({})); warm(String(b.model || "gemma")); return jsonOut(res, 200, { ok: true }); }
  if (url.pathname === "/api/models/loaded") {
    try { const r = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(2000) }); const j = await r.json(); return jsonOut(res, 200, { loaded: (j.models || []).map((x) => x.name) }); }
    catch { return jsonOut(res, 200, { loaded: [] }); }
  }

  // ---- Obsidian vault ----
  if (url.pathname.startsWith("/api/vault")) {
    if (!vault) return jsonOut(res, 503, { error: "The notes vault is turned off (VAULT_DIR=off in .env)." });
    try {
      if (url.pathname === "/api/vault" && req.method === "GET") {
        const notes = vault.list();
        return jsonOut(res, 200, { name: vault.name, dir: vault.root, notes, memory: vault.readMemory() });
      }
      if (url.pathname === "/api/vault/note" && req.method === "GET") return jsonOut(res, 200, vault.read(url.searchParams.get("path") || ""));
      if (url.pathname === "/api/vault/note" && req.method === "POST") {
        const b = await readBody(req);
        if (!String(b.body || "").trim()) return jsonOut(res, 400, { error: "Empty note" });
        let body = String(b.body).slice(0, 60000);
        // Photos the note is about: copy them into the vault and embed them under the title
        const embeds = [];
        for (const n of (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 4)) {
          const src = photoPath(n);
          if (!src || !fs.existsSync(src)) continue;
          fs.mkdirSync(path.join(vault.root, "Attachments"), { recursive: true });
          fs.copyFileSync(src, path.join(vault.root, "Attachments", path.basename(src)));
          embeds.push(`![[${path.basename(src)}]]`);
        }
        if (embeds.length) body = /^#\s.*\n/.test(body) ? body.replace(/^(#\s.*\n)/, `$1\n${embeds.join("\n")}\n`) : `${embeds.join("\n")}\n\n${body}`;
        return jsonOut(res, 200, vault.save({ title: b.title, body, tags: Array.isArray(b.tags) ? b.tags : [], folder: b.folder || "Notes", key: b.key || "", source: b.source || "nexus-hq" }));
      }
      if (url.pathname === "/api/vault/note" && req.method === "DELETE") return jsonOut(res, 200, vault.remove(url.searchParams.get("path") || ""));
      if (url.pathname === "/api/vault/search") {
        const q = url.searchParams.get("q") || "", k = Math.min(Number(url.searchParams.get("k")) || 3, 8);
        if (semantic) return jsonOut(res, 200, await semantic.search(q, k));
        return jsonOut(res, 200, { results: vault.search(q, k), mode: "keywords" });
      }
      if (url.pathname === "/api/vault/sync") {
        if (!repoSync) return jsonOut(res, 200, { enabled: false, reason: !github ? "GitHub isn't connected" : "REPO_SYNC_MINUTES is 0" });
        if (req.method === "POST") { if (!repoSync.state.running) repoSync.run().catch(() => {}); await new Promise((r) => setTimeout(r, 50)); }
        const { repos, ...st } = repoSync.state;
        return jsonOut(res, 200, { enabled: true, minutes: REPO_SYNC_MINUTES, tracked: Object.keys(repos).length, ...st });
      }
      if (url.pathname === "/api/vault/repo" && req.method === "POST") {
        const b = await readBody(req);
        return jsonOut(res, 200, vault.repoNote(String(b.repo || ""), { overview: b.overview ? String(b.overview).slice(0, 20000) : undefined, url: b.url, meta: b.overview ? { "overview-by": "nexus-hq" } : undefined }));
      }
    } catch (e) { return jsonOut(res, e.status || 500, { error: e.message }); }
    return jsonOut(res, 404, { error: "unknown vault action" });
  }

  // ---- GitHub ----
  if (url.pathname.startsWith("/api/github/")) {
    if (!github) return jsonOut(res, 503, { error: "GitHub isn't connected yet. Add GITHUB_TOKEN to .env and restart Nexus HQ." });
    try {
      if (url.pathname === "/api/github/status") { const u = await github.user(); return jsonOut(res, 200, { connected: true, login: u.login, url: u.html_url }); }
      if (url.pathname === "/api/github/repos") return jsonOut(res, 200, { repos: await github.repos() });
      if (url.pathname === "/api/github/snapshot") {
        const focus = (url.searchParams.get("focus") || "").split(",").map((x) => x.trim()).filter(Boolean);
        const budget = Math.min(Number(url.searchParams.get("budget")) || 40000, 120000);
        return jsonOut(res, 200, await github.snapshot(url.searchParams.get("repo"), { budget, focus }));
      }
      if (url.pathname === "/api/github/file") {
        const p = safeRel(url.searchParams.get("path") || "");
        if (!p) return jsonOut(res, 400, { error: "bad path" });
        return jsonOut(res, 200, await github.file(url.searchParams.get("repo"), p));
      }
      if (url.pathname === "/api/github/merge" && req.method === "POST") {
        const b = await readBody(req);
        const r = await github.merge(b.repo, b.number);
        // Log the merge in the repo's note in the vault
        if (vault && r.merged && !r.already) {
          try { const full = await github.full(b.repo); vault.repoNote(full, { url: `https://github.com/${full}`, logLine: `- ${new Date().toISOString().slice(0, 10)} — ${String(b.title || r.title || "Update").replace(/\s+/g, " ").slice(0, 120)} ([#${b.number}](${r.url}))` }); } catch {}
        }
        return jsonOut(res, 200, r);
      }
      if (url.pathname === "/api/github/pr" && req.method === "POST") {
        const b = await readBody(req);
        const files = (b.files || []).map((f) => ({ path: safeRel(f.path), content: String(f.content ?? "") })).filter((f) => f.path);
        if (!files.length) return jsonOut(res, 400, { error: "No files to change" });
        return jsonOut(res, 200, await github.openPR(b.repo, { title: String(b.title || "Update from Nexus HQ").slice(0, 120), body: String(b.body || ""), files, branchHint: b.title || "update" }));
      }
    } catch (e) { return jsonOut(res, e.status === 401 ? 401 : 502, { error: e.message }); }
    return jsonOut(res, 404, { error: "unknown GitHub action" });
  }

  // ---- projects: code the agents write, saved as files ----
  if (url.pathname === "/api/projects" && req.method === "GET") {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
      const files = listFiles(path.join(PROJECTS_DIR, d.name));
      return { name: d.name, files: files.length, updated: Math.max(0, ...files.map((f) => f.mtime)) };
    }).sort((a, b) => b.updated - a.updated);
    return jsonOut(res, 200, { projects });
  }
  const pm = url.pathname.match(/^\/api\/projects\/([^/]+)(\/file|\/publish)?$/);
  if (pm) {
    const dir = projectDir(decodeURIComponent(pm[1]));
    if (!dir) return jsonOut(res, 400, { error: "bad project name" });
    const name = path.basename(dir);
    if (!pm[2] && req.method === "GET") return jsonOut(res, 200, { name, files: listFiles(dir) });
    if (!pm[2] && req.method === "POST") { fs.mkdirSync(dir, { recursive: true }); return jsonOut(res, 200, { name, files: listFiles(dir) }); }
    if (pm[2] === "/file") {
      const rel = safeRel(req.method === "PUT" ? (await readBody(req).then((b) => (req._b = b).path)) : url.searchParams.get("path"));
      if (!rel) return jsonOut(res, 400, { error: "bad file path" });
      const fp = path.join(dir, rel);
      if (req.method === "GET") { if (!fs.existsSync(fp)) return jsonOut(res, 404, { error: "no such file" }); return jsonOut(res, 200, { path: rel, content: fs.readFileSync(fp, "utf8") }); }
      if (req.method === "PUT") { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, String(req._b.content ?? "")); return jsonOut(res, 200, { name, path: rel, files: listFiles(dir).length }); }
      if (req.method === "DELETE") { if (fs.existsSync(fp)) fs.unlinkSync(fp); return jsonOut(res, 200, { name, files: listFiles(dir).length }); }
    }
    if (pm[2] === "/publish" && req.method === "POST") {
      if (!github) return jsonOut(res, 503, { error: "GitHub isn't connected yet. Add GITHUB_TOKEN to .env and restart Nexus HQ." });
      const b = await readBody(req);
      const files = listFiles(dir).map((f) => ({ path: f.path, content: fs.readFileSync(path.join(dir, f.path), "utf8") }));
      if (!files.length) return jsonOut(res, 400, { error: "This project has no files yet" });
      try { return jsonOut(res, 200, await github.publish(b.repo, { files, message: String(b.message || `Publish ${name} from Nexus HQ`) })); }
      catch (e) { return jsonOut(res, 502, { error: e.message }); }
    }
    return jsonOut(res, 405, { error: "not allowed" });
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    res.setHeader("Content-Type", "application/json");
    if (!SEARXNG_URL) { res.writeHead(503); return res.end(JSON.stringify({ error: "Web search isn't set up yet. Run: bash setup-web-search.sh" })); }
    const q = (url.searchParams.get("q") || "").trim().slice(0, 300);
    if (!q) { res.writeHead(400); return res.end(JSON.stringify({ error: "empty query" })); }
    try { const results = await webSearch(q); res.writeHead(200); return res.end(JSON.stringify({ query: q, results })); }
    catch (e) { res.writeHead(502); return res.end(JSON.stringify({ error: `Search failed: ${e.message}` })); }
  }

  const tm = url.pathname.match(/^\/api\/models\/([\w-]+)\/enabled$/);
  if (tm && req.method === "POST") {
    const m = ALL_MODELS.find((x) => x.id === tm[1] && x.provider !== "ollama");
    if (!m) return jsonOut(res, 404, { error: "Only cloud models can be switched on or off" });
    const b = await readBody(req);
    const st = readSettings(), set = new Set(st.disabledModels || []);
    b.enabled ? set.delete(m.id) : set.add(m.id);
    st.disabledModels = [...set]; writeSettings(st);
    return jsonOut(res, 200, { id: m.id, enabled: !set.has(m.id) });
  }

  if (req.method === "GET" && url.pathname === "/api/agents") {
    let org;
    try { org = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf8")); }
    catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `agents.json could not be read: ${e.message}` }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ...org, models: await status(), web: { enabled: !!SEARXNG_URL }, github: github ? { enabled: true, ...github.state } : { enabled: false }, memory: readMemory(), vault: vault ? { enabled: true, name: vault.name, notes: vault.list().length, search: semantic ? "meaning" : "keywords" } : { enabled: false }, homelab: homelab ? homelab.chip() : { configured: false }, tools: tools ? { names: await tools.available(), sandbox: { enabled: sandbox.state.enabled, reason: sandbox.state.reason } } : { names: [] }, push: { enabled: !!push, devices: push?.count() || 0 }, spend: spendInfo() }));
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ models: await status(), passwordRequired: !!PASSWORD }));
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    let body;
    try { body = await readBody(req); } catch { res.writeHead(400); return res.end("bad json"); }
    let m = MODELS.find((x) => x.id === body.model);
    const fb = MODELS.find((x) => x.id === body.fallback);
    if (!m && fb) m = fb;
    if (!m) { res.writeHead(404); return res.end("unknown model"); }

    res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    const send = (o) => res.write(JSON.stringify(o) + "\n");
    if (m.provider !== "ollama" && isDisabled(m.id)) {
      if (!fb) { send({ type: "error", message: `${m.label} is turned off in Nexus HQ` }); return res.end(); }
      send({ type: "note", text: `${m.label} is turned off, so ${fb.label} is standing in` });
      m = fb;
    }
    if (m.budgeted && overBudget()) {
      if (!fb) { send({ type: "error", message: `${m.label} reached the ${limitHit()}` }); return res.end(); }
      send({ type: "note", text: `${m.label} reached the ${limitHit()}, so ${fb.label} is standing in` });
      m = fb;
    }
    // If you leave the app mid-answer, the answer keeps going here and can be fetched later
    const rid = /^[\w-]{6,40}$/.test(String(body.rid || "")) ? body.rid : null;
    const job = rid ? { text: "", done: false, at: Date.now() } : null;
    if (job) chatJobs.set(rid, job);
    const ac = new AbortController();
    if (job) job.ac = ac;
    let clientGone = false;
    res.on("close", () => { clientGone = !res.writableFinished; if (!job) ac.abort(); });

    const t0 = Date.now();
    let ttft = null;
    try {
      let toolNames = [];
      if (tools && Array.isArray(body.tools) && body.tools.length) { const have = await tools.available(); toolNames = body.tools.filter((n) => have.includes(n)); }
      const popts = { num_predict: Math.min(Number(body.maxTokens) || 0, 2048) || undefined, tools: toolNames, verify: !!body.verify && toolNames.includes("run_code") };
      for await (const ev of PROVIDERS[route(m).via || m.provider](m, body.messages || [], body.system || "", ac.signal, popts)) {
        if (ev.type === "delta") { if (ttft === null) ttft = Date.now() - t0; if (job) job.text += ev.text; if (!clientGone) send(ev); }
        else if (ev.type === "usage") {
          send({ type: "usage", input: ev.input ?? null, output: ev.output ?? null });
          if (m.budgeted) { const usd = costOf(m, ev); addSpend(usd); send({ type: "cost", usd, ...spendInfo() }); }
        }
        else if (ev.type === "tool" || ev.type === "toolResult") { if (job) (job.events ||= []).push(ev); if (!clientGone) send(ev); }
        else if (ev.type === "reset") { if (job) job.text = ""; if (!clientGone) send(ev); }
      }
      if (!clientGone) send({ type: "done", ms: Date.now() - t0, ttft, model: m.id });
      if (job) { job.done = true; job.model = m.id; job.ms = Date.now() - t0; }
      // phone notification when the answer finishes and you're not looking at Nexus HQ
      const away = clientGone || (body.cid && presence.get(body.cid)?.visible === false);
      if (push && body.notify && away && Date.now() - t0 > 4000) {
        push.send({ title: "✓ Answer ready", body: String(body.notify).slice(0, 120), url: "/", tag: "answer" }).catch(() => {});
      }
    } catch (e) {
      if (job) { job.done = true; job.error = String(e.message || e); }
      if (e.name !== "AbortError" && !clientGone) send({ type: "error", message: String(e.message || e) });
    }
    return res.end();
  }

  res.writeHead(404); res.end("not found");
}

// Never let one bad request take the whole dashboard down.
process.on("uncaughtException", (e) => console.error("Unexpected error:", e));
process.on("unhandledRejection", (e) => console.error("Unexpected error:", e));

server.listen(PORT, HOST, () => {
  console.log(`\nNexus HQ running on http://${HOST}:${PORT}`);
  console.log(`On your phone (Tailscale): http://<this-computer's-tailscale-name-or-100.x.x.x-ip>:${PORT}`);
  console.log(`Find it with:  tailscale ip -4\n`);
  if (!PASSWORD && HOST === "0.0.0.0") console.log("Tip: set DASHBOARD_PASSWORD in .env — anyone on your Wi-Fi can reach this port too.\n");
});
