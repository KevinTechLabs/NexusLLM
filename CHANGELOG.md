# Changelog

## 2026-10-18

- Nexus HQ: routing and memory suggestions work on thinking models (no more "router error: Empty response"), lab addresses copied from the browser (ending in /login etc.) work, and the Lab chip shows connection problems plainly.
- Nexus HQ: every coding answer's code is run in the sandbox automatically and fixed if it fails; coding questions no longer pull in unrelated vault notes; stricter vault matching.
- LLM stack: Ollama only reachable from the PC itself, flash attention and q8_0 KV cache.

## 2026-10-15

- Nexus HQ: local agents use tools on their own (web search, notes, lab status, calculator, code sandbox), the Builder tests and fixes its code in a locked Docker sandbox before answering, and memory suggestions offer to remember lasting facts you mention (one tap, never automatic).

- Nexus HQ: homelab awareness (live NexusLab + Sentinel data for agents, Lab chip, "restart pihole" / "ack alert" with a confirm), vault search by meaning (nomic-embed-text), phone notifications over https (answer ready, critical/high alerts, machines offline), answers that survive the phone sleeping, faster replies (models stay loaded, warm-up, prewarm while typing, no router for code), and renaming chats.

- Nexus HQ repo sync: repo notes in the vault follow GitHub automatically (new commits logged, new repos added, overviews refreshed), plus "sync my repos" and a sync chip in the Vault tab.

- Nexus HQ: "add all my repos to my vault" (one note per repo). Answers to Nexus HQ's own questions work ("Which repo?" → "all of them" or a repo name). GitHub, notes and memory actions are part of the conversation, so agents understand follow-ups, and agents know the exact phrases the app understands.

- Nexus HQ phone layout: slim top bar with a status sheet, bottom tab bar (HQ · Ask · Vault · Photos), chat-style Ask tab, one-line ask bar with a + menu (photos, camera, web search), and an "Answer ready" bubble on the HQ tab.

- Nexus HQ photos: attach photos or take them with the phone camera, Gemma 4 12B looks at them (and stands in for models that can't see), Photos tab gallery shared by phone and PC, photos embedded in saved notes.

- Nexus HQ Obsidian vault: Vault tab (graph, reader, search, tags, memory), "save this to my notes", "make a note about ...", repo notes with automatic merge logs, relevant notes given to agents, no duplicate notes, `Memory.md` as editable memory, `Private/` folder never read by agents.

- Nexus HQ understands more ways to ask for repo changes ("get rid of", "clean up", "keep only", ...), keeps follow-ups on the same repo for your next few messages, and passes the earlier request along with the follow-up.

## 2026-10-14

- Nexus HQ memory: "remember that ...", "what do you remember", "forget ..."; every agent sees remembered facts. Follow-ups like "add it to that repo" stay on the same repo, and repo edits tolerate model noise in FIND blocks.

- Nexus HQ connects to GitHub automatically at startup, shows a GitHub status chip (with a token-expiry warning), and understands plain requests like "read my NexusLLM repo" and "add a FAQ to my NexusLLM repo".

- Nexus HQ web answers no longer show inline citation numbers; sources stay in the Sources list under each answer.
- Nexus HQ GitHub workflow: `/repo` remembers the repo, `/update` makes targeted FIND/REPLACE edits (safe inside large files), and the change card has a one-tap **Merge now**.
- Nexus HQ commits are always authored by the repo owner (private noreply email) and AI co-author lines are stripped automatically.

- Switched the general "Nexus" model from Qwen3 8B to Gemma 4 12B in the README, models, Open WebUI and Knowledge Base docs.
- Restored `apps/nexus-hq/server.js` and `apps/nexus-hq/agents.json`, which an automated update had accidentally truncated.
- Nexus HQ `/update` now refuses unsafe edits: files too large to read in full, and edits that would shrink a file by more than 40% unless removal was requested.

## 2026-10-13

- Added **Nexus HQ** (`apps/nexus-hq/`): animated agent dashboard for Chat and Coding departments on port 3100, run by systemd.
- Nexus HQ models: Gemma 4 12B (replaces Qwen3 8B in Nexus HQ) and Qwen3-Coder 30B, with an optional Claude Opus 5.5 lead.
- Opus cost controls: recap-only context, prompt caching, output cap, $10 monthly and $1 daily limits, on/off switch (`/opus on|off`) with automatic fallback to local models.
- Command console with routing, `/ship` pipeline, saved server-side chats, full-screen mode.
- Opus-style answer formatting and automatic Markdown tables.
- Private web search through SearXNG (`setup-web-search.sh`) with hover citations.
- GitHub integration: repo reviews, updates as pull requests on new branches, publishing projects to a new repo.
- Themed login screen with logout, phone login fixes, spread-out phone map, "Neural" Home Screen icon.
- Added `docs/nexus-hq.md` and updated the README architecture, services and troubleshooting.

## 2026-09-21

- NexusLLM repository created.
- Documented Nexus-Ai hardware and software stack.
- Documented Ollama and Open WebUI deployment.
- Documented Qwen3 8B, Qwen3-Coder 30B, and nomic-embed-text.
- Documented local RAG / Knowledge Base.
- Documented Web Search integration.
- Documented Tailscale, UFW, Docker firewall controls, and Portainer Agent.
- Documented Uptime Kuma and Discord alerts.
- Documented Nexus iPhone PWA and custom icon implementation.
- Added sanitized deployment configuration and operational documentation.
