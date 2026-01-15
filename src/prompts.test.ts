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

  describe("prompts/dm.md", () => {
    const dmPromptPath = path.join(process.cwd(), "prompts", "dm.md");

    it("test_dm_prompt_exists", () => {
      expect(fs.existsSync(dmPromptPath)).toBe(true);
    });

    it("contains always respond behavior", () => {
      const content = fs.readFileSync(dmPromptPath, "utf-8");
      expect(content).toMatch(/always\s+respond/i);
    });

    it("contains variable placeholders for contact info", () => {
      const content = fs.readFileSync(dmPromptPath, "utf-8");
      expect(content).toContain("{CONTACT_NAME}");
      expect(content).toContain("{CONTACT_PHONE}");
      expect(content).toContain("{AGENT_PHONE_NUMBER}");
    });

    it("contains send command example", () => {
      const content = fs.readFileSync(dmPromptPath, "utf-8");
      expect(content).toContain("signal-cli");
      expect(content).toContain("send -m");
    });
  });

  describe("prompts/group.md", () => {
    const groupPromptPath = path.join(process.cwd(), "prompts", "group.md");

    it("test_group_prompt_exists", () => {
      expect(fs.existsSync(groupPromptPath)).toBe(true);
    });

    it("contains discretion guidelines", () => {
      const content = fs.readFileSync(groupPromptPath, "utf-8");
      expect(content).toMatch(/respond\s+when/i);
      expect(content).toMatch(/don't\s+respond\s+when|do\s+not\s+respond\s+when/i);
    });

    it("contains pass() tool reference", () => {
      const content = fs.readFileSync(groupPromptPath, "utf-8");
      expect(content).toContain("pass()");
    });

    it("contains example exchanges", () => {
      const content = fs.readFileSync(groupPromptPath, "utf-8");
      // Should have examples showing when to respond and when not to
      expect(content).toMatch(/should\s+respond|example/i);
      expect(content).toMatch(/should\s+not\s+respond|shouldn't\s+respond/i);
    });

    it("contains variable placeholders for group info", () => {
      const content = fs.readFileSync(groupPromptPath, "utf-8");
      expect(content).toContain("{GROUP_NAME}");
      expect(content).toContain("{GROUP_ID}");
      expect(content).toContain("{AGENT_PHONE_NUMBER}");
    });

    it("contains send command example for groups", () => {
      const content = fs.readFileSync(groupPromptPath, "utf-8");
      expect(content).toContain("signal-cli");
      expect(content).toContain("send -m");
      expect(content).toContain("-g"); // group flag
    });
  });
});
