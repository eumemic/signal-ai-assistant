import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("prompts", () => {
  describe("prompts/common.md", () => {
    const commonPromptPath = path.join(
      process.cwd(),
      "prompts",
      "common.md"
    );

    it("test_common_prompt_exists", () => {
      expect(fs.existsSync(commonPromptPath)).toBe(true);
    });

    it("contains Jarvis identity", () => {
      const content = fs.readFileSync(commonPromptPath, "utf-8");
      expect(content).toContain("Jarvis");
      expect(content).toContain("family assistant");
    });

    it("contains personality traits", () => {
      const content = fs.readFileSync(commonPromptPath, "utf-8");
      expect(content).toContain("Helpful but not intrusive");
      expect(content).toContain("Warm and friendly");
      expect(content).toContain("Knowledgeable but humble");
      expect(content).toContain("Proactive when genuinely useful");
    });

    it("contains signal-cli instructions", () => {
      const content = fs.readFileSync(commonPromptPath, "utf-8");
      expect(content).toContain("signal-cli");
      expect(content).toContain("{AGENT_PHONE_NUMBER}");
      expect(content).toContain("send -m");
      expect(content).toContain("sendReaction");
    });

    it("contains constraint about not running signal-cli receive", () => {
      const content = fs.readFileSync(commonPromptPath, "utf-8");
      expect(content).toContain("signal-cli receive");
      expect(content).toMatch(/do\s+not|don't|NOT/i);
    });

    it("contains constraint about isolated conversation access", () => {
      const content = fs.readFileSync(commonPromptPath, "utf-8");
      expect(content).toContain("only see this conversation");
    });
  });
});
