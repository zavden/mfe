/* A file assembled in memory, for a browser that gives the page no file to write to (no File
 * System Access API): pages written by position, since a muxer goes back to patch what it wrote,
 * and one Blob at the end. Nothing here caps its size. The browser's memory does: the dialog
 * warns about a large file before the export, and running out is reported as what it is. */
import type { VideoSink } from '../types';
import { OUTPUT_CHUNK_BYTES } from './outputWriter';

/** The browser refused the memory for the file being assembled. */
export class OutOfMemoryError extends Error {
  /** How much of the file was held when it happened. */
  readonly bytes: number;

  constructor(bytes: number, cause?: unknown) {
    super(
      `The browser ran out of memory after ${Math.round(bytes / 1024 ** 2)} MB of the file.`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'OutOfMemoryError';
    this.bytes = bytes;
  }
}

/** Whether `error` is the browser running out of memory: the error above, or an engine's own
 * words for an allocation it refused — a muxer or the Blob constructor can meet it too. Chrome
 * says "Array buffer allocation failed" or "Invalid typed array length", Firefox "out of memory"
 * (thrown as bare words), "allocation size overflow" or "invalid array length", Safari "Out of
 * memory". The array words count only on a RangeError, the type engines use for a size, and not
 * when the size they name is negative: that is a mistake of the program, to be read as one. */
export function isOutOfMemory(error: unknown): boolean {
  if (error instanceof OutOfMemoryError) return true;
  const text = error instanceof Error ? error.message : String(error);
  if (/out of memory|allocation failed|allocation size overflow/i.test(text)) return true;
  return (
    error instanceof RangeError &&
    /array buffer|typed array|array length/i.test(text) &&
    !/-\d/.test(text)
  );
}

export interface MemoryFile {
  /** Takes writes at any position, in any order. */
  readonly sink: VideoSink;
  /** The end of the furthest write. */
  readonly size: number;
  /** The file. Its pages go to the Blob: the memory file is empty afterwards. */
  blob(type: string): Blob;
}

export function createMemoryFile(
  allocate: (bytes: number) => Uint8Array<ArrayBuffer> = (bytes) => new Uint8Array(bytes),
): MemoryFile {
  const pages = new Map<number, Uint8Array<ArrayBuffer>>();
  let size = 0;
  const newPage = () => {
    try {
      return allocate(OUTPUT_CHUNK_BYTES);
    } catch (error) {
      throw new OutOfMemoryError(pages.size * OUTPUT_CHUNK_BYTES, error);
    }
  };
  const pageAt = (index: number) => {
    let page = pages.get(index);
    if (!page) pages.set(index, (page = newPage()));
    return page;
  };
  return {
    sink: {
      // async: a refused page is a rejected write, as a failed write to a real file is
      async write(bytes, position) {
        for (let offset = 0; offset < bytes.length;) {
          const index = Math.floor((position + offset) / OUTPUT_CHUNK_BYTES);
          const within = (position + offset) % OUTPUT_CHUNK_BYTES;
          const count = Math.min(bytes.length - offset, OUTPUT_CHUNK_BYTES - within);
          pageAt(index).set(bytes.subarray(offset, offset + count), within);
          offset += count;
        }
        size = Math.max(size, position + bytes.length);
      },
    },
    get size() {
      return size;
    },
    blob(type) {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      // What was skipped over reads as zeros; one page of them serves every gap.
      let blank: Uint8Array<ArrayBuffer> | undefined;
      for (let start = 0; start < size; start += OUTPUT_CHUNK_BYTES) {
        const page = pages.get(start / OUTPUT_CHUNK_BYTES) ?? (blank ??= newPage());
        parts.push(page.subarray(0, Math.min(OUTPUT_CHUNK_BYTES, size - start)));
      }
      const blob = new Blob(parts, { type });
      pages.clear();
      size = 0;
      return blob;
    },
  };
}
