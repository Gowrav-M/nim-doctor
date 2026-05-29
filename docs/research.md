# Research Notes

## Problem

NVIDIA NIM exposes OpenAI-compatible developer endpoints, but developers still need to know whether a specific NIM model works inside real agent tools. Basic chat is not enough; agent workflows need streaming, tool calls, streaming tool-call deltas, JSON mode, and correct config for clients such as Cursor, Continue, LiteLLM, CrewAI, LlamaIndex, and OpenCode.

## Evidence

- NVIDIA NIM uses OpenAI-compatible API patterns and developer/API access, but production use still depends on NVIDIA terms and appropriate licensing: https://docs.api.nvidia.com/nim/docs/run-anywhere
- Continue's OpenAI-compatible provider docs show that users often need to configure `apiBase`, legacy completions, and `/responses` behavior by hand: https://docs.continue.dev/customize/model-providers/top-level/openai
- LiteLLM lists NVIDIA NIM among a large provider ecosystem, showing that NIM sits inside a broader routing/configuration landscape: https://docs.litellm.ai/docs/providers
- Microsoft Agent Framework issue #3437 identifies local/OpenAI-compatible endpoints and the exact capabilities `nim-doctor compat` now tests: tool calling, streaming, structured output, and embeddings: https://github.com/microsoft/agent-framework/issues/3437
- OpenAI Codex issue #2507 shows that `/v1/models` success does not prove an agent can run; local endpoint workflows can fail later on nonstandard assumptions or streaming behavior: https://github.com/openai/codex/issues/2507

## Product Direction

`nim-doctor` should stay NVIDIA-focused. The useful gap is not another model list; it is a local diagnostic and compatibility matrix for NIM developer workflows.

