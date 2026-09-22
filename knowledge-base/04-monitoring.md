# Nexus Homelab — Monitoring

Uptime Kuma:
- Host: `192.0.2.20`
- Port: `3001`
- URL: `http://192.0.2.20:3001`

Monitors:
- Open WebUI: `http://192.0.2.10:3000`
- Ollama: `http://192.0.2.10:11434/api/tags`
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
