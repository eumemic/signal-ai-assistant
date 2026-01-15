import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  classifyAttachment,
  AttachmentType,
  generateAttachmentFilename,
  formatAttachmentLine,
  processAttachment,
  type AttachmentResult,
} from './attachments'
import type { SignalAttachment } from './receiver'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}))

describe('classifyAttachment', () => {
  it('classifies JPEG images as image type', () => {
    expect(classifyAttachment('image/jpeg')).toBe(AttachmentType.Image)
  })

  it('classifies PNG images as image type', () => {
    expect(classifyAttachment('image/png')).toBe(AttachmentType.Image)
  })

  it('classifies GIF images as image type', () => {
    expect(classifyAttachment('image/gif')).toBe(AttachmentType.Image)
  })

  it('classifies WebP images as image type', () => {
    expect(classifyAttachment('image/webp')).toBe(AttachmentType.Image)
  })

  it('classifies PDF documents as document type', () => {
    expect(classifyAttachment('application/pdf')).toBe(AttachmentType.Document)
  })

  it('classifies text files as document type', () => {
    expect(classifyAttachment('text/plain')).toBe(AttachmentType.Document)
  })

  it('classifies audio files as unsupported', () => {
    expect(classifyAttachment('audio/mpeg')).toBe(AttachmentType.Unsupported)
    expect(classifyAttachment('audio/ogg')).toBe(AttachmentType.Unsupported)
  })

  it('classifies video files as unsupported', () => {
    expect(classifyAttachment('video/mp4')).toBe(AttachmentType.Unsupported)
    expect(classifyAttachment('video/webm')).toBe(AttachmentType.Unsupported)
  })

  it('classifies unknown types as unsupported', () => {
    expect(classifyAttachment('application/octet-stream')).toBe(AttachmentType.Unsupported)
  })
})

describe('generateAttachmentFilename', () => {
  it('uses the original filename if provided', () => {
    const attachment: SignalAttachment = {
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
      id: 'abc123',
    }
    const result = generateAttachmentFilename(attachment, 1705312245123)
    expect(result).toBe('1705312245123_photo.jpg')
  })

  it('generates filename from id and extension when no filename provided', () => {
    const attachment: SignalAttachment = {
      contentType: 'image/png',
      id: 'xyz789',
    }
    const result = generateAttachmentFilename(attachment, 1705312245123)
    expect(result).toBe('1705312245123_xyz789.png')
  })

  it('uses correct extension for JPEG', () => {
    const attachment: SignalAttachment = {
      contentType: 'image/jpeg',
      id: 'abc',
    }
    const result = generateAttachmentFilename(attachment, 1)
    expect(result).toBe('1_abc.jpg')
  })

  it('uses correct extension for PDF', () => {
    const attachment: SignalAttachment = {
      contentType: 'application/pdf',
      id: 'doc',
    }
    const result = generateAttachmentFilename(attachment, 1)
    expect(result).toBe('1_doc.pdf')
  })

  it('uses bin extension for unknown types', () => {
    const attachment: SignalAttachment = {
      contentType: 'application/octet-stream',
      id: 'unknown',
    }
    const result = generateAttachmentFilename(attachment, 1)
    expect(result).toBe('1_unknown.bin')
  })

  describe('security: filename sanitization', () => {
    it('prevents path traversal with ../', () => {
      const attachment: SignalAttachment = {
        contentType: 'image/jpeg',
        filename: '../../etc/passwd',
        id: 'malicious',
      }
      const result = generateAttachmentFilename(attachment, 123)
      expect(result).not.toContain('..')
      expect(result).toBe('123_passwd')
    })

    it('strips directory components from Unix paths', () => {
      const attachment: SignalAttachment = {
        contentType: 'image/jpeg',
        filename: '/etc/passwd',
        id: 'malicious',
      }
      const result = generateAttachmentFilename(attachment, 123)
      expect(result).toBe('123_passwd')
    })

    it('strips directory components from Windows paths', () => {
      const attachment: SignalAttachment = {
        contentType: 'image/jpeg',
        filename: 'C:\\Windows\\System32\\config',
        id: 'malicious',
      }
      const result = generateAttachmentFilename(attachment, 123)
      // path.basename handles Windows paths on all platforms
      expect(result).not.toContain('\\')
      expect(result).not.toContain(':')
    })

    it('replaces dangerous characters with underscores', () => {
      const attachment: SignalAttachment = {
        contentType: 'image/jpeg',
        filename: 'file<name>:with*bad?chars.jpg',
        id: 'special',
      }
      const result = generateAttachmentFilename(attachment, 123)
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).not.toContain(':')
      expect(result).not.toContain('*')
      expect(result).not.toContain('?')
      expect(result).toBe('123_file_name__with_bad_chars.jpg')
    })

    it('allows safe characters', () => {
      const attachment: SignalAttachment = {
        contentType: 'image/jpeg',
        filename: 'my-photo_2024.jpg',
        id: 'safe',
      }
      const result = generateAttachmentFilename(attachment, 123)
      expect(result).toBe('123_my-photo_2024.jpg')
    })
  })
})

describe('formatAttachmentLine', () => {
  it('formats image attachments with Image prefix', () => {
    const result = formatAttachmentLine(
      AttachmentType.Image,
      '/home/jarvis/downloads/photo.jpg'
    )
    expect(result).toBe('[Image: /home/jarvis/downloads/photo.jpg]')
  })

  it('formats document attachments with Document prefix', () => {
    const result = formatAttachmentLine(
      AttachmentType.Document,
      '/home/jarvis/downloads/report.pdf'
    )
    expect(result).toBe('[Document: /home/jarvis/downloads/report.pdf]')
  })

  it('formats unsupported attachments with mimeType', () => {
    const result = formatAttachmentLine(
      AttachmentType.Unsupported,
      '/some/path',
      'video/mp4'
    )
    expect(result).toBe('[Unsupported attachment: video/mp4]')
  })
})

describe('processAttachment', () => {
  const downloadsDir = '/home/jarvis/downloads'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes an image attachment and returns correct result', async () => {
    const attachment: SignalAttachment = {
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
      id: 'abc123',
    }
    const sourcePath = '/tmp/signal-attachments/abc123'
    const timestamp = 1705312245123

    const result = await processAttachment(attachment, sourcePath, timestamp, downloadsDir)

    expect(result.type).toBe(AttachmentType.Image)
    expect(result.savedPath).toBe('/home/jarvis/downloads/1705312245123_photo.jpg')
    expect(result.sourcePath).toBe(sourcePath)
    expect(result.passInline).toBe(true)
    expect(result.formatLine).toBe('[Image: /home/jarvis/downloads/1705312245123_photo.jpg]')
    expect(fs.mkdir).toHaveBeenCalledWith(downloadsDir, { recursive: true })
    expect(fs.copyFile).toHaveBeenCalledWith(
      sourcePath,
      '/home/jarvis/downloads/1705312245123_photo.jpg'
    )
  })

  it('processes a document attachment and returns correct result', async () => {
    const attachment: SignalAttachment = {
      contentType: 'application/pdf',
      filename: 'report.pdf',
      id: 'doc456',
    }
    const sourcePath = '/tmp/signal-attachments/doc456'
    const timestamp = 1705312245123

    const result = await processAttachment(attachment, sourcePath, timestamp, downloadsDir)

    expect(result.type).toBe(AttachmentType.Document)
    expect(result.savedPath).toBe('/home/jarvis/downloads/1705312245123_report.pdf')
    expect(result.passInline).toBe(false)
    expect(result.formatLine).toBe('[Document: /home/jarvis/downloads/1705312245123_report.pdf]')
    expect(fs.copyFile).toHaveBeenCalled()
  })

  it('processes an unsupported attachment without saving', async () => {
    const attachment: SignalAttachment = {
      contentType: 'video/mp4',
      filename: 'video.mp4',
      id: 'vid789',
    }
    const sourcePath = '/tmp/signal-attachments/vid789'
    const timestamp = 1705312245123

    const result = await processAttachment(attachment, sourcePath, timestamp, downloadsDir)

    expect(result.type).toBe(AttachmentType.Unsupported)
    expect(result.savedPath).toBeUndefined()
    expect(result.passInline).toBe(false)
    expect(result.formatLine).toBe('[Unsupported attachment: video/mp4]')
    // Should NOT try to copy unsupported files
    expect(fs.copyFile).not.toHaveBeenCalled()
  })

  it('handles file copy errors gracefully', async () => {
    vi.mocked(fs.copyFile).mockRejectedValueOnce(new Error('ENOENT: no such file'))

    const attachment: SignalAttachment = {
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
      id: 'abc123',
    }
    const sourcePath = '/tmp/signal-attachments/missing'
    const timestamp = 1705312245123

    const result = await processAttachment(attachment, sourcePath, timestamp, downloadsDir)

    expect(result.type).toBe(AttachmentType.Image)
    expect(result.savedPath).toBeUndefined()
    expect(result.passInline).toBe(false)
    expect(result.error).toBe('ENOENT: no such file')
    expect(result.formatLine).toBe('[Failed to save image: ENOENT: no such file]')
  })

  it('handles mkdir errors gracefully', async () => {
    vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error('EACCES: permission denied'))

    const attachment: SignalAttachment = {
      contentType: 'application/pdf',
      filename: 'doc.pdf',
      id: 'doc',
    }
    const sourcePath = '/tmp/signal-attachments/doc'
    const timestamp = 1705312245123

    const result = await processAttachment(attachment, sourcePath, timestamp, downloadsDir)

    expect(result.type).toBe(AttachmentType.Document)
    expect(result.savedPath).toBeUndefined()
    expect(result.passInline).toBe(false)
    expect(result.error).toBe('EACCES: permission denied')
    expect(result.formatLine).toBe('[Failed to save document: EACCES: permission denied]')
  })
})
