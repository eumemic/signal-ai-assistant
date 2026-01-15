import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk'

/**
 * Creates a tool validation callback that prevents agents from running
 * `signal-cli receive`, which would conflict with the orchestrator's
 * single receiver loop.
 *
 * All other commands and tools are allowed.
 */
export function createToolValidator(): CanUseTool {
  return async (toolName, input) => {
    if (toolName !== 'Bash') {
      return { behavior: 'allow', updatedInput: input }
    }

    const command = input.command
    if (typeof command !== 'string') {
      return { behavior: 'allow', updatedInput: input }
    }

    const isSignalReceive = command.includes('signal-cli') && command.includes('receive')
    if (isSignalReceive) {
      return {
        behavior: 'deny',
        message:
          'signal-cli receive is managed by the system. Messages are automatically delivered to your context.',
      }
    }

    return { behavior: 'allow', updatedInput: input }
  }
}
