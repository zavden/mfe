// @vitest-environment node
import { BlobSource, EncodedPacket, Input, WEBM } from 'mediabunny';
import { describe, expect, it, vi } from 'vitest';
import { createTimedWebmWriter } from '../webm';

function metadata(): EncodedAudioChunkMetadata {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode('OpusHead'));
  head[8] = 1;
  head[9] = 2;
  new DataView(head.buffer).setUint16(10, 312, true);
  new DataView(head.buffer).setUint32(12, 48000, true);
  return {
    decoderConfig: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, description: head },
  };
}
const packet = (index: number) =>
  new EncodedPacket(new Uint8Array([0xf8, 0xff, 0xfe]), 'key', -0.0065 + index * 0.02, 0.02);

interface Element {
  id: number;
  offset: number;
  data: Uint8Array;
}
/** Minimal independent EBML reader for asserting public container fields, not writer internals. */
function elements(bytes: Uint8Array, from = 0, to = bytes.length): Element[] {
  const containers = new Set([
    0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe1, 0xe0, 0x1f43b675, 0xa0, 0x1c53bb6b, 0xbb, 0xb7,
  ]);
  const result: Element[] = [];
  let position = from;
  const number = (id: boolean) => {
    const first = bytes[position]!;
    let width = 1;
    while (!(first & (1 << (8 - width)))) width++;
    let value = id ? first : first & ((1 << (8 - width)) - 1);
    for (let i = 1; i < width; i++) value = value * 256 + bytes[position + i]!;
    position += width;
    return value;
  };
  while (position < to) {
    const id = number(true);
    const length = number(false);
    const end = Math.min(to, position + length);
    result.push({ id, offset: position, data: bytes.subarray(position, end) });
    if (containers.has(id)) result.push(...elements(bytes, position, end));
    position = end;
  }
  return result;
}
function unsigned(bytes: Uint8Array): number {
  return bytes.reduce((total, byte) => total * 256 + byte, 0);
}

describe('exact WebM audio presentation', () => {
  it('writes actual Opus delay and final sample discard, plus precise presentation duration', async () => {
    const writer = createTimedWebmWriter();
    for (let i = 0; i < 6; i++)
      await writer.addAudio(packet(i), i === 0 ? metadata() : undefined, i === 5 ? 648 : 0);
    const blob = (await writer.finalize(4800))!;
    const all = elements(new Uint8Array(await blob.arrayBuffer()));
    expect(unsigned(all.find((item) => item.id === 0x2ad7b1)!.data)).toBe(10000);
    expect(unsigned(all.find((item) => item.id === 0x56aa)!.data)).toBe(6_500_000);
    expect(unsigned(all.find((item) => item.id === 0x75a2)!.data)).toBe(13_500_000);
    expect(unsigned(all.filter((item) => item.id === 0x9b).at(-1)!.data)).toBe(650);
    const duration = all.find((item) => item.id === 0x4489)!.data;
    expect(new DataView(duration.buffer, duration.byteOffset, 8).getFloat64(0)).toBe(10000);
  });

  it('retains the exact final packet duration when no trailing padding is needed', async () => {
    const writer = createTimedWebmWriter();
    await writer.addAudio(packet(0), metadata());
    const blob = (await writer.finalize(648))!;
    const input = new Input({ source: new BlobSource(blob), formats: [WEBM] });
    try {
      const track = (await input.getPrimaryAudioTrack())!;
      expect(await track.computeDuration()).toBeCloseTo(648 / 48000, 8);
      const all = elements(new Uint8Array(await blob.arrayBuffer()));
      expect(all.filter((item) => item.id === 0x75a2)).toHaveLength(0);
      expect(unsigned(all.find((item) => item.id === 0x9b)!.data)).toBe(2000);
    } finally {
      input.dispose();
    }
  });

  it('preserves positional duration patches and leaves real file publication to its owner', async () => {
    const writes: { bytes: Uint8Array; position: number }[] = [];
    const sink = {
      async write(bytes: Uint8Array, position: number) {
        writes.push({ bytes: bytes.slice(), position });
      },
      close: vi.fn(),
      abort: vi.fn(),
    };
    const writer = createTimedWebmWriter({
      sink,
      video: { codec: 'vp9', width: 64, height: 64, fps: 30 },
    });
    await writer.addAudio(packet(0), metadata());
    await writer.addVideo(new EncodedPacket(new Uint8Array([1]), 'key', 0, 1 / 30));
    await writer.addAudio(packet(1), undefined, 168);
    expect(await writer.finalize(1440)).toBeNull();
    expect(sink.close).not.toHaveBeenCalled();
    expect(sink.abort).not.toHaveBeenCalled();
    const length = Math.max(...writes.map((write) => write.position + write.bytes.length));
    const output = new Uint8Array(length);
    for (const write of writes) output.set(write.bytes, write.position);
    const all = elements(output);
    expect(unsigned(all.find((item) => item.id === 0x23e383)!.data)).toBe(33333333);
    expect(writes.at(-1)!.position).toBe(all.find((item) => item.id === 0x4489)!.offset);
  });

  it('waits for a slow write and never starts another write after cancellation', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const writer = createTimedWebmWriter({ sink: { write }, signal: controller.signal });
    const pending = writer.addAudio(packet(0), metadata());
    await Promise.resolve();
    expect(write).toHaveBeenCalledOnce();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(write).toHaveBeenCalledOnce();
  });

  it('rejects an unbounded audio lead instead of silently retaining an entire track', async () => {
    const writer = createTimedWebmWriter({
      video: { codec: 'vp9', width: 64, height: 64, fps: 30 },
    });
    for (let i = 0; i < 256; i++)
      await writer.addAudio(packet(i), i === 0 ? metadata() : undefined);
    await expect(writer.addAudio(packet(256))).rejects.toThrow('bounded interleave');
  });
});
