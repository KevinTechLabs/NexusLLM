# Docker Services

## LLM Stack

Compose source:

`deploy/llm/compose.yml`

### Ollama

- Container: `ollama`
- Image: `ollama/ollama:latest`
- API: TCP/11434
- Host binding: `11434:11434`
- Persistent volume: `ollama_data`
- Restart policy: `unless-stopped`
- NVIDIA GPU reservation enabled

Environment:

`OLLAMA_HOST=0.0.0.0:11434`

Healthcheck:

`ollama list`

### Open WebUI

- Container: `open-webui`
- Image: `ghcr.io/open-webui/open-webui:main`
- Internal HTTP port: 8080
- Persistent volume: `open_webui_data`
- Restart policy: `unless-stopped`

Open WebUI connects to:

`http://ollama:11434`

The external PWA manifest is supplied by:

`http://192.0.2.10:8081/manifest.webmanifest`

### Nexus Proxy

- Container: `nexus-proxy`
- Image: `nginx:alpine`
- Host port: 3000
- Container port: 80

The proxy preserves the public Open WebUI URL while providing the custom Apple Touch Icon.

## Data

Persistent application data is stored in Docker volumes.

Do not remove `ollama_data` or `open_webui_data` unless data loss is intentional and backed up.
