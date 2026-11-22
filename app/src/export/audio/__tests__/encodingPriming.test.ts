// @vitest-environment node
import { CustomAudioEncoder, EncodedPacket, registerEncoder, type AudioSample } from 'mediabunny';
import { afterEach, describe, expect, it, vi } from 'vitest';

/* The priming of an AAC export, with the browser's encoder played by one that starts its stream
 * a given number of samples before the sound: none, as Chrome's does on Windows (Media
 * Foundation), 1 024 as FFmpeg's, 2 112 as the one of a Mac. The real ones exist on their system
 * only (`e2e/audioExport.spec.ts` hears them); this one runs anywhere. */

const RATE = 48_000;
const FRAME = 1024;

interface Fed {
  /** The first sample of what the encoder was given, counted from the start of the sound. */
  start: number;
  frames: number;
  silent: boolean;
}

/** The encoder of the test in progress: its lead-in, what it has been given so far, and which
 * of the pieces it is given (by their first sample) it fails on. */
const encoder = {
  lead: 0,
  fed: [] as Fed[],
  fails: null as ((start: number) => boolean) | null,
};

class FakeAac extends CustomAudioEncoder {
  private next: number | null = null;
  private pending = 0;
  private first = true;

  static override supports(codec: string): boolean {
    return codec === 'aac';
  }

  init(): void {}

  encode(sample: AudioSample): void {
    const start = Math.round(sample.timestamp * RATE);
    const data = new Float32Array(sample.numberOfFrames);
    sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
    encoder.fed.push({
      start,
      frames: sample.numberOfFrames,
      silent: data.every((value) => value === 0),
    });
    if (encoder.fails?.(start)) throw new Error('The encoder failed.');
    if (this.next === null) {
      // The stream starts `lead` samples before what it was first given.
      this.next = start - encoder.lead;
      this.pending = encoder.lead;
    }
    this.pending += sample.numberOfFrames;
    while (this.pending >= FRAME) this.emit();
  }

  flush(): void {
    while (this.pending > 0) this.emit(); // the last frame, padded
  }

  close(): void {}

  private emit(): void {
    const meta: EncodedAudioChunkMetadata | undefined = this.first
      ? {
          decoderConfig: {
            codec: 'mp4a.40.2',
            sampleRate: RATE,
            numberOfChannels: 2,
            description: new Uint8Array([0x11, 0x90]), // AAC-LC, 48 kHz, stereo
          },
        }
      : undefined;
    this.first = false;
    this.onPacket(
      new EncodedPacket(new Uint8Array(16), 'key', this.next! / RATE, FRAME / RATE),
      meta,
    );
    this.next! += FRAME;
    this.pending -= FRAME;
  }
}

// Once: mediabunny is one for the whole file, and asks the encoders it knows in their order.
registerEncoder(FakeAac);

/** `../encoding` loaded anew, over an AAC encoder with `lead` samples of lead-in: what a page
 * learns of its encoder it keeps for as long as it lives. */
async function withEncoder(lead: number, fails: typeof encoder.fails = null) {
  encoder.lead = lead;
  encoder.fed = [];
  encoder.fails = fails;
  vi.resetModules();
  const { createAudioEncoder } = await import('../encoding');
  return { createAudioEncoder, fed: encoder.fed };
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'edts', 'minf', 'stbl']);

/** What an MP4 says of its one track: the edit list (null: the whole media is presented), the
 * number of packets, and where the first one starts and the presentation ends, in samples. */
function track(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = new Map<string, number>();
  const walk = (from: number, to: number) => {
    for (let at = from; at + 8 <= to;) {
      const size = view.getUint32(at);
      const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      if (size < 8) break;
      if (CONTAINERS.has(type)) walk(at + 8, at + size);
      else if (!found.has(type)) found.set(type, at + 8);
      at += size;
    }
  };
  walk(0, bytes.length);
  const elst = found.get('elst');
  const movieTimescale = view.getUint32(found.get('mvhd')! + 12);
  const mediaTimescale = view.getUint32(found.get('mdhd')! + 12);
  const edit =
    elst === undefined
      ? null
      : { duration: view.getUint32(elst + 8), mediaTime: view.getInt32(elst + 12) };
  return {
    edit,
    packets: view.getUint32(found.get('stsz')! + 8),
    mediaDuration: view.getUint32(found.get('mdhd')! + 16),
    presented: edit
      ? Math.round((edit.duration * mediaTimescale) / movieTimescale)
      : view.getUint32(found.get('mdhd')! + 16),
  };
}

/** `frames` samples of a sound that is never silent, in blocks as an export gives them. */
async function exported(lead: number, frames: number, fails: typeof encoder.fails = null) {
  const { createAudioEncoder, fed } = await withEncoder(lead, fails);
  const output = await createAudioEncoder('mp4-aac');
  // What the encoder was given first, to learn its lead-in, is no part of what the export
  // encodes: the rest is.
  const learned = fed.splice(0, 1);
  for (let startFrame = 0; startFrame < frames; startFrame += 4096) {
    const count = Math.min(4096, frames - startFrame);
    const channel = Float32Array.from(
      { length: count },
      (_, i) => 0.5 + ((startFrame + i) % 7) / 100,
    );
    await output.add({ startFrame, sampleRate: RATE, channels: [channel, channel.slice()] });
  }
  const blob = await output.finalize();
  return { learned, fed, file: track(new Uint8Array(await blob!.arrayBuffer())) };
}

afterEach(() => {
  vi.resetModules();
});

describe('the priming of an AAC export', () => {
  it('learns the lead-in of the encoder from two frames of silence, once', async () => {
    const { createAudioEncoder, fed } = await withEncoder(0);
    await (await createAudioEncoder('mp4-aac')).cancel();
    expect(fed[0]).toEqual({ start: 0, frames: 2 * FRAME, silent: true });
    const afterFirst = fed.filter((piece) => piece.start === 0 && piece.frames === 2 * FRAME);
    await (await createAudioEncoder('mp4-aac')).cancel();
    expect(fed.filter((piece) => piece.start === 0 && piece.frames === 2 * FRAME)).toEqual(
      afterFirst,
    );
  });

  it('gives an encoder that starts with the sound a frame of silence before it', async () => {
    // Chrome on Windows: the first packet at zero, no edit list, the start of the sound lost.
    const { learned, fed, file } = await exported(0, 10_000);
    expect(learned).toEqual([{ start: 0, frames: 2 * FRAME, silent: true }]);
    expect(fed[0]).toEqual({ start: -FRAME, frames: FRAME, silent: true });
    expect(fed.slice(1).every((piece) => !piece.silent && piece.start >= 0)).toBe(true);
    expect(fed.slice(1).reduce((sum, piece) => sum + piece.frames, 0)).toBe(10_000);
    // The file leaves that frame out, and presents the sound whole.
    expect(file.edit?.mediaTime).toBe(FRAME);
    expect(file.presented).toBe(10_000);
    expect(file.packets).toBe(1 + Math.ceil(10_000 / FRAME));
  });

  it('adds nothing where the encoder primes a frame or more itself', async () => {
    for (const lead of [1024, 2112]) {
      const { learned, fed, file } = await exported(lead, 10_000);
      expect(learned, String(lead)).toEqual([{ start: 0, frames: 2 * FRAME, silent: true }]);
      // Only the sound, from zero: the encoder gets what it got before.
      expect(
        fed.every((piece) => !piece.silent),
        String(lead),
      ).toBe(true);
      expect(fed[0]!.start, String(lead)).toBe(0);
      expect(file.edit?.mediaTime, String(lead)).toBe(lead);
      expect(file.presented, String(lead)).toBe(10_000);
    }
  });

  it('completes a lead-in shorter than a frame to one frame', async () => {
    const { fed, file } = await exported(312, 10_000);
    expect(fed[0]).toEqual({ start: -(FRAME - 312), frames: FRAME - 312, silent: true });
    expect(file.edit?.mediaTime).toBe(FRAME);
    expect(file.presented).toBe(10_000);
  });

  it('goes on without it when the encoder cannot be asked, and asks again the next time', async () => {
    // An encoder that fails the first thing it is given, the two frames it is asked with.
    let asked = false;
    const once = () => !asked && (asked = true);
    const { learned, fed, file } = await exported(0, 10_000, once);
    expect(learned).toEqual([{ start: 0, frames: 2 * FRAME, silent: true }]);
    // What every encoder got before: the sound alone, and a file that starts with it.
    expect(fed.every((piece) => !piece.silent)).toBe(true);
    expect(file.edit).toBeNull();
    expect(file.presented).toBe(10_000);
    // A failure is not the encoder's answer: the next export asks again, and primes.
    const { createAudioEncoder } = await import('../encoding');
    const before = fed.length;
    await (await createAudioEncoder('mp4-aac')).cancel();
    expect(fed.slice(before, before + 2)).toEqual([
      { start: 0, frames: 2 * FRAME, silent: true },
      { start: -FRAME, frames: FRAME, silent: true },
    ]);
  });

  it('says so at the first of the sound when the encoder fails on that silence', async () => {
    // Where the caller of the export hears it, and cancels what was started.
    const { createAudioEncoder } = await withEncoder(0, (start) => start === -FRAME);
    const output = await createAudioEncoder('mp4-aac');
    const channel = new Float32Array(4096).fill(0.5);
    await expect(
      output.add({ startFrame: 0, sampleRate: RATE, channels: [channel, channel.slice()] }),
    ).rejects.toThrow('The encoder failed.');
    await output.cancel();
  });
});
