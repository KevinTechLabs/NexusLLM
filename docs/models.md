# Models

## Nexus

Underlying Ollama model:

`qwen3:8b`

Purpose:

- General questions
- Homelab assistance
- Linux
- Docker
- Networking
- Self-hosting
- General research

Configured context:

`32768`

Suggested parameters:

- Temperature: 0.4
- Top-p: 0.9

## Nexus Coder

Underlying Ollama model:

`qwen3-coder:30b`

Purpose:

- Software engineering
- Coding
- Debugging
- Docker
- Linux
- Infrastructure
- API and documentation research

Configured context:

`16384`

Suggested parameters:

- Temperature: 0.2
- Top-p: 0.9

Native function calling is enabled.

## Embeddings

Model:

`nomic-embed-text:latest`

Purpose:

Local Knowledge Base embeddings.

This model is required for RAG and should remain installed.

## Performance Notes

Qwen3 8B generally runs around the mid-80 token/sec range on short generation tests.

Qwen3-Coder 30B uses both GPU VRAM and system RAM because the quantized model is larger than the RTX 4070's 12 GB VRAM.

Observed short-prompt generation was approximately 60 tok/sec, while long-context generation slows substantially as context grows.

At 32K context, Qwen3-Coder 30B was observed using approximately 22 GB combined memory with roughly 52% GPU / 48% CPU placement in `ollama ps`.

For this reason, Nexus uses 32K context for the smaller general model and 16K for the larger coding model.
