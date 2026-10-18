// Smarter vault search: finds notes by meaning, not just matching words, using the local
// nomic-embed-text model in Ollama. Notes are split into chunks, embedded once, and cached;
// only new or changed notes are embedded again. Results blend meaning (embeddings) with the
// keyword ranking, and fall back to keywords alone if the model isn't installed.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function makeSemantic({ vault, ollamaUrl, model = "nomic-embed-text", cacheFile, log = () => {} }) {
  let cache = { model, chunks: {} }; // key: path -> { sig, items: [{ text, vec }] }
  try { const c = JSON.parse(fs.readFileSync(cacheFile, "utf8")); if (c.model === model) cache = c; } catch {}
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch {} }, 500); };
  let available = null, checkedAt = 0, indexing = null;

  async function ready() {
    if (available !== null && Date.now() - checkedAt < 5 * 60e3) return available;
    try {
      const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      available = r.ok && ((await r.json()).models || []).some((m) => m.name === model || m.name === `${model}:latest`);
    } catch { available = false; }
    checkedAt = Date.now();
    return available;
  }

  async function embed(texts) {
    const r = await fetch(`${ollamaUrl}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, input: texts, keep_alive: "30m" }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`embed ${r.status}`);
    return (await r.json()).embeddings;
  }

  // ~700-character chunks along paragraph boundaries, each prefixed with the note title for context
  function chunk(title, body) {
    const paras = body.replace(/^---[\s\S]*?---\s*/, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const out = []; let cur = "";
    for (const p of paras) {
      if ((cur + "\n\n" + p).length > 700 && cur) { out.push(cur); cur = p; } else cur = cur ? cur + "\n\n" + p : p;
    }
    if (cur) out.push(cur);
    return (out.length ? out : [title]).slice(0, 40).map((t) => ({ text: t.slice(0, 1400) }));
  }

  // Bring the index up to date (only changed notes are embedded)
  async function index() {
    if (indexing) return indexing;
    indexing = (async () => {
      const notes = vault.list().filter((n) => !n.private);
      const live = new Set(notes.map((n) => n.path));
      for (const p of Object.keys(cache.chunks)) if (!live.has(p)) delete cache.chunks[p];
      for (const n of notes) {
        const sig = `${n.updated}|${n.words}`;
        if (cache.chunks[n.path]?.sig === sig) continue;
        let body = "";
        try { body = vault.read(n.path).body; } catch { continue; }
        const items = chunk(n.title, body);
        const vecs = await embed(items.map((c) => `search_document: ${n.title}\n${c.text}`));
        items.forEach((c, i) => (c.vec = vecs[i].map((x) => Math.round(x * 1e5) / 1e5)));
        cache.chunks[n.path] = { sig, title: n.title, items };
        save();
      }
    })().finally(() => { indexing = null; });
    return indexing;
  }

  const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };

  // Hybrid search: meaning first, keywords as a tie-breaker. Same result shape as vault.search().
  async function search(q, k = 3) {
    const keyword = vault.search(q, 8, { minScore: 0.6 });
    if (!(await ready())) return { results: keyword.slice(0, k), mode: "keywords" };
    try {
      await index();
      const [qv] = await embed([`search_query: ${q}`]);
      const best = {};
      for (const [p, e] of Object.entries(cache.chunks)) for (const c of e.items) {
        const s = cos(qv, c.vec);
        if (!best[p] || s > best[p].s) best[p] = { s, text: c.text, title: e.title };
      }
      const kmax = Math.max(1, ...keyword.map((r) => r.score));
      const kw = Object.fromEntries(keyword.map((r) => [r.path, r.score / kmax]));
      const merged = Object.entries(best).map(([p, b]) => ({ path: p, title: b.title, snippet: b.text, sem: b.s, score: b.s * 0.75 + (kw[p] || 0) * 0.25 }))
        // nomic-embed-text scores unrelated text around 0.4-0.55, so only clear matches count
        .filter((r) => !/^Welcome\.md$/i.test(r.path) && (r.sem >= 0.7 || (kw[r.path] >= 0.3 && r.sem >= 0.55)))
        .sort((a, b) => b.score - a.score)
        .filter((r, i, all) => r.score >= all[0].score * 0.6) // drop weak tag-alongs
        .slice(0, k);
      const notes = Object.fromEntries(vault.list().map((n) => [n.path, n]));
      return {
        mode: "meaning",
        results: merged.map((r) => {
          let text = r.snippet;
          try { const full = vault.read(r.path).body; text = (r.snippet + "\n\n" + full.replace(r.snippet, "")).slice(0, 2400); } catch {}
          return { path: r.path, title: r.title, tags: notes[r.path]?.tags || [], score: +r.score.toFixed(3), snippet: r.snippet.slice(0, 500), text };
        }),
      };
    } catch (e) {
      log(`semantic search fell back to keywords: ${e.message}`);
      return { results: keyword.slice(0, k), mode: "keywords" };
    }
  }

  return { search, index, ready, status: () => ({ model, available, notes: Object.keys(cache.chunks).length }) };
}

module.exports = { makeSemantic };
