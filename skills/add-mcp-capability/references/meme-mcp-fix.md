# Fixing MCP Servers That Return Inline Data

This reference documents the process of fixing an MCP server that returns inline image data (which Claude can see but can't save) to instead return a file path.

## The Problem

Many MCP servers return images using the MCP image content type:

```typescript
return {
  content: [{ type: "image", data: base64Data, mimeType: "image/png" }],
};
```

Claude can **see** this image visually, but cannot extract the raw bytes to save to disk. When asked to send the image, Claude will hallucinate a URL or try to manually type out base64 (which gets truncated).

## The Solution

Modify the MCP server to:
1. Save the image to a file on disk
2. Return the file path as text

```typescript
import { writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

// Output directory - configurable via env var
const OUTPUT_DIR = process.env.MEME_OUTPUT_DIR || "/tmp";

// In the tool handler:
const filename = `meme_${randomBytes(8).toString("hex")}.jpg`;
const filepath = join(OUTPUT_DIR, filename);
writeFileSync(filepath, imageBuffer);

return {
  content: [
    {
      type: "text",
      text: `Meme saved to: ${filepath}\n\nYou can now send this image as an attachment.`,
    },
  ],
};
```

## Case Study: meme-mcp

### Original Implementation

The original [meme-mcp](https://github.com/haltakov/meme-mcp) server:

1. Called the Imgflip API to generate a meme
2. Downloaded the resulting image
3. Converted to base64
4. Returned as `type: "image"` content

```typescript
// Original code (problematic)
const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
const imageDataBase64 = imageResponse.data.toString("base64");

return {
  content: [{ type: "image", data: imageDataBase64, mimeType: "image/png" }],
};
```

### What Happened

1. Claude called `mcp__meme__generateMeme`
2. Tool returned base64 image data
3. Claude saw `[tool_result]` (image displayed visually)
4. Claude said "Perfect! Now let me save this..."
5. Claude **hallucinated** a curl command to a wrong URL
6. Downloaded HTML instead of image
7. Sent broken 7KB "image" file

### Fixed Implementation

The forked version at `/Users/tom/code/meme-mcp-fork`:

```typescript
import { writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const OUTPUT_DIR = process.env.MEME_OUTPUT_DIR || "/tmp";

// In tool handler:
const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });

// Generate unique filename and save
const filename = `meme_${randomBytes(8).toString("hex")}.jpg`;
const filepath = join(OUTPUT_DIR, filename);
writeFileSync(filepath, imageResponse.data);

// Return path as text
return {
  content: [
    {
      type: "text",
      text: `Meme saved to: ${filepath}\n\nYou can now send this image as an attachment.`,
    },
  ],
};
```

### Installation Notes

When installing a forked local package for Docker compatibility:

```bash
# In the fork directory
cd /path/to/meme-mcp-fork
npm run build
npm pack
# Creates meme-mcp-1.0.1.tgz

# In signal-ai-assistant/data
cd /path/to/signal-ai-assistant/data
npm install /path/to/meme-mcp-fork/meme-mcp-1.0.1.tgz
```

**Why npm pack?** Direct `npm install /local/path` creates a symlink. Symlinks don't work across Docker mount boundaries because the target path doesn't exist inside the container.

## Generalizing to Other MCP Servers

Apply this pattern to any MCP server that returns binary data:

### Before (Inline Data)

```typescript
// PDF generator
return {
  content: [{ type: "resource", data: pdfBase64, mimeType: "application/pdf" }],
};

// Audio generator
return {
  content: [{ type: "resource", data: audioBase64, mimeType: "audio/mp3" }],
};
```

### After (File Path)

```typescript
// PDF generator
const filepath = `/tmp/doc_${randomBytes(8).toString("hex")}.pdf`;
writeFileSync(filepath, pdfBuffer);
return {
  content: [{ type: "text", text: `PDF saved to: ${filepath}` }],
};

// Audio generator
const filepath = `/tmp/audio_${randomBytes(8).toString("hex")}.mp3`;
writeFileSync(filepath, audioBuffer);
return {
  content: [{ type: "text", text: `Audio saved to: ${filepath}` }],
};
```

## Testing the Fix

Test the MCP server standalone before integrating:

```bash
export API_KEY="your_key"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"toolName","arguments":{...}}}' | node /path/to/mcp-server

# Should return:
# {"result":{"content":[{"type":"text","text":"File saved to: /tmp/..."}]},...}
```

Verify the file:
```bash
file /tmp/generated_file.jpg
# Should show: JPEG image data, ...

ls -la /tmp/generated_file.jpg
# Should show reasonable file size
```
