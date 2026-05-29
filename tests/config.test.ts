import { describe, expect, it } from "vitest";
import { generateConfig } from "../src/config/generators.js";

describe("config generators", () => {
  it("generates Continue config with NVIDIA provider", () => {
    const config = generateConfig({
      tool: "continue",
      model: "qwen/qwen3-coder-480b-a35b-instruct",
      outputDir: "out"
    });
    expect(config.content).toContain("provider: nvidia");
    expect(config.content).toContain("NVIDIA_API_KEY");
    expect(config.path).toContain("continue-nim-template.yaml");
  });

  it("generates Cursor as a review checklist", () => {
    const config = generateConfig({
      tool: "cursor",
      model: "qwen/qwen3-coder-480b-a35b-instruct",
      outputDir: "out"
    });
    expect(config.content).toContain("Cursor + NVIDIA NIM setup checklist");
    expect(config.content).toContain("not /v1/chat/completions");
  });
});
