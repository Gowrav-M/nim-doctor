# nim-doctor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first TypeScript CLI that diagnoses NVIDIA NIM developer setup, tests OpenAI-compatible endpoints, generates safe config templates, and writes evidence reports.

**Architecture:** The CLI uses Commander for commands, Zod for strict runtime schemas, small core modules for filesystem paths, API calls, diagnostics, config generation, and report rendering. Network calls only run when the user provides `NVIDIA_API_KEY`; demo mode is fully offline using fixtures.

**Tech Stack:** Node 22, TypeScript strict mode, Commander, Zod, Vitest, ESLint, tsx, npm package publishing layout.

---

### Task 1: Repository Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `.github/workflows/ci.yml`

- [ ] Add strict TypeScript package metadata and build scripts.
- [ ] Configure ESLint for typed TypeScript.
- [ ] Add GitHub Actions for install, typecheck, lint, test, and build.

### Task 2: Core Schemas And Filesystem

**Files:**
- Create: `src/core/schemas.ts`
- Create: `src/core/files.ts`
- Create: `src/core/json.ts`

- [ ] Define Zod schemas for models, diagnostics, test results, generated configs, and reports.
- [ ] Implement `.nim-doctor/` workspace paths and JSON read/write helpers.
- [ ] Add schema tests for valid and invalid objects.

### Task 3: NVIDIA Client And Diagnostics

**Files:**
- Create: `src/core/nvidia.ts`
- Create: `src/core/diagnostics.ts`

- [ ] Implement safe OpenAI-compatible client for `/models` and `/chat/completions`.
- [ ] Implement API-key, Node version, writable output, and base URL diagnostics.
- [ ] Redact secrets in all errors and reports.

### Task 4: Config Generation

**Files:**
- Create: `src/config/generators.ts`

- [ ] Generate Cursor, Continue, LiteLLM, CrewAI, LlamaIndex, and OpenCode config templates.
- [ ] Default to writing templates inside `.nim-doctor/generated/`.
- [ ] Avoid modifying real user config unless a target path is explicitly provided.

### Task 5: Report Rendering

**Files:**
- Create: `src/report/render.ts`

- [ ] Render JSON, Markdown, and HTML reports.
- [ ] Include diagnostics, tested models, generated configs, recommendations, and legal/safety caveats.

### Task 6: CLI Commands

**Files:**
- Create: `src/cli.ts`

- [ ] Implement `demo`, `doctor`, `discover`, `test`, `check`, `init`, and `report`.
- [ ] Ensure `demo` works offline from a clean folder.
- [ ] Ensure commands fail clearly and never leak API keys.

### Task 7: Docs And Examples

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Create: `examples/README.md`
- Create: `examples/sample-models.json`

- [ ] Explain the real problem: NVIDIA NIM is powerful but integration is hard to validate.
- [ ] State unofficial NVIDIA relationship and production licensing caveat.
- [ ] Provide one-command demo and realistic command examples.

### Task 8: Verification

**Commands:**
- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `node dist/cli.js demo`
- `npm audit --audit-level=moderate`
- `npm pack --dry-run`

- [ ] Fix failures until all required commands pass.
