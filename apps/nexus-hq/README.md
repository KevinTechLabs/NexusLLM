# 🛰️ Nexus HQ

A live, animated map of an AI "company" with two departments, **Chat** and **Coding**. Every agent runs on Nexus-Ai's RTX 4070 through Ollama. A budget-capped **Claude Opus 5.5** lead is optional and can be switched off at any time.

It runs as a zero-dependency Node.js server (no `npm install`), next to Open WebUI on the same machine, and opens on the iPhone over Tailscale as a Home Screen app.

---

## ✨ Features

- **Map:** a glowing core with both departments and all ten agents. Agents light up while they work. The phone layout is spread out for small screens.
- **Department trees:** models → agents → tasks. Tap a task to see its procedure, autonomy ladder and example requests, then **▶ Run this task**.
- **Command console:** type anything and HQ picks the department, agent and task, animates the map and streams the answer.
  - `@agent question` sends a question straight to one agent.
  - `/ship feature` runs the Architect → Builder → Test Writer → Reviewer pipeline.
  - **Full screen:** the ⛶ button or `/full`.
  - **Saved chats:** stored on the server, so the phone and PC share them. Use **+ New** and **Chats** to manage them.
- **House style:** every agent writes in a clear, Opus-like format, and answers turn into Markdown tables when a table helps.
- **Web search:** uses a private SearXNG container. The **WEB** switch cycles AUTO, ON and OFF. Answers read cleanly with no citation numbers in the text; every source is listed in the **Sources** box under the answer.
- **Claude Opus 5.5 lead (optional):** Opus plans as Architect, reviews as Reviewer and answers `@opus` questions as Advisor, while the local models do the bulk of the work. Token cost is kept down by:
  - sending Opus a short recap instead of the full chat
  - capping answer length
  - caching the system prompt
  - a monthly limit (and an optional daily one)

  The header shows spend. Turn Opus off with `/opus off` or the Opus chip, and its agents fall back to the local models. The server enforces this, so it costs $0 while off.
- **GitHub:** connected automatically at startup (the header shows a GitHub chip, and warns 14 days before the token expires). Just ask in plain words: *"read my NexusLLM repo"*, *"add a FAQ to my NexusLLM repo"*, *"show my repos"*. The repo you last used is remembered, so *"add a section about X to my repo"* works too. Slash commands still work: `/repo NexusLLM`, then `/update what to change`. Builder makes small, targeted edits (even inside big files), Reviewer checks them, and you get a diff → **Open pull request** → **Merge now**, all from the console. Nothing is written until you click.
- **Memory:** say *"remember that my main repo is NexusLLM"* or *"remember that I prefer short answers"*. Every agent sees these facts in every chat, on every device. *"what do you remember"* lists them, and *"forget 2"* (or *"forget the one about tables"*) removes one. Stored in `data/memory.json`, never committed. Within a chat, follow-ups like *"add a license section to it"* go to the repo you were just working on.
- **You're the only contributor:** every commit is authored by you with your private GitHub email, and any "Co-authored-by" or AI credit line is stripped from commit messages and pull requests automatically.
- **Projects:** `/project new name`, **Save** buttons on code blocks (or `/save`), `/files`, and `/publish repo`. An empty repo gets an initial commit; a repo with code gets a pull request.
- **Login screen:** themed, with logout. The password is checked server-side with a timing-safe comparison.
- **Home Screen icon:** "Neural" brain icon, PWA manifest and Apple touch icon.
- **Compare:** one prompt to every model, side by side.

## 🤖 Models and agents

| Model | Runs on | Used by |
|---|---|---|
| `gemma4:12b` | Ollama (local) | Concierge, Writer, Explainer, Private Helper, Doc Writer |
| `qwen3-coder:30b` | Ollama (local) | Builder, Debugger, Test Writer |
| `claude-opus-5-5` | Anthropic API (optional) | Advisor, Architect, Reviewer, which fall back to Gemma / Qwen3-Coder |

Opus pricing used for the spend meter: $4 / M input tokens, $20 / M output tokens, $0.20 / M cache reads. A typical Opus call costs about 1¢.

---

## 🚀 Install on Nexus-Ai

Requires Node.js 18+ (tested on 22) and Ollama with the two models pulled.

```bash
# Ollama runs in Docker on Nexus-Ai, so pull through its API:
curl http://127.0.0.1:11434/api/pull -d '{"model":"gemma4:12b"}'
curl http://127.0.0.1:11434/api/pull -d '{"model":"qwen3-coder:30b"}'

cd ~/Documents/nexus-hq
cp .env.example .env
nano .env            # set DASHBOARD_PASSWORD; API keys are optional
node server.js       # test run, then Ctrl+C
```

Port **3100** is used because Open WebUI's proxy already owns 3000.

### Run it in the background (systemd)

```bash
sudo cp deploy/nexus-hq.service /etc/systemd/system/nexus-hq.service
sudo nano /etc/systemd/system/nexus-hq.service   # check User and WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-hq
```

| Task | Command |
|---|---|
| Restart after editing `.env` | `sudo systemctl restart nexus-hq` |
| Logs | `journalctl -u nexus-hq -f` |
| Status | `systemctl status nexus-hq` |

### Web search (optional)

```bash
bash setup-web-search.sh     # starts SearXNG in Docker on 127.0.0.1:8888 and sets SEARXNG_URL
sudo systemctl restart nexus-hq
```

### GitHub (optional)

1. Create a **fine-grained** token at github.com/settings/personal-access-tokens:
   - Repository access: **All repositories**
   - Permissions: **Contents** and **Pull requests**, both **Read and write**
2. Add `GITHUB_TOKEN=github_pat_...` to `.env`, then restart.
3. Type `/github` in the console to confirm.

Everyday use:

```text
read my NexusLLM repo                            review it (plain English works)
add a FAQ to my NexusLLM repo                    write the change and show the diff
show my repos                                    list them
/repo NexusLLM                                   pick the repo once (remembered)
/update in README.md under AI Models, add ...    write the change and show the diff
→ Open pull request → Merge now                  two taps, no GitHub site needed
/review                                          review the current repo
```

Tips: name the file and section in `/update` for the best results. `/update` refuses unsafe edits (text it can't find, files it can't fully read, or edits that would delete most of a file).

### Claude Opus (optional, paid)

Set `ANTHROPIC_API_KEY` (or `OPENROUTER_API_KEY`) in `.env`. Spending controls:

```ini
OPUS_MONTHLY_BUDGET=10.00
OPUS_DAILY_BUDGET=1.00
OPUS_MAX_TOKENS=1500
```

---

## 📱 iPhone

1. Turn Tailscale on.
2. Open `http://nexus-ai:3100` (MagicDNS) or `http://198.51.100.10:3100`, using the Tailscale IP from `tailscale ip -4`.
3. Log in.
4. Tap **Share → Add to Home Screen**.

If the firewall blocks it:

```bash
sudo ufw allow in on tailscale0 to any port 3100
```

iOS caches Home Screen icons. After an icon change, delete the shortcut and add it again.

---

## 🔐 Security

- `.env` (password, API keys, GitHub token) and `data/` (chats, spend, settings, projects) are git-ignored. Never commit or photograph them.
- The dashboard has no public exposure: it is reachable only on the LAN and through Tailscale.
- GitHub writes happen only on an explicit click, and always as a pull request on a `nexus-hq/...` branch. The one exception is the first commit into an empty repo.
- Web search blocks private and Tailscale addresses, so search results can't make the server fetch internal pages.

## ⚙️ Configuration

| File | Purpose |
|---|---|
| `.env` | Ports, password, model names, budgets, API keys, `GITHUB_TOKEN` |
| `agents.json` | Departments, agents, tasks, pipelines and the shared house style. Changes take effect on a page refresh, with no restart. |
| `data/` | Runtime state: `sessions/`, `projects/`, `spend.json`, `settings.json` |

## 🧰 Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE` | Another service is on the port. Keep `PORT=3100`. |
| A model chip is red | Tap it to see what's missing (Ollama down, model not pulled, no key). |
| Phone login fails | Re-type the password in `.env` with no trailing spaces, then restart. |
| Opus chip shows "limit reached" | The monthly or daily budget was hit. Local models take over until it resets. |
| `/github` says not connected | Check `GITHUB_TOKEN` in `.env` and its permissions, then restart. |
