import { access } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readOptionalJsonFile } from "./json.js";
import {
  DoctorReportSchema,
  NimCompatibilityMatrixSchema,
  type DiagnosticFinding,
  type DoctorReport,
  type NimCompatibilityMatrix,
  type NimCompatibilityResult
} from "./schemas.js";

export type TrustDecision = "allow" | "review" | "block";
export type TrustSeverity = "info" | "low" | "medium" | "warning" | "high" | "critical";

export interface NimTrustPaths {
  reportsDir: string;
  reportJson: string;
  reportMarkdown: string;
  reportHtml: string;
  compatibilityJson: string;
  compatibilityMarkdown: string;
}

export interface TrustEvidenceFinding {
  id: string;
  severity: TrustSeverity;
  title: string;
  message: string;
  recommendation?: string;
  source?: string;
}

export interface TrustEvidence {
  schemaVersion: "agent.trust.evidence.v1";
  tool: {
    name: "nim-doctor";
    version: string;
  };
  subject: {
    type: "nim";
    name: string;
  };
  decision: TrustDecision;
  score: number;
  generatedAt: string;
  findings: TrustEvidenceFinding[];
  artifacts: Array<{ type: string; path: string }>;
  recommendations: string[];
}

const CompatibilityMatrixArraySchema = z.array(NimCompatibilityMatrixSchema);

export function trustEvidencePath(paths: NimTrustPaths): string {
  return join(paths.reportsDir, "trust-evidence.json");
}

export async function createNimTrustEvidence(input: {
  paths: NimTrustPaths;
  version: string;
  matrices?: NimCompatibilityMatrix[];
  report?: DoctorReport;
}): Promise<TrustEvidence> {
  const matrices = input.matrices ?? await readOptionalJsonFile(input.paths.compatibilityJson, CompatibilityMatrixArraySchema);
  const report = input.report ?? await readOptionalJsonFile(input.paths.reportJson, DoctorReportSchema);
  if ((matrices === undefined || matrices.length === 0) && report === undefined) {
    throw new Error("No nim-doctor report found. Run nim-doctor demo, compat, or report first.");
  }
  const evidence = matrices !== undefined && matrices.length > 0
    ? fromMatrices({ matrices, paths: input.paths, version: input.version })
    : fromReport({ report: report as DoctorReport, paths: input.paths, version: input.version });
  return {
    ...evidence,
    artifacts: await existingArtifacts(input.paths)
  };
}

function fromMatrices(input: {
  matrices: NimCompatibilityMatrix[];
  paths: NimTrustPaths;
  version: string;
}): Omit<TrustEvidence, "artifacts"> {
  const worstDecision = worstTrustDecision(input.matrices.map((matrix) => mapDecision(matrix.decision)));
  const riskScore = Math.max(...input.matrices.map((matrix) => readinessToRisk(matrix.agentReadinessScore)));
  const findings = input.matrices.flatMap((matrix) => matrix.results.filter((result) => result.status === "fail").map((result) => matrixFinding(matrix, result)));
  const recommendations = new Set(input.matrices.flatMap((matrix) => matrix.recommendations));
  if (worstDecision === "allow") {
    recommendations.add("Keep rerunning nim-doctor compatibility before routing new agent traffic to this NIM endpoint.");
  }
  return {
    schemaVersion: "agent.trust.evidence.v1",
    tool: {
      name: "nim-doctor",
      version: input.version
    },
    subject: {
      type: "nim",
      name: input.matrices.map((matrix) => matrix.model).join(", ")
    },
    decision: worstDecision,
    score: riskScore,
    generatedAt: input.matrices[0]?.generatedAt ?? new Date().toISOString(),
    findings,
    recommendations: [...recommendations]
  };
}

function fromReport(input: {
  report: DoctorReport;
  paths: NimTrustPaths;
  version: string;
}): Omit<TrustEvidence, "artifacts"> {
  const findings = [
    ...input.report.diagnostics.filter((finding) => finding.status !== "pass").map(toTrustFinding),
    ...input.report.tests.filter((test) => !test.ok).map((test): TrustEvidenceFinding => ({
      id: `model-test.${test.model}`,
      severity: "high",
      title: "NIM model test failed",
      message: test.error ?? "Model test failed.",
      recommendation: `Do not route agent traffic to ${test.model} until the test passes.`,
      source: test.baseUrl
    }))
  ];
  return {
    schemaVersion: "agent.trust.evidence.v1",
    tool: {
      name: "nim-doctor",
      version: input.version
    },
    subject: {
      type: "nim",
      name: "nvidia-nim"
    },
    decision: mapDecision(input.report.summary.decision),
    score: reportRiskScore(input.report),
    generatedAt: input.report.generatedAt,
    findings,
    recommendations: input.report.recommendations
  };
}

function matrixFinding(matrix: NimCompatibilityMatrix, result: NimCompatibilityResult): TrustEvidenceFinding {
  const finding: TrustEvidenceFinding = {
    id: `nim.${matrix.model}.${result.capability}`,
    severity: result.capability === "chat" || result.capability === "tools" ? "high" : "warning",
    title: `${result.capability} compatibility failed`,
    message: result.message,
    source: matrix.baseUrl
  };
  if (result.recommendation !== undefined) {
    finding.recommendation = result.recommendation;
  }
  return finding;
}

function toTrustFinding(finding: DiagnosticFinding): TrustEvidenceFinding {
  const evidence: TrustEvidenceFinding = {
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    message: finding.message
  };
  if (finding.recommendation !== undefined) {
    evidence.recommendation = finding.recommendation;
  }
  return evidence;
}

function reportRiskScore(report: DoctorReport): number {
  if (report.summary.failures > 0) {
    return 85;
  }
  if (report.summary.warnings > 0) {
    return 45;
  }
  return 0;
}

function mapDecision(decision: "ready" | "review" | "blocked"): TrustDecision {
  if (decision === "blocked") {
    return "block";
  }
  if (decision === "review") {
    return "review";
  }
  return "allow";
}

function worstTrustDecision(decisions: TrustDecision[]): TrustDecision {
  if (decisions.includes("block")) {
    return "block";
  }
  if (decisions.includes("review")) {
    return "review";
  }
  return "allow";
}

function readinessToRisk(score: number): number {
  return Math.max(0, Math.min(100, 100 - Math.round(score)));
}

async function existingArtifacts(paths: NimTrustPaths): Promise<Array<{ type: string; path: string }>> {
  const candidates: Array<{ type: string; path: string }> = [
    { type: "nim-report-json", path: paths.reportJson },
    { type: "nim-report-markdown", path: paths.reportMarkdown },
    { type: "nim-report-html", path: paths.reportHtml },
    { type: "nim-compatibility-json", path: paths.compatibilityJson },
    { type: "nim-compatibility-markdown", path: paths.compatibilityMarkdown }
  ];
  const existing: Array<{ type: string; path: string }> = [];
  for (const candidate of candidates) {
    if (await fileExists(candidate.path)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
