import { describe, expect, it } from "vitest";
import { createNimTrustEvidence, type NimTrustPaths } from "../src/core/trustEvidence.js";
import type { NimCompatibilityMatrix } from "../src/core/schemas.js";

const paths: NimTrustPaths = {
  reportsDir: "D:\\tmp\\nim-evidence-test\\.nim-doctor\\reports",
  reportJson: "D:\\tmp\\nim-evidence-test\\.nim-doctor\\reports\\nim-doctor-report.json",
  reportMarkdown: "D:\\tmp\\nim-evidence-test\\.nim-doctor\\reports\\nim-doctor-report.md",
  reportHtml: "D:\\tmp\\nim-evidence-test\\.nim-doctor\\reports\\nim-doctor-report.html",
  compatibilityJson: "D:\\tmp\\nim-evidence-test\\.nim-doctor\\reports\\nim-compatibility-matrix.json",
  compatibilityMarkdown: "D:\\tmp\\nim-evidence-test\\.nim-doctor\\reports\\nim-compatibility-matrix.md"
};

describe("nim-doctor trust evidence", () => {
  it("normalizes compatibility readiness into risk evidence", async () => {
    const matrix: NimCompatibilityMatrix = {
      schemaVersion: "nim-doctor.compatibility.v1",
      generatedAt: "2026-05-30T00:00:00.000Z",
      model: "qwen/qwen3-coder",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      decision: "blocked",
      agentReadinessScore: 40,
      results: [
        {
          capability: "chat",
          status: "fail",
          message: "Chat failed.",
          recommendation: "Fix endpoint credentials before agent use."
        }
      ],
      recommendations: ["Fix endpoint credentials before agent use."]
    };

    const evidence = await createNimTrustEvidence({ paths, version: "0.1.0", matrices: [matrix] });

    expect(evidence.schemaVersion).toBe("agent.trust.evidence.v1");
    expect(evidence.subject.type).toBe("nim");
    expect(evidence.decision).toBe("block");
    expect(evidence.score).toBe(60);
    expect(evidence.findings[0]?.severity).toBe("high");
  });
});
