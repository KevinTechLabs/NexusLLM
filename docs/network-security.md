# Network and Security

## Network

### AI Server

`192.0.2.10`

### Existing Homelab Mini PC

`192.0.2.20`

### Tailscale

AI server Tailscale IP:

`198.51.100.10`

## UFW

Desired policy:

- Default incoming: deny
- Default outgoing: allow
- Default routed: deny
- LAN `192.0.2.0/24`: allowed
- Tailscale interface `tailscale0`: allowed

Useful command:

`sudo ufw status verbose`

UFW is enabled at boot.

## Docker Firewall

Docker-published ports can bypass normal UFW INPUT filtering.

For Portainer Agent, the Docker `DOCKER-USER` chain is used.

Current intended rules:

```text
Allow established/related traffic
Allow 192.0.2.20 → TCP/9001
Drop all other TCP/9001 traffic
```

## Persistent Portainer Firewall

Script:

`/usr/local/sbin/portainer-firewall.sh`

Service:

`/etc/systemd/system/portainer-firewall.service`

The service waits for Docker's `DOCKER-USER` chain and applies the required rules.

It is enabled and verified to remain active after reboot.

## Security Principles

- Do not expose management ports publicly.
- Keep Tailscale private.
- Restrict Portainer Agent to its management host.
- Never store secrets in Git.
- Review destructive Docker commands before execution.
- Back up persistent data before major upgrades.
