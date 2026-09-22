# Nexus Homelab — Docker Services

Compose path:

`~/llm/compose.yml`

## Ollama

Container: `ollama`

Image: `ollama/ollama:latest`

Port: `11434`

Volume: `ollama_data`

Environment: `OLLAMA_HOST=0.0.0.0:11434`

## Open WebUI

Container: `open-webui`

Image: `ghcr.io/open-webui/open-webui:main`

Internal port: `8080`

Volume: `open_webui_data`

Ollama URL: `http://ollama:11434`

External PWA manifest: `the configured PWA manifest endpoint`

## Nexus Proxy

Container: `nexus-proxy`

Image: `nginx:alpine`

Host port: `3000`

The proxy serves the custom Apple Touch Icon and forwards normal requests to Open WebUI.
