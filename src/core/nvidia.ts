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
  jsonMode?: boolean | undefined;
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
      const text = await safeText(response);
      if (!response.ok) {
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
      const validation = validateResponseShape(options, text, response.headers.get("content-type") ?? "");
      return ModelTestResultSchema.parse({
        model: options.model,
        baseUrl: this.baseUrl,
        testedAt,
        ok: validation.ok,
        latencyMs,
        statusCode: response.status,
        streaming: options.stream === true ? validation.status : undefined,
        toolCalling: options.tools === true ? validation.status : undefined,
        error: validation.ok ? undefined : validation.message,
        responsePreview: redactSecrets(text.slice(0, 300))
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
        content: options.jsonMode === true ? "Return {\"ok\":true} as JSON." : "Reply with exactly: OK"
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
    request["tool_choice"] = {
      type: "function",
      function: { name: "nim_doctor_ping" }
    };
  }
  if (options.jsonMode === true) {
    request["response_format"] = { type: "json_object" };
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

function validateResponseShape(
  options: TestModelOptions,
  text: string,
  contentType: string
): { ok: boolean; status: "pass" | "fail"; message?: string | undefined } {
  if (options.stream === true) {
    const looksLikeSse = contentType.includes("text/event-stream") || text.includes("data:");
    if (!looksLikeSse) {
      return {
        ok: false,
        status: "fail",
        message: "stream=true did not return recognizable SSE data."
      };
    }
    if (options.tools === true && !text.includes("tool_calls") && !text.includes("function_call")) {
      return {
        ok: false,
        status: "fail",
        message: "streaming tool request did not return recognizable tool-call deltas."
      };
    }
    return { ok: true, status: "pass" };
  }

  const parsed = parseJson(text);
  if (options.tools === true && !hasPath(parsed, ["choices", 0, "message", "tool_calls"])) {
    return {
      ok: false,
      status: "fail",
      message: "tools request succeeded but response did not include message.tool_calls."
    };
  }
  if (options.jsonMode === true) {
    const content = readPath(parsed, ["choices", 0, "message", "content"]);
    if (typeof content !== "string") {
      return {
        ok: false,
        status: "fail",
        message: "JSON mode response did not include message.content."
      };
    }
    try {
      JSON.parse(content);
    } catch {
      return {
        ok: false,
        status: "fail",
        message: "JSON mode response content was not parseable JSON."
      };
    }
  }
  return { ok: true, status: "pass" };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function hasPath(value: unknown, path: Array<string | number>): boolean {
  return readPath(value, path) !== undefined;
}

function readPath(value: unknown, path: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}
