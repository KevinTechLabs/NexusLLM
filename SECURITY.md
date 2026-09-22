# Security

## Secrets

Do not commit credentials, tokens, webhook URLs, private keys, passwords, or API keys.

## Network

Nexus-Ai is intended to remain private on the LAN and through Tailscale.

Do not expose Ollama, Open WebUI, Portainer Agent, or other management services directly to the public Internet unless the security model is deliberately redesigned.

## Firewall

UFW provides host-level filtering.

Docker-published Portainer Agent traffic is additionally controlled with the `DOCKER-USER` chain.

## Backups

Before major Open WebUI upgrades or database migrations, back up persistent Open WebUI data.

Before changing Docker Compose, firewall, or reverse-proxy configuration, keep a known-good configuration backup.

## Reporting

For a security issue, do not publish credentials or exploit details in a public issue. Rotate affected secrets and document the incident separately.
