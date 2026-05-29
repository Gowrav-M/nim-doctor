import { describe, expect, it } from "vitest";
import { buildNimCompatibilityMatrix, renderNimCompatibilityMarkdown } from "../src/core/compatibility.js";
import type { ModelTestResult } from "../src/core/schemas.js";

function testResult(ok: boolean, error?: string): ModelTestResult {
  return {
    model: "qwen/test",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    testedAt: new Date().toISOString(),
    ok,
    latencyMs: 100,
    error
  };
}

describe("NIM compatibility matrix", () => {
  it("blocks when tool calling fails", () => {
    const matrix = buildNimCompatibilityMatrix({
      model: "qwen/test",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      chat: testResult(true),
      streaming: testResult(true),
      tools: testResult(false, "missing tool_calls"),
      streamingTools: testResult(true),
      jsonMode: testResult(true)
    });
    expect(matrix.decision).toBe("blocked");
    expect(matrix.agentReadinessScore).toBeLessThan(100);
    expect(renderNimCompatibilityMarkdown(matrix)).toContain("NVIDIA NIM Compatibility Matrix");
  });
});
