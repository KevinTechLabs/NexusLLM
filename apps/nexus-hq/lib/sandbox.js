// Code sandbox: lets agents run the code they write and see what happens, before showing it to you.
// Each run is a throwaway Docker container with no network, no access to your files, a non-root
// user, a read-only system, 512 MB of memory, one CPU and a 20-second limit.
// Needs Docker, and the user Nexus HQ runs as must be allowed to use it. SANDBOX=off turns it off.

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const LANGS = {
  python: { image: "python:3.12-slim", file: "main.py", cmd: ["python3", "-u", "main.py"] },
  javascript: { image: "node:22-slim", file: "main.js", cmd: ["node", "main.js"] },
  bash: { image: "python:3.12-slim", file: "main.sh", cmd: ["bash", "main.sh"] },
};
const ALIASES = { py: "python", python3: "python", js: "javascript", node: "javascript", nodejs: "javascript", sh: "bash", shell: "bash" };

function sh(cmd, args, { timeout = 30000, input } = {}) {
  return new Promise((ok) => {
    const p = execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, killSignal: "SIGKILL" }, (err, stdout, stderr) =>
      ok({ code: err ? (typeof err.code === "number" ? err.code : -1) : 0, killed: !!err?.killed, stdout: String(stdout || ""), stderr: String(stderr || ""), err }));
    if (input != null) { p.stdin.end(input); }
  });
}

function makeSandbox({ mode = "docker", log = () => {} } = {}) {
  const state = { enabled: false, reason: "checking…", images: {} };
  if (/^(off|0|false|no)$/i.test(mode)) { state.reason = "turned off (SANDBOX=off)"; return { state, ready: async () => false, run: async () => ({ error: "The code sandbox is turned off." }) }; }

  let checked = null;
  async function ready() {
    if (checked && Date.now() - checked.at < 5 * 60e3) return state.enabled;
    const r = await sh("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 8000 });
    if (r.code === 0) { state.enabled = true; state.reason = null; }
    else {
      state.enabled = false;
      state.reason = /permission denied/i.test(r.stderr) ? "Docker is installed but Nexus HQ isn't allowed to use it (add your user to the docker group)"
        : /ENOENT|not found/i.test(String(r.err?.message || r.stderr)) ? "Docker isn't installed" : `Docker isn't responding: ${r.stderr.trim().slice(0, 120)}`;
    }
    checked = { at: Date.now() };
    return state.enabled;
  }

  async function run(language, code, { timeoutS = 20 } = {}) {
    const key = ALIASES[String(language).toLowerCase()] || String(language).toLowerCase(), lang = LANGS[key];
    if (!lang) return { error: `Unsupported language "${language}". Use python, javascript or bash.` };
    if (!(await ready())) return { error: `The code sandbox isn't available: ${state.reason}.` };
    code = String(code || "");
    if (!code.trim()) return { error: "No code to run." };
    if (code.length > 100000) return { error: "That's too much code to run at once." };
    const limit = Math.max(2, Math.min(Number(timeoutS) || 20, 60));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhq-run-"));
    fs.writeFileSync(path.join(dir, lang.file), code);
    fs.chmodSync(dir, 0o755); fs.chmodSync(path.join(dir, lang.file), 0o644);
    const name = `nhq-run-${crypto.randomBytes(5).toString("hex")}`;
    const t0 = Date.now();
    const r = await sh("docker", [
      "run", "--rm", "--name", name, "--network", "none", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--pids-limit", "128",
      "--read-only", "--tmpfs", "/tmp:rw,size=64m,mode=1777", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
      "-e", "HOME=/tmp", "-e", "PYTHONDONTWRITEBYTECODE=1", "-v", `${dir}:/work:ro`, "-w", "/work",
      lang.image, "timeout", "-s", "KILL", String(limit), ...lang.cmd,
    ], { timeout: (limit + 150) * 1000 }); // generous outer limit: the first run may download the image
    const ms = Date.now() - t0;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    if (r.killed) { sh("docker", ["rm", "-f", name], { timeout: 10000 }); return { error: "The sandbox took too long to start (is the image still downloading?). Try again in a minute." }; }
    if (r.code === 125) return { error: /Unable to find image|pull access denied|manifest unknown|Forbidden/i.test(r.stderr) ? `Couldn't get the ${lang.image} image. On the PC run: docker pull ${lang.image}` : `Docker couldn't start the sandbox: ${r.stderr.trim().slice(0, 200)}` };
    const cap = (t) => (t.length > 6000 ? t.slice(0, 3000) + `\n… (${t.length - 6000} characters cut) …\n` + t.slice(-3000) : t);
    const out = { language: key, exitCode: r.code, stdout: cap(r.stdout), stderr: cap(r.stderr), ms };
    if (r.code === 137) out.stderr += ms < limit * 1000 - 300 ? "\nStopped: it used more than the 512 MB memory limit." : `\nStopped: it ran longer than ${limit} seconds.`;
    return out;
  }

  ready().then((ok) => log(ok ? "Code sandbox: ready (Docker)" : `Code sandbox: off (${state.reason})`)).catch(() => {});
  return { state, ready, run };
}

module.exports = { makeSandbox };
