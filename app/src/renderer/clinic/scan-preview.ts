import { historicalFileLimit } from '../../shared/historical-documents-api';

export function decodeScan(
  content: string,
  expectedLength: number,
): Uint8Array<ArrayBuffer> {
  if (
    !Number.isSafeInteger(expectedLength) ||
    expectedLength < 1 ||
    expectedLength > historicalFileLimit ||
    content.length > Math.ceil(historicalFileLimit / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
  )
    throw new Error('Invalid scan content');
  const binary = atob(content);
  if (binary.length !== expectedLength)
    throw new Error('The scan size does not match its metadata');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function checkJpegDimensions(bytes: Uint8Array): void {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error('This scan is not a JPEG image.');
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset++] !== 0xff)
      throw new Error('The JPEG structure is invalid.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (
      marker === 0x01 ||
      (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)
    )
      continue;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length)
      throw new Error('The JPEG structure is invalid.');
    if (
      marker !== undefined &&
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 8) break;
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      if (
        !width ||
        !height ||
        width > 16384 ||
        height > 16384 ||
        width * height > 24_000_000
      )
        throw new Error('This image exceeds the safe preview size.');
      return;
    }
    offset += length;
  }
  throw new Error('The JPEG dimensions could not be confirmed.');
}
