import { join } from "node:path";
import { GeneratedConfigSchema, type GeneratedConfig, type ToolName } from "../core/schemas.js";
import { DEFAULT_NVIDIA_BASE_URL, normalizeBaseUrl } from "../core/nvidia.js";

export interface GenerateConfigOptions {
  tool: ToolName;
  model: string;
  baseUrl?: string | undefined;
  outputDir: string;
}

export function defaultModelForTool(tool: ToolName): string {
  switch (tool) {
    case "cursor":
    case "continue":
    case "opencode":
      return "qwen/qwen3-coder-480b-a35b-instruct";
    case "crewai":
    case "llamaindex":
      return "nvidia/llama-3.1-nemotron-nano-8b-v1";
    case "litellm":
      return "qwen/qwen3-coder-480b-a35b-instruct";
  }
}

export function generateConfig(options: GenerateConfigOptions): GeneratedConfig {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_NVIDIA_BASE_URL);
  const generatedAt = new Date().toISOString();
  const path = join(options.outputDir, `${options.tool}-nim-template.${extensionForTool(options.tool)}`);
  return GeneratedConfigSchema.parse({
    tool: options.tool,
    path,
    model: options.model,
    baseUrl,
    generatedAt,
    notes: notesForTool(options.tool),
    content: contentForTool(options.tool, options.model, baseUrl)
  });
}

function extensionForTool(tool: ToolName): string {
  switch (tool) {
    case "cursor":
      return "md";
    case "continue":
    case "crewai":
    case "litellm":
    case "llamaindex":
      return "yaml";
    case "opencode":
      return "json";
  }
}

function notesForTool(tool: ToolName): string[] {
  const common = [
    "Keep NVIDIA_API_KEY in your shell or secret manager; do not paste nvapi keys into committed files.",
    "Use the base URL ending in /v1. Do not append /chat/completions manually."
  ];
  switch (tool) {
    case "cursor":
      return [
        ...common,
        "Cursor custom-provider behavior changes by version. This file is a review checklist, not an automatic Cursor settings overwrite.",
        "Some Cursor built-in features may still use Cursor-managed model routes even when a custom OpenAI-compatible endpoint is configured."
      ];
    case "continue":
      return [...common, "Continue has first-class NVIDIA provider support; paste this into ~/.continue/config.yaml after review."];
    case "litellm":
      return [...common, "LiteLLM expects NVIDIA models with the nvidia_nim/ prefix."];
    case "crewai":
      return [...common, "CrewAI commonly routes through LiteLLM-compatible model identifiers."];
    case "llamaindex":
      return [...common, "Use the official NVIDIA LlamaIndex packages when you need direct SDK integrations."];
    case "opencode":
      return [...common, "OpenCode-compatible configs vary by release; use this as a tested starting template."];
  }
}

function contentForTool(tool: ToolName, model: string, baseUrl: string): string {
  switch (tool) {
    case "cursor":
      return cursorInstructions(model, baseUrl);
    case "continue":
      return continueYaml(model, baseUrl);
    case "litellm":
      return litellmYaml(model, baseUrl);
    case "crewai":
      return crewaiYaml(model, baseUrl);
    case "llamaindex":
      return llamaIndexYaml(model, baseUrl);
    case "opencode":
      return opencodeJson(model, baseUrl);
  }
}

function cursorInstructions(model: string, baseUrl: string): string {
  return `# Cursor + NVIDIA NIM setup checklist

This is an unofficial nim-doctor template. Review Cursor's current UI before applying.

1. Open Cursor Settings > Models.
2. Enable your own OpenAI-compatible API key if your Cursor version supports it.
3. Set API key from your local environment: NVIDIA_API_KEY.
4. Set OpenAI-compatible base URL:

\`\`\`text
${baseUrl}
\`\`\`

5. Add or select this model:

\`\`\`text
${model}
\`\`\`

Known checks:
- Base URL should end with /v1, not /v1/chat/completions.
- If Cursor verification hangs, test the model first with: nim-doctor test ${model}
- If tool calling fails, try a different chat/coding model and rerun nim-doctor test --tools.
`;
}

function continueYaml(model: string, baseUrl: string): string {
  return `name: NVIDIA NIM
version: 1.0.0
schema: v1
models:
  - name: NIM Coder
    provider: nvidia
    model: ${model}
    apiBase: ${baseUrl}
    apiKey: \${{ env.NVIDIA_API_KEY }}
    roles:
      - chat
      - edit
      - apply
context:
  - provider: code
  - provider: docs
`;
}

function litellmYaml(model: string, baseUrl: string): string {
  return `model_list:
  - model_name: nim-coder
    litellm_params:
      model: nvidia_nim/${model}
      api_base: ${baseUrl}
      api_key: os.environ/NVIDIA_API_KEY
router_settings:
  routing_strategy: simple-shuffle
general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
`;
}

function crewaiYaml(model: string, baseUrl: string): string {
  return `# CrewAI commonly uses LiteLLM model identifiers.
environment:
  NVIDIA_API_KEY: "\${NVIDIA_API_KEY}"
  NVIDIA_BASE_URL: "${baseUrl}"
agents:
  researcher:
    llm: nvidia_nim/${model}
    goal: "Research and summarize with cited evidence."
  coder:
    llm: nvidia_nim/${model}
    goal: "Generate and review code changes."
`;
}

function llamaIndexYaml(model: string, baseUrl: string): string {
  return `# LlamaIndex NVIDIA NIM starting point.
llm:
  provider: nvidia
  model: ${model}
  api_base: ${baseUrl}
  api_key_env: NVIDIA_API_KEY
embedding:
  provider: nvidia
  model: nvidia/nv-embedcode-7b-v1
  api_key_env: NVIDIA_API_KEY
`;
}

function opencodeJson(model: string, baseUrl: string): string {
  return `${JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      provider: {
        nvidia: {
          name: "NVIDIA NIM",
          type: "openai-compatible",
          baseURL: baseUrl,
          apiKey: "{env:NVIDIA_API_KEY}",
          models: {
            [model]: {
              name: "NIM Coder"
            }
          }
        }
      }
    },
    null,
    2
  )}\n`;
}
