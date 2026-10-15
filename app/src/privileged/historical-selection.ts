import { randomUUID } from 'node:crypto';
import type {
  HistoricalSelection,
  HistoricalMimeType,
} from '../shared/historical-documents-api';
import { historicalFileLimit } from '../shared/historical-documents-api';
export interface PickedHistoricalFile {
  bytes: Uint8Array;
  filename: string;
  mimeType: HistoricalMimeType;
}
export interface HistoricalFilePicker {
  pick: () => Promise<PickedHistoricalFile | null>;
}
export class HistoricalSelections {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private current: {
    selection: HistoricalSelection;
    bytes: Buffer;
    expiresAt: number;
  } | null = null;
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.current?.bytes.fill(0);
    this.current = null;
  }
  store(patientId: string, file: PickedHistoricalFile): HistoricalSelection {
    this.clear();
    if (
      !file.bytes.length ||
      file.bytes.length > historicalFileLimit ||
      file.filename.length > 150 ||
      /[\\/:<>"|?*]/.test(file.filename) ||
      [...file.filename].some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error('Invalid selected file');
    const selection = {
      token: randomUUID(),
      patientId,
      filename: file.filename,
      mimeType: file.mimeType,
      byteLength: file.bytes.length,
    };
    this.current = {
      selection,
      bytes: Buffer.from(file.bytes),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    this.timer = setTimeout(() => this.clear(), 10 * 60 * 1000);
    this.timer.unref();
    return selection;
  }
  read(
    patientId: string,
    token: string,
  ): { selection: HistoricalSelection; bytes: Buffer } {
    if (!this.current || this.current.expiresAt <= Date.now()) {
      this.clear();
      throw new Error('Choose the file again');
    }
    if (
      this.current.selection.token !== token ||
      this.current.selection.patientId !== patientId
    )
      throw new Error('Selected file does not match patient');
    return this.current;
  }
  discard(token: string): void {
    if (this.current?.selection.token === token) this.clear();
  }
}
