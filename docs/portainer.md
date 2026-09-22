# Portainer

## Existing Portainer

Portainer remains on the existing homelab mini PC.

Address:

`the configured Portainer management address`

The AI server does not run a second Portainer instance.

## Agent

AI server container:

`portainer_agent`

Image:

`portainer/agent:2.25.0`

Port:

`9001`

The existing Portainer connects to:

`the configured Portainer Agent endpoint`

## Firewall

Only the Portainer server at `192.0.2.20` is allowed to reach TCP/9001.

Check:

`sudo iptables -nL DOCKER-USER --line-numbers`

Check service:

`sudo systemctl status portainer-firewall.service`

Check enablement:

`sudo systemctl is-enabled portainer-firewall.service`

## Troubleshooting

If Portainer reports the AI server as disconnected:

1. Check `portainer_agent`.
2. Verify TCP/9001 from `192.0.2.20`.
3. Inspect `DOCKER-USER`.
4. Check `portainer-firewall.service`.
5. Confirm Docker is running.

Portainer connectivity is separate from Open WebUI connectivity.
