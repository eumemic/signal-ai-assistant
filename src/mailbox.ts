/**
 * Represents a formatted message ready for delivery to an agent.
 */
export interface FormattedMessage {
  timestamp: string
  senderName: string
  senderPhone: string
  text: string
  /** Optional attachment path (for images/documents) */
  attachmentPath?: string
  /** Optional inline image data for multimodal processing */
  inlineImage?: Buffer
}

/** Callback invoked when the mailbox should wake its agent */
export type WakeCallback = () => void | Promise<void>

/**
 * Mailbox manages message queueing for a single chat (DM or group).
 *
 * Each chat gets its own Mailbox instance that:
 * - Queues incoming messages
 * - Tracks whether the agent is currently busy
 * - Signals the agent to wake when new messages arrive (if not busy)
 * - Delivers all queued messages as a batch when the agent turn starts
 */
export class Mailbox {
  readonly chatId: string
  readonly type: 'dm' | 'group'

  private queue: FormattedMessage[] = []
  private _agentBusy: boolean = false
  private wakeCallback: WakeCallback | null = null

  constructor(chatId: string, type: 'dm' | 'group') {
    this.chatId = chatId
    this.type = type
  }

  /**
   * Returns whether the agent is currently processing a turn.
   */
  get agentBusy(): boolean {
    return this._agentBusy
  }

  /**
   * Returns the current number of messages waiting in the queue.
   */
  get queueLength(): number {
    return this.queue.length
  }

  /**
   * Registers a callback to be invoked when the mailbox wakes the agent.
   */
  onWake(callback: WakeCallback): void {
    this.wakeCallback = callback
  }

  /**
   * Sets the agent busy state.
   * Call with `true` when starting an agent turn, `false` when complete.
   */
  setAgentBusy(busy: boolean): void {
    this._agentBusy = busy
  }

  /**
   * Adds a message to the queue.
   */
  enqueue(message: FormattedMessage): void {
    this.queue.push(message)
  }

  /**
   * Signals the agent to process messages if:
   * - The agent is not currently busy
   * - There are messages in the queue
   *
   * The registered wake callback is invoked synchronously.
   */
  wake(): void {
    if (this._agentBusy) {
      return
    }
    if (this.queue.length === 0) {
      return
    }
    if (this.wakeCallback) {
      this.wakeCallback()
    }
  }

  /**
   * Removes and returns all messages from the queue.
   * Call this at the start of an agent turn to get all pending messages.
   * Returns an empty array if no messages are queued.
   */
  drainQueue(): FormattedMessage[] {
    const messages = this.queue
    this.queue = []
    return messages
  }
}
