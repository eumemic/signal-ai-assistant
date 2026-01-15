import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Allows the agent to explicitly pass without responding.
 * Essential for group chat discretion when observing conversations
 * that don't require agent input.
 */
export const passTool = tool(
  "pass",
  "Explicitly do nothing this turn. Use when observing messages but choosing not to engage.",
  { reason: z.string().optional().describe("Why you are passing") },
  async function ({ reason }) {
    const message = reason?.trim() || "No reason given";
    console.log(`[pass] ${message}`);
    return { content: [{ type: "text", text: "Acknowledged - no action taken." }] };
  }
);
