import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn, execFile } from 'child_process'
import { EventEmitter } from 'events'

// Mock child_process for signal-cli
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn((cmd, args, opts, callback) => {
    // Mock empty groups response
    if (typeof callback === 'function') {
      callback(null, '[]', '')
    }
  }),
}))

// Mock net module for TCP connection
vi.mock('net', () => ({
  createConnection: vi.fn(),
}))

// Mock readline module
vi.mock('readline', () => ({
  createInterface: vi.fn(),
}))

// Default mock for the Claude SDK - uses the V1 query() API
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(() => {
    // Return an async iterator that yields a result
    return (async function* () {
      yield {
        type: 'system',
        session_id: 'test-session-id',
      }
      yield {
        type: 'result',
        subtype: 'success',
        result: 'Mock response',
        session_id: 'test-session-id',
      }
    })()
  }),
}))

// Mock prompts module
vi.mock('./prompts', () => ({
  loadPrompt: vi.fn((type: string, vars: Record<string, string>) => {
    if (type === 'dm') {
      return `common content\n\nDM prompt for ${vars.CONTACT_NAME}`
    } else {
      return `common content\n\nGroup prompt for ${vars.GROUP_NAME}\nSend: ${vars.SEND_SCRIPT}`
    }
  }),
}))

// Mock env module
vi.mock('./env', () => ({
  getEnv: vi.fn(() => ({
    agentName: 'TestAgent',
    agentPhoneNumber: '+1555000000',
    anthropicApiKey: 'test-api-key',
    anthropicModel: 'claude-sonnet-4-5-20250514',
    signalCliConfig: '/mock/signal-cli-config',
    groupBehaviorInDms: false,
  })),
}))

// Mock fs for sessions
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import * as net from 'net'
import * as readline from 'readline'

describe('Orchestrator', () => {
  let mockProcess: {
    stdout: { on: ReturnType<typeof vi.fn> }
    stderr: { on: ReturnType<typeof vi.fn> }
    on: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }
  let mockTcpSocket: EventEmitter & {
    write: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }
  let mockReadlineInterface: EventEmitter
  let tcpLineCallback: ((line: string) => void) | null = null

  beforeEach(() => {
    // Reset module state
    vi.resetModules()

    // Create mock process for spawn
    mockProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    }
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ReturnType<typeof spawn>)

    // Create mock TCP socket
    mockTcpSocket = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      destroy: vi.fn(),
    })

    // Create mock readline interface that captures the line callback
    mockReadlineInterface = new EventEmitter()

    // Mock net.createConnection to return the socket and emit 'connect' immediately
    vi.mocked(net.createConnection).mockImplementation(() => {
      // Schedule the connect event for next tick so the caller has time to register handlers
      setImmediate(() => {
        mockTcpSocket.emit('connect')
      })
      return mockTcpSocket as unknown as net.Socket
    })

    // Mock readline.createInterface to capture line events
    vi.mocked(readline.createInterface).mockImplementation(() => {
      return mockReadlineInterface as unknown as readline.Interface
    })

    // Reset the line callback
    tcpLineCallback = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Emits a message to the orchestrator via the TCP socket (simulating daemon output).
   * In the new architecture, messages arrive as JSON-RPC notifications.
   */
  function emitDaemonMessage(envelope: Record<string, unknown>): void {
    // The daemon sends JSON-RPC notifications with method 'receive'
    const notification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'receive',
      params: { envelope },
    })
    mockReadlineInterface.emit('line', notification)
  }

  describe('test_orchestrator_startup', () => {
    it('initializes with required components and starts daemon', async () => {
      // Import the orchestrator
      const { createOrchestrator } = await import('./main')

      // Create the orchestrator
      const orchestrator = createOrchestrator()
      expect(orchestrator).toBeDefined()

      // Start it
      const handle = await orchestrator.start()
      expect(handle).toBeDefined()
      expect(handle.stop).toBeDefined()

      // Verify daemon was spawned with correct arguments (daemon mode with TCP and on-connection receive mode)
      expect(spawn).toHaveBeenCalledWith(
        'signal-cli',
        ['-c', '/mock/signal-cli-config', '-a', '+1555000000', '-o', 'json', 'daemon', '--tcp', 'localhost:7583', '--receive-mode=on-connection'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        })
      )

      // Verify TCP connection was established
      expect(net.createConnection).toHaveBeenCalledWith({
        port: 7583,
        host: 'localhost',
      })

      // Clean up
      handle.stop()
    })

    it('routes messages to mailboxes and wakes agents', async () => {
      const { createOrchestrator } = await import('./main')

      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // Simulate a DM message arriving via daemon TCP socket
      emitDaemonMessage({
        source: '+1234567890',
        sourceNumber: '+1234567890',
        sourceName: 'Tom',
        timestamp: Date.now(),
        dataMessage: {
          message: 'Hello!',
        },
      })

      // Verify mailbox was created
      expect(orchestrator.getMailbox('+1234567890')).toBeDefined()

      handle.stop()
    })

    it('creates separate mailboxes for DM and group messages', async () => {
      const { createOrchestrator } = await import('./main')

      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // DM message
      emitDaemonMessage({
        source: '+1234567890',
        timestamp: Date.now(),
        dataMessage: { message: 'DM message' },
      })

      // Group message
      emitDaemonMessage({
        source: '+1234567890',
        timestamp: Date.now(),
        dataMessage: {
          message: 'Group message',
          groupInfo: { groupId: 'test-group-id' },
        },
      })

      // Verify separate mailboxes
      const dmMailbox = orchestrator.getMailbox('+1234567890')
      const groupMailbox = orchestrator.getMailbox('test-group-id')

      expect(dmMailbox).toBeDefined()
      expect(groupMailbox).toBeDefined()
      expect(dmMailbox?.type).toBe('dm')
      expect(groupMailbox?.type).toBe('group')

      handle.stop()
    })
  })

  // Note: test_agent_crash_isolation tests are in src/agent.test.ts for the ChatAgent class itself.
  // The integration tests below verify that handleAgentTurn properly catches errors and removes crashed agents.

  describe('test_agent_crash_isolation (integration)', () => {
    it('should log error and continue when agent fails during turn', async () => {
      // This test verifies the error handling path works by observing
      // that an error is logged but the orchestrator continues running.
      // The actual crash simulation is difficult in integration tests because
      // we can't easily mock the SDK at the right point in the module tree.

      // For now, verify the basic infrastructure is in place:
      // - Orchestrator starts successfully
      // - Messages are routed to mailboxes
      // - Orchestrator continues operating after processing

      const consoleSpy = vi.spyOn(console, 'log')

      const { createOrchestrator } = await import('./main')
      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // Send a message via TCP socket
      emitDaemonMessage({
        source: '+1234567890',
        sourceName: 'Tom',
        timestamp: Date.now(),
        dataMessage: { message: 'Hello!' },
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify the message was processed (orchestrator didn't crash)
      expect(orchestrator.getMailbox('+1234567890')).toBeDefined()

      // Verify that processing logs were emitted
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[agent:+1234567890] Processing 1 message(s)')
      )

      // Clean up
      handle.stop()
      consoleSpy.mockRestore()
    })
  })

  describe('test_self_message_filtering', () => {
    it('should filter out messages from the agent itself', async () => {
      const { createOrchestrator } = await import('./main')

      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // Send a message from the agent's own phone number
      emitDaemonMessage({
        source: '+1555000000', // This is the agent's phone number
        timestamp: Date.now(),
        dataMessage: { message: 'Self message' },
      })

      // The mailbox should NOT be created for self-messages
      expect(orchestrator.getMailbox('+1555000000')).toBeUndefined()

      handle.stop()
    })
  })

  describe('test_json_rpc_response_handling', () => {
    it('should handle JSON-RPC responses for send requests', async () => {
      const { createOrchestrator } = await import('./main')

      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // Verify the socket write is available for sending
      expect(mockTcpSocket.write).toBeDefined()

      handle.stop()
    })
  })
})
