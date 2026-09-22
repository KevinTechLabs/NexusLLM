# Nexus Homelab — Monitoring

Uptime Kuma:
- Host: `192.0.2.20`
- Port: `3001`
- URL: `the configured Uptime Kuma address`

Monitors:
- Open WebUI: `the configured Open WebUI endpoint`
- Ollama: `the configured Ollama health endpoint`
- Nexus-Ai: ping `192.0.2.10`

Notifications use a private Discord server and `#alerts`.

Uptime Kuma 2FA is enabled.

Open WebUI troubleshooting:
1. Check Nexus-Ai.
2. Check open-webui.
3. Check health.
4. Check Ollama.
5. Review logs.
6. Check firewall/networking.

Portainer troubleshooting:
1. Check portainer_agent.
2. Verify TCP/9001 from 192.0.2.20.
3. Check DOCKER-USER.
4. Check portainer-firewall.service.
