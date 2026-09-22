# 🧠 NexusLLM

> A self-hosted local AI platform and homelab environment built around **Ollama + Open WebUI + NVIDIA RTX 4070**, with private remote access, local RAG, monitoring, centralized Docker management, and a custom iPhone PWA.

**Status:** 🟢 Operational  
**Documentation snapshot:** September 21, 2026

---

# ✨ Features

- 🎯 **Dedicated AI Server** — Nexus-Ai, 24/7 local inference.
- 🚀 **Local LLM Serving** — Ollama on the RTX 4070.
- 🧠 **Nexus** — Qwen3 8B, 32K context.
- 💻 **Nexus Coder** — Qwen3-Coder 30B, 16K context.
- 📚 **Local RAG** — Open WebUI Knowledge Base + `nomic-embed-text`.
- 🔎 **Web Search** — DuckDuckGo/DDGS configured in Open WebUI.
- 🎨 **Nexus Branding** — custom model identity and PWA branding.
- 📱 **iPhone PWA** — standalone Nexus AI Home Screen app.
- 🐳 **Docker Compose** — reproducible deployment.
- 🛡️ **UFW + Docker Firewall** — host and Docker-layer controls.
- 🔐 **Tailscale** — private remote access.
- 🧰 **Portainer** — centralized Docker management from the existing mini PC.
- 📊 **Uptime Kuma** — monitoring.
- 🔔 **Discord Alerts** — private monitoring notifications.
- ♻️ **Persistent Services** — restart policies and reboot-persistent firewall rules.

---

# 🖥️ Hardware

| Component | Configuration |
|---|---|
| Hostname | `Nexus-Ai` |
| LAN IP | `192.0.2.10` |
| Tailscale IP | `198.51.100.10` |
| GPU | NVIDIA RTX 4070 |
| VRAM | 12 GB |
| RAM | 32 GB DDR5 |
| Storage | 1 TB SSD |
| Network | Ethernet |
| OS | Ubuntu 26.04.1 LTS |
| Kernel | 7.0.8-31-generic |
| NVIDIA Driver | 595.91.07 |
| CUDA | 13.2 |
| NVIDIA Container Toolkit | 1.20.1 |
| Docker Engine | 29.8.1 |

---

# 🏗️ Architecture

```text
iPhone / LAN
    │
    ▼
Nexus-Ai 192.0.2.10
    │
    ├── :3000 → nexus-proxy → Open WebUI :8080
    │                              │
    │                              ▼
    │                         Ollama :11434
    │                              │
    │                              ▼
    │                         RTX 4070
    │
    └── :8081 → nexus-pwa → manifest + Nexus icon

Existing Mini PC 192.0.2.20
    ├── Portainer :9443
    └── Uptime Kuma :3001
```

---

# 🤖 AI Models

## 🧠 Nexus

**Base:** `qwen3:8b`

General-purpose assistant for Linux, Docker, networking, homelab, self-hosting, general questions, Knowledge Base work, and web research.

- Context: **32768**
- Temperature: **0.4**
- Top-p: **0.9**
- Web Search: enabled

## 💻 Nexus Coder

**Base:** `qwen3-coder:30b`

Dedicated software-engineering assistant for programming, debugging, Docker, Linux, infrastructure, APIs, security, and documentation research.

- Context: **16384**
- Temperature: **0.2**
- Top-p: **0.9**
- Native function calling: enabled
- Web Search: enabled

## 📚 Embeddings

`nomic-embed-text:latest`

Required for local RAG. Do not remove it while the Knowledge Base depends on it.

---

# 📚 Local RAG / Knowledge Base

Open WebUI Knowledge Base:

**Nexus Homelab**

It documents:

- AI server
- Docker services
- Network/security
- Monitoring
- Operations
- Troubleshooting

Embedding configuration:

- Engine: Ollama
- API: `http://ollama:11434`
- Model: `nomic-embed-text`
- Batch size: 1
- Token/Tiktoken splitter
- Markdown Header Text Splitter: enabled
- Chunk size: 2000
- Chunk overlap: 200
- Chunk minimum target: 1000
- PDF loader mode: Page
- Retrieval bypass: disabled

RAG was tested successfully for hardware lookups and multi-document troubleshooting.

---

# 📱 iPhone Nexus AI PWA

**URL:** `http://198.51.100.10:3000`

Install from Safari with **Share → Add to Home Screen**.

The PWA uses a custom Nexus icon and standalone display mode.

### Why the proxy exists

Open WebUI explicitly serves its own Apple Touch Icon. iOS can prefer that icon over the manifest icon.

Nexus therefore uses Nginx on host port `3000` to:

- serve the Nexus icon at `/static/apple-touch-icon.png`
- proxy everything else to Open WebUI:8080
- leave Open WebUI application files untouched

---

# 🐳 Services

| Service | Address | Purpose |
|---|---|---|
| Nexus Proxy | `192.0.2.10:3000` | Open WebUI entry point + Apple icon |
| Open WebUI | internal `:8080` | AI interface |
| Ollama | `192.0.2.10:11434` | LLM API |
| Nexus PWA | `192.0.2.10:8081` | Manifest/icon |
| Portainer | `https://192.0.2.20:9443` | Docker management |
| Uptime Kuma | `http://192.0.2.20:3001` | Monitoring |

Persistent volumes:

- `ollama_data`
- `open_webui_data`

---

# 🛡️ Security

UFW:

```text
Default incoming: deny
Default outgoing: allow
Default routed: deny
LAN 192.0.2.0/24: allow
Tailscale interface: allow
```

Portainer Agent TCP/9001 is restricted to `192.0.2.20` through Docker's `DOCKER-USER` chain.

Rules are persisted by:

`portainer-firewall.service`

Remote access uses Tailscale. No public Internet exposure is intended.

**Never commit:** passwords, API keys, Tailscale auth keys, Discord webhooks, Open WebUI secrets, SSH private keys, or tokens.

---

# 📊 Monitoring

Uptime Kuma runs on `192.0.2.20:3001`.

Monitors:

- Open WebUI: `http://192.0.2.10:3000`
- Ollama: `http://192.0.2.10:11434/api/tags`
- Nexus-Ai: ping `192.0.2.10`

Alerts go to a private Discord server and `#alerts`.

Uptime Kuma 2FA is enabled.

---

# 🧰 Troubleshooting

### Open WebUI

```bash
sudo docker ps --filter name=open-webui
sudo docker logs --tail 100 open-webui
sudo docker ps --filter name=ollama
sudo docker exec ollama ollama list
curl http://127.0.0.1:11434/api/tags
sudo ufw status verbose
```

### Portainer

```bash
sudo docker ps --filter name=portainer_agent
sudo iptables -nL DOCKER-USER --line-numbers
sudo systemctl status portainer-firewall.service
sudo systemctl is-enabled portainer-firewall.service
```

### Tailscale

```bash
tailscale status
tailscale ip -4
```

---

# 📁 Repository Structure

```text
NexusLLM/
├── README.md
├── CHANGELOG.md
├── SECURITY.md
├── .gitignore
├── .env.example
├── docs/
│   ├── architecture.md
│   ├── ai-server.md
│   ├── docker-services.md
│   ├── models.md
│   ├── rag-knowledge-base.md
│   ├── network-security.md
│   ├── monitoring.md
│   ├── open-webui.md
│   ├── iphone-pwa.md
│   ├── portainer.md
│   └── operations.md
├── deploy/
│   ├── llm/
│   │   ├── compose.yml
│   │   └── nexus-proxy.conf
│   └── nexus-pwa/
│       ├── compose.yml
│       ├── manifest.webmanifest
│       └── nginx.conf
└── firewall/
    ├── portainer-firewall.sh
    └── portainer-firewall.service
```

---

# 🚀 Quick Start

This repository is a **documentation and configuration reference for the existing Nexus installation**.

For a new machine:

1. Install Ubuntu.
2. Install NVIDIA driver and NVIDIA Container Toolkit.
3. Install Docker.
4. Configure networking.
5. Configure Tailscale.
6. Review firewall rules.
7. Provide secrets through environment variables.
8. Deploy Ollama/Open WebUI.
9. Pull required models.
10. Configure the Knowledge Base.
11. Deploy the PWA proxy if desired.
12. Configure monitoring and Portainer.

Always review configuration for the target machine before applying it.

---

# 📖 Documentation

- [Architecture](docs/architecture.md)
- [AI Server](docs/ai-server.md)
- [Docker Services](docs/docker-services.md)
- [Models](docs/models.md)
- [RAG / Knowledge Base](docs/rag-knowledge-base.md)
- [Network & Security](docs/network-security.md)
- [Monitoring](docs/monitoring.md)
- [Open WebUI](docs/open-webui.md)
- [iPhone PWA](docs/iphone-pwa.md)
- [Portainer](docs/portainer.md)
- [Operations](docs/operations.md)

---

# ⚠️ Safety

Before destructive operations, verify what will be affected.

Avoid casually using:

```bash
docker volume rm
docker system prune
docker compose down -v
```

Back up persistent data before major upgrades or migrations.

See [SECURITY.md](SECURITY.md) for repository security rules.
