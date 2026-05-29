#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { generateConfig, defaultModelForTool } from "./config/generators.js";
import { checkToolConfig, runDoctorDiagnostics } from "./core/diagnostics.js";
import { ensureStateDirs, packageRoot, resolvePaths } from "./core/files.js";
import { readOptionalJsonFile, writeJsonFile } from "./core/json.js";
import { DEFAULT_NVIDIA_BASE_URL, NvidiaApiError, NvidiaClient, normalizeBaseUrl } from "./core/nvidia.js";
import {
  DiagnosticFindingSchema,
  GeneratedConfigSchema,
  ModelTestResultSchema,
  NimModelSchema,
  ToolNameSchema,
  type DiagnosticFinding,
  type GeneratedConfig,
  type ModelTestResult,
  type NimModel
} from "./core/schemas.js";
import { buildReport, renderHtml, renderMarkdown } from "./report/render.js";

const FALLBACK_VERSION = "0.1.0";

const DiagnosticsArraySchema = z.array(DiagnosticFindingSchema);
const ModelsArraySchema = z.array(NimModelSchema);
const TestsArraySchema = z.array(ModelTestResultSchema);
const ConfigsArraySchema = z.array(GeneratedConfigSchema);

interface GlobalOptions {
  cwd?: string;
  baseUrl?: string;
}

const program = new Command();

program
  .name("nim-doctor")
  .description("Unofficial local-first diagnostic CLI for NVIDIA NIM developer workflows.")
  .version(await readPackageVersion())
  .option("--cwd <path>", "working directory for .nim-doctor output", process.cwd())
  .option("--base-url <url>", "NVIDIA/OpenAI-compatible base URL", process.env["NVIDIA_BASE_URL"] ?? DEFAULT_NVIDIA_BASE_URL);

program
  .command("demo")
  .description("Run an offline demo and generate reports without an NVIDIA API key.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    const diagnostics = await runDoctorDiagnostics({ cwd: ctx.cwd, paths: ctx.paths, env: {}, baseUrl: ctx.baseUrl });
    const models = await loadFixtureModels();
    const configs = [
      generateConfig({ tool: "continue", model: defaultModelForTool("continue"), baseUrl: ctx.baseUrl, outputDir: ctx.paths.generatedDir }),
      generateConfig({ tool: "litellm", model: defaultModelForTool("litellm"), baseUrl: ctx.baseUrl, outputDir: ctx.paths.generatedDir })
    ];
    for (const config of configs) await writeTextFile(config.path, config.content);
    const tests: ModelTestResult[] = [
      ModelTestResultSchema.parse({
        model: defaultModelForTool("continue"),
        baseUrl: normalizeBaseUrl(ctx.baseUrl),
        testedAt: new Date().toISOString(),
        ok: true,
        latencyMs: 742,
        statusCode: 200,
        streaming: "pass",
        toolCalling: "pass",
        responsePreview: "offline demo fixture"
      })
    ];
    await persistState(ctx.paths, { diagnostics, models, tests, configs });
    const report = await writeReport(ctx.paths, { diagnostics, models, tests, configs, version: ctx.version });
    printHeader("nim-doctor offline demo");
    console.log("Created local evidence without using a network request.");
    console.log(`Report: ${report.markdown}`);
    console.log(`HTML:   ${report.html}`);
    console.log("Next: set NVIDIA_API_KEY and run nim-doctor test <model-id>");
  });

program
  .command("doctor")
  .description("Check local Node, NVIDIA API key, base URL, and writable output folder.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    const diagnostics = await runDoctorDiagnostics({ cwd: ctx.cwd, paths: ctx.paths, baseUrl: ctx.baseUrl });
    await writeJsonFile(ctx.paths.diagnosticsJson, diagnostics);
    printFindings("doctor", diagnostics);
  });

program
  .command("discover")
  .description("Discover NVIDIA NIM models using /v1/models, or use offline fixtures without an API key.")
  .option("--offline", "use bundled model fixtures instead of the network")
  .action(async (options: { offline?: boolean }) => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    let models: NimModel[];
    if (options.offline === true || !hasApiKey()) {
      models = await loadFixtureModels();
      console.log("Using offline sample model catalog. Set NVIDIA_API_KEY for live discovery.");
    } else {
      const client = new NvidiaClient({ apiKey: process.env["NVIDIA_API_KEY"], baseUrl: ctx.baseUrl });
      models = await client.listModels();
    }
    await writeJsonFile(ctx.paths.modelsJson, models);
    printHeader("models");
    for (const model of models.slice(0, 30)) {
      console.log(`- ${model.id} (${model.category ?? "unknown"}) ${model.capabilities.join(", ")}`);
    }
    if (models.length > 30) console.log(`...and ${models.length - 30} more`);
    console.log(`Saved: ${ctx.paths.modelsJson}`);
  });

program
  .command("test")
  .description("Run a live OpenAI-compatible health check against a specific NIM model.")
  .argument("<model>", "model ID, for example qwen/qwen3-coder-480b-a35b-instruct")
  .option("--stream", "test streaming response mode")
  .option("--tools", "send a minimal tool-calling request")
  .action(async (model: string, options: { stream?: boolean; tools?: boolean }) => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    if (!hasApiKey()) {
      throw new NvidiaApiError("NVIDIA_API_KEY is required for live model tests. Run nim-doctor demo for offline proof.");
    }
    const client = new NvidiaClient({ apiKey: process.env["NVIDIA_API_KEY"], baseUrl: ctx.baseUrl });
    const result = await client.testModel({ model, stream: options.stream, tools: options.tools });
    const existing = await readOptionalJsonFile(ctx.paths.testsJson, TestsArraySchema) ?? [];
    await writeJsonFile(ctx.paths.testsJson, [...existing, result]);
    printHeader("model test");
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.model} (${result.latencyMs ?? "unknown"}ms)`);
    if (result.error !== undefined) console.log(`Error: ${result.error}`);
    console.log(`Saved: ${ctx.paths.testsJson}`);
    if (!result.ok) process.exitCode = 1;
  });

program
  .command("check")
  .description("Inspect a local tool config for common NVIDIA NIM integration mistakes.")
  .argument("<tool>", "cursor | continue | crewai | litellm | llamaindex | opencode")
  .action(async (toolInput: string) => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    const tool = ToolNameSchema.parse(toolInput);
    const check = await checkToolConfig(tool, ctx.cwd);
    const existing = await readOptionalJsonFile(ctx.paths.diagnosticsJson, DiagnosticsArraySchema) ?? [];
    await writeJsonFile(ctx.paths.diagnosticsJson, [...existing, ...check.findings]);
    printFindings(`check ${tool}`, check.findings);
  });

program
  .command("init")
  .description("Generate a reviewable NVIDIA NIM config template for an agent/coding tool.")
  .argument("<tool>", "cursor | continue | crewai | litellm | llamaindex | opencode")
  .option("--model <model>", "model ID to put in the generated template")
  .option("--target <path>", "explicit file path to write instead of .nim-doctor/generated")
  .action(async (toolInput: string, options: { model?: string; target?: string }) => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    const tool = ToolNameSchema.parse(toolInput);
    const model = options.model ?? defaultModelForTool(tool);
    const generated = generateConfig({ tool, model, baseUrl: ctx.baseUrl, outputDir: ctx.paths.generatedDir });
    const config = options.target === undefined
      ? generated
      : GeneratedConfigSchema.parse({ ...generated, path: resolve(ctx.cwd, options.target) });
    await writeTextFile(config.path, config.content);
    const existing = await readOptionalJsonFile(ctx.paths.generatedConfigsJson, ConfigsArraySchema) ?? [];
    await writeJsonFile(ctx.paths.generatedConfigsJson, [...existing.filter((item) => item.path !== config.path), config]);
    printHeader(`init ${tool}`);
    console.log(`Generated: ${config.path}`);
    console.log(`Model: ${config.model}`);
    for (const note of config.notes) console.log(`- ${note}`);
  });

program
  .command("report")
  .description("Generate JSON, Markdown, and HTML reports from the local .nim-doctor state.")
  .action(async () => {
    const ctx = await commandContext();
    await ensureStateDirs(ctx.paths);
    const diagnostics = await readOptionalJsonFile(ctx.paths.diagnosticsJson, DiagnosticsArraySchema) ?? [];
    const models = await readOptionalJsonFile(ctx.paths.modelsJson, ModelsArraySchema) ?? [];
    const tests = await readOptionalJsonFile(ctx.paths.testsJson, TestsArraySchema) ?? [];
    const configs = await readOptionalJsonFile(ctx.paths.generatedConfigsJson, ConfigsArraySchema) ?? [];
    const report = await writeReport(ctx.paths, { diagnostics, models, tests, configs, version: ctx.version });
    printHeader("report");
    console.log(`JSON: ${report.json}`);
    console.log(`Markdown: ${report.markdown}`);
    console.log(`HTML: ${report.html}`);
  });

program.showHelpAfterError();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`nim-doctor: ${message}`);
  process.exitCode = 1;
}

async function commandContext(): Promise<{
  cwd: string;
  baseUrl: string;
  version: string;
  paths: ReturnType<typeof resolvePaths>;
}> {
  const options = program.opts<GlobalOptions>();
  const cwd = resolve(options.cwd ?? process.cwd());
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_NVIDIA_BASE_URL);
  return {
    cwd,
    baseUrl,
    version: await readPackageVersion(),
    paths: resolvePaths(cwd)
  };
}

async function readPackageVersion(): Promise<string> {
  try {
    const raw = await readFile(join(packageRoot(), "package.json"), "utf8");
    const parsed = z.object({ version: z.string().min(1) }).parse(JSON.parse(raw));
    return parsed.version;
  } catch {
    return FALLBACK_VERSION;
  }
}

async function loadFixtureModels(): Promise<NimModel[]> {
  const raw = await readFile(join(packageRoot(), "examples", "sample-models.json"), "utf8");
  return z.array(NimModelSchema).parse(JSON.parse(raw));
}

function hasApiKey(): boolean {
  return process.env["NVIDIA_API_KEY"] !== undefined && process.env["NVIDIA_API_KEY"].trim().length > 0;
}

async function persistState(
  paths: ReturnType<typeof resolvePaths>,
  state: {
    diagnostics: DiagnosticFinding[];
    models: NimModel[];
    tests: ModelTestResult[];
    configs: GeneratedConfig[];
  }
): Promise<void> {
  await Promise.all([
    writeJsonFile(paths.diagnosticsJson, state.diagnostics),
    writeJsonFile(paths.modelsJson, state.models),
    writeJsonFile(paths.testsJson, state.tests),
    writeJsonFile(paths.generatedConfigsJson, state.configs)
  ]);
}

async function writeReport(
  paths: ReturnType<typeof resolvePaths>,
  input: {
    diagnostics: DiagnosticFinding[];
    models: NimModel[];
    tests: ModelTestResult[];
    configs: GeneratedConfig[];
    version: string;
  }
): Promise<{ json: string; markdown: string; html: string }> {
  const report = buildReport(input);
  await Promise.all([
    writeJsonFile(paths.reportJson, report),
    writeTextFile(paths.reportMarkdown, renderMarkdown(report)),
    writeTextFile(paths.reportHtml, renderHtml(report))
  ]);
  return { json: paths.reportJson, markdown: paths.reportMarkdown, html: paths.reportHtml };
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function printHeader(title: string): void {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function printFindings(title: string, findings: DiagnosticFinding[]): void {
  printHeader(title);
  for (const finding of findings) {
    console.log(`[${finding.status.toUpperCase()}] ${finding.title}: ${finding.message}`);
    if (finding.recommendation !== undefined) console.log(`  -> ${finding.recommendation}`);
  }
}
