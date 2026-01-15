import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("SDK Dependency Installation", () => {
  let packageJson: { dependencies?: Record<string, string> };

  beforeAll(() => {
    const packageJsonPath = path.join(__dirname, "package.json");
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  });

  it("should have @anthropic-ai/claude-agent-sdk installed", () => {
    expect(packageJson.dependencies).toHaveProperty(
      "@anthropic-ai/claude-agent-sdk"
    );
  });

  it("should not have langchain installed", () => {
    expect(packageJson.dependencies).not.toHaveProperty("langchain");
  });

  it("should be able to import the SDK", async () => {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    expect(sdk).toBeDefined();
  });
});
