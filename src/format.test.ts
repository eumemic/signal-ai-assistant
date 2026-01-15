import { describe, it, expect } from 'vitest'
import { formatTextMessage } from './format'
import { ParsedTextMessage } from './receiver'

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
})
