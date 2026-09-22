# Monitoring

## Uptime Kuma

Uptime Kuma runs on the existing homelab mini PC.

Address:

`http://192.0.2.20:3001`

It uses persistent Docker storage and embedded MariaDB.

## Monitors

### Open WebUI

`http://192.0.2.10:3000`

Purpose: verify the AI interface is reachable.

### Ollama

`http://192.0.2.10:11434/api/tags`

Purpose: verify the Ollama API is reachable.

### Nexus-Ai

Ping:

`192.0.2.10`

Purpose: verify network reachability.

## Notifications

Discord notifications are configured for a private homelab server and `#alerts`.

Webhook credentials are intentionally excluded from documentation.

## Security

Uptime Kuma 2FA is enabled.

## Troubleshooting Open WebUI

1. Ping Nexus-Ai.
2. Check the Open WebUI container.
3. Check its health.
4. Check Ollama.
5. Review Open WebUI and Ollama logs.
6. Check UFW and Docker networking if connectivity is suspected.

## Troubleshooting Portainer

Portainer is independent of Open WebUI.

Check:

`sudo docker ps --filter name=portainer_agent`

Then:

`sudo iptables -nL DOCKER-USER --line-numbers`

Then:

`sudo systemctl status portainer-firewall.service`
