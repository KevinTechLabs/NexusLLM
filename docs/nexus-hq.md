# Nexus HQ

Nexus HQ is a second front end on Nexus-Ai, next to Open WebUI. Open WebUI is the general chat interface. Nexus HQ is an agent dashboard: a live map of Chat and Coding agents, each with a role, tasks and a model.

Source and full setup guide: [`apps/nexus-hq/`](../apps/nexus-hq/README.md)

## Placement

| Item | Value |
|---|---|
| Host | Nexus-Ai |
| Port | `3100` (Open WebUI's proxy keeps `3000`) |
| Runtime | Node.js 22, no dependencies |
| Service | systemd unit `nexus-hq` |
| LLM backend | Ollama `127.0.0.1:11434` |
| Web search | SearXNG container `nexus-searxng`, bound to `127.0.0.1:8888` |
| Remote access | Tailscale only: `http://nexus-ai:3100` |

## Traffic flow

```text
iPhone (Home Screen app) → Tailscale → Nexus-Ai:3100 → Nexus HQ (Node)
                                                         ├── Ollama :11434 → RTX 4070
                                                         │     ├── gemma4:12b        (chat agents)
                                                         │     └── qwen3-coder:30b   (coding agents)
                                                         ├── SearXNG 127.0.0.1:8888  (web search)
                                                         ├── Anthropic API           (optional Opus lead, budget-capped)
                                                         └── GitHub API              (optional, pull requests only)
```

## Models

- **Gemma 4 12B** replaced Qwen3 8B in Nexus HQ. It runs the Concierge, Writer, Explainer, Private Helper and Doc Writer.
- **Qwen3-Coder 30B** runs the Builder, Debugger and Test Writer.
- **Claude Opus 5.5** is optional. It runs the Advisor, Architect and Reviewer, and falls back to the local models when it is off, has no key or is over budget.
  - Budget: `OPUS_MONTHLY_BUDGET=10.00`, `OPUS_DAILY_BUDGET=1.00`, `OPUS_MAX_TOKENS=1500`.

## GitHub workflow

1. Just ask: "read my NexusLLM repo" or "add a FAQ to my NexusLLM repo" (or `/repo NexusLLM` once, then `/update ...`). Nexus HQ remembers the repo.
2. `/update <what to change>`. Builder writes FIND/REPLACE edits, Reviewer checks them, and a diff card appears.
3. **Open pull request**, then **Merge now** (squash merge; the temporary `nexus-hq/...` branch is deleted).

Commits are always authored as the token owner with their `users.noreply.github.com` address. Co-author and AI credit trailers are removed from commit messages, PR titles and PR bodies, so the repo only ever lists the owner as a contributor.

## Obsidian vault

| Item | Value |
|---|---|
| Location | `~/Documents/NexusVault` (`VAULT_DIR` in `.env`) |
| Folders | `Notes/` (saved answers and topics), `Repos/` (one note per repo: overview + merge log), `Private/` (never read by agents) |
| Memory | `Memory.md`, one fact per line, editable in Obsidian |
| Search | Local keyword ranking (BM25) over titles, tags and text; top 3 notes go to the agent |
| Duplicates | Same question, topic or title updates the existing note |

## Operations

```bash
sudo systemctl restart nexus-hq
journalctl -u nexus-hq -f
systemctl status nexus-hq
sudo docker ps --filter name=nexus-searxng
```

## Security notes

- Secrets live only in `~/Documents/nexus-hq/.env`, which is git-ignored.
- Runtime data (chats, spend, projects) lives in `data/`, which is also git-ignored.
- UFW allows port `3100` on `tailscale0` and the LAN only. There is no public exposure.
- The GitHub token is fine-grained (Contents and Pull requests). Writes happen only on an explicit click, as a pull request on a new branch.
