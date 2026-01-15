import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn, execFile } from 'child_process'

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

// Mock the Claude SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  unstable_v2_createSession: vi.fn(() => ({
    sessionId: 'test-session-id',
    close: vi.fn(),
  })),
  unstable_v2_resumeSession: vi.fn(() => ({
    sessionId: 'resumed-session-id',
    close: vi.fn(),
  })),
}))

// Mock env module
vi.mock('./env', () => ({
  getEnv: vi.fn(() => ({
    agentName: 'TestAgent',
    agentPhoneNumber: '+1555000000',
    anthropicApiKey: 'test-api-key',
    anthropicModel: 'claude-sonnet-4-5-20250514',
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

describe('Orchestrator', () => {
  let mockProcess: {
    stdout: { on: ReturnType<typeof vi.fn> }
    stderr: { on: ReturnType<typeof vi.fn> }
    on: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }
  let stdoutCallback: (data: Buffer) => void

  beforeEach(() => {
    mockProcess = {
      stdout: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') stdoutCallback = cb
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    }
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ReturnType<typeof spawn>)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('test_orchestrator_startup', () => {
    it('initializes with required components and starts receiver', async () => {
      // Import the orchestrator
      const { createOrchestrator } = await import('./main')

      // Create the orchestrator
      const orchestrator = createOrchestrator()
      expect(orchestrator).toBeDefined()

      // Start it
      const handle = await orchestrator.start()
      expect(handle).toBeDefined()
      expect(handle.stop).toBeDefined()

      // Verify receiver was spawned with correct arguments
      expect(spawn).toHaveBeenCalledWith(
        'signal-cli',
        ['-a', '+1555000000', 'receive', '-t', '-1', '--json'],
        expect.any(Object)
      )

      // Clean up
      handle.stop()
    })

    it('routes messages to mailboxes and wakes agents', async () => {
      const { createOrchestrator } = await import('./main')

      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // Simulate a DM message arriving
      const dmMessage = JSON.stringify({
        envelope: {
          source: '+1234567890',
          sourceNumber: '+1234567890',
          sourceName: 'Tom',
          timestamp: Date.now(),
          dataMessage: {
            message: 'Hello!',
          },
        },
      })

      stdoutCallback(Buffer.from(dmMessage + '\n'))

      // Verify mailbox was created
      expect(orchestrator.getMailbox('+1234567890')).toBeDefined()

      handle.stop()
    })

    it('creates separate mailboxes for DM and group messages', async () => {
      const { createOrchestrator } = await import('./main')

      const orchestrator = createOrchestrator()
      const handle = await orchestrator.start()

      // DM message
      const dmMessage = JSON.stringify({
        envelope: {
          source: '+1234567890',
          timestamp: Date.now(),
          dataMessage: { message: 'DM message' },
        },
      })

      // Group message
      const groupMessage = JSON.stringify({
        envelope: {
          source: '+1234567890',
          timestamp: Date.now(),
          dataMessage: {
            message: 'Group message',
            groupInfo: { groupId: 'test-group-id' },
          },
        },
      })

      stdoutCallback(Buffer.from(dmMessage + '\n'))
      stdoutCallback(Buffer.from(groupMessage + '\n'))

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
})
