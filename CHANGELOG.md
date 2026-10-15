# Changelog

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
