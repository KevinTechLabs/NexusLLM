# Nexus Homelab — Operations

Common checks:

```bash
sudo docker ps
sudo docker exec ollama ollama list
sudo docker exec ollama nvidia-smi
curl http://127.0.0.1:11434/api/tags
sudo ufw status verbose
tailscale status
```

Open WebUI logs:

```bash
sudo docker logs --tail 100 open-webui
```

Portainer firewall:

```bash
sudo iptables -nL DOCKER-USER --line-numbers
sudo systemctl status portainer-firewall.service
sudo systemctl is-enabled portainer-firewall.service
```

Avoid destructive Docker commands unless data impact is understood.

Do not casually delete persistent volumes.

Back up before major upgrades.

Prefer Docker Compose for reproducible service management.
