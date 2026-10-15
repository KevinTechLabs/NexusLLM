const ALL_MODELS = [
  { id: "gpt", label: "GPT-5.6 Sol", provider: "openai", model: env("OPENAI_MODEL", "gpt-5.6-sol"), orModel: env("OPENROUTER_GPT_MODEL", "openai/gpt-5.6-sol"), color: "#10a37f" },
  { id: "opus", label: "Claude Opus 5.5", provider: "anthropic", model: env("ANTHROPIC_MODEL", "claude-opus-5-5"), orModel: env("OPENROUTER_OPUS_MODEL", "anthropic/claude-opus-5.5"), color: "#d97757",
    // Opus is the expensive one: short answers, priced per million tokens, and a daily budget.
    maxTokens: Number(env("OPUS_MAX_TOKENS", 1500)), priceIn: Number(env("OPUS_PRICE_IN", 4)), priceOut: Number(env("OPUS_PRICE_OUT", 20)), budgeted: true },
  { id: "gemma", label: "Gemma 4 12B", provider: "ollama", model: env("GEMMA_MODEL", "gemma4:12b"), color: "#4c8bf5" },
  { id: "qwencoder", label: "Qwen3-Coder 30B", provider: "ollama", model: env("QWEN_CODER_MODEL", "qwen3-coder:30b"), color: "#3b82f6" },
];
