# NexusLLM Architecture

## Overview

NexusLLM is a dedicated local AI server integrated with an existing homelab management and monitoring system.

## Hosts

### Nexus-Ai

- IP: `192.0.2.10`
- Dedicated AI server
- Ollama
- Open WebUI
- NVIDIA GPU
- Tailscale
- Docker

### Existing Homelab Mini PC

- IP: `192.0.2.20`
- Existing Portainer
- Uptime Kuma
- Discord notification integration

## Traffic Flow

### Local

`LAN client → 192.0.2.10:3000 → nexus-proxy → Open WebUI:8080`

### Remote

`iPhone → Tailscale → 198.51.100.10:3000 → nexus-proxy → Open WebUI:8080`

### AI requests

`Open WebUI → Docker network → Ollama:11434 → NVIDIA RTX 4070`

### Knowledge retrieval

`Open WebUI → nomic-embed-text → Nexus Homelab Knowledge Base`

### Management

`Portainer on 192.0.2.20 → Portainer Agent on 192.0.2.10:9001`

### Monitoring

`Uptime Kuma on 192.0.2.20 → Nexus-Ai services`

## Design Goals

- Keep AI workloads local.
- Keep remote access private.
- Preserve persistent model and application data.
- Separate management and monitoring from the AI host.
- Make configuration reproducible.
- Keep troubleshooting documented.
