import { z } from "zod";

export const SeveritySchema = z.enum(["info", "warning", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const DiagnosticStatusSchema = z.enum(["pass", "warn", "fail"]);
export type DiagnosticStatus = z.infer<typeof DiagnosticStatusSchema>;

export const ToolNameSchema = z.enum([
  "cursor",
  "continue",
  "crewai",
  "litellm",
  "llamaindex",
  "opencode"
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const NimCapabilitySchema = z.enum([
  "chat",
  "streaming",
  "tool-calling",
  "vision",
  "embeddings",
  "reranking",
  "reasoning",
  "coding",
  "safety"
]);
export type NimCapability = z.infer<typeof NimCapabilitySchema>;

export const NimModelSchema = z.object({
  id: z.string().min(1),
  object: z.string().optional(),
  ownedBy: z.string().optional(),
  category: z.string().optional(),
  provider: z.string().optional(),
  capabilities: z.array(NimCapabilitySchema).default([]),
  source: z.enum(["api", "fixture", "cache"]).default("api")
});
export type NimModel = z.infer<typeof NimModelSchema>;

export const NimModelsResponseSchema = z.object({
  object: z.string().optional(),
  data: z.array(
    z.object({
      id: z.string().min(1),
      object: z.string().optional(),
      owned_by: z.string().optional(),
      ownedBy: z.string().optional()
    }).loose()
  )
});
export type NimModelsResponse = z.infer<typeof NimModelsResponseSchema>;

export const DiagnosticFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: DiagnosticStatusSchema,
  severity: SeveritySchema,
  message: z.string().min(1),
  recommendation: z.string().optional(),
  evidence: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
});
export type DiagnosticFinding = z.infer<typeof DiagnosticFindingSchema>;

export const ModelTestResultSchema = z.object({
  model: z.string().min(1),
  baseUrl: z.url(),
  testedAt: z.iso.datetime(),
  ok: z.boolean(),
  latencyMs: z.number().nonnegative().optional(),
  statusCode: z.number().int().positive().optional(),
  streaming: DiagnosticStatusSchema.optional(),
  toolCalling: DiagnosticStatusSchema.optional(),
  error: z.string().optional(),
  responsePreview: z.string().max(500).optional()
});
export type ModelTestResult = z.infer<typeof ModelTestResultSchema>;

export const GeneratedConfigSchema = z.object({
  tool: ToolNameSchema,
  path: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.url(),
  generatedAt: z.iso.datetime(),
  notes: z.array(z.string().min(1)).default([]),
  content: z.string().min(1)
});
export type GeneratedConfig = z.infer<typeof GeneratedConfigSchema>;

export const DoctorReportSchema = z.object({
  schemaVersion: z.literal("nim-doctor.report.v1"),
  generatedAt: z.iso.datetime(),
  project: z.object({
    name: z.literal("nim-doctor"),
    version: z.string().min(1)
  }),
  summary: z.object({
    decision: z.enum(["ready", "review", "blocked"]),
    checks: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    testedModels: z.number().int().nonnegative(),
    generatedConfigs: z.number().int().nonnegative()
  }),
  diagnostics: z.array(DiagnosticFindingSchema).default([]),
  models: z.array(NimModelSchema).default([]),
  tests: z.array(ModelTestResultSchema).default([]),
  configs: z.array(GeneratedConfigSchema).default([]),
  recommendations: z.array(z.string().min(1)).default([]),
  caveats: z.array(z.string().min(1)).default([])
});
export type DoctorReport = z.infer<typeof DoctorReportSchema>;

export const ToolCheckSchema = z.object({
  tool: ToolNameSchema,
  checkedAt: z.iso.datetime(),
  findings: z.array(DiagnosticFindingSchema)
});
export type ToolCheck = z.infer<typeof ToolCheckSchema>;

export function severityRank(severity: Severity): number {
  switch (severity) {
    case "info":
      return 0;
    case "warning":
      return 1;
    case "high":
      return 2;
    case "critical":
      return 3;
  }
}
