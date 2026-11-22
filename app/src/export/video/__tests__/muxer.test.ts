import { describe, expect, it } from 'vitest';
import { createMuxer, findWebmDuration, setWebmDuration } from '../muxer';

describe('setWebmDuration', () => {
  it('rewrites the Duration element near the start of the file', () => {
    const bytes = new Uint8Array(64);
    // …Info element, Duration id 0x4489, size 8, float64 4900 (ms), TimecodeScale after it
    bytes.set([0x15, 0x49, 0xa9, 0x66, 0x90, 0x44, 0x89, 0x88], 10);
    new DataView(bytes.buffer).setFloat64(18, 4900, false);
    bytes.set([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40], 26);
    expect(findWebmDuration(bytes)).toBe(18);
    expect(setWebmDuration(bytes, 5000)).toBe(true);
    expect(new DataView(bytes.buffer).getFloat64(18, false)).toBe(5000);
    expect([...bytes.slice(26, 33)]).toEqual([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]); // intact
  });

  it('leaves a file without the element alone', () => {
    const bytes = new Uint8Array(64).fill(1);
    expect(findWebmDuration(bytes)).toBeNull();
    expect(setWebmDuration(bytes, 5000)).toBe(false);
    expect(bytes.every((b) => b === 1)).toBe(true);
  });
});

/** What the muxers see of an encoded frame (jsdom has no WebCodecs: the class is a stand-in). */
class FakeChunk {
  readonly payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  readonly duration = 100_000;
  readonly byteLength = this.payload.length;
  constructor(
    readonly type: 'key' | 'delta',
    readonly timestamp: number,
  ) {}
  copyTo(destination: ArrayBuffer | ArrayBufferView): void {
    const view =
      destination instanceof ArrayBuffer
        ? new Uint8Array(destination)
        : new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength);
    view.set(this.payload);
  }
}
(globalThis as { EncodedVideoChunk?: unknown }).EncodedVideoChunk ??= FakeChunk;

/** A few encoded frames, as WebCodecs would hand them over. */
const chunk = (timestamp: number, key: boolean) =>
  new FakeChunk(key ? 'key' : 'delta', timestamp) as unknown as EncodedVideoChunk;

/** A sink that keeps what it was given, as the file would hold it. */
function fileSink() {
  const writes: { position: number; data: Uint8Array }[] = [];
  return {
    writes,
    write: async (data: Uint8Array, position: number) => {
      writes.push({ position, data: data.slice() });
    },
    bytes(): Uint8Array {
      const size = Math.max(0, ...writes.map((w) => w.position + w.data.length));
      const out = new Uint8Array(size);
      for (const w of writes) out.set(w.data, w.position);
      return out;
    },
  };
}

const ascii = (bytes: Uint8Array, at: number, n: number) =>
  String.fromCharCode(...bytes.subarray(at, at + n));

describe('createMuxer with a sink', () => {
  const request = { codec: 'vp9' as const, width: 64, height: 48, fps: 10 };

  it('writes the WebM to the sink as it goes, with the duration patched at the end', async () => {
    const sink = fileSink();
    const muxer = createMuxer({ ...request, container: 'webm', sink });
    for (let k = 0; k < 3; k++) muxer.addChunk(chunk(k * 100_000, k === 0));
    expect(await muxer.finalize(300_000)).toBeNull();
    const bytes = sink.bytes();
    expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]); // EBML header
    const at = findWebmDuration(bytes);
    expect(at).not.toBeNull();
    expect(new DataView(bytes.buffer).getFloat64(at!, false)).toBe(300);
    // The same bytes as the in-memory file.
    const inMemory = createMuxer({ ...request, container: 'webm' });
    for (let k = 0; k < 3; k++) inMemory.addChunk(chunk(k * 100_000, k === 0));
    const blob = (await inMemory.finalize(300_000))!;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it('writes the MP4 to the sink with the moov box at the end and the mdat size patched', async () => {
    const sink = fileSink();
    const muxer = createMuxer({ ...request, container: 'mp4', sink });
    // The first chunk carries the decoder configuration, as WebCodecs gives it with a key frame.
    const meta: EncodedVideoChunkMetadata = {
      decoderConfig: {
        codec: 'vp09.00.10.08',
        colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
      },
    };
    for (let k = 0; k < 3; k++)
      muxer.addChunk(chunk(k * 100_000, k === 0), k === 0 ? meta : undefined);
    expect(await muxer.finalize(300_000)).toBeNull();
    const bytes = sink.bytes();
    expect(ascii(bytes, 4, 4)).toBe('ftyp');
    const boxes: string[] = [];
    for (let i = 0; i < bytes.length;) {
      const size = new DataView(bytes.buffer).getUint32(i, false);
      boxes.push(ascii(bytes, i + 4, 4));
      if (size < 8) break;
      i += size;
    }
    expect(boxes).toEqual(['ftyp', 'mdat', 'moov']);
    // The mdat size was patched once the length was known: its 16-byte header (room for a
    // 64-bit size) plus three 8-byte frames.
    const ftypSize = new DataView(bytes.buffer).getUint32(0, false);
    expect(new DataView(bytes.buffer).getUint32(ftypSize, false)).toBe(16 + 3 * 8);
  });

  it('reports a failing sink when finalizing', async () => {
    const muxer = createMuxer({
      ...request,
      container: 'webm',
      sink: { write: async () => Promise.reject(new Error('disk full')) },
    });
    muxer.addChunk(chunk(0, true));
    await expect(muxer.finalize(100_000)).rejects.toThrow('disk full');
  });
});
