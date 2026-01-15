import * as fs from 'fs/promises'
import * as path from 'path'
import type { SignalAttachment } from './receiver'

/**
 * Attachment classification based on MIME type.
 */
export enum AttachmentType {
  /** Images: saved to disk AND passed inline to Claude */
  Image = 'image',
  /** Documents (PDFs, text): saved to disk, agent uses Read tool */
  Document = 'document',
  /** Audio/video: logged as unsupported, not saved */
  Unsupported = 'unsupported',
}

/**
 * MIME type prefixes for image types that Claude can process.
 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * MIME types and prefixes for document types.
 */
const DOCUMENT_TYPES = ['application/pdf', 'text/']

/**
 * Extension mapping for common MIME types.
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/csv': 'csv',
}

/**
 * Classifies an attachment by its MIME type.
 */
export function classifyAttachment(contentType: string): AttachmentType {
  // Check for image types
  if (IMAGE_TYPES.some(type => contentType.startsWith(type))) {
    return AttachmentType.Image
  }

  // Check for document types
  if (DOCUMENT_TYPES.some(type => contentType.startsWith(type))) {
    return AttachmentType.Document
  }

  return AttachmentType.Unsupported
}

/**
 * Sanitizes a filename by stripping directory components and removing dangerous characters.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
function sanitizeFilename(filename: string): string {
  // Strip directory components (handles both Unix and Windows paths)
  const basename = path.basename(filename)
  // Replace any characters that aren't alphanumeric, dots, dashes, or underscores
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Generates a filename for saving an attachment.
 * Format: {timestamp}_{sanitizedName} or {timestamp}_{id}.{ext}
 */
export function generateAttachmentFilename(
  attachment: SignalAttachment,
  timestamp: number
): string {
  if (attachment.filename) {
    const sanitized = sanitizeFilename(attachment.filename)
    return `${timestamp}_${sanitized}`
  }

  // Generate extension from MIME type
  const ext = MIME_TO_EXTENSION[attachment.contentType] ?? getExtensionFromMime(attachment.contentType) ?? 'bin'
  return `${timestamp}_${attachment.id}.${ext}`
}

/**
 * Attempts to extract extension from MIME type (e.g., image/png -> png).
 */
function getExtensionFromMime(contentType: string): string | null {
  const parts = contentType.split('/')
  if (parts.length === 2) {
    const subtype = parts[1].split(';')[0] // Handle params like "text/plain; charset=utf-8"
    if (subtype && !subtype.includes('+') && subtype.length <= 10) {
      return subtype
    }
  }
  return null
}

/**
 * Formats the attachment line for the agent's context.
 */
export function formatAttachmentLine(
  type: AttachmentType,
  savedPath: string,
  mimeType?: string
): string {
  switch (type) {
    case AttachmentType.Image:
      return `[Image: ${savedPath}]`
    case AttachmentType.Document:
      return `[Document: ${savedPath}]`
    case AttachmentType.Unsupported:
      return `[Unsupported attachment: ${mimeType}]`
  }
}

/**
 * Result of processing an attachment.
 */
export interface AttachmentResult {
  /** The classified type of the attachment */
  type: AttachmentType
  /** Path where the file was saved (undefined for unsupported types or failures) */
  savedPath?: string
  /** Original source path from signal-cli */
  sourcePath: string
  /** Whether to pass the file inline to Claude (images only) */
  passInline: boolean
  /** Formatted line for the agent's context */
  formatLine: string
  /** Original MIME type */
  mimeType: string
  /** Error message if processing failed */
  error?: string
}

/**
 * Processes an attachment: classifies it, saves if appropriate, and returns metadata.
 *
 * Per spec:
 * - Images: saved to disk AND passed inline to Claude (multimodal)
 * - Documents: saved to disk, agent uses Read tool to view
 * - Audio/video: logged as unsupported, not saved
 */
export async function processAttachment(
  attachment: SignalAttachment,
  sourcePath: string,
  timestamp: number,
  downloadsDir: string
): Promise<AttachmentResult> {
  const type = classifyAttachment(attachment.contentType)

  // Unsupported types are not saved
  if (type === AttachmentType.Unsupported) {
    return {
      type,
      sourcePath,
      passInline: false,
      formatLine: formatAttachmentLine(type, '', attachment.contentType),
      mimeType: attachment.contentType,
    }
  }

  // Generate filename and save path
  const filename = generateAttachmentFilename(attachment, timestamp)
  const savedPath = path.join(downloadsDir, filename)

  try {
    // Ensure downloads directory exists
    await fs.mkdir(downloadsDir, { recursive: true })

    // Copy the file from signal-cli's attachment cache
    await fs.copyFile(sourcePath, savedPath)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      type,
      sourcePath,
      passInline: false,
      formatLine: `[Failed to save ${type}: ${errorMessage}]`,
      mimeType: attachment.contentType,
      error: errorMessage,
    }
  }

  return {
    type,
    savedPath,
    sourcePath,
    passInline: type === AttachmentType.Image,
    formatLine: formatAttachmentLine(type, savedPath),
    mimeType: attachment.contentType,
  }
}
