import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { loadPrompt } from "./prompts";

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

  describe("loadPrompt", () => {
    it("test_prompt_variable_substitution", () => {
      // Test DM prompt with variable substitution
      const dmPrompt = loadPrompt("dm", {
        AGENT_PHONE_NUMBER: "+1555123456",
        CONTACT_NAME: "Alice",
        CONTACT_PHONE: "+1555987654",
      });

      // Should contain common.md content
      expect(dmPrompt).toContain("Jarvis");
      expect(dmPrompt).toContain("family assistant");

      // Should contain dm.md content
      expect(dmPrompt).toMatch(/always\s+respond/i);

      // Variables should be substituted
      expect(dmPrompt).toContain("+1555123456");
      expect(dmPrompt).toContain("Alice");
      expect(dmPrompt).toContain("+1555987654");

      // No unsubstituted placeholders should remain
      expect(dmPrompt).not.toContain("{AGENT_PHONE_NUMBER}");
      expect(dmPrompt).not.toContain("{CONTACT_NAME}");
      expect(dmPrompt).not.toContain("{CONTACT_PHONE}");
    });

    it("substitutes group prompt variables", () => {
      const groupPrompt = loadPrompt("group", {
        AGENT_PHONE_NUMBER: "+1555123456",
        GROUP_NAME: "Family Chat",
        GROUP_ID: "abc123groupid==",
      });

      // Should contain common.md content
      expect(groupPrompt).toContain("Jarvis");

      // Should contain group.md content
      expect(groupPrompt).toContain("pass()");

      // Variables should be substituted
      expect(groupPrompt).toContain("+1555123456");
      expect(groupPrompt).toContain("Family Chat");
      expect(groupPrompt).toContain("abc123groupid==");

      // No unsubstituted placeholders should remain
      expect(groupPrompt).not.toContain("{AGENT_PHONE_NUMBER}");
      expect(groupPrompt).not.toContain("{GROUP_NAME}");
      expect(groupPrompt).not.toContain("{GROUP_ID}");
    });

    it("combines common and type-specific prompts", () => {
      const dmPrompt = loadPrompt("dm", {
        AGENT_PHONE_NUMBER: "+1555123456",
        CONTACT_NAME: "Bob",
        CONTACT_PHONE: "+1555111222",
      });

      // Common content should appear first (or be present)
      expect(dmPrompt).toContain("Jarvis");
      expect(dmPrompt).toContain("Signal Operations");

      // DM-specific content should also be present
      expect(dmPrompt).toContain("chatting directly with");
    });

    it("handles special regex characters in variable values", () => {
      const dmPrompt = loadPrompt("dm", {
        AGENT_PHONE_NUMBER: "+1555123456",
        CONTACT_NAME: "Test $User (Special)",
        CONTACT_PHONE: "+1555111222",
      });

      // Special characters should be preserved
      expect(dmPrompt).toContain("Test $User (Special)");
    });
  });
});
