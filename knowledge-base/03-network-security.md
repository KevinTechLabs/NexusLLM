# Nexus Homelab — Network Security

AI server: `192.0.2.10`

Mini PC: `192.0.2.20`

Tailscale: `198.51.100.10`

UFW:
- default incoming deny
- default outgoing allow
- default routed deny
- allow `192.0.2.0/24`
- allow `tailscale0`

Portainer Agent:
- TCP/9001
- source allowed: `192.0.2.20`
- restricted by Docker `DOCKER-USER`
- persistent service: `portainer-firewall.service`

Do not store credentials or webhook secrets in the Knowledge Base.
