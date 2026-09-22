# Operations

## Basic Health

```bash
hostname
ip addr
nvidia-smi
sudo docker ps
sudo docker stats --no-stream
sudo ufw status verbose
tailscale status
```

## Ollama

List models:

```bash
sudo docker exec ollama ollama list
```

Check GPU visibility:

```bash
sudo docker exec ollama nvidia-smi
```

API test:

```bash
curl http://127.0.0.1:11434/api/tags
```

## Open WebUI

```bash
sudo docker ps --filter name=open-webui
sudo docker logs --tail 100 open-webui
```

## Restart LLM Stack

From the Compose directory:

```bash
cd ~/llm
sudo docker compose up -d
```

## Docker Compose

Validate configuration before applying:

```bash
sudo docker compose config
```

## Firewall

```bash
sudo ufw status verbose
sudo iptables -nL DOCKER-USER --line-numbers
sudo systemctl status portainer-firewall.service
sudo systemctl is-enabled portainer-firewall.service
```

## Tailscale

```bash
tailscale status
tailscale ip -4
```

## Destructive Operations

Do not casually run:

- `docker volume rm`
- `docker system prune`
- `docker compose down -v`
- model deletion commands
- firewall flush/reset commands

Always confirm what data will be affected first.
