import { describe, expect, it } from "vitest";
import { buildReport, renderHtml, renderMarkdown } from "../src/report/render.js";

describe("reports", () => {
  it("marks reports with failed tests as blocked", () => {
    const report = buildReport({
      version: "0.1.0",
      tests: [{
        model: "qwen/test",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        testedAt: new Date().toISOString(),
        ok: false,
        error: "401"
      }]
    });
    expect(report.summary.decision).toBe("blocked");
    expect(renderMarkdown(report)).toContain("Decision: **BLOCKED**");
    expect(renderHtml(report)).toContain("<h1>nim-doctor Report</h1>");
  });
});
