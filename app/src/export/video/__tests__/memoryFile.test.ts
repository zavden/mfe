// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMemoryFile, isOutOfMemory, OutOfMemoryError } from '../memoryFile';
import { OUTPUT_CHUNK_BYTES } from '../outputWriter';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('a file assembled in memory', () => {
  it('takes writes at any position, patches included, and gives the file as one Blob', async () => {
    const file = createMemoryFile();
    await file.sink.write(bytes(1, 2, 3, 4), 0);
    // across a page boundary, then a patch of what was written first
    await file.sink.write(bytes(7, 8, 9), OUTPUT_CHUNK_BYTES - 1);
    await file.sink.write(bytes(5), 1);
    expect(file.size).toBe(OUTPUT_CHUNK_BYTES + 2);
    const blob = file.blob('video/mp4');
    expect(blob.type).toBe('video/mp4');
    const all = new Uint8Array(await blob.arrayBuffer());
    expect(all).toHaveLength(OUTPUT_CHUNK_BYTES + 2);
    expect([...all.subarray(0, 5)]).toEqual([1, 5, 3, 4, 0]);
    expect([...all.subarray(OUTPUT_CHUNK_BYTES - 1)]).toEqual([7, 8, 9]);
  });

  it('has no size of its own to refuse: the browser’s memory is the limit', async () => {
    const file = createMemoryFile();
    // One page is all this costs: the pages before it were never written.
    await file.sink.write(bytes(1), 3 * 1024 ** 3);
    expect(file.size).toBe(3 * 1024 ** 3 + 1);
  });

  it('says so when the browser refuses the memory, with how far it got', async () => {
    let pages = 0;
    const file = createMemoryFile((length) => {
      if (++pages > 8) throw new RangeError('Array buffer allocation failed');
      return new Uint8Array(length);
    });
    await file.sink.write(new Uint8Array(8 * OUTPUT_CHUNK_BYTES), 0);
    const failed = file.sink.write(bytes(1), 8 * OUTPUT_CHUNK_BYTES);
    await expect(failed).rejects.toBeInstanceOf(OutOfMemoryError);
    await expect(failed).rejects.toThrow('The browser ran out of memory after 2 MB of the file.');
  });

  it('recognizes the words of each engine for memory it refused, and nothing else', () => {
    expect(isOutOfMemory(new OutOfMemoryError(0))).toBe(true);
    expect(isOutOfMemory(new RangeError('Array buffer allocation failed'))).toBe(true);
    expect(isOutOfMemory(new RangeError('Invalid typed array length: 5000000000'))).toBe(true);
    expect(isOutOfMemory(new RangeError('invalid array length'))).toBe(true);
    expect(isOutOfMemory(new RangeError('Out of memory'))).toBe(true);
    expect(isOutOfMemory('out of memory')).toBe(true); // Firefox throws the bare words
    expect(isOutOfMemory(new Error('allocation size overflow'))).toBe(true);
    // A size that is not one is a mistake of the program, not a lack of memory.
    expect(isOutOfMemory(new RangeError('Invalid typed array length: -1'))).toBe(false);
    expect(isOutOfMemory(new RangeError('Invalid array buffer length: -4096'))).toBe(false);
    expect(isOutOfMemory(new RangeError('Maximum call stack size exceeded'))).toBe(false);
    expect(isOutOfMemory(new Error('Invalid array length'))).toBe(false);
    expect(isOutOfMemory(new Error('The encoder failed'))).toBe(false);
    expect(isOutOfMemory(new DOMException('Cancelled', 'AbortError'))).toBe(false);
  });
});
