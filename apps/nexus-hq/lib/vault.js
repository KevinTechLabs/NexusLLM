// Obsidian vault for Nexus HQ: a folder of Markdown notes that Nexus HQ reads, searches and writes,
// and that you open in Obsidian like any other vault. No dependencies.
//
//   <vault>/Notes/     notes saved from answers ("save this to my notes")
//   <vault>/Repos/     one note per GitHub repo: overview + change log of merges
//   <vault>/Private/   never searched, never shown to agents, never sent to Opus
//   <vault>/Memory.md  the "remember that ..." facts, one per line ("- fact")

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SKIP = /(^|\/)(\.obsidian|\.trash|\.git|node_modules)(\/|$)/;
const isPrivate = (rel) => /^private(\/|$)/i.test(rel);

// ---------- small helpers ----------
const slug = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("a an the and or but of to in on for with at by from is are was were be been it this that these those i me my you your we our can could would should do does did how what why when where which who whom about into over under than then so if please just also vs versus between difference".split(" "));
const words = (s) => norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
const today = () => new Date().toISOString().slice(0, 10);
const yamlStr = (v) => (/^[\w .,'()&+-]*$/.test(v) && v.trim() === v && v !== "" ? v : JSON.stringify(v));

// Minimal frontmatter parser: scalars, inline [a, b] lists, and "- item" lists.
function parseNote(text) {
  const meta = {}; let body = text;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (m) {
    body = text.slice(m[0].length);
    let key = null;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (kv) {
        key = kv[1]; let v = kv[2].trim();
        if (v.startsWith("[") && v.endsWith("]")) meta[key] = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        else if (v === "") meta[key] = [];
        else meta[key] = v.replace(/^["']|["']$/g, "");
      } else if (key && /^\s*-\s+/.test(line)) {
        if (!Array.isArray(meta[key])) meta[key] = meta[key] ? [meta[key]] : [];
        meta[key].push(line.replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      }
    }
  }
  const tags = new Set((Array.isArray(meta.tags) ? meta.tags : meta.tags ? String(meta.tags).split(/[ ,]+/) : []).map((t) => t.replace(/^#/, "")).filter(Boolean));
  for (const t of body.matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/g)) tags.add(t[1]);
  const links = [...new Set([...body.matchAll(/!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((x) => x[1].trim()))];
  return { meta, body, tags: [...tags], links };
}
function buildNote(meta, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) { lines.push(`${k}:`); for (const x of v) lines.push(`  - ${yamlStr(String(x))}`); }
    else lines.push(`${k}: ${yamlStr(String(v))}`);
  }
  lines.push("---", "");
  return lines.join("\n") + String(body).replace(/^\s+/, "").replace(/\s+$/, "") + "\n";
}

function makeVault(dir) {
  const root = path.resolve(dir);
  const abs = (rel) => {
    const p = path.resolve(root, String(rel || "").replace(/^\/+/, ""));
    if (p !== root && !p.startsWith(root + path.sep)) throw Object.assign(new Error("Path is outside the vault"), { status: 400 });
    return p;
  };

  function init() {
    for (const d of ["Notes", "Repos", "Private"]) fs.mkdirSync(path.join(root, d), { recursive: true });
    const welcome = path.join(root, "Welcome.md");
    if (!fs.existsSync(welcome)) fs.writeFileSync(welcome, buildNote({ title: "Welcome", tags: ["nexus"], created: today() },
      `# Welcome to your Nexus vault\n\nNexus HQ reads and writes the notes in this folder, and you can open it in Obsidian like any other vault.\n\n> [!tip] How notes get here\n> - Say **save this to my notes** after an answer in Nexus HQ.\n> - Say **make a note about ...** to have an agent write one.\n> - Every **remember that ...** goes into [[Memory]].\n> - Every GitHub merge from Nexus HQ is logged in that repo's note in \`Repos/\`.\n\n> [!warning] Private\n> Anything in \`Private/\` is never searched, never shown to agents and never sent to Opus.\n`));
    if (!fs.existsSync(path.join(root, "Memory.md"))) writeMemory([]);
  }

  // ---------- listing ----------
  function walk(dirAbs, out = []) {
    for (const e of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const p = path.join(dirAbs, e.name), rel = path.relative(root, p).split(path.sep).join("/");
      if (SKIP.test(rel) || e.name.startsWith(".")) continue;
      if (e.isDirectory()) walk(p, out);
      else if (e.name.toLowerCase().endsWith(".md")) out.push({ rel, abs: p });
    }
    return out;
  }
  let cache = { at: 0, notes: [] };
  function list(force) {
    if (!force && Date.now() - cache.at < 1500) return cache.notes;
    const notes = [];
    for (const f of walk(root)) {
      let st, text;
      try { st = fs.statSync(f.abs); if (st.size > 2e6) continue; text = fs.readFileSync(f.abs, "utf8"); } catch { continue; }
      const { meta, body, tags, links } = parseNote(text);
      const name = path.basename(f.rel, ".md");
      const plain = body.replace(new RegExp(`^\\s*#\\s+${(meta.title || name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`), "")
        .replace(/```[\s\S]*?```/g, " ").replace(/\[![a-z]+\][+-]?/gi, " ").replace(/!?\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b || a)
        .replace(/[#>*_`=\[\]()|-]+/g, " ").replace(/\s+/g, " ").trim();
      notes.push({
        path: f.rel, name, title: meta.title || name, folder: f.rel.includes("/") ? f.rel.split("/")[0] : "",
        tags, links, key: meta["nexus-key"] || "", source: meta.source || "",
        created: meta.created || st.birthtime.toISOString().slice(0, 10), updated: st.mtime.toISOString(),
        words: plain ? plain.split(" ").length : 0, excerpt: (meta.description ? `${meta.description} ` : "") + plain.replace(/^GitHub:\s*\S+\s*/, "").slice(0, 220), private: isPrivate(f.rel),
        _body: body, _plain: plain,
      });
    }
    // resolve [[links]] to paths, and compute backlinks
    const byName = new Map(notes.map((n) => [n.name.toLowerCase(), n.path]));
    for (const n of notes) { n.linkPaths = n.links.map((l) => byName.get(l.split("/").pop().toLowerCase())).filter(Boolean); n.backlinks = []; }
    for (const n of notes) for (const p of n.linkPaths) { const t = notes.find((x) => x.path === p); if (t && !t.backlinks.includes(n.path)) t.backlinks.push(n.path); }
    notes.sort((a, b) => b.updated.localeCompare(a.updated));
    cache = { at: Date.now(), notes };
    return notes;
  }
  const pub = (n) => { const { _body, _plain, ...rest } = n; return rest; };

  function read(rel) {
    const n = list().find((x) => x.path === rel);
    if (!n) throw Object.assign(new Error("Note not found"), { status: 404 });
    return { ...pub(n), text: fs.readFileSync(abs(rel), "utf8"), body: n._body };
  }

  // ---------- search (BM25 over title, tags and text; Private is never included) ----------
  function search(q, k = 3, { minScore = 1.2 } = {}) {
    const qs = [...new Set(words(q))];
    if (!qs.length) return [];
    const docs = list().filter((n) => !n.private && n.path !== "Memory.md");
    const toks = docs.map((n) => { const t = words(`${n.title} ${n.title} ${n.title} ${n.tags.join(" ")} ${n.tags.join(" ")} ${n._plain}`); return t; });
    const avg = toks.reduce((a, t) => a + t.length, 0) / (toks.length || 1);
    const df = Object.fromEntries(qs.map((w) => [w, toks.filter((t) => t.includes(w)).length]));
    const scored = docs.map((n, i) => {
      const t = toks[i]; let s = 0;
      for (const w of qs) {
        const tf = t.filter((x) => x === w).length; if (!tf) continue;
        const idf = Math.log(1 + (docs.length - df[w] + 0.5) / (df[w] + 0.5));
        s += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * t.length / (avg || 1)));
      }
      const hit = qs.filter((w) => t.includes(w)).length / qs.length; // coverage of the question
      return { n, score: s * (0.5 + hit) };
    }).filter((x) => x.score >= minScore).sort((a, b) => b.score - a.score).slice(0, k);
    return scored.map(({ n, score }) => {
      // best paragraph as the snippet
      const paras = n._body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !/^---/.test(p));
      const best = paras.map((p) => [p, qs.filter((w) => norm(p).includes(w)).length]).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      return { path: n.path, title: n.title, tags: n.tags, score: +score.toFixed(2), snippet: best.slice(0, 500), text: n._body.slice(0, 2400) };
    });
  }

  // ---------- writing with de-duplication ----------
  // A note is the "same" as an existing one when it has the same key (the normalized question/topic),
  // the same title, or a very similar title/key. Then it's updated instead of duplicated.
  const sim = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
  function findSame({ key, title, folder }) {
    const notes = list(true).filter((n) => !n.private);
    const k = norm(key), t = norm(title);
    return notes.find((n) => k && norm(n.key) === k)
      || notes.find((n) => t && norm(n.title) === t)
      || notes.find((n) => (k && n.key && sim(n.key, key) >= 0.75) || (t && (!folder || n.folder === folder) && sim(n.title, title) >= 0.8));
  }
  function save({ title, body, tags = [], folder = "Notes", key = "", source = "nexus-hq", aliases = [] }) {
    title = slug(title); folder = String(folder || "Notes").replace(/[^\w -]/g, "").trim() || "Notes";
    if (isPrivate(folder)) throw Object.assign(new Error("Nexus HQ doesn't write to Private/"), { status: 400 });
    const same = findSame({ key: key || title, title, folder });
    const cleanTags = [...new Set(tags.map((t) => String(t).toLowerCase().replace(/^#/, "").replace(/[^\w/-]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean))].slice(0, 8);
    if (same) {
      const old = parseNote(fs.readFileSync(abs(same.path), "utf8"));
      const meta = { ...old.meta, title: old.meta.title || same.title, tags: [...new Set([...(Array.isArray(old.meta.tags) ? old.meta.tags : []), ...cleanTags])],
        updated: today(), "nexus-key": old.meta["nexus-key"] || key || title, source: old.meta.source || source };
      fs.writeFileSync(abs(same.path), buildNote(meta, body));
      list(true);
      return { mode: "updated", path: same.path, title: meta.title };
    }
    let rel = `${folder}/${title}.md`, i = 2;
    while (fs.existsSync(abs(rel))) rel = `${folder}/${title} ${i++}.md`;
    fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
    fs.writeFileSync(abs(rel), buildNote({ title, tags: cleanTags, aliases, created: today(), updated: today(), source, "nexus-key": key || title }, body));
    list(true);
    return { mode: "created", path: rel, title };
  }
  function remove(rel) {
    if (rel === "Memory.md") throw Object.assign(new Error("Memory.md holds your remembered facts; edit it instead of deleting it"), { status: 400 });
    const p = abs(rel);
    if (!fs.existsSync(p)) throw Object.assign(new Error("Note not found"), { status: 404 });
    // Move to Obsidian's .trash instead of deleting outright
    const t = path.join(root, ".trash", path.basename(rel));
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.renameSync(p, fs.existsSync(t) ? t.replace(/\.md$/, ` ${Date.now()}.md`) : t);
    list(true);
    return { ok: true };
  }

  // ---------- repo notes: overview + change log ----------
  // Frontmatter of a repo's note (used by the repo sync to know which commit it last saw)
  function repoMeta(repo) {
    const p = abs(`Repos/${slug(repo.split("/").pop())}.md`);
    return fs.existsSync(p) ? parseNote(fs.readFileSync(p, "utf8")).meta : null;
  }
  function repoNote(repo, { overview, logLine, logLines, url, meta: extra } = {}) {
    const name = slug(repo.split("/").pop());
    const rel = `Repos/${name}.md`, p = abs(rel);
    let meta = { title: name, tags: ["repo", "github"], repo, url, created: today(), "nexus-key": `repo ${repo}` }, ov = "", log = [];
    if (fs.existsSync(p)) {
      const old = parseNote(fs.readFileSync(p, "utf8"));
      meta = { ...meta, ...old.meta };
      ov = (old.body.match(/## Overview\s*\n([\s\S]*?)(?=\n## |\s*$)/) || [])[1]?.trim() || "";
      log = ((old.body.match(/## Change log\s*\n([\s\S]*?)(?=\n## |\s*$)/) || [])[1] || "").split("\n").filter((l) => /^\s*-\s+/.test(l));
    }
    if (overview) ov = overview.trim();
    if (logLine && !log.includes(logLine)) log.unshift(logLine);
    // several new lines at once, newest first; skip ones already logged (same short commit id)
    for (const l of [...(logLines || [])].reverse()) { const id = (l.match(/\(([0-9a-f]{7})\)\s*$/) || [])[1]; if (!log.includes(l) && !(id && log.some((x) => x.includes(`(${id})`)))) log.unshift(l); }
    log = log.slice(0, 200);
    if (extra) Object.assign(meta, extra);
    meta.updated = today(); if (url) meta.url = url;
    const body = `# ${name}\n\n${url ? `GitHub: ${url}\n\n` : ""}## Overview\n\n${ov || "_No overview yet. Say \"make a note about my " + name + " repo\" in Nexus HQ._"}\n\n## Change log\n\n${log.join("\n") || "_Merges made from Nexus HQ show up here._"}\n`;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buildNote(meta, body));
    list(true);
    return { path: rel, title: name };
  }

  // ---------- Memory.md: the facts, editable in Obsidian ----------
  const MEM = () => path.join(root, "Memory.md");
  const idOf = (t) => crypto.createHash("sha1").update(t).digest("hex").slice(0, 10);
  function readMemory() {
    let text = ""; try { text = fs.readFileSync(MEM(), "utf8"); } catch { return []; }
    const { body } = parseNote(text);
    return body.split(/\r?\n/).map((l) => l.match(/^\s*[-*]\s+(?!\[[ x]\])(.+?)\s*$/)?.[1]).filter(Boolean).map((t) => ({ id: idOf(t), text: t }));
  }
  function writeMemory(items) {
    const body = `# Memory\n\nFacts Nexus HQ remembers. Every agent sees these in every chat.\nEdit freely: one fact per line, starting with "- ". Say **remember that ...** in Nexus HQ to add one.\n\n${items.map((i) => `- ${i.text}`).join("\n")}\n`;
    fs.writeFileSync(MEM(), buildNote({ title: "Memory", tags: ["nexus/memory"], updated: today() }, body));
    list(true);
  }

  init();
  return { root, name: path.basename(root), list: () => list().map(pub), read, search, save, remove, repoNote, repoMeta, readMemory, writeMemory, init };
}

module.exports = { makeVault, parseNote, buildNote };
