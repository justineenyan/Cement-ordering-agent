import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface EarlyFilterResult {
  passed: boolean;
  format?: "jpeg" | "png" | "webp" | "pdf";
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  reason?: string;
}

/**
 * Validates file signature (magic numbers) to ensure it's a genuine image/document
 */
function detectMagicFormat(buffer: Buffer): "jpeg" | "png" | "webp" | "pdf" | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "pdf";
  }

  // WebP: RIFF ... WEBP
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff === "RIFF" && webp === "WEBP") {
    return "webp";
  }

  return null;
}

/**
 * Lightweight header parser for dimensions without external binary dependencies
 */
function extractDimensions(buffer: Buffer, format: string): { width: number; height: number } | null {
  try {
    if (format === "png" && buffer.length >= 24) {
      // IHDR chunk: width at 16..20, height at 20..24
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (format === "jpeg") {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) markers contain dimensions
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }
  } catch {
    // If dimension parsing fails, allow pipeline to continue
  }
  return null;
}

/**
 * Early algorithmic pre-screener:
 * Filters out corrupt files, fake extensions, blank files, and extreme non-document aspect ratios
 */
export async function preScreenImage(filePath: string): Promise<EarlyFilterResult> {
  try {
    const resolvedPath = path.resolve(filePath);

    // 1. Check file existence & size
    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      return { passed: false, reason: `File not found at path: ${filePath}` };
    }

    if (stat.size < 2048) {
      return {
        passed: false,
        fileSizeBytes: stat.size,
        reason: "File too small (< 2 KB). Likely corrupted or empty thumbnail."
      };
    }

    if (stat.size > 15 * 1024 * 1024) {
      return {
        passed: false,
        fileSizeBytes: stat.size,
        reason: "File exceeds maximum size limit (15 MB)."
      };
    }

    // 2. Read first 64KB for header and magic number validation
    const fileHandle = await fs.open(resolvedPath, "r");
    const headerBuffer = Buffer.alloc(Math.min(65536, stat.size));
    await fileHandle.read(headerBuffer, 0, headerBuffer.length, 0);
    await fileHandle.close();

    const format = detectMagicFormat(headerBuffer);
    if (!format) {
      return {
        passed: false,
        fileSizeBytes: stat.size,
        reason: "Invalid file signature. File is not a valid JPEG, PNG, WEBP, or PDF document."
      };
    }

    // 3. Dimensional & Aspect Ratio Heuristic for images
    if (format !== "pdf") {
      const dimensions = extractDimensions(headerBuffer, format);
      if (dimensions) {
        const { width, height } = dimensions;

        // Minimum resolution check for readable receipt text
        if (width < 150 || height < 150) {
          return {
            passed: false,
            format,
            width,
            height,
            fileSizeBytes: stat.size,
            reason: `Resolution too low (${width}x${height}px) to read receipt text.`
          };
        }

        const aspectRatio = width / height;

        // Receipts are typically portrait (0.25 to 1.5) or standard landscape (up to 2.5).
        // Anything like 5:1 (a horizontal ribbon/banner) or 1:10 is definitely not a receipt.
        if (aspectRatio > 3.0 || aspectRatio < 0.2) {
          return {
            passed: false,
            format,
            width,
            height,
            fileSizeBytes: stat.size,
            reason: `Irregular aspect ratio (${aspectRatio.toFixed(2)}:1). Payment receipts are standard portrait or document ratios.`
          };
        }

        return {
          passed: true,
          format,
          width,
          height,
          fileSizeBytes: stat.size
        };
      }
    }

    return {
      passed: true,
      format,
      fileSizeBytes: stat.size
    };
  } catch (err: any) {
    return {
      passed: false,
      reason: `Pre-screening error: ${err.message}`
    };
  }
}
