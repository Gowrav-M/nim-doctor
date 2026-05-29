# nim-doctor Examples

The examples are safe offline fixtures used by `nim-doctor demo`.

```bash
npx nim-doctor demo
npx nim-doctor discover --offline
npx nim-doctor init continue
npx nim-doctor report
```

For live NVIDIA NIM checks, set your own key locally:

```bash
$env:NVIDIA_API_KEY="nvapi-..."
npx nim-doctor test qwen/qwen3-coder-480b-a35b-instruct --stream --tools
```

Do not commit API keys. Use environment variables or your local secret manager.
