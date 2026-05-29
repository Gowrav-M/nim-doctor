import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

export interface NimDoctorPaths {
  cwd: string;
  packageRoot: string;
  stateDir: string;
  cacheDir: string;
  reportsDir: string;
  generatedDir: string;
  modelsJson: string;
  diagnosticsJson: string;
  testsJson: string;
  generatedConfigsJson: string;
  reportJson: string;
  reportMarkdown: string;
  reportHtml: string;
}

export function packageRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return dirname(dirname(moduleDir));
}

export function resolvePaths(cwd = process.cwd()): NimDoctorPaths {
  const stateDir = join(cwd, ".nim-doctor");
  const cacheDir = join(stateDir, "cache");
  const reportsDir = join(stateDir, "reports");
  const generatedDir = join(stateDir, "generated");
  return {
    cwd,
    packageRoot: packageRoot(),
    stateDir,
    cacheDir,
    reportsDir,
    generatedDir,
    modelsJson: join(cacheDir, "models.json"),
    diagnosticsJson: join(cacheDir, "diagnostics.json"),
    testsJson: join(cacheDir, "model-tests.json"),
    generatedConfigsJson: join(cacheDir, "generated-configs.json"),
    reportJson: join(reportsDir, "nim-doctor-report.json"),
    reportMarkdown: join(reportsDir, "nim-doctor-report.md"),
    reportHtml: join(reportsDir, "nim-doctor-report.html")
  };
}

export async function ensureStateDirs(paths: NimDoctorPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.stateDir, { recursive: true }),
    mkdir(paths.cacheDir, { recursive: true }),
    mkdir(paths.reportsDir, { recursive: true }),
    mkdir(paths.generatedDir, { recursive: true })
  ]);
}
