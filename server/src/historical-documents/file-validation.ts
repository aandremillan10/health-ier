import { createHash } from 'node:crypto';
import { invalid, text } from '../validation';

export const historicalFileLimit = 10 * 1024 * 1024;
export interface ValidatedHistoricalFile {
  bytes: Buffer;
  filename: string;
  mimeType: 'application/pdf' | 'image/jpeg';
  sha256: string;
}

function validateJpeg(bytes: Buffer): void {
  if (
    bytes.length < 12 ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    invalid('file');
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) invalid('file');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (
      marker === undefined ||
      marker === 0 ||
      marker === 0xd8 ||
      marker === 0xd9
    )
      invalid('file');
    if (offset + 2 > bytes.length) invalid('file');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) invalid('file');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) invalid('file');
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (!width || !height || width * height > 40_000_000) invalid('file');
      hasFrame = true;
    }
    offset += length;
    if (marker === 0xda) {
      hasScan = true;
      while (offset < bytes.length - 2) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
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
  if (!hasFrame || !hasScan || offset !== bytes.length - 2) invalid('file');
}

export function validateHistoricalBytes(
  bytes: Buffer,
  filenameInput: unknown,
  mimeInput: unknown,
): ValidatedHistoricalFile {
  if (!bytes.length || bytes.length > historicalFileLimit) invalid('file');
  const filename = text(filenameInput, 'filename', true, 150)!;
  if (
    /[\\/:<>"|?*]/.test(filename) ||
    [...filename].some((character) => character.charCodeAt(0) < 32) ||
    filename === '.' ||
    filename === '..'
  )
    invalid('filename');
  if (mimeInput === 'image/jpeg') {
    if (!/\.jpe?g$/i.test(filename)) invalid('filename');
    validateJpeg(bytes);
  } else if (mimeInput === 'application/pdf') {
    if (!/\.pdf$/i.test(filename)) invalid('filename');
    const start = bytes.subarray(0, 16).toString('latin1');
    const tail = bytes
      .subarray(Math.max(0, bytes.length - 2048))
      .toString('latin1');
    const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
    if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(start) || !end) invalid('file');
    const xref = Number(end[1]);
    if (!Number.isSafeInteger(xref) || xref < 9 || xref >= bytes.length)
      invalid('file');
    if (
      !/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(
        bytes.subarray(xref, xref + 80).toString('latin1'),
      )
    )
      invalid('file');
    // Structural bounds are not sanitization; preview renders inert canvases only.
  } else invalid('mimeType');
  return {
    bytes,
    filename,
    mimeType: mimeInput,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function decodeHistoricalFile(
  body: Record<string, unknown>,
): ValidatedHistoricalFile {
  if (
    typeof body.contentBase64 !== 'string' ||
    body.contentBase64.length > Math.ceil(historicalFileLimit / 3) * 4 ||
    body.contentBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)
  )
    invalid('file');
  const bytes = Buffer.from(body.contentBase64, 'base64');
  if (bytes.toString('base64') !== body.contentBase64) invalid('file');
  return validateHistoricalBytes(bytes, body.filename, body.mimeType);
}
