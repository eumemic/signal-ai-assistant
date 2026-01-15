import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn } from 'child_process'
import { parseSignalMessage, createReceiver, type SignalEnvelope, type ParsedMessage, type ReceiverOptions } from './receiver'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

describe('parseSignalMessage', () => {
  describe('chat ID extraction', () => {
    it('uses source phone as chatId for DM messages', () => {
      const envelope: SignalEnvelope = {
        source: '+1234567890',
        sourceNumber: '+1234567890',
        sourceName: 'Tom',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Hello!',
        },
      }

      const result = parseSignalMessage(envelope)

      expect(result?.chatId).toBe('+1234567890')
      expect(result?.chatType).toBe('dm')
    })

    it('uses groupId as chatId for group messages', () => {
      const envelope: SignalEnvelope = {
        source: '+1234567890',
        sourceNumber: '+1234567890',
        sourceName: 'Tom',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Hello group!',
          groupInfo: {
            groupId: 'Z3JvdXBfYWJjMTIz==',
          },
        },
      }

      const result = parseSignalMessage(envelope)

      expect(result?.chatId).toBe('Z3JvdXBfYWJjMTIz==')
      expect(result?.chatType).toBe('group')
      expect(result?.groupId).toBe('Z3JvdXBfYWJjMTIz==')
    })

    it('falls back to source phone when groupInfo exists but groupId is empty', () => {
      const envelope: SignalEnvelope = {
        source: '+1234567890',
        sourceNumber: '+1234567890',
        sourceName: 'Tom',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Edge case',
          groupInfo: { groupId: '' },
        },
      }

      const result = parseSignalMessage(envelope)

      expect(result?.chatId).toBe('+1234567890')
      expect(result?.chatType).toBe('dm')
    })
  })

  it('parses a DM text message', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      dataMessage: {
        message: 'Hello!',
      },
    }

    const result = parseSignalMessage(envelope)

    expect(result).toEqual({
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      text: 'Hello!',
    })
  })

  it('parses a group text message', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      dataMessage: {
        message: 'Hello group!',
        groupInfo: {
          groupId: 'Z3JvdXBfYWJjMTIz==',
        },
      },
    }

    const result = parseSignalMessage(envelope)

    expect(result).toEqual({
      type: 'text',
      chatId: 'Z3JvdXBfYWJjMTIz==',
      chatType: 'group',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      text: 'Hello group!',
      groupId: 'Z3JvdXBfYWJjMTIz==',
    })
  })

  it('returns null for receipt messages', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      timestamp: 1705312245123,
      receiptMessage: {
        type: 'DELIVERY',
      },
    }

    const result = parseSignalMessage(envelope)
    expect(result).toBeNull()
  })

  it('returns null for typing indicators', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      timestamp: 1705312245123,
      typingMessage: {
        action: 'STARTED',
      },
    }

    const result = parseSignalMessage(envelope)
    expect(result).toBeNull()
  })

  it('returns null for empty dataMessage', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      timestamp: 1705312245123,
      dataMessage: {},
    }

    const result = parseSignalMessage(envelope)
    expect(result).toBeNull()
  })

  it('parses reaction messages', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245200,
      dataMessage: {
        reaction: {
          emoji: '👍',
          targetAuthor: '+0987654321',
          targetTimestamp: 1705312245100,
        },
      },
    }

    const result = parseSignalMessage(envelope)

    expect(result).toEqual({
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245200,
      emoji: '👍',
      targetAuthor: '+0987654321',
      targetTimestamp: 1705312245100,
    })
  })

  it('parses group reaction messages', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245200,
      dataMessage: {
        reaction: {
          emoji: '❤️',
          targetAuthor: '+0987654321',
          targetTimestamp: 1705312245100,
        },
        groupInfo: {
          groupId: 'Z3JvdXBfYWJjMTIz==',
        },
      },
    }

    const result = parseSignalMessage(envelope)

    expect(result).toEqual({
      type: 'reaction',
      chatId: 'Z3JvdXBfYWJjMTIz==',
      chatType: 'group',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245200,
      emoji: '❤️',
      targetAuthor: '+0987654321',
      targetTimestamp: 1705312245100,
      groupId: 'Z3JvdXBfYWJjMTIz==',
    })
  })

  it('parses messages with attachments', () => {
    const envelope: SignalEnvelope = {
      source: '+1234567890',
      sourceNumber: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      dataMessage: {
        message: 'Check this out!',
        attachments: [
          {
            contentType: 'image/jpeg',
            filename: 'photo.jpg',
            id: 'abc123',
          },
        ],
      },
    }

    const result = parseSignalMessage(envelope)

    expect(result).toEqual({
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      text: 'Check this out!',
      attachments: [
        {
          contentType: 'image/jpeg',
          filename: 'photo.jpg',
          id: 'abc123',
        },
      ],
    })
  })
})

describe('createReceiver', () => {
  let mockProcess: {
    stdout: { on: ReturnType<typeof vi.fn> }
    stderr: { on: ReturnType<typeof vi.fn> }
    on: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }
  let stdoutCallback: (data: Buffer) => void
  let stderrCallback: (data: Buffer) => void
  let closeCallback: (code: number) => void
  let errorCallback: (error: Error) => void

  beforeEach(() => {
    mockProcess = {
      stdout: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') stdoutCallback = cb
        }),
      },
      stderr: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') stderrCallback = cb
        }),
      },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'close') closeCallback = cb as (code: number) => void
        if (event === 'error') errorCallback = cb as (error: Error) => void
      }),
      kill: vi.fn(),
    }
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ReturnType<typeof spawn>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('spawns signal-cli with correct arguments', () => {
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage: vi.fn(),
    }

    createReceiver(options)

    expect(spawn).toHaveBeenCalledWith(
      'signal-cli',
      ['-a', '+1555123456', 'receive', '-t', '-1', '--json'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
  })

  it('parses JSON lines from stdout and invokes onMessage', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    const jsonLine = JSON.stringify({
      envelope: {
        source: '+1234567890',
        sourceNumber: '+1234567890',
        sourceName: 'Tom',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Hello!',
        },
      },
    })

    stdoutCallback(Buffer.from(jsonLine + '\n'))

    expect(onMessage).toHaveBeenCalledWith({
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705312245123,
      text: 'Hello!',
    })
  })

  it('handles multiple JSON lines in a single chunk', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    const line1 = JSON.stringify({
      envelope: {
        source: '+1111111111',
        timestamp: 1,
        dataMessage: { message: 'First' },
      },
    })
    const line2 = JSON.stringify({
      envelope: {
        source: '+2222222222',
        timestamp: 2,
        dataMessage: { message: 'Second' },
      },
    })

    stdoutCallback(Buffer.from(line1 + '\n' + line2 + '\n'))

    expect(onMessage).toHaveBeenCalledTimes(2)
  })

  it('handles partial lines across chunks', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    const fullJson = JSON.stringify({
      envelope: {
        source: '+1234567890',
        timestamp: 1705312245123,
        dataMessage: { message: 'Hello!' },
      },
    })

    // Send first half
    stdoutCallback(Buffer.from(fullJson.substring(0, 50)))
    expect(onMessage).not.toHaveBeenCalled()

    // Send second half with newline
    stdoutCallback(Buffer.from(fullJson.substring(50) + '\n'))
    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it('skips malformed JSON lines and continues', () => {
    const onMessage = vi.fn()
    const onError = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
      onError,
    }

    createReceiver(options)

    const validJson = JSON.stringify({
      envelope: {
        source: '+1234567890',
        timestamp: 1705312245123,
        dataMessage: { message: 'Hello!' },
      },
    })

    stdoutCallback(Buffer.from('not valid json\n' + validJson + '\n'))

    // Should have been called with the valid message
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('invokes onClose callback when process exits', () => {
    const onClose = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage: vi.fn(),
      onClose,
    }

    createReceiver(options)
    closeCallback(0)

    expect(onClose).toHaveBeenCalledWith(0)
  })

  it('invokes onError callback on process error', () => {
    const onError = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage: vi.fn(),
      onError,
    }

    createReceiver(options)
    errorCallback(new Error('spawn failed'))

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('returns a receiver handle with stop method', () => {
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage: vi.fn(),
    }

    const receiver = createReceiver(options)

    expect(receiver).toHaveProperty('stop')
    expect(typeof receiver.stop).toBe('function')

    receiver.stop()
    expect(mockProcess.kill).toHaveBeenCalled()
  })

  it('filters receipt and typing messages (test_receipt_typing_filtered)', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    // Receipt message should be filtered
    const receiptJson = JSON.stringify({
      envelope: {
        source: '+1234567890',
        timestamp: 1705312245123,
        receiptMessage: { type: 'DELIVERY' },
      },
    })

    stdoutCallback(Buffer.from(receiptJson + '\n'))
    expect(onMessage).not.toHaveBeenCalled()

    // Typing indicator should be filtered
    const typingJson = JSON.stringify({
      envelope: {
        source: '+1234567890',
        timestamp: 1705312245124,
        typingMessage: { action: 'STARTED' },
      },
    })

    stdoutCallback(Buffer.from(typingJson + '\n'))
    expect(onMessage).not.toHaveBeenCalled()

    // Verify a real message still gets through
    const realMessageJson = JSON.stringify({
      envelope: {
        source: '+1234567890',
        timestamp: 1705312245125,
        dataMessage: { message: 'Hello!' },
      },
    })

    stdoutCallback(Buffer.from(realMessageJson + '\n'))
    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it('filters out self-messages (source === agentPhoneNumber)', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    // Message from the agent itself (self-message)
    const selfMessageJson = JSON.stringify({
      envelope: {
        source: '+1555123456', // Same as agentPhoneNumber
        sourceNumber: '+1555123456',
        sourceName: 'Jarvis',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Hello from me!',
        },
      },
    })

    stdoutCallback(Buffer.from(selfMessageJson + '\n'))
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('does not filter messages from other users', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    // Message from a different user
    const otherUserJson = JSON.stringify({
      envelope: {
        source: '+1234567890', // Different from agentPhoneNumber
        sourceNumber: '+1234567890',
        sourceName: 'Tom',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Hello!',
        },
      },
    })

    stdoutCallback(Buffer.from(otherUserJson + '\n'))
    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it('filters self-messages in group chats', () => {
    const onMessage = vi.fn()
    const options: ReceiverOptions = {
      agentPhoneNumber: '+1555123456',
      onMessage,
    }

    createReceiver(options)

    // Self-message in a group
    const selfGroupMessageJson = JSON.stringify({
      envelope: {
        source: '+1555123456', // Same as agentPhoneNumber
        sourceNumber: '+1555123456',
        sourceName: 'Jarvis',
        timestamp: 1705312245123,
        dataMessage: {
          message: 'Hello group from me!',
          groupInfo: {
            groupId: 'Z3JvdXBfYWJjMTIz==',
          },
        },
      },
    })

    stdoutCallback(Buffer.from(selfGroupMessageJson + '\n'))
    expect(onMessage).not.toHaveBeenCalled()
  })
})
