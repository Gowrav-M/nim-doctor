import { access, readFile, writeFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  DiagnosticFindingSchema,
  ToolCheckSchema,
  type DiagnosticFinding,
  type ToolCheck,
  type ToolName
} from "./schemas.js";
import { DEFAULT_NVIDIA_BASE_URL, normalizeBaseUrl } from "./nvidia.js";
import type { NimDoctorPaths } from "./files.js";

export interface DiagnosticContext {
  cwd: string;
  paths: NimDoctorPaths;
  env?: NodeJS.ProcessEnv | undefined;
  baseUrl?: string | undefined;
}

export async function runDoctorDiagnostics(ctx: DiagnosticContext): Promise<DiagnosticFinding[]> {
  const env = ctx.env ?? process.env;
  const findings: DiagnosticFinding[] = [
    checkNodeVersion(process.versions.node),
    checkApiKey(env["NVIDIA_API_KEY"]),
    checkBaseUrl(ctx.baseUrl ?? env["NVIDIA_BASE_URL"] ?? DEFAULT_NVIDIA_BASE_URL)
  ];
  findings.push(await checkWritableOutput(ctx.paths.stateDir));
  return findings;
}

export async function checkToolConfig(tool: ToolName, cwd: string): Promise<ToolCheck> {
  const checkedAt = new Date().toISOString();
  const candidates = configCandidates(tool, cwd);
  const existing = [];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      existing.push(candidate);
    } catch {
      // Missing configs are reported below as an actionable warning.
    }
  }
  const findings: DiagnosticFinding[] = [];
  if (existing.length === 0) {
    findings.push(
      DiagnosticFindingSchema.parse({
        id: `${tool}.config.missing`,
        title: `${tool} config not found`,
        status: "warn",
        severity: "warning",
        message: `No ${tool} config file was found in common locations.`,
        recommendation: `Run nim-doctor init ${tool} to generate a safe local template.`,
        evidence: { checkedLocations: candidates.join("; ") }
      })
    );
  } else {
    findings.push(
      DiagnosticFindingSchema.parse({
        id: `${tool}.config.found`,
        title: `${tool} config found`,
        status: "pass",
        severity: "info",
        message: `Found ${existing.length} ${tool} config file(s).`,
        evidence: { files: existing.join("; ") }
      })
    );
    for (const file of existing) {
      findings.push(...await inspectConfigFile(tool, file));
    }
  }
  return ToolCheckSchema.parse({ tool, checkedAt, findings });
}

export function configCandidates(tool: ToolName, cwd: string): string[] {
  const home = homedir();
  switch (tool) {
    case "cursor":
      return [
        join(home, "AppData", "Roaming", "Cursor", "User", "settings.json"),
        join(home, ".cursor", "settings.json"),
        join(cwd, ".cursor", "settings.json")
      ];
    case "continue":
      return [
        join(home, ".continue", "config.yaml"),
        join(home, ".continue", "config.json"),
        join(cwd, ".continue", "config.yaml")
      ];
    case "crewai":
      return [join(cwd, ".env"), join(cwd, "crewai.yaml"), join(cwd, "config", "agents.yaml")];
    case "litellm":
      return [join(cwd, "litellm.yaml"), join(cwd, "litellm_config.yaml"), join(home, ".litellm", "config.yaml")];
    case "llamaindex":
      return [join(cwd, ".env"), join(cwd, "llamaindex.json"), join(cwd, "settings.yaml")];
    case "opencode":
      return [join(home, ".config", "opencode", "opencode.json"), join(cwd, "opencode.json")];
  }
}

function checkNodeVersion(version: string): DiagnosticFinding {
  const major = Number(version.split(".")[0] ?? "0");
  return DiagnosticFindingSchema.parse({
    id: "node.version",
    title: "Node.js version",
    status: major >= 22 ? "pass" : "fail",
    severity: major >= 22 ? "info" : "critical",
    message: major >= 22
      ? `Node ${version} is supported.`
      : `Node ${version} is too old. nim-doctor requires Node 22 or newer.`,
    recommendation: major >= 22 ? undefined : "Install Node 22+ and rerun nim-doctor doctor.",
    evidence: { node: version }
  });
}

function checkApiKey(apiKey: string | undefined): DiagnosticFinding {
  const present = apiKey !== undefined && apiKey.trim().length > 0;
  return DiagnosticFindingSchema.parse({
    id: "nvidia.api_key",
    title: "NVIDIA API key",
    status: present ? "pass" : "warn",
    severity: present ? "info" : "warning",
    message: present
      ? "NVIDIA_API_KEY is set locally. The value is not printed or stored."
      : "NVIDIA_API_KEY is not set. Network commands will use offline/demo data or fail clearly.",
    recommendation: present
      ? undefined
      : "Create a developer key at build.nvidia.com and set NVIDIA_API_KEY before running live endpoint tests.",
    evidence: { present }
  });
}

function checkBaseUrl(baseUrl: string): DiagnosticFinding {
  const normalized = normalizeBaseUrl(baseUrl);
  const looksValid = normalized.startsWith("https://") || normalized.startsWith("http://localhost") || normalized.startsWith("http://127.0.0.1");
  const hasEndpointSuffix = baseUrl.endsWith("/chat/completions") || baseUrl.endsWith("/models");
  return DiagnosticFindingSchema.parse({
    id: "nvidia.base_url",
    title: "NVIDIA base URL",
    status: looksValid && !hasEndpointSuffix ? "pass" : "warn",
    severity: looksValid && !hasEndpointSuffix ? "info" : "warning",
    message: hasEndpointSuffix
      ? `Base URL includes an endpoint path. Use ${normalized} instead.`
      : `Using base URL ${normalized}.`,
    recommendation: hasEndpointSuffix
      ? "Set NVIDIA_BASE_URL to the provider root ending in /v1, not /v1/chat/completions."
      : undefined,
    evidence: { normalized }
  });
}

async function checkWritableOutput(stateDir: string): Promise<DiagnosticFinding> {
  const probe = resolve(stateDir, ".write-test");
  try {
    await writeFile(probe, "ok", "utf8");
    await unlink(probe);
    return DiagnosticFindingSchema.parse({
      id: "output.writable",
      title: "Output folder writable",
      status: "pass",
      severity: "info",
      message: ".nim-doctor output folder is writable.",
      evidence: { folder: stateDir }
    });
  } catch (error) {
    return DiagnosticFindingSchema.parse({
      id: "output.writable",
      title: "Output folder writable",
      status: "fail",
      severity: "critical",
      message: `Cannot write .nim-doctor output folder: ${error instanceof Error ? error.message : String(error)}`,
      recommendation: "Run from a writable project folder or fix filesystem permissions.",
      evidence: { folder: stateDir }
    });
  }
}

async function inspectConfigFile(tool: ToolName, file: string): Promise<DiagnosticFinding[]> {
  const raw = await readFile(file, "utf8");
  const findings: DiagnosticFinding[] = [];
  const normalized = raw.toLowerCase();
  if (normalized.includes("integrate.api.nvidia.com/v1/chat/completions")) {
    findings.push(DiagnosticFindingSchema.parse({
      id: `${tool}.base_url.endpoint_suffix`,
      title: "Base URL includes chat endpoint",
      status: "warn",
      severity: "warning",
      message: `${tool} config appears to use /chat/completions as the base URL.`,
      recommendation: "Use https://integrate.api.nvidia.com/v1 as the base URL and let the client append endpoints.",
      evidence: { file }
    }));
  }
  if (normalized.includes("nvidia") && !normalized.includes("api_key") && !normalized.includes("nvidia_api_key")) {
    findings.push(DiagnosticFindingSchema.parse({
      id: `${tool}.api_key.reference_missing`,
      title: "API key reference not obvious",
      status: "warn",
      severity: "warning",
      message: `${tool} config mentions NVIDIA but no API-key reference was detected.`,
      recommendation: "Prefer reading the key from NVIDIA_API_KEY rather than hardcoding secrets.",
      evidence: { file }
    }));
  }
  if (raw.match(/nvapi-[A-Za-z0-9_-]+/) !== null) {
    findings.push(DiagnosticFindingSchema.parse({
      id: `${tool}.hardcoded_secret`,
      title: "Hardcoded NVIDIA API key",
      status: "fail",
      severity: "critical",
      message: `${tool} config appears to contain a hardcoded NVIDIA API key.`,
      recommendation: "Remove the key from the file, rotate it if committed, and use NVIDIA_API_KEY from the environment.",
      evidence: { file }
    }));
  }
  if (findings.length === 0) {
    findings.push(DiagnosticFindingSchema.parse({
      id: `${tool}.config.basic_scan`,
      title: "Basic config scan",
      status: "pass",
      severity: "info",
      message: `${tool} config did not match known nim-doctor warning patterns.`,
      evidence: { file }
    }));
  }
  return findings;
}
