import type { DoctorReport, GeneratedConfig, ModelTestResult, NimModel, DiagnosticFinding } from "../core/schemas.js";

export function buildReport(input: {
  diagnostics?: DiagnosticFinding[] | undefined;
  models?: NimModel[] | undefined;
  tests?: ModelTestResult[] | undefined;
  configs?: GeneratedConfig[] | undefined;
  version: string;
}): DoctorReport {
  const diagnostics = input.diagnostics ?? [];
  const models = input.models ?? [];
  const tests = input.tests ?? [];
  const configs = input.configs ?? [];
  const failures = diagnostics.filter((finding) => finding.status === "fail").length + tests.filter((test) => !test.ok).length;
  const warnings = diagnostics.filter((finding) => finding.status === "warn").length;
  const decision = failures > 0 ? "blocked" : warnings > 0 ? "review" : "ready";
  return {
    schemaVersion: "nim-doctor.report.v1",
    generatedAt: new Date().toISOString(),
    project: {
      name: "nim-doctor",
      version: input.version
    },
    summary: {
      decision,
      checks: diagnostics.length,
      warnings,
      failures,
      testedModels: tests.length,
      generatedConfigs: configs.length
    },
    diagnostics,
    models,
    tests,
    configs,
    recommendations: recommendationsFor(diagnostics, tests, configs),
    caveats: [
      "nim-doctor is an unofficial community tool and is not affiliated with or endorsed by NVIDIA.",
      "NVIDIA developer/API access is intended for development, testing, and evaluation; production use requires appropriate NVIDIA licensing or subscription.",
      "Generated configs are reviewable templates. Verify current tool documentation before replacing existing production settings."
    ]
  };
}

export function renderMarkdown(report: DoctorReport): string {
  const lines = [
    "# nim-doctor Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Decision: **${report.summary.decision.toUpperCase()}**`,
    `- Checks: ${report.summary.checks}`,
    `- Warnings: ${report.summary.warnings}`,
    `- Failures: ${report.summary.failures}`,
    `- Tested models: ${report.summary.testedModels}`,
    `- Generated configs: ${report.summary.generatedConfigs}`,
    "",
    "## Diagnostics",
    "",
    ...renderFindings(report.diagnostics),
    "",
    "## Model Tests",
    "",
    ...renderTests(report.tests),
    "",
    "## Generated Configs",
    "",
    ...renderConfigs(report.configs),
    "",
    "## Recommendations",
    "",
    ...(report.recommendations.length > 0 ? report.recommendations.map((item) => `- ${item}`) : ["- No recommendations."]),
    "",
    "## Caveats",
    "",
    ...report.caveats.map((item) => `- ${item}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

export function renderHtml(report: DoctorReport): string {
  const markdown = renderMarkdown(report);
  const body = escapeHtml(markdown)
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\n/g, "\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>nim-doctor Report</title>
  <style>
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 980px; line-height: 1.55; color: #18202a; }
    h1, h2 { line-height: 1.15; }
    h1 { font-size: 2rem; }
    h2 { border-top: 1px solid #d9e1ec; padding-top: 1rem; margin-top: 2rem; }
    li { margin: 0.3rem 0; }
    code { background: #eef3f8; padding: 0.1rem 0.3rem; border-radius: 4px; }
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

function renderFindings(findings: DiagnosticFinding[]): string[] {
  if (findings.length === 0) return ["- No diagnostics available."];
  return findings.map((finding) => {
    const recommendation = finding.recommendation ? ` Recommendation: ${finding.recommendation}` : "";
    return `- [${finding.status.toUpperCase()}] ${finding.title}: ${finding.message}${recommendation}`;
  });
}

function renderTests(tests: ModelTestResult[]): string[] {
  if (tests.length === 0) return ["- No live model tests were run."];
  return tests.map((test) => {
    const latency = test.latencyMs === undefined ? "unknown latency" : `${test.latencyMs}ms`;
    const error = test.error ? ` Error: ${test.error}` : "";
    return `- ${test.ok ? "PASS" : "FAIL"} ${test.model} at ${test.baseUrl} (${latency}).${error}`;
  });
}

function renderConfigs(configs: GeneratedConfig[]): string[] {
  if (configs.length === 0) return ["- No config templates were generated."];
  return configs.map((config) => `- ${config.tool}: ${config.path} using ${config.model}`);
}

function recommendationsFor(
  diagnostics: DiagnosticFinding[],
  tests: ModelTestResult[],
  configs: GeneratedConfig[]
): string[] {
  const recommendations = new Set<string>();
  for (const finding of diagnostics) {
    if (finding.recommendation !== undefined) recommendations.add(finding.recommendation);
  }
  if (tests.length === 0) recommendations.add("Run nim-doctor test <model-id> with NVIDIA_API_KEY set before trusting a model in an agent workflow.");
  if (configs.length === 0) recommendations.add("Run nim-doctor init <tool> to generate reviewable config templates for your coding agent tools.");
  for (const test of tests) {
    if (!test.ok) recommendations.add(`Do not route agent traffic to ${test.model} until its endpoint test passes.`);
  }
  return [...recommendations];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
