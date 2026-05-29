import {
  ModelTestResultSchema,
  NimModelSchema,
  NimModelsResponseSchema,
  type ModelTestResult,
  type NimCapability,
  type NimModel
} from "./schemas.js";

export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export interface NvidiaClientOptions {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export interface TestModelOptions {
  model: string;
  stream?: boolean | undefined;
  tools?: boolean | undefined;
}

export class NvidiaApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number | undefined
  ) {
    super(message);
    this.name = "NvidiaApiError";
  }
}

export class NvidiaClient {
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(options: NvidiaClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_NVIDIA_BASE_URL);
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async listModels(): Promise<NimModel[]> {
    this.assertApiKey();
    const response = await this.fetchFn(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.headers()
    });
    const payload = await parseJsonResponse(response);
    const parsed = NimModelsResponseSchema.parse(payload);
    return parsed.data.map((model) =>
      NimModelSchema.parse({
        id: model.id,
        object: model.object,
        ownedBy: model.owned_by ?? model.ownedBy,
        provider: inferProvider(model.id),
        category: inferCategory(model.id),
        capabilities: inferCapabilities(model.id),
        source: "api"
      })
    );
  }

  async testModel(options: TestModelOptions): Promise<ModelTestResult> {
    this.assertApiKey();
    const started = performance.now();
    const testedAt = new Date().toISOString();
    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(buildChatRequest(options))
      });
      const latencyMs = Math.round(performance.now() - started);
      if (!response.ok) {
        const text = await safeText(response);
        return ModelTestResultSchema.parse({
          model: options.model,
          baseUrl: this.baseUrl,
          testedAt,
          ok: false,
          latencyMs,
          statusCode: response.status,
          streaming: options.stream === true ? "fail" : undefined,
          toolCalling: options.tools === true ? "fail" : undefined,
          error: redactSecrets(text.slice(0, 500))
        });
      }
      const responsePreview = options.stream === true
        ? redactSecrets((await safeText(response)).slice(0, 300))
        : redactSecrets(JSON.stringify(await parseJsonResponse(response)).slice(0, 300));
      return ModelTestResultSchema.parse({
        model: options.model,
        baseUrl: this.baseUrl,
        testedAt,
        ok: true,
        latencyMs,
        statusCode: response.status,
        streaming: options.stream === true ? "pass" : undefined,
        toolCalling: options.tools === true ? "pass" : undefined,
        responsePreview
      });
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      return ModelTestResultSchema.parse({
        model: options.model,
        baseUrl: this.baseUrl,
        testedAt,
        ok: false,
        latencyMs,
        streaming: options.stream === true ? "fail" : undefined,
        toolCalling: options.tools === true ? "fail" : undefined,
        error: redactSecrets(error instanceof Error ? error.message : String(error))
      });
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey ?? ""}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  private assertApiKey(): void {
    if (this.apiKey === undefined || this.apiKey.trim().length === 0) {
      throw new NvidiaApiError(
        "NVIDIA_API_KEY is not set. Create a free developer key at build.nvidia.com, then set NVIDIA_API_KEY locally."
      );
    }
  }
}

function buildChatRequest(options: TestModelOptions): Record<string, unknown> {
  const request: Record<string, unknown> = {
    model: options.model,
    messages: [
      {
        role: "user",
        content: "Reply with exactly: OK"
      }
    ],
    temperature: 0,
    max_tokens: 16,
    stream: options.stream === true
  };
  if (options.tools === true) {
    request["tools"] = [
      {
        type: "function",
        function: {
          name: "nim_doctor_ping",
          description: "Return a tiny health-check acknowledgement.",
          parameters: {
            type: "object",
            properties: {
              ok: { type: "boolean" }
            },
            required: ["ok"],
            additionalProperties: false
          }
        }
      }
    ];
    request["tool_choice"] = "auto";
  }
  return request;
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  if (trimmed.endsWith("/models")) {
    return trimmed.slice(0, -"/models".length);
  }
  return trimmed;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await safeText(response);
  if (!response.ok) {
    throw new NvidiaApiError(redactSecrets(text.slice(0, 500)), response.status);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new NvidiaApiError(`Expected JSON from NVIDIA API, received: ${redactSecrets(text.slice(0, 200))}`);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function redactSecrets(value: string): string {
  return value
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]+/gi, "api_key=***");
}

export function inferProvider(modelId: string): string | undefined {
  const [provider] = modelId.split("/");
  return provider && provider !== modelId ? provider : undefined;
}

export function inferCategory(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("embed")) return "retrieval";
  if (id.includes("rerank")) return "retrieval";
  if (id.includes("guard") || id.includes("safety") || id.includes("moderation")) return "safety";
  if (id.includes("vision") || id.includes("vlm") || id.includes("multimodal") || id.includes("phi-4")) return "vision";
  if (id.includes("coder") || id.includes("code")) return "coding";
  if (id.includes("reason") || id.includes("nemotron") || id.includes("qwq") || id.includes("thinking")) return "reasoning";
  return "chat";
}

export function inferCapabilities(modelId: string): NimCapability[] {
  const category = inferCategory(modelId);
  const capabilities = new Set<NimCapability>(["chat"]);
  if (category === "coding") capabilities.add("coding");
  if (category === "reasoning") capabilities.add("reasoning");
  if (category === "vision") capabilities.add("vision");
  if (category === "retrieval" && modelId.toLowerCase().includes("embed")) {
    capabilities.delete("chat");
    capabilities.add("embeddings");
  }
  if (category === "retrieval" && modelId.toLowerCase().includes("rerank")) {
    capabilities.delete("chat");
    capabilities.add("reranking");
  }
  if (category === "safety") capabilities.add("safety");
  if (capabilities.has("chat")) {
    capabilities.add("streaming");
    capabilities.add("tool-calling");
  }
  return [...capabilities];
}
