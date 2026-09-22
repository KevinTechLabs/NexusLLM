# Open WebUI

## Deployment

Open WebUI runs in Docker using:

`ghcr.io/open-webui/open-webui:main`

It is accessed externally through the Nexus Nginx proxy on port 3000.

Open WebUI itself listens on container port 8080.

## Configuration

Ollama backend:

`http://ollama:11434`

External PWA manifest:

`http://192.0.2.10:8081/manifest.webmanifest`

A secret key is required through the environment. The real value is intentionally not stored in this repository.

## Workspace Models

### Nexus

- Base model: `qwen3:8b`
- General-purpose system prompt
- Web Search enabled
- Local Nexus Homelab Knowledge Base used when relevant

### Nexus Coder

- Base model: `qwen3-coder:30b`
- Dedicated software-engineering system prompt
- Web Search enabled
- Native function calling
- Local Knowledge Base available

## Web Search

Web Search is enabled in Open WebUI.

DuckDuckGo/DDGS was selected as the search provider without an API key.

Testing confirmed that native tool calls work, although smaller local models may be less reliable for exact version/date verification.

For current external information, prefer official primary sources.

## Versioning

The deployment uses the moving `:main` image tag.

This was intentionally left unchanged after verifying that the running image was recent and operational.

Future maintenance should consider pinning a known stable Open WebUI release rather than depending indefinitely on a moving tag.

Before upgrades:

1. Verify the exact running image/version.
2. Review official release notes.
3. Back up persistent Open WebUI data.
4. Test migrations.
5. Keep the current Compose configuration available for rollback.

## Troubleshooting

Check the container:

`sudo docker ps --filter name=open-webui`

Logs:

`sudo docker logs --tail 100 open-webui`

Check Ollama:

`sudo docker ps --filter name=ollama`

`sudo docker exec ollama ollama list`

`curl http://127.0.0.1:11434/api/tags`

Check firewall:

`sudo ufw status verbose`
