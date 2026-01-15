import * as fs from "fs";
import * as path from "path";

/**
 * Loads and combines prompt files with variable substitution.
 *
 * Combines common.md with the type-specific prompt (dm.md or group.md),
 * then substitutes all {VAR} placeholders with provided values.
 *
 * @param type - The chat type: 'dm' for direct messages, 'group' for group chats
 * @param vars - Key-value pairs for variable substitution (e.g., { CONTACT_NAME: "Alice" })
 * @returns The combined prompt with all variables substituted
 */
export function loadPrompt(
  type: "dm" | "group",
  vars: Record<string, string>
): string {
  const promptsDir = path.join(process.cwd(), "prompts");

  const commonPath = path.join(promptsDir, "common.md");
  const commonContent = fs.readFileSync(commonPath, "utf-8");

  const typeFileName = type === "dm" ? "dm.md" : "group.md";
  const typePath = path.join(promptsDir, typeFileName);
  const typeContent = fs.readFileSync(typePath, "utf-8");

  let combined = `${commonContent}\n\n${typeContent}`;

  for (const [key, value] of Object.entries(vars)) {
    combined = combined.replaceAll(`{${key}}`, value);
  }

  return combined;
}
