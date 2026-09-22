# Local RAG / Knowledge Base

## Open WebUI Knowledge Base

Name:

**Nexus Homelab**

Description:

Documentation, configuration notes, and reference information for the Nexus homelab, AI server, Docker services, networking, monitoring, and infrastructure.

Access:

Private.

## Embedding

Ollama hosts:

`nomic-embed-text:latest`

Open WebUI document settings:

- Embedding engine: Ollama
- API base: `http://ollama:11434`
- API key: none
- Embedding model: `nomic-embed-text`
- Embedding batch size: 1
- Text splitter: Token (Tiktoken)
- Markdown header splitter: enabled
- Chunk size: 2000
- Chunk overlap: 200
- Chunk minimum target: 1000
- PDF loader mode: Page
- Bypass embedding/retrieval: off

## Knowledge Documents

The Knowledge Base contains:

1. AI server
2. Docker services
3. Network and security
4. Monitoring
5. Operations

The source copies are maintained under this repository's `knowledge-base/` directory.

## Verification

RAG has been tested with:

- A hardware/identity query retrieving the AI server document.
- An Open WebUI troubleshooting query retrieving monitoring, operations, and Docker documentation.
- A combined Open WebUI + Portainer troubleshooting query that correctly separated the two workflows.

## Rule

When local configuration matters, use the Knowledge Base rather than guessing.

If a configuration value is not documented, explicitly say it is undocumented instead of inventing it.
