import { describe, expect, it } from "vitest";
import { DoctorReportSchema, ModelTestResultSchema, NimModelSchema } from "../src/core/schemas.js";

describe("schemas", () => {
  it("validates a NIM model", () => {
    const model = NimModelSchema.parse({
      id: "qwen/qwen3-coder-480b-a35b-instruct",
      capabilities: ["chat", "coding", "streaming", "tool-calling"]
    });
    expect(model.id).toBe("qwen/qwen3-coder-480b-a35b-instruct");
    expect(model.source).toBe("api");
  });

  it("rejects malformed model test results", () => {
    expect(() =>
      ModelTestResultSchema.parse({
        model: "",
        baseUrl: "not-a-url",
        testedAt: "today",
        ok: true
      })
    ).toThrow();
  });

  it("validates a complete report", () => {
    const report = DoctorReportSchema.parse({
      schemaVersion: "nim-doctor.report.v1",
      generatedAt: new Date().toISOString(),
      project: { name: "nim-doctor", version: "0.1.0" },
      summary: {
        decision: "ready",
        checks: 0,
        warnings: 0,
        failures: 0,
        testedModels: 0,
        generatedConfigs: 0
      },
      diagnostics: [],
      models: [],
      tests: [],
      configs: [],
      recommendations: [],
      caveats: []
    });
    expect(report.summary.decision).toBe("ready");
  });
});
