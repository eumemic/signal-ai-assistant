import { describe, it, expect } from 'vitest'
import { formatTextMessage, formatReactionMessage } from './format'
import { ParsedTextMessage, ParsedReactionMessage } from './receiver'

describe('formatTextMessage', () => {
  it('test_message_format_iso8601', () => {
    // Test that messages are formatted with ISO 8601 timestamps
    // Format: [{ISO8601}] {senderName} ({senderPhone}): {text}
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000, // 2024-01-15T10:30:45.000Z
      text: 'Hey, what\'s for dinner?',
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890): Hey, what\'s for dinner?')
  })

  it('formats message with different timestamp', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+0987654321',
      chatType: 'dm',
      source: '+0987654321',
      sourceName: 'Sarah',
      timestamp: 1705314700000, // 2024-01-15T10:31:40.000Z
      text: 'Hello world!',
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:31:40.000Z] Sarah (+0987654321): Hello world!')
  })

  it('formats group message the same way (chat context from system prompt)', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: 'Z3JvdXBfYWJjMTIz==',
      chatType: 'group',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645123, // 2024-01-15T10:30:45.123Z
      groupId: 'Z3JvdXBfYWJjMTIz==',
      text: 'Hey everyone!',
    }

    const formatted = formatTextMessage(message)

    // Per spec: chat label omitted since agent knows its chat from system prompt
    expect(formatted).toBe('[2024-01-15T10:30:45.123Z] Tom (+1234567890): Hey everyone!')
  })

  it('handles empty text', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000,
      text: '',
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890): ')
  })

  it('handles multiline text', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000,
      text: 'Line 1\nLine 2\nLine 3',
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890): Line 1\nLine 2\nLine 3')
  })

  it('handles special characters in text', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000,
      text: 'Hello! 👋 How are you? <script>alert("xss")</script>',
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890): Hello! 👋 How are you? <script>alert("xss")</script>')
  })

  it('test_empty_source_name_fallback', () => {
    // Per spec: When sourceName is empty or missing, phone number is used as display name
    // Format becomes: [timestamp] +1234567890 (+1234567890): message
    const messageWithEmptyName: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: '', // Empty string, not undefined
      timestamp: 1705314645000,
      text: 'Hello from unknown contact',
    }

    const formatted = formatTextMessage(messageWithEmptyName)

    // Phone number should be used for both name and phone fields
    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] +1234567890 (+1234567890): Hello from unknown contact')
  })

  it('falls back to phone number when sourceName is undefined', () => {
    const messageWithUndefinedName: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      // sourceName is undefined (not provided)
      timestamp: 1705314645000,
      text: 'Hello from unknown contact',
    }

    const formatted = formatTextMessage(messageWithUndefinedName)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] +1234567890 (+1234567890): Hello from unknown contact')
  })

  it('formats message with quote (reply-to)', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000,
      text: 'can you see which message I\'m responding to here?',
      quote: {
        targetTimestamp: 1705312000000,
        targetAuthor: '+0987654321',
        text: 'Done! 👋',
      },
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890) (replying to msg@1705312000000 from +0987654321: "Done! 👋"): can you see which message I\'m responding to here?')
  })

  it('formats message with quote and author name option', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000,
      text: 'can you see which message I\'m responding to here?',
      quote: {
        targetTimestamp: 1705312000000,
        targetAuthor: '+0987654321',
        text: 'Done! 👋',
      },
    }

    const formatted = formatTextMessage(message, { quoteAuthorName: 'Sarah' })

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890) (replying to msg@1705312000000 from Sarah: "Done! 👋"): can you see which message I\'m responding to here?')
  })

  it('formats message with quote without text preview', () => {
    const message: ParsedTextMessage = {
      type: 'text',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+1234567890',
      sourceName: 'Tom',
      timestamp: 1705314645000,
      text: 'What about this one?',
      quote: {
        targetTimestamp: 1705312000000,
        targetAuthor: '+0987654321',
      },
    }

    const formatted = formatTextMessage(message)

    expect(formatted).toBe('[2024-01-15T10:30:45.000Z] Tom (+1234567890) (replying to msg@1705312000000 from +0987654321): What about this one?')
  })
})

describe('formatReactionMessage', () => {
  it('test_reaction_format', () => {
    // Test reaction formatting with target timestamp
    // Format: [{timestamp}] {reactorName} ({reactorPhone}) reacted {emoji} to msg@{targetTimestamp} from {authorName}: "{preview}"
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+0987654321',
      sourceName: 'Sarah',
      timestamp: 1705314660000, // 2024-01-15T10:31:00.000Z
      emoji: '👍',
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    const formatted = formatReactionMessage(reaction, {
      targetAuthorName: 'Tom',
      messagePreview: 'Hey, what\'s...',
    })

    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] Sarah (+0987654321) reacted 👍 to msg@1705312245123 from Tom: "Hey, what\'s..."')
  })

  it('formats reaction without message preview', () => {
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+0987654321',
      sourceName: 'Sarah',
      timestamp: 1705314660000,
      emoji: '❤️',
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    // Without preview, the format should omit the preview portion
    const formatted = formatReactionMessage(reaction)

    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] Sarah (+0987654321) reacted ❤️ to msg@1705312245123 from +1234567890')
  })

  it('formats reaction with only target author name', () => {
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+0987654321',
      sourceName: 'Sarah',
      timestamp: 1705314660000,
      emoji: '😂',
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    const formatted = formatReactionMessage(reaction, {
      targetAuthorName: 'Tom',
    })

    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] Sarah (+0987654321) reacted 😂 to msg@1705312245123 from Tom')
  })

  it('falls back to phone number when reactor sourceName is missing', () => {
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+0987654321',
      // sourceName intentionally missing
      timestamp: 1705314660000,
      emoji: '👍',
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    const formatted = formatReactionMessage(reaction)

    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] +0987654321 (+0987654321) reacted 👍 to msg@1705312245123 from +1234567890')
  })

  it('falls back to phone number when reactor sourceName is empty string', () => {
    // Per spec: empty sourceName should also fall back to phone number
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+0987654321',
      sourceName: '', // Empty string, not undefined
      timestamp: 1705314660000,
      emoji: '👍',
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    const formatted = formatReactionMessage(reaction)

    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] +0987654321 (+0987654321) reacted 👍 to msg@1705312245123 from +1234567890')
  })

  it('formats group reaction the same way', () => {
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: 'Z3JvdXBfYWJjMTIz==',
      chatType: 'group',
      source: '+0987654321',
      sourceName: 'Sarah',
      timestamp: 1705314660000,
      groupId: 'Z3JvdXBfYWJjMTIz==',
      emoji: '🎉',
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    const formatted = formatReactionMessage(reaction, {
      targetAuthorName: 'Tom',
      messagePreview: 'Hey everyone!',
    })

    // Per spec: chat label omitted since agent knows its chat from system prompt
    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] Sarah (+0987654321) reacted 🎉 to msg@1705312245123 from Tom: "Hey everyone!"')
  })

  it('handles special emoji characters', () => {
    const reaction: ParsedReactionMessage = {
      type: 'reaction',
      chatId: '+1234567890',
      chatType: 'dm',
      source: '+0987654321',
      sourceName: 'Sarah',
      timestamp: 1705314660000,
      emoji: '👨‍👩‍👧‍👦', // Complex emoji with ZWJ
      targetAuthor: '+1234567890',
      targetTimestamp: 1705312245123,
    }

    const formatted = formatReactionMessage(reaction)

    expect(formatted).toBe('[2024-01-15T10:31:00.000Z] Sarah (+0987654321) reacted 👨‍👩‍👧‍👦 to msg@1705312245123 from +1234567890')
  })
})
