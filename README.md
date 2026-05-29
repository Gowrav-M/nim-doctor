# nim-doctor

> Unofficial local-first diagnostic CLI for NVIDIA NIM developer workflows.

NVIDIA NIM gives developers OpenAI-compatible model endpoints, but real setup often fails in boring ways: wrong base URLs, missing API keys, model IDs that do not work in a specific tool, fragile streaming, tool-calling mismatch, and hand-written configs for Cursor, Continue, LiteLLM, CrewAI, LlamaIndex, and OpenCode.

`nim-doctor` is the `brew doctor` style check for that workflow.

```bash
npx nim-doctor demo
```

The demo is offline. It generates local evidence in `.nim-doctor/` without needing an API key.

## What It Solves

- Checks whether your machine is ready to call NVIDIA NIM.
- Uses your own `NVIDIA_API_KEY`; keys are not printed or stored.
- Discovers models through the OpenAI-compatible `/v1/models` endpoint when a key is available.
- Tests a model with `/v1/chat/completions`.
- Optionally checks streaming and tool-calling request compatibility.
- Scans local tool configs for common mistakes like `/chat/completions` inside the base URL.
- Generates reviewable config templates for Cursor, Continue, LiteLLM, CrewAI, LlamaIndex, and OpenCode.
- Writes Markdown, HTML, and JSON reports for sharing with a team.

## Quick Start

```bash
# Offline proof, no key needed
npx nim-doctor demo

# Local machine checks
npx nim-doctor doctor

# Live model discovery, requires NVIDIA_API_KEY
npx nim-doctor discover

# Live endpoint check
npx nim-doctor test qwen/qwen3-coder-480b-a35b-instruct --stream --tools

# Full NIM agent-readiness matrix
npx nim-doctor compat qwen/qwen3-coder-480b-a35b-instruct

# Generate a Continue config template
npx nim-doctor init continue

# Scan an existing Cursor/Continue/LiteLLM style config
npx nim-doctor check cursor

# Render local evidence
npx nim-doctor report
```

On PowerShell:

```powershell
$env:NVIDIA_API_KEY="nvapi-..."
npx nim-doctor test qwen/qwen3-coder-480b-a35b-instruct
```

## Commands

| Command | Purpose |
| --- | --- |
| `demo` | Offline proof run with fixture models, generated configs, and reports |
| `doctor` | Checks Node version, API key presence, base URL shape, and output folder permissions |
| `discover` | Lists live NVIDIA NIM models, or bundled offline fixtures without a key |
| `test <model>` | Runs a live chat completion health check |
| `compat <model>` | Tests chat, streaming, tools, streaming tools, and JSON mode for agent readiness |
| `check <tool>` | Scans local config files for known NIM integration mistakes |
| `init <tool>` | Writes reviewable config templates under `.nim-doctor/generated/` |
| `report` | Writes JSON, Markdown, and HTML evidence reports |

## Example Output

```text
doctor
------
[PASS] Node.js version: Node 22.22.0 is supported.
[PASS] NVIDIA API key: NVIDIA_API_KEY is set locally. The value is not printed or stored.
[PASS] NVIDIA base URL: Using base URL https://integrate.api.nvidia.com/v1.
[PASS] Output folder writable: .nim-doctor output folder is writable.
```

## Why Not Just Use LiteLLM?

LiteLLM is a router/proxy. `nim-doctor` is a diagnostic and setup tool.

| Tool | Good At | Gap |
| --- | --- | --- |
| LiteLLM | Proxying and routing many providers | Does not inspect your local Cursor/Continue setup |
| NVIDIA Build UI | Trying models in the browser | Does not generate local agent-tool configs |
| Web status pages | Showing model availability | Not local-first, no project report |
| `nim-doctor` | Local checks, endpoint tests, config templates, evidence reports | Not a production proxy |

Research notes: [docs/research.md](docs/research.md)

## Safety And Legal Notes

`nim-doctor` is an unofficial community tool. It is not affiliated with, endorsed by, or sponsored by NVIDIA.

Use of NVIDIA APIs, hosted endpoints, downloadable NIMs, model outputs, and production deployments is governed by NVIDIA's own terms. Developer or trial access should be treated as development, testing, and evaluation access unless you have the proper production subscription or license.

This project does not:

- bypass authentication or rate limits
- scrape NVIDIA services aggressively
- redistribute NVIDIA models
- claim official NVIDIA status
- store your API key in reports

## Local Files

`nim-doctor` writes all artifacts under your current folder:

```text
.nim-doctor/
  cache/
    diagnostics.json
    generated-configs.json
    model-tests.json
    models.json
  generated/
    continue-nim-template.yaml
    litellm-nim-template.yaml
  reports/
    nim-compatibility-matrix.json
    nim-compatibility-matrix.md
    nim-doctor-report.json
    nim-doctor-report.md
    nim-doctor-report.html
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
node dist/cli.js demo
```

## License

MIT
