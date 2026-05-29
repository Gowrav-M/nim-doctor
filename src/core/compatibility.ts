import {
  NimCompatibilityMatrixSchema,
  NimCompatibilityResultSchema,
  type ModelTestResult,
  type NimCompatibilityMatrix,
  type NimCompatibilityResult
} from "./schemas.js";

export function buildNimCompatibilityMatrix(input: {
  model: string;
  baseUrl: string;
  chat: ModelTestResult;
  streaming: ModelTestResult;
  tools: ModelTestResult;
  streamingTools: ModelTestResult;
  jsonMode: ModelTestResult;
}): NimCompatibilityMatrix {
  const results: NimCompatibilityResult[] = [
    resultFor("chat", input.chat, "Basic chat must pass before any agent workflow can use this model."),
    resultFor("streaming", input.streaming, "Disable streaming in clients if this fails."),
    resultFor("tools", input.tools, "Coding agents need real OpenAI-style tool_calls, not plain text that describes tools."),
    resultFor("streaming_tools", input.streamingTools, "Streaming tool calls are fragile; disable streaming for tool-heavy workflows if this fails."),
    resultFor("json_mode", input.jsonMode, "Structured output failures can break evals, config generation, and automation.")
  ];
  const agentReadinessScore = computeScore(results);
  const decision = results.some((result) => result.status === "fail" && ["chat", "tools"].includes(result.capability))
    ? "blocked"
    : results.some((result) => result.status === "fail")
      ? "review"
      : "ready";
  const recommendations = results
    .filter((result) => result.status === "fail")
    .map((result) => result.recommendation)
    .filter((item): item is string => item !== undefined);
  return NimCompatibilityMatrixSchema.parse({
    schemaVersion: "nim-doctor.compatibility.v1",
    generatedAt: new Date().toISOString(),
    model: input.model,
    baseUrl: input.baseUrl,
    decision,
    agentReadinessScore,
    results,
    recommendations
  });
}

export function renderNimCompatibilityMarkdown(matrix: NimCompatibilityMatrix): string {
  const lines = [
    "# NVIDIA NIM Compatibility Matrix",
    "",
    `Generated: ${matrix.generatedAt}`,
    "",
    `- Model: \`${matrix.model}\``,
    `- Base URL: \`${matrix.baseUrl}\``,
    `- Decision: **${matrix.decision.toUpperCase()}**`,
    `- Agent readiness score: ${matrix.agentReadinessScore}/100`,
    "",
    "| Capability | Status | Latency | Message |",
    "| --- | --- | ---: | --- |",
    ...matrix.results.map((result) => `| ${result.capability} | ${result.status} | ${result.latencyMs ?? ""} | ${result.message.replaceAll("|", "\\|")} |`),
    "",
    "## Recommendations",
    "",
    ...(matrix.recommendations.length > 0 ? matrix.recommendations.map((item) => `- ${item}`) : ["- No recommendations."]),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function resultFor(
  capability: NimCompatibilityResult["capability"],
  test: ModelTestResult,
  recommendation: string
): NimCompatibilityResult {
  return NimCompatibilityResultSchema.parse({
    capability,
    status: test.ok ? "pass" : "fail",
    latencyMs: test.latencyMs,
    message: test.ok ? "Capability returned the expected agent-compatible response shape." : test.error ?? "Capability failed.",
    recommendation: test.ok ? undefined : recommendation
  });
}

function computeScore(results: NimCompatibilityResult[]): number {
  const weights: Record<NimCompatibilityResult["capability"], number> = {
    chat: 25,
    streaming: 15,
    tools: 25,
    streaming_tools: 20,
    json_mode: 15
  };
  const total = results.reduce((sum, result) => sum + weights[result.capability], 0);
  const earned = results.reduce((sum, result) => sum + (result.status === "pass" ? weights[result.capability] : 0), 0);
  return Math.round((earned / total) * 100);
}
