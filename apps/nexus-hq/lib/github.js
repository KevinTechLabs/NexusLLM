// Minimal GitHub client for Nexus HQ: list repos, read a repo snapshot,
// open pull requests, and publish a project into a repo.
// Uses a fine-grained personal access token (GITHUB_TOKEN). Nothing here writes
// without being called from an explicit user action in the dashboard.

const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");

// Files that are never useful to an AI reviewer
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|coverage|vendor|venv|\.venv|__pycache__|\.next|\.cache|target|bin|obj)(\/|$)/i;
const SKIP_FILE = /(\.(png|jpe?g|gif|webp|ico|svg|bmp|mp3|mp4|mov|wav|ogg|zip|gz|tar|7z|rar|pdf|woff2?|ttf|otf|eot|exe|dll|so|dylib|bin|class|jar|pyc|db|sqlite|lock)|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock)|\.min\.(js|css))$/i;

// Commit messages and PR text never credit an AI co-author: drop any "Co-authored-by",
// "Signed-off-by" or "Generated with Claude" style lines, whatever the model or user typed.
function clean(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((l) => !/^\s*(co-authored-by|signed-off-by)\s*:/i.test(l))
    .map((l) => l.replace(/\s*(co-authored-by|signed-off-by)\s*:.*$/i, "").replace(/\s*<?noreply@anthropic\.com>?/gi, ""))
    .filter((l) => !/(claude[-_ ]session|claude\.ai\/code|generated (with|by) \[?claude)/i.test(l))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function makeClient(token) {
  async function gh(method, url, body, accept) {
    const r = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept || "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nexus-hq",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const exp = r.headers.get("github-authentication-token-expiration");
    if (exp) state.expires = new Date(exp.replace(" UTC", "Z").replace(" ", "T")).toISOString();
    if (r.status === 401) state.error = "token rejected (expired or revoked)";
    else if (r.ok) state.error = null;
    if (accept && accept.includes("raw")) {
      if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status} reading file`), { status: r.status });
      return r.text();
    }
    const text = await r.text();
    let j = null; try { j = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      const msg = j?.message || text || r.statusText;
      throw Object.assign(new Error(`GitHub ${r.status}: ${msg}`), { status: r.status, body: j });
    }
    return j;
  }

  let me = null;
  const state = { login: null, expires: null, error: null };
  async function user() { me ||= await gh("GET", "/user"); state.login = me.login; return me; }
  async function check() { me = null; return user(); }
  // Every commit Nexus HQ makes is authored by you, with your private GitHub email,
  // so GitHub's email-privacy check passes and nobody else is ever credited.
  async function ident() {
    const u = await user();
    return { name: u.name || u.login, email: `${u.id}+${u.login}@users.noreply.github.com` };
  }

  // "name" or "owner/name" -> "owner/name"
  async function full(repo) {
    repo = String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
    if (!/^[\w.-]+(\/[\w.-]+)?$/.test(repo)) throw new Error(`"${repo}" isn't a valid repo name`);
    return repo.includes("/") ? repo : `${(await user()).login}/${repo}`;
  }

  async function repos() {
    const list = await gh("GET", "/user/repos?per_page=100&sort=updated&affiliation=owner");
    return list.map((r) => ({ full_name: r.full_name, name: r.name, description: r.description, private: r.private, html_url: r.html_url, default_branch: r.default_branch, updated_at: r.updated_at, size: r.size, language: r.language }));
  }

  async function info(repo) {
    const fn = await full(repo);
    const r = await gh("GET", `/repos/${fn}`);
    return { full_name: r.full_name, html_url: r.html_url, default_branch: r.default_branch || "main", size: r.size, private: r.private };
  }

  // All file paths on the default branch (empty list for an empty repo)
  async function tree(repo) {
    const r = await info(repo);
    try {
      const t = await gh("GET", `/repos/${r.full_name}/git/trees/${encodeURIComponent(r.default_branch)}?recursive=1`);
      return { ...r, empty: false, truncated: !!t.truncated, files: t.tree.filter((x) => x.type === "blob").map((x) => ({ path: x.path, size: x.size || 0 })) };
    } catch (e) {
      if (e.status === 409 || e.status === 404) return { ...r, empty: true, truncated: false, files: [] };
      throw e;
    }
  }

  async function readFile(fullName, branch, p) {
    return gh("GET", `/repos/${fullName}/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`, null, "application/vnd.github.raw+json");
  }

  // Pick the files that tell the most about a repo, up to a character budget.
  function rank(p) {
    const base = p.split("/").pop().toLowerCase(), depth = p.split("/").length;
    if (/^readme(\.|$)/.test(base)) return 0;
    if (/^(package\.json|pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod|composer\.json|gemfile|dockerfile|docker-compose\.ya?ml|makefile|tsconfig\.json|vite\.config\.\w+|next\.config\.\w+)$/.test(base)) return 1;
    if (/^(index|main|app|server|cli|__init__)\.\w+$/.test(base)) return 2 + depth * 0.1;
    if (/^(src|lib|app|server|api|backend|frontend|components|pages|routes)\//i.test(p)) return 3 + depth * 0.1;
    if (/(^|\/)(test|tests|__tests__|spec)\//i.test(p) || /\.(test|spec)\.\w+$/.test(base)) return 6;
    if (/\.(md|txt|rst)$/.test(base)) return 7;
    return 4 + depth * 0.1;
  }
  async function snapshot(repo, { budget = 40000, perFile = 12000, focus = [] } = {}) {
    const t = await tree(repo);
    const usable = t.files.filter((f) => !SKIP_DIR.test(f.path) && !SKIP_FILE.test(f.path) && f.size < 400000);
    const focusSet = new Set(focus);
    const order = [...usable].sort((a, b) => (focusSet.has(b.path) - focusSet.has(a.path)) || (rank(a.path) - rank(b.path)) || (a.size - b.size));
    const files = []; let used = 0;
    for (const f of order) {
      if (used >= budget) break;
      if (!focusSet.has(f.path) && f.size > budget - used + 2000 && files.length) continue;
      let text = "";
      try { text = await readFile(t.full_name, t.default_branch, f.path); } catch { continue; }
      if (/\u0000/.test(text.slice(0, 2000))) continue; // binary after all
      const cut = text.length > perFile;
      text = cut ? text.slice(0, perFile) + `\n… (${text.length - perFile} more characters not shown)` : text;
      files.push({ path: f.path, size: f.size, text, cut });
      used += text.length;
    }
    return { repo: t.full_name, url: t.html_url, branch: t.default_branch, empty: t.empty, paths: usable.map((f) => f.path), skipped: t.files.length - usable.length, truncatedTree: t.truncated, files };
  }

  // Commit files on top of a branch head; returns the new commit sha.
  async function commitFiles(fullName, parentSha, files, message, deletions = []) {
    const entries = files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content }))
      .concat(deletions.map((p) => ({ path: p, mode: "100644", type: "blob", sha: null })));
    const parent = await gh("GET", `/repos/${fullName}/git/commits/${parentSha}`);
    const t = await gh("POST", `/repos/${fullName}/git/trees`, { base_tree: parent.tree.sha, tree: entries });
    const who = await ident();
    const c = await gh("POST", `/repos/${fullName}/git/commits`, { message: clean(message) || "Update from Nexus HQ", tree: t.sha, parents: [parentSha], author: who, committer: who });
    return c.sha;
  }

  // Changes land on a new branch with a pull request; main is never touched.
  async function openPR(repo, { title, body, files, deletions = [], branchHint = "update" }) {
    const r = await info(repo);
    const head = await gh("GET", `/repos/${r.full_name}/git/ref/heads/${encodeURIComponent(r.default_branch)}`);
    const slug = branchHint.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "update";
    const branch = `nexus-hq/${slug}-${Date.now().toString(36)}`;
    const sha = await commitFiles(r.full_name, head.object.sha, files, title, deletions);
    await gh("POST", `/repos/${r.full_name}/git/refs`, { ref: `refs/heads/${branch}`, sha });
    const pr = await gh("POST", `/repos/${r.full_name}/pulls`, { title: clean(title).split("\n")[0] || "Update from Nexus HQ", body: clean(body), head: branch, base: r.default_branch });
    return { url: pr.html_url, number: pr.number, branch };
  }

  // Put a whole project into a repo. Empty repo: becomes its first commit.
  // Repo that already has code: goes in as a pull request instead.
  async function publish(repo, { files, message }) {
    const t = await tree(repo);
    if (!t.empty) {
      const pr = await openPR(repo, { title: message, body: "Published from Nexus HQ.\n\nReview the files, then merge when you're happy.", files, branchHint: "publish" });
      return { mode: "pull-request", ...pr };
    }
    // An empty repo has no branch yet: create the first file to start one, then add the rest in one commit.
    const [first, ...rest] = files;
    const put = await gh("PUT", `/repos/${t.full_name}/contents/${first.path.split("/").map(encodeURIComponent).join("/")}`,
      { message: clean(message) || "Initial commit", content: Buffer.from(first.content, "utf8").toString("base64"), author: await ident(), committer: await ident() });
    let sha = put.commit.sha;
    const branch = (await info(repo)).default_branch;
    if (rest.length) {
      sha = await commitFiles(t.full_name, sha, rest, message);
      await gh("PATCH", `/repos/${t.full_name}/git/refs/heads/${encodeURIComponent(branch)}`, { sha });
    }
    return { mode: "initial-commit", url: t.html_url, branch, files: files.length };
  }

  // Whole text of one file (for small edits inside files too big to show the model in full)
  async function file(repo, p) {
    const r = await info(repo);
    return { repo: r.full_name, path: p, text: await readFile(r.full_name, r.default_branch, p) };
  }

  // One-tap merge from the dashboard: squash into the default branch, then tidy up the branch.
  async function merge(repo, number) {
    const fn = await full(repo);
    const pr = await gh("GET", `/repos/${fn}/pulls/${Number(number)}`);
    if (pr.merged) return { merged: true, already: true, url: pr.html_url };
    if (pr.state !== "open") throw new Error(`Pull request #${number} is closed`);
    const m = await gh("PUT", `/repos/${fn}/pulls/${Number(number)}/merge`, {
      merge_method: "squash",
      commit_title: `${clean(pr.title).split("\n")[0]} (#${pr.number})`,
      commit_message: "",
    });
    if (pr.head?.ref?.startsWith("nexus-hq/") && pr.head.repo?.full_name === fn) {
      try { await gh("DELETE", `/repos/${fn}/git/refs/heads/${pr.head.ref.split("/").map(encodeURIComponent).join("/")}`); } catch {}
    }
    return { merged: !!m.merged, sha: m.sha, url: pr.html_url };
  }

  // Latest commits on the default branch (newest first)
  async function commits(repo, n = 20) {
    const r = await info(repo);
    try {
      const list = await gh("GET", `/repos/${r.full_name}/commits?sha=${encodeURIComponent(r.default_branch)}&per_page=${n}`);
      return list.map((c) => ({ sha: c.sha, date: (c.commit?.committer?.date || c.commit?.author?.date || "").slice(0, 10), message: String(c.commit?.message || "").split("\n")[0].trim(), url: c.html_url }));
    } catch (e) { if (e.status === 409) return []; throw e; }
  }

  return { user, repos, info, tree, snapshot, openPR, publish, file, merge, full, state, check, commits };
}

module.exports = { makeClient, clean };
