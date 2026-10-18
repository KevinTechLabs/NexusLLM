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
- **Obsidian vault (notes):** a **Vault** tab with an animated graph of your notes and their `[[links]]`, a reader that shows Obsidian callouts, highlights, tags and backlinks, search and tag filters, and your memory list.
  - Say *"save this to my notes"* after an answer, or *"make a note about docker networking"*.
  - Saving the same question or topic again **updates the existing note** instead of making a duplicate.
  - *"add all my repos to my vault"* writes an overview note for every repo, one after another (Stop ends it early).
  - **Repo sync:** every 30 minutes (`REPO_SYNC_MINUTES`) Nexus HQ checks each repo's latest commit. Changes made anywhere (Nexus HQ, the GitHub website, Claude) are added to that repo note's change log, new repos get a note, and the overview is refreshed by Gemma at most every 3 hours per repo. Overviews marked `overview-by: claude` are kept as written. Say *"sync my repos"* or tap the ↻ chip in the Vault tab to check right away.
  - *"make a note about my NexusLLM repo"* writes that repo's overview into `Repos/NexusLLM.md`, and every **Merge now** adds a line to its change log.
  - When you ask something, Nexus HQ finds your most relevant notes and gives them to the agent (you'll see "📓 using a note from your vault").
  - `Private/` is never searched, never shown to agents and never sent to Opus.
  - Remembered facts live in `Memory.md`, so you can edit them in Obsidian too.
  - Note-writing rules are adapted from [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) (MIT).
- **Photos:** attach photos to any question with the 🖼 button, or take one with 📷 on the phone. On the PC you can also paste or drag a picture into the console. Gemma 4 12B looks at them for free, and if the chosen agent's model can't see images (Qwen3-Coder), Gemma looks for it. Follow-up questions keep the photo, and *"save this to my notes"* embeds it in the note.
  - The **Photos** tab is a gallery of everything you've added, shared by your phone and PC: grouped by day, full-screen viewer, swipe, download, delete, and **Ask about it**. Select up to 4 to ask about together.
  - Photos are shrunk to 1600px before upload and saved in `~/Documents/NexusPhotos`, so they're also in a normal folder on the PC. Pictures you copy into that folder show up in the tab too.
  - With Opus on, a photo sent to Opus costs about 1¢.
- **Agents that use tools:** the local agents decide for themselves when to search the web, search or read your notes, check your lab, do exact math, or run code. The console shows each step ("🌐 searching the web…", "▶ running python in the sandbox · ✓"). `/tools off` turns it off.
- **Code that's been tested:** the Builder and Debugger run their code in a locked sandbox (no internet, none of your files, 20 seconds, 512 MB), read the errors, fix them and run it again before you see it. Even when the model skips testing, Nexus HQ runs the main code block of every coding answer itself; if it fails, the error goes back to the model and the answer is rewritten with the fix (up to twice). Tap **show code and output** to see the test.
- **Memory suggestions:** when you mention something lasting about yourself ("my NAS is called backup-nas", "I prefer short answers"), Nexus HQ offers to remember it. Nothing is saved unless you tap **Remember**, and facts you say No to aren't offered again. `/automemory off` turns it off.
- **Homelab awareness:** ask "is anything down?", "how hot is the GPU?", "any new alerts?" or "what's my power bill this month?" and the agents answer from live NexusLab and Sentinel data. Say "restart pihole" or "ack alert A-1043" and Nexus HQ asks you to confirm first. A **Lab** chip shows machines up and open alerts.
- **Smarter vault search:** notes are found by meaning, not just matching words ("what should I cook tonight" finds *Weeknight dinner*), using the local `nomic-embed-text` model. Falls back to keyword search if it isn't installed.
- **Phone notifications:** a notification when an answer finishes while you're away, when a critical or high alert comes in, and when a machine goes offline or comes back. If the phone puts the app to sleep mid-answer, the answer keeps going on the PC and shows up when you come back.
- **Faster replies:** models stay loaded for 30 minutes, Gemma loads when the server starts, the model starts loading while you type, and coding questions skip the router so Gemma and Qwen don't swap in and out of GPU memory.
- **Chat comforts:** a message box that grows as you type (Enter sends, Shift+Enter adds a line; on the phone the arrow sends), ✎ edit and resend, ↻ retry, ⧉ copy on every answer, automatic chat titles, suggested follow-up questions (`/followups off` to hide), long chats summarized so agents remember earlier decisions, a search box in **Chats**, and a 💬 chat-bubble view on the PC.
- **Rename chats:** tap the chat title, the ✎ in **Chats**, or type `/rename new name`.
- **Phone app layout:** on the iPhone, Nexus HQ looks like a native app:
  - a slim top bar with a status pill (models, GitHub, Compare, log out)
  - a bottom tab bar: **HQ** (map plus the Chat and Coding departments), **Ask** (full-screen chat with message bubbles), **Vault** and **Photos**
  - a clean ask bar with a **+** menu for the photo library, camera and web search
  - ask from the HQ tab to watch the map work; an "Answer ready" bubble takes you to the answer

  The PC layout is unchanged.
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

### Obsidian vault

Nexus HQ creates the vault on first start: a `NexusVault` folder next to the `nexus-hq` folder (`~/Documents/NexusVault`), containing `Notes/`, `Repos/`, `Private/`, `Memory.md` and `Welcome.md`. To move it, set `VAULT_DIR=/path` in `.env`; `VAULT_DIR=off` turns notes off.

- **On the PC:** install Obsidian, choose **Open folder as vault**, and pick `~/Documents/NexusVault`.
- **On your phone:** sync the folder with Syncthing (free) or Obsidian Sync. Don't put the vault in a public GitHub repo.
- If Obsidian can't save changes, the folder is owned by root: `sudo chown -R $USER:$USER ~/Documents/NexusVault`.

### Homelab (optional)

Add to `.env` (use your NexusLab login; the addresses are whatever you use in the browser):

```ini
NEXUSLAB_URL=http://<lab-server>:<port>
NEXUSLAB_USER=admin
NEXUSLAB_PASSWORD=...
SENTINEL_URL=http://<lab-server>:<port>
```

Container restart/stop/start only works on machines where NexusLab has Docker control turned on, and always asks you first.

### Code sandbox

Agents test code in throwaway Docker containers. Once:

```bash
docker pull python:3.12-slim node:22-slim
groups | grep -q docker || sudo usermod -aG docker $USER   # let Nexus HQ start containers
sudo systemctl restart nexus-hq
```

Each run has no network, a read-only system, a non-root user, 1 CPU, 512 MB and a 20-second limit, and only sees the one file being tested. Being in the `docker` group is effectively admin access on that PC, which is fine for a personal machine. `SANDBOX=off` in `.env` turns code running off. Type `/tools` to check it's ready.

### Smarter vault search

```bash
ollama pull nomic-embed-text
```

The index builds itself in the background (`data/vault-embeddings.json`) and only re-reads notes that changed.

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

### Notifications (needs https)

iPhones only allow notifications for a Home Screen app opened from an `https://` address. Tailscale gives you one for free, reachable only on your tailnet:

```bash
sudo tailscale serve --bg 3100
tailscale serve status        # shows https://nexus-ai.<your-tailnet>.ts.net
```

If it asks, enable HTTPS certificates for your tailnet in the Tailscale admin console (DNS → HTTPS Certificates).

1. On the iPhone, open `https://nexus-ai.<your-tailnet>.ts.net` in Safari and log in.
2. Delete the old Home Screen icon, then **Share → Add to Home Screen**.
3. Open Nexus HQ from the new icon, tap the status pill → **Phone notifications**, and allow them. A test notification arrives.

The plain `http://…:3100` address keeps working; only the https one can send notifications.

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
| `data/` | Runtime state: `sessions/`, `projects/`, `spend.json`, `settings.json`, `vault-embeddings.json`, `vapid.json` + `push-subscriptions.json` (notification keys, never commit) |

## 🧰 Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE` | Another service is on the port. Keep `PORT=3100`. |
| A model chip is red | Tap it to see what's missing (Ollama down, model not pulled, no key). |
| Phone login fails | Re-type the password in `.env` with no trailing spaces, then restart. |
| Opus chip shows "limit reached" | The monthly or daily budget was hit. Local models take over until it resets. |
| `/github` says not connected | Check `GITHUB_TOKEN` in `.env` and its permissions, then restart. |
