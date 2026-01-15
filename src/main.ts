import { getEnv } from './env'
import { createResilientReceiver, ParsedMessage, ReceiverHandle } from './receiver'
import { Mailbox, FormattedMessage, formatBatchForDelivery } from './mailbox'
import { ChatAgent, ChatAgentConfig } from './agent'
import { SessionStore } from './sessions'
import { createGroupCache, GroupCache } from './groups'
import { formatReactionMessage, formatTimestamp } from './format'

/**
 * Handle for controlling the orchestrator.
 */
export interface OrchestratorHandle {
  /** Stops the orchestrator gracefully */
  stop: () => void
}

/**
 * The orchestrator coordinates all components of the Signal AI assistant:
 * - Receiver: listens for incoming Signal messages
 * - Mailboxes: queue messages per chat (DM or group)
 * - Agents: Claude SDK agents, one per chat with isolated context
 * - Sessions: persist agent sessions across restarts
 * - Groups: resolve group IDs to names
 */
export interface Orchestrator {
  /** Starts the orchestrator and returns a handle to control it */
  start(): Promise<OrchestratorHandle>
  /** Gets a mailbox by chat ID (for testing/inspection) */
  getMailbox(chatId: string): Mailbox | undefined
  /** Gets an agent by chat ID (for testing/inspection) */
  getAgent(chatId: string): ChatAgent | undefined
}

/**
 * Creates the orchestrator that coordinates receiver, mailboxes, and agents.
 */
export function createOrchestrator(): Orchestrator {
  const env = getEnv()
  const { agentPhoneNumber, anthropicModel } = env

  // State
  const mailboxes = new Map<string, Mailbox>()
  const agents = new Map<string, ChatAgent>()
  let sessionStore: SessionStore
  let groupCache: GroupCache
  let receiver: ReceiverHandle | null = null

  /**
   * Gets or creates a mailbox for a chat.
   */
  function getOrCreateMailbox(chatId: string, type: 'dm' | 'group'): Mailbox {
    let mailbox = mailboxes.get(chatId)
    if (!mailbox) {
      mailbox = new Mailbox(chatId, type)
      mailboxes.set(chatId, mailbox)

      // Set up wake callback to process messages
      mailbox.onWake(async () => {
        await handleAgentTurn(chatId, mailbox!)
      })
    }
    return mailbox
  }

  /**
   * Gets or creates an agent for a chat.
   */
  async function getOrCreateAgent(
    chatId: string,
    type: 'dm' | 'group',
    metadata: { contactPhone?: string; contactName?: string; groupId?: string; groupName?: string }
  ): Promise<ChatAgent> {
    let agent = agents.get(chatId)
    if (agent) {
      return agent
    }

    // Check for existing session
    const existingSession = sessionStore.getSession(chatId)

    // Build agent config
    let config: ChatAgentConfig
    if (type === 'dm') {
      config = {
        chatId,
        type: 'dm',
        contactPhone: metadata.contactPhone || chatId,
        contactName: metadata.contactName,
        agentPhoneNumber,
        anthropicModel,
        existingSessionId: existingSession?.sessionId,
      }
    } else {
      // Resolve group name if not provided
      const groupName = metadata.groupName || (await groupCache.getNameWithRefresh(chatId))
      config = {
        chatId,
        type: 'group',
        groupId: metadata.groupId || chatId,
        groupName,
        agentPhoneNumber,
        anthropicModel,
        existingSessionId: existingSession?.sessionId,
      }
    }

    agent = new ChatAgent(config)
    await agent.initialize()

    // Save the session
    sessionStore.saveSession(chatId, {
      type,
      sessionId: agent.sessionId,
      lastActive: new Date().toISOString(),
    })

    agents.set(chatId, agent)
    console.log(`[orchestrator] Created ${type} agent for ${chatId}`)
    return agent
  }

  /**
   * Handles an agent turn for a mailbox.
   */
  async function handleAgentTurn(chatId: string, mailbox: Mailbox): Promise<void> {
    // Mark agent as busy
    mailbox.setAgentBusy(true)

    try {
      // Drain all pending messages
      const messages = mailbox.drainQueue()
      if (messages.length === 0) {
        return
      }

      console.log(`[agent:${chatId}] Processing ${messages.length} message(s)`)

      // Get or create the agent
      const agent = await getOrCreateAgent(chatId, mailbox.type, {})

      // Format messages for delivery
      const batchText = formatBatchForDelivery(messages)
      console.log(`[agent:${chatId}] Batch:\n${batchText}`)

      // TODO: Send batch to agent and process response
      // For now, just log that we would process it
      // This will be enhanced when we integrate the full SDK query API

    } catch (error) {
      console.error(`[agent:${chatId}] Error during turn:`, error)
    } finally {
      // Mark agent as no longer busy
      mailbox.setAgentBusy(false)

      // Check if more messages arrived while processing
      if (mailbox.queueLength > 0) {
        mailbox.wake()
      }
    }
  }

  /**
   * Converts a ParsedMessage to a FormattedMessage.
   */
  function formatMessage(parsed: ParsedMessage): FormattedMessage {
    const timestamp = formatTimestamp(parsed.timestamp)
    const senderName = parsed.sourceName || parsed.source
    const senderPhone = parsed.source

    if (parsed.type === 'text') {
      return {
        timestamp,
        senderName,
        senderPhone,
        text: parsed.text,
      }
    }

    // Reaction message
    const reactionText = formatReactionMessage(parsed)
    return {
      timestamp,
      senderName,
      senderPhone,
      text: reactionText,
    }
  }

  /**
   * Handles an incoming message from the receiver.
   */
  function handleMessage(message: ParsedMessage): void {
    console.log(`[receiver] Message from ${message.sourceName || message.source} in ${message.chatId}`)

    // Get or create mailbox
    const mailbox = getOrCreateMailbox(message.chatId, message.chatType)

    // Format and enqueue the message
    const formatted = formatMessage(message)
    mailbox.enqueue(formatted)

    // Wake the agent
    mailbox.wake()
  }

  return {
    async start(): Promise<OrchestratorHandle> {
      console.log(`Starting ${env.agentName} agent...`)

      // Initialize session store
      sessionStore = new SessionStore()

      // Initialize and load group cache
      groupCache = createGroupCache(agentPhoneNumber)
      await groupCache.load()

      // Start the resilient receiver (auto-restarts with exponential backoff)
      receiver = createResilientReceiver({
        agentPhoneNumber,
        onMessage: handleMessage,
        onClose: (code) => {
          console.log(`[receiver] Process exited with code ${code}, will restart with backoff`)
        },
        onError: (error) => {
          console.error(`[receiver] Error:`, error.message)
        },
      })

      console.log(`[orchestrator] Started receiver for ${agentPhoneNumber}`)

      return {
        stop: () => {
          console.log('[orchestrator] Stopping...')
          if (receiver) {
            receiver.stop()
            receiver = null
          }
          // Close all agents
          for (const agent of agents.values()) {
            agent.close()
          }
          agents.clear()
          console.log('[orchestrator] Stopped')
        },
      }
    },

    getMailbox(chatId: string): Mailbox | undefined {
      return mailboxes.get(chatId)
    },

    getAgent(chatId: string): ChatAgent | undefined {
      return agents.get(chatId)
    },
  }
}

// Main entry point when run directly
async function main() {
  const orchestrator = createOrchestrator()
  const handle = await orchestrator.start()

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[main] Received SIGINT, shutting down...')
    handle.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('[main] Received SIGTERM, shutting down...')
    handle.stop()
    process.exit(0)
  })
}

// Only run main() when executed directly (not when imported as a module)
if (require.main === module) {
  main().catch(console.error)
}
