import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { historicalFileLimit } from '../shared/historical-documents-api';
import type { PickedHistoricalFile } from './historical-selection';

export function preflightHistoricalJpeg(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    buffer.length < 4 ||
    buffer.readUInt16BE(0) !== 0xffd8 ||
    buffer.readUInt16BE(buffer.length - 2) !== 0xffd9
  )
    throw new Error('Invalid JPEG');
  let offset = 2;
  let dimensions: { width: number; height: number } | undefined;
  let hasScan = false;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset++] !== 0xff) throw new Error('Invalid JPEG segment');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (offset + 2 > buffer.length || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length)
      throw new Error('Invalid JPEG segment');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (dimensions) throw new Error('Multiple JPEG frames are unsupported');
      if (length < 8) throw new Error('Invalid JPEG frame');
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (!width || !height || width * height > 40_000_000)
        throw new Error('JPEG dimensions exceed limit');
      dimensions = { width, height };
    }
    offset += length;
    if (marker === 0xda) {
      hasScan = true;
      while (offset < buffer.length - 2) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const next = buffer[offset + 1];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
          offset += 2;
          continue;
        }
        if (next === 0xff) {
          offset++;
          continue;
        }
        break;
      }
    }
  }
  if (!dimensions || !hasScan || offset !== buffer.length - 2)
    throw new Error('JPEG frame unavailable');
  return dimensions;
}

export async function readPickedHistoricalFile(
  path: string,
): Promise<PickedHistoricalFile> {
  const extension = extname(path).toLowerCase();
  if (!['.pdf', '.jpg', '.jpeg'].includes(extension))
    throw new Error('Unsupported file type');
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > historicalFileLimit)
      throw new Error('Invalid file size');
    const bytes = Buffer.alloc(stat.size + 1);
    let position = 0;
    while (position < bytes.length) {
      const read = await file.read(
        bytes,
        position,
        bytes.length - position,
        position,
      );
      if (!read.bytesRead) break;
      position += read.bytesRead;
    }
    if (position !== stat.size)
      throw new Error('The selected file changed while reading');
    const content = bytes.subarray(0, position);
    const mimeType = extension === '.pdf' ? 'application/pdf' : 'image/jpeg';
    if (
      mimeType === 'application/pdf'
        ? !content.subarray(0, 5).equals(Buffer.from('%PDF-'))
        : content.length < 4 ||
          content.readUInt16BE(0) !== 0xffd8 ||
          content.readUInt16BE(content.length - 2) !== 0xffd9
    )
      throw new Error('File contents do not match its type');
    if (mimeType === 'image/jpeg') preflightHistoricalJpeg(content);
    return { bytes: content, filename: basename(path), mimeType };
  } finally {
    await file.close();
  }
}
