import { spawn, ChildProcess } from 'child_process'
import * as net from 'net'
import * as readline from 'readline'
import { getEnv } from './env.js'
import { parseSignalMessage, ParsedMessage } from './receiver.js'
import { Mailbox, FormattedMessage, formatBatchForDelivery } from './mailbox.js'
import { ChatAgent, ChatAgentConfig } from './agent.js'
import { SessionStore } from './sessions.js'
import { createGroupCache, GroupCache } from './groups.js'
import { formatReactionMessage, formatTimestamp } from './format.js'

const DAEMON_PORT = 7583

/**
 * Handle for controlling the orchestrator.
 */
export interface OrchestratorHandle {
  /** Stops the orchestrator gracefully */
  stop: () => void
}

/**
 * The orchestrator coordinates all components of the Signal AI assistant:
 * - Daemon: signal-cli daemon process for both receiving and sending
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
 * JSON-RPC request structure
 */
interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
  id: number
}

/**
 * JSON-RPC response structure
 */
interface JsonRpcResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: { code: number; message: string }
  id: number
}

/**
 * Creates the orchestrator that coordinates daemon, mailboxes, and agents.
 */
export function createOrchestrator(): Orchestrator {
  const env = getEnv()
  const { agentPhoneNumber, anthropicModel, signalCliConfig, groupBehaviorInDms } = env

  // State
  const mailboxes = new Map<string, Mailbox>()
  const agents = new Map<string, ChatAgent>()
  const agentCooldowns = new Map<string, number>() // chatId -> cooldown end timestamp
  const chatMetadata = new Map<string, { contactName?: string; groupName?: string }>() // chatId -> metadata
  const AGENT_COOLDOWN_MS = 30000 // 30 second cooldown after agent errors
  let sessionStore: SessionStore
  let groupCache: GroupCache
  let daemonProcess: ChildProcess | null = null
  let rpcIdCounter = 1
  const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let tcpClient: net.Socket | null = null

  /**
   * Fetches group member list from the daemon via listGroups RPC.
   * Returns array of member identifiers (phone numbers or UUIDs).
   */
  async function fetchGroupMembers(groupId: string): Promise<string[]> {
    try {
      const result = await sendRpcRequest('listGroups') as Array<{
        id: string
        members?: Array<{ number?: string; uuid?: string }>
      }>

      const group = result.find(g => g.id === groupId)
      if (!group || !group.members) return []

      return group.members.map(m => m.number || m.uuid || 'unknown')
    } catch (error) {
      console.error(`[orchestrator] Failed to fetch group members for ${groupId}:`, error)
      return []
    }
  }

  /**
   * Sends a JSON-RPC request to the daemon and waits for response.
   */
  async function sendRpcRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!tcpClient) {
      throw new Error('TCP client not connected')
    }

    const id = rpcIdCounter++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    }

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject })
      tcpClient!.write(JSON.stringify(request) + '\n')

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id)
          reject(new Error(`RPC request ${method} timed out`))
        }
      }, 30000)
    })
  }

  /**
   * Handles incoming JSON-RPC responses and notifications from daemon.
   */
  function handleDaemonMessage(line: string): void {
    if (!line.trim()) return

    try {
      const json = JSON.parse(line)

      // Check if it's a response to a request we made
      if (json.id !== undefined && pendingRequests.has(json.id)) {
        const { resolve, reject } = pendingRequests.get(json.id)!
        pendingRequests.delete(json.id)

        if (json.error) {
          reject(new Error(`RPC error: ${json.error.message}`))
        } else {
          resolve(json.result)
        }
        return
      }

      // Otherwise it's a notification (incoming message)
      if (json.method === 'receive' && json.params?.envelope) {
        // Filter out self-messages
        if (json.params.envelope.source === agentPhoneNumber) {
          return
        }

        const parsed = parseSignalMessage(json.params.envelope)
        if (parsed) {
          handleMessage(parsed)
        }
      }
    } catch (error) {
      console.error('[daemon] Failed to parse message:', error)
    }
  }

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
        useGroupBehavior: groupBehaviorInDms,
      }
    } else {
      // Resolve group name if not provided
      const groupName = metadata.groupName || (await groupCache.getNameWithRefresh(chatId))
      // Fetch group members for the system prompt
      const groupMembers = await fetchGroupMembers(chatId)
      config = {
        chatId,
        type: 'group',
        groupId: metadata.groupId || chatId,
        groupName,
        groupMembers,
        agentPhoneNumber,
        anthropicModel,
        existingSessionId: existingSession?.sessionId,
      }
    }

    agent = new ChatAgent(config)
    await agent.initialize()

    // Save the session only if we have a session ID
    // For new sessions, sessionId is only available after first message exchange
    const sessionId = agent.sessionId
    if (sessionId) {
      sessionStore.saveSession(chatId, {
        type,
        sessionId,
        lastActive: new Date().toISOString(),
      })
    }

    agents.set(chatId, agent)
    if (existingSession) {
      console.log(`[orchestrator] Resumed ${type} agent for ${chatId} (session: ${existingSession.sessionId.substring(0, 20)}...)`)
    } else {
      console.log(`[orchestrator] Created new ${type} agent for ${chatId}`)
    }
    return agent
  }

  /**
   * Removes an agent from the map, closing it if it exists.
   * This allows the agent to be recreated fresh on the next message.
   */
  function removeAgent(chatId: string): void {
    const agent = agents.get(chatId)
    if (agent) {
      agent.close()
      agents.delete(chatId)
      // Also remove the stored session so a fresh one is created
      sessionStore.removeSession(chatId)
    }
  }

  /**
   * Sends a message via signal-cli daemon JSON-RPC.
   */
  async function sendSignalMessage(chatId: string, chatType: 'dm' | 'group', message: string): Promise<void> {
    console.log(`[orchestrator] Sending message to ${chatId}...`)

    try {
      const params: Record<string, unknown> = {
        message,
      }

      if (chatType === 'group') {
        params.groupId = chatId
      } else {
        params.recipient = [chatId]
      }

      await sendRpcRequest('send', params)
      console.log(`[orchestrator] Sent message to ${chatId}`)
    } catch (error) {
      console.error(`[orchestrator] Failed to send message to ${chatId}:`, error)
      throw error
    }
  }

  /**
   * Handles an agent turn for a mailbox.
   *
   * Implements crash isolation: errors are logged but don't crash the orchestrator.
   * On error, the agent is removed and a cooldown is set to prevent rapid retry loops.
   */
  async function handleAgentTurn(chatId: string, mailbox: Mailbox): Promise<void> {
    // Check if agent is in cooldown period after an error
    const cooldownEnd = agentCooldowns.get(chatId)
    if (cooldownEnd && Date.now() < cooldownEnd) {
      const remainingSeconds = Math.ceil((cooldownEnd - Date.now()) / 1000)
      console.log(`[agent:${chatId}] In cooldown for ${remainingSeconds}s, skipping turn`)
      return
    }
    agentCooldowns.delete(chatId) // Clear expired cooldown

    // Mark agent as busy
    mailbox.setAgentBusy(true)

    let hadError = false
    try {
      // Get or create the agent BEFORE draining messages
      // This ensures messages aren't lost if agent creation fails
      // Pass stored metadata (contact/group name) to avoid blocking signal-cli calls
      const metadata = chatMetadata.get(chatId) || {}
      const agent = await getOrCreateAgent(chatId, mailbox.type, {
        contactPhone: chatId, // For DMs, chatId is the phone number
        contactName: metadata.contactName,
        groupId: chatId, // For groups, chatId is the groupId
        groupName: metadata.groupName,
      })

      // Drain all pending messages
      const messages = mailbox.drainQueue()
      if (messages.length === 0) {
        return
      }

      console.log(`[agent:${chatId}] Processing ${messages.length} message(s)`)

      // Format messages for delivery
      const batchText = formatBatchForDelivery(messages)
      console.log(`[agent:${chatId}] Batch:\n${batchText}`)

      // Run the agent turn with the batched messages
      const result = await agent.runTurn(batchText)

      if (result.timedOut) {
        console.log(`[agent:${chatId}] Turn timed out, no response sent`)
      } else if (result.response) {
        console.log(`[agent:${chatId}] Response:\n${result.response}`)

        // Determine if we should auto-send the response
        // - DMs: auto-send (unless groupBehaviorInDms is enabled for testing)
        // - Groups: do NOT auto-send (agent must call signal-cli explicitly)
        const isGroupBehavior = mailbox.type === 'group' || groupBehaviorInDms

        if (isGroupBehavior) {
          console.log(`[agent:${chatId}] Group behavior: response not auto-sent (agent must use signal-cli)`)
        } else {
          // DM behavior: auto-send the response
          await sendSignalMessage(chatId, mailbox.type, result.response)
        }
      } else {
        console.log(`[agent:${chatId}] No response from agent`)
      }

      // Save session after turn completes (session ID only available after first exchange)
      const sessionId = agent.sessionId
      if (sessionId) {
        sessionStore.saveSession(chatId, {
          type: mailbox.type,
          sessionId,
          lastActive: new Date().toISOString(),
        })
      }

    } catch (error) {
      hadError = true
      console.error(`[agent:${chatId}] Error during turn:`, error)
      // Remove the crashed agent so it gets recreated on next message
      removeAgent(chatId)
      // Set cooldown to prevent rapid retry loops
      agentCooldowns.set(chatId, Date.now() + AGENT_COOLDOWN_MS)
      console.log(`[agent:${chatId}] Entering ${AGENT_COOLDOWN_MS / 1000}s cooldown`)
    } finally {
      // Mark agent as no longer busy
      mailbox.setAgentBusy(false)

      // Only process pending messages if we didn't have an error
      // (if we had an error, we're in cooldown and shouldn't immediately retry)
      if (!hadError && mailbox.queueLength > 0) {
        mailbox.wake()
      }
    }
  }

  /**
   * Converts a ParsedMessage to a FormattedMessage.
   */
  function formatMessage(parsed: ParsedMessage): FormattedMessage {
    const timestamp = formatTimestamp(parsed.timestamp)
    const rawTimestamp = parsed.timestamp
    const senderName = parsed.sourceName || parsed.source
    const senderPhone = parsed.source

    if (parsed.type === 'text') {
      // Build text, starting with quote context if this is a reply
      let text = ''

      if (parsed.quote) {
        const quoteAuthor = parsed.quote.targetAuthor
        text += `(replying to msg@${parsed.quote.targetTimestamp} from ${quoteAuthor}`
        if (parsed.quote.text) {
          text += `: "${parsed.quote.text}"`
        }
        text += ') '
      }

      text += parsed.text

      // Append attachment paths so agent can view them with Read tool
      // signal-cli downloads attachments to {configDir}/attachments/{id}
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const attachment of parsed.attachments) {
          // Construct path: signal-cli stores attachments at {configDir}/attachments/{id}
          const attachmentPath = signalCliConfig
            ? `${signalCliConfig}/attachments/${attachment.id}`
            : null

          if (attachmentPath) {
            const isImage = attachment.contentType.startsWith('image/')
            const typeLabel = isImage ? 'Image' : 'Attachment'
            text += `\n[${typeLabel}: ${attachmentPath}]`
          }
        }
      }

      return {
        timestamp,
        rawTimestamp,
        senderName,
        senderPhone,
        text,
      }
    }

    // Reaction message
    const reactionText = formatReactionMessage(parsed)
    return {
      timestamp,
      rawTimestamp,
      senderName,
      senderPhone,
      text: reactionText,
    }
  }

  /**
   * Handles an incoming message from the receiver.
   */
  function handleMessage(message: ParsedMessage): void {
    console.log(`[receiver] Message from ${message.sourceName || message.source} in ${message.chatId} (${message.chatType})`)

    // Store metadata for this chat (contact name for DMs, group name for groups)
    // This avoids needing to call signal-cli later to look up names
    if (message.chatType === 'dm' && message.sourceName) {
      chatMetadata.set(message.chatId, { contactName: message.sourceName })
    } else if (message.chatType === 'group' && message.groupName) {
      chatMetadata.set(message.chatId, { groupName: message.groupName })
    }

    // Get or create mailbox
    const mailbox = getOrCreateMailbox(message.chatId, message.chatType)

    // Format and enqueue the message
    const formatted = formatMessage(message)
    mailbox.enqueue(formatted)

    // Wake the agent
    mailbox.wake()
  }

  /**
   * Starts the signal-cli daemon and connects to it.
   */
  async function startDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build daemon args
      const args: string[] = []
      if (signalCliConfig) {
        args.push('-c', signalCliConfig)
      }
      // Use --receive-mode=on-connection so pending messages are delivered AFTER we connect
      // (default is on-start, which delivers messages before TCP client connects, losing them)
      args.push('-a', agentPhoneNumber, '-o', 'json', 'daemon', '--tcp', `localhost:${DAEMON_PORT}`, '--receive-mode=on-connection')

      // Use full path to signal-cli (not in PATH to discourage agent from using it directly)
      const signalCliBin = '/opt/signal-cli-0.13.22/bin/signal-cli'
      console.log(`[daemon] Starting signal-cli daemon: ${signalCliBin} ${args.join(' ')}`)
      daemonProcess = spawn(signalCliBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      // Handle daemon stdout (JSON-RPC responses/notifications come here in some versions)
      daemonProcess.stdout!.on('data', (data: Buffer) => {
        const text = data.toString().trim()
        if (text) {
          console.log(`[daemon stdout] ${text}`)
        }
      })

      // Handle daemon stderr (startup messages, errors)
      daemonProcess.stderr!.on('data', (data: Buffer) => {
        const text = data.toString().trim()
        if (text) {
          console.log(`[daemon stderr] ${text}`)
        }
      })

      daemonProcess.on('error', (error) => {
        console.error('[daemon] Process error:', error)
        reject(error)
      })

      daemonProcess.on('close', (code) => {
        console.log(`[daemon] Process exited with code ${code}`)
      })

      // Connect to the daemon with retries (daemon may take a few seconds to start)
      connectToDaemon()
        .then(resolve)
        .catch(reject)
    })
  }

  /**
   * Connects to the daemon's TCP JSON-RPC interface with retry logic.
   */
  async function connectToDaemon(maxRetries = 30, retryDelayMs = 1000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await tryConnect()
        return
      } catch (error) {
        if (attempt === maxRetries) {
          throw error
        }
        console.log(`[daemon] Connection attempt ${attempt} failed, retrying in ${retryDelayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  /**
   * Single connection attempt to the daemon.
   */
  function tryConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[daemon] Connecting to TCP port ${DAEMON_PORT}...`)

      const client = net.createConnection({ port: DAEMON_PORT, host: 'localhost' })

      client.on('connect', () => {
        console.log(`[daemon] Connected to TCP port ${DAEMON_PORT}`)
        tcpClient = client

        // Handle incoming data line by line
        const rl = readline.createInterface({ input: tcpClient })
        rl.on('line', handleDaemonMessage)

        tcpClient.on('close', () => {
          console.log('[daemon] TCP connection closed')
        })

        resolve()
      })

      client.on('error', (error) => {
        client.destroy()
        reject(error)
      })
    })
  }

  return {
    async start(): Promise<OrchestratorHandle> {
      console.log(`Starting ${env.agentName} agent...`)

      // Initialize session store
      sessionStore = new SessionStore()

      // Initialize group cache (but don't load yet - daemon isn't running)
      groupCache = createGroupCache(agentPhoneNumber, signalCliConfig)

      // Start the daemon and connect to it
      await startDaemon()

      // Now load group cache
      await groupCache.load()

      console.log(`[orchestrator] Started daemon for ${agentPhoneNumber}`)

      return {
        stop: () => {
          console.log('[orchestrator] Stopping...')

          // Close TCP connection
          if (tcpClient) {
            tcpClient.destroy()
            tcpClient = null
          }

          // Kill daemon process
          if (daemonProcess) {
            daemonProcess.kill()
            daemonProcess = null
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
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch(console.error)
}
