import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Mailbox, FormattedMessage, formatBatchForDelivery } from './mailbox'

describe('Mailbox', () => {
  let mailbox: Mailbox

  beforeEach(() => {
    mailbox = new Mailbox('test-chat-123', 'dm')
  })

  describe('test_mailbox_queue_and_wake', () => {
    it('should initialize with correct properties', () => {
      expect(mailbox.chatId).toBe('test-chat-123')
      expect(mailbox.type).toBe('dm')
      expect(mailbox.agentBusy).toBe(false)
    })

    it('should enqueue messages to the queue', () => {
      const msg1: FormattedMessage = {
        timestamp: '2024-01-15T10:30:45Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'Hello!'
      }
      const msg2: FormattedMessage = {
        timestamp: '2024-01-15T10:30:50Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'How are you?'
      }

      mailbox.enqueue(msg1)
      mailbox.enqueue(msg2)

      expect(mailbox.queueLength).toBe(2)
    })

    it('should drain queue and return all messages', () => {
      const msg1: FormattedMessage = {
        timestamp: '2024-01-15T10:30:45Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'Hello!'
      }
      const msg2: FormattedMessage = {
        timestamp: '2024-01-15T10:30:50Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'How are you?'
      }

      mailbox.enqueue(msg1)
      mailbox.enqueue(msg2)

      const messages = mailbox.drainQueue()

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual(msg1)
      expect(messages[1]).toEqual(msg2)
      expect(mailbox.queueLength).toBe(0)
    })

    it('should call wake callback when messages enqueued and agent is not busy', async () => {
      const wakeCallback = vi.fn().mockResolvedValue(undefined)
      mailbox.onWake(wakeCallback)

      const msg: FormattedMessage = {
        timestamp: '2024-01-15T10:30:45Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'Hello!'
      }

      mailbox.enqueue(msg)
      mailbox.wake()

      expect(wakeCallback).toHaveBeenCalledTimes(1)
    })

    it('should NOT call wake callback when agent is busy', async () => {
      const wakeCallback = vi.fn().mockResolvedValue(undefined)
      mailbox.onWake(wakeCallback)

      mailbox.setAgentBusy(true)

      const msg: FormattedMessage = {
        timestamp: '2024-01-15T10:30:45Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'Hello!'
      }

      mailbox.enqueue(msg)
      mailbox.wake()

      expect(wakeCallback).not.toHaveBeenCalled()
    })

    it('should track agentBusy state correctly', () => {
      expect(mailbox.agentBusy).toBe(false)

      mailbox.setAgentBusy(true)
      expect(mailbox.agentBusy).toBe(true)

      mailbox.setAgentBusy(false)
      expect(mailbox.agentBusy).toBe(false)
    })

    it('should NOT call wake callback when queue is empty', () => {
      const wakeCallback = vi.fn().mockResolvedValue(undefined)
      mailbox.onWake(wakeCallback)

      // Try to wake with empty queue
      mailbox.wake()

      expect(wakeCallback).not.toHaveBeenCalled()
    })

    it('should queue messages while agent is busy', async () => {
      const processedMessages: FormattedMessage[][] = []
      let resolveAgentWork: () => void
      const agentWorkPromise = new Promise<void>((resolve) => {
        resolveAgentWork = resolve
      })

      // Simulate an agent turn that takes time
      const wakeCallback = vi.fn().mockImplementation(async () => {
        mailbox.setAgentBusy(true)
        const messages = mailbox.drainQueue()
        processedMessages.push(messages)
        await agentWorkPromise
        mailbox.setAgentBusy(false)
      })
      mailbox.onWake(wakeCallback)

      // First message triggers wake
      const msg1: FormattedMessage = {
        timestamp: '2024-01-15T10:30:45Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'First message'
      }
      mailbox.enqueue(msg1)
      mailbox.wake()

      expect(wakeCallback).toHaveBeenCalledTimes(1)
      expect(mailbox.agentBusy).toBe(true)

      // Second message arrives while agent is busy
      const msg2: FormattedMessage = {
        timestamp: '2024-01-15T10:30:50Z',
        senderName: 'Tom',
        senderPhone: '+1234567890',
        text: 'Second message'
      }
      mailbox.enqueue(msg2)
      mailbox.wake() // This should not trigger callback since agent is busy

      expect(wakeCallback).toHaveBeenCalledTimes(1)
      expect(mailbox.queueLength).toBe(1) // Second message is queued

      // Agent finishes, can now process next batch
      resolveAgentWork!()

      // First batch had 1 message
      expect(processedMessages[0]).toHaveLength(1)
      expect(processedMessages[0][0].text).toBe('First message')
    })

    it('should support group type mailbox', () => {
      const groupMailbox = new Mailbox('Z3JvdXBfYWJjMTIz==', 'group')

      expect(groupMailbox.chatId).toBe('Z3JvdXBfYWJjMTIz==')
      expect(groupMailbox.type).toBe('group')
    })

    it('should preserve message order when draining', () => {
      const messages: FormattedMessage[] = [
        { timestamp: '2024-01-15T10:30:45Z', senderName: 'Tom', senderPhone: '+1', text: 'First' },
        { timestamp: '2024-01-15T10:30:46Z', senderName: 'Tom', senderPhone: '+1', text: 'Second' },
        { timestamp: '2024-01-15T10:30:47Z', senderName: 'Tom', senderPhone: '+1', text: 'Third' }
      ]

      for (const msg of messages) {
        mailbox.enqueue(msg)
      }

      const drained = mailbox.drainQueue()

      expect(drained[0].text).toBe('First')
      expect(drained[1].text).toBe('Second')
      expect(drained[2].text).toBe('Third')
    })

    it('should return empty array when draining empty queue', () => {
      const drained = mailbox.drainQueue()

      expect(drained).toEqual([])
      expect(mailbox.queueLength).toBe(0)
    })
  })

  describe('test_batch_message_delivery', () => {
    it('should format messages with "New messages:" prefix', () => {
      const messages: FormattedMessage[] = [
        {
          timestamp: '2024-01-15T10:30:45Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Hey, quick question'
        },
        {
          timestamp: '2024-01-15T10:30:52Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Actually two questions'
        },
        {
          timestamp: '2024-01-15T10:31:01Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Never mind, figured it out!'
        }
      ]

      const batch = formatBatchForDelivery(messages)

      expect(batch).toBe(
        `New messages:

[2024-01-15T10:30:45Z] Tom (+1234567890): Hey, quick question
[2024-01-15T10:30:52Z] Tom (+1234567890): Actually two questions
[2024-01-15T10:31:01Z] Tom (+1234567890): Never mind, figured it out!`
      )
    })

    it('should handle single message batch', () => {
      const messages: FormattedMessage[] = [
        {
          timestamp: '2024-01-15T10:30:45Z',
          senderName: 'Alice',
          senderPhone: '+1987654321',
          text: 'Hello!'
        }
      ]

      const batch = formatBatchForDelivery(messages)

      expect(batch).toBe(
        `New messages:

[2024-01-15T10:30:45Z] Alice (+1987654321): Hello!`
      )
    })

    it('should return empty string for empty message array', () => {
      const batch = formatBatchForDelivery([])

      expect(batch).toBe('')
    })

    it('should handle messages from different senders', () => {
      const messages: FormattedMessage[] = [
        {
          timestamp: '2024-01-15T10:30:45Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Hey everyone'
        },
        {
          timestamp: '2024-01-15T10:30:52Z',
          senderName: 'Alice',
          senderPhone: '+1987654321',
          text: 'Hi Tom!'
        },
        {
          timestamp: '2024-01-15T10:31:01Z',
          senderName: 'Bob',
          senderPhone: '+1555555555',
          text: 'Hello!'
        }
      ]

      const batch = formatBatchForDelivery(messages)

      expect(batch).toBe(
        `New messages:

[2024-01-15T10:30:45Z] Tom (+1234567890): Hey everyone
[2024-01-15T10:30:52Z] Alice (+1987654321): Hi Tom!
[2024-01-15T10:31:01Z] Bob (+1555555555): Hello!`
      )
    })

    it('should include attachment path line when present', () => {
      const messages: FormattedMessage[] = [
        {
          timestamp: '2024-01-15T10:30:45Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Check out this document',
          attachmentPath: '/home/jarvis/downloads/document.pdf'
        }
      ]

      const batch = formatBatchForDelivery(messages)

      expect(batch).toBe(
        `New messages:

[2024-01-15T10:30:45Z] Tom (+1234567890): Check out this document
  📎 Attachment: /home/jarvis/downloads/document.pdf`
      )
    })

    it('should include inline image indicator when present', () => {
      const messages: FormattedMessage[] = [
        {
          timestamp: '2024-01-15T10:30:45Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Check out this photo',
          attachmentPath: '/home/jarvis/downloads/photo.jpg',
          inlineImage: Buffer.from('fake-image-data')
        }
      ]

      const batch = formatBatchForDelivery(messages)

      expect(batch).toBe(
        `New messages:

[2024-01-15T10:30:45Z] Tom (+1234567890): Check out this photo
  📎 Attachment: /home/jarvis/downloads/photo.jpg
  🖼️ [Image included for visual analysis]`
      )
    })

    it('should handle multiple messages with mixed attachments', () => {
      const messages: FormattedMessage[] = [
        {
          timestamp: '2024-01-15T10:30:45Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Hello!'
        },
        {
          timestamp: '2024-01-15T10:30:52Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'Here is the image',
          attachmentPath: '/home/jarvis/downloads/image.png',
          inlineImage: Buffer.from('fake-image-data')
        },
        {
          timestamp: '2024-01-15T10:31:01Z',
          senderName: 'Tom',
          senderPhone: '+1234567890',
          text: 'And the PDF',
          attachmentPath: '/home/jarvis/downloads/doc.pdf'
        }
      ]

      const batch = formatBatchForDelivery(messages)

      expect(batch).toBe(
        `New messages:

[2024-01-15T10:30:45Z] Tom (+1234567890): Hello!
[2024-01-15T10:30:52Z] Tom (+1234567890): Here is the image
  📎 Attachment: /home/jarvis/downloads/image.png
  🖼️ [Image included for visual analysis]
[2024-01-15T10:31:01Z] Tom (+1234567890): And the PDF
  📎 Attachment: /home/jarvis/downloads/doc.pdf`
      )
    })
  })
})
