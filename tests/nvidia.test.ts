import { describe, expect, it } from "vitest";
import { inferCapabilities, inferCategory, normalizeBaseUrl, NvidiaClient, redactSecrets } from "../src/core/nvidia.js";

describe("nvidia helpers", () => {
  it("normalizes endpoint-shaped base URLs", () => {
    expect(normalizeBaseUrl("https://integrate.api.nvidia.com/v1/chat/completions")).toBe("https://integrate.api.nvidia.com/v1");
    expect(normalizeBaseUrl("https://integrate.api.nvidia.com/v1/models")).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("infers model categories and capabilities", () => {
    expect(inferCategory("qwen/qwen3-coder-480b-a35b-instruct")).toBe("coding");
    expect(inferCapabilities("nvidia/nv-embedcode-7b-v1")).toContain("embeddings");
    expect(inferCapabilities("meta/llama-guard-4-12b")).toContain("safety");
  });

  it("redacts API keys", () => {
    expect(redactSecrets("Authorization: Bearer nvapi-secret-token")).toContain("Bearer ***");
    expect(redactSecrets("api_key=nvapi-secret-token")).toContain("api_key=***");
  });

  it("lists models through the OpenAI-compatible endpoint", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({
        object: "list",
        data: [{ id: "qwen/qwen3-coder-480b-a35b-instruct", object: "model", owned_by: "qwen" }]
      }), { status: 200 });
    const client = new NvidiaClient({ apiKey: "nvapi-test", fetchFn });
    const models = await client.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.capabilities).toContain("coding");
  });

  it("returns a failed test result on endpoint errors", async () => {
    const fetchFn = async () => new Response("bad key nvapi-secret", { status: 401 });
    const client = new NvidiaClient({ apiKey: "nvapi-test", fetchFn });
    const result = await client.testModel({ model: "qwen/test" });
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("nvapi-secret");
  });
});
