import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("cli", () => {
  it("runs demo from a clean folder and writes reports", async () => {
    const cwd = process.cwd();
    const temp = await mkdtemp(join(tmpdir(), "nim-doctor-demo-"));
    const cli = join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
    const result = await execFileAsync(process.execPath, [cli, "src/cli.ts", "--cwd", temp, "demo"], { cwd });
    expect(result.stdout).toContain("nim-doctor offline demo");
    const report = await readFile(join(temp, ".nim-doctor", "reports", "nim-doctor-report.md"), "utf8");
    expect(report).toContain("nim-doctor Report");
    expect(report).toContain("Generated configs: 2");
  }, 30_000);
});
