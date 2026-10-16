// Repo sync: keeps the vault's Repos/<name>.md notes in step with GitHub, with no one asking.
// Every REPO_SYNC_MINUTES it checks each repo's latest commit. When a repo changed (from Nexus HQ,
// from GitHub's website, from Claude, from anywhere):
//   - the new commits are added to the note's "Change log" (instant, no AI needed)
//   - the "Overview" is rewritten by the local model from the current files (at most once per
//     repo every few hours, and only a few per run, so the GPU isn't tied up)
// Repos without a note get one. Empty repos are skipped.

const fs = require("fs");
const path = require("path");

const NOTE_RULES = `Write in Obsidian Flavored Markdown. Use "### " for sub-headings (never "# " or "## "), short paragraphs, bullet lists, and Markdown tables where they help. Use a callout for the key takeaway, e.g.
> [!summary] What it is
> one or two lines
Link related repos with [[Repo-Name]] only if they appear in the list you're given. No frontmatter, no HTML, and don't invent facts that aren't in the files.`;

function makeRepoSync({ github, vault, ollamaUrl, model, minutes, stateFile, log = console.log }) {
  const state = { running: false, lastRun: null, nextRun: null, lastError: null, events: [], repos: {} };
  try { Object.assign(state.repos, JSON.parse(fs.readFileSync(stateFile, "utf8")).repos || {}); } catch {}
  const save = () => { try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify({ repos: state.repos }, null, 2)); } catch {} };
  const event = (text) => { state.events.unshift({ at: new Date().toISOString(), text }); state.events.length = Math.min(state.events.length, 40); };

  async function writeOverview(fullName, allNames) {
    const snap = await github.snapshot(fullName, { budget: 14000 });
    if (snap.empty) return null;
    const files = snap.files.map((f) => `--- ${f.path} ---\n${f.text.slice(0, 2800)}`).join("\n\n");
    const body = {
      model, stream: false, options: { num_ctx: 16384, temperature: 0.3 },
      messages: [
        { role: "system", content: `You write clear, accurate notes about the user's GitHub repositories for their Obsidian vault.\n\n${NOTE_RULES}` },
        { role: "user", content: `Write the Overview section of a note about the GitHub repository ${snap.repo}: start with a [!summary] callout saying what it is in one or two sentences, then ### sections for what's in it (key folders and files), how to run or use it, and its current state. Base it only on these files.\n\nThe user's other repos you may link to: ${allNames.map((n) => `[[${n}]]`).join(", ")}\n\nAll files:\n${snap.paths.slice(0, 150).join("\n")}\n\n${files}` },
      ],
    };
    const r = await fetch(`${ollamaUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60e3) });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    const j = await r.json();
    let text = String(j.message?.content || "").trim()
      .replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, "$1")
      .replace(/^\s*(TITLE|TAGS):.*$/gim, "").replace(/^\s*---\s*$/m, "")
      .replace(/^#\s.*\n+/, "").replace(/^##\s+Overview\s*\n+/i, "")
      .replace(/^##\s/gm, "### ").trim();
    return text.length > 40 ? text : null;
  }

  const fmtLine = (c) => `- ${c.date} — ${c.message.replace(/\s+/g, " ").slice(0, 140)} ([${c.sha.slice(0, 7)}](${c.url}))`;
  const isMerge = (m) => /^Merge (pull request|branch|remote-tracking)/i.test(m);

  async function run({ force = false } = {}) {
    if (state.running) return state;
    state.running = true; state.lastError = null;
    let aiBudget = force ? 20 : 3, changed = 0;
    try {
      const repos = (await github.repos()).filter((r) => r.size > 0);
      const names = repos.map((r) => r.name);
      for (const r of repos) {
        try {
          const commits = await github.commits(r.full_name, 30);
          if (!commits.length) continue;
          const head = commits[0].sha;
          const meta = vault.repoMeta(r.full_name);
          const seen = String(state.repos[r.full_name]?.sha || meta?.["last-commit"] || "").slice(0, 12) || null;
          if (meta && seen && head.startsWith(seen) && !force) continue;
          // commits since the one we last saw (all recent ones for a brand-new note)
          const idx = seen ? commits.findIndex((c) => c.sha.startsWith(seen)) : -1;
          const fresh = (idx === -1 ? commits.slice(0, 12) : commits.slice(0, idx)).filter((c) => !isMerge(c.message));
          const prev = state.repos[r.full_name] || {};
          // Overviews written by hand (or by Claude) are kept; only the change log grows
          const keepOverview = /^(claude|manual|me)$/i.test(String(meta?.["overview-by"] || "")) && !force;
          const dueForAI = !keepOverview && (!meta || force || !prev.overviewAt || Date.now() - new Date(prev.overviewAt) > 3 * 3600e3);
          let overview;
          if (dueForAI && aiBudget > 0) {
            try { overview = await writeOverview(r.full_name, names.filter((n) => n !== r.name)); aiBudget--; }
            catch (e) { log(`repo sync: overview for ${r.name} failed: ${e.message}`); }
          }
          vault.repoNote(r.full_name, {
            url: r.html_url, overview: overview || undefined, logLines: fresh.map(fmtLine),
            meta: { "last-commit": head.slice(0, 12), description: r.description || undefined, language: r.language || undefined, ...(overview ? { "overview-by": "nexus-hq" } : {}) },
          });
          state.repos[r.full_name] = { sha: head.slice(0, 12), checkedAt: new Date().toISOString(), overviewAt: overview ? new Date().toISOString() : prev.overviewAt || null };
          changed++;
          event(`${r.name}: ${meta ? `${fresh.length} new commit${fresh.length === 1 ? "" : "s"} logged` : "note created"}${overview ? ", overview refreshed" : ""}`);
        } catch (e) { event(`${r.name}: ${e.message}`); }
      }
      save();
    } catch (e) { state.lastError = e.message; event(`sync failed: ${e.message}`); }
    state.running = false; state.lastRun = new Date().toISOString(); state.changed = changed;
    return state;
  }

  let timer = null;
  function start() {
    if (!minutes) return;
    const tick = () => { state.nextRun = new Date(Date.now() + minutes * 60e3).toISOString(); run().catch(() => {}); };
    setTimeout(() => { tick(); timer = setInterval(tick, minutes * 60e3); timer.unref?.(); }, 90e3).unref?.();
    state.nextRun = new Date(Date.now() + 90e3).toISOString();
  }
  return { run, start, state };
}

module.exports = { makeRepoSync };
