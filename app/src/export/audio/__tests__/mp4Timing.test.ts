// @vitest-environment node
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { MP4_MOVIE_TIMESCALE, mp4TrackEnd } from '../mp4Timing';

const RATE = 48_000;
const FRAME = 1024; // an AAC packet

/** The fields of an MP4 that say how long its one track lasts (all of them version 0). */
interface Mp4Times {
  movieTimescale: number;
  movieDuration: number;
  trackDuration: number;
  mediaTimescale: number;
  mediaDuration: number;
  /** The edit list: what of the media is presented, or null when the whole of it is. */
  edit: { duration: number; mediaTime: number } | null;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'edts']);

function mp4Times(bytes: Uint8Array): Mp4Times {
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
  const at = (type: string) => {
    const offset = found.get(type);
    if (offset === undefined) throw new Error(`no ${type} box`);
    if (view.getUint8(offset) !== 0) throw new Error(`${type} is not version 0`);
    return offset;
  };
  const mvhd = at('mvhd');
  const tkhd = at('tkhd');
  const mdhd = at('mdhd');
  const elst = found.has('elst') ? at('elst') : null;
  if (elst !== null && view.getUint32(elst + 4) !== 1) throw new Error('more than one edit');
  return {
    movieTimescale: view.getUint32(mvhd + 12),
    movieDuration: view.getUint32(mvhd + 16),
    trackDuration: view.getUint32(tkhd + 20),
    mediaTimescale: view.getUint32(mdhd + 12),
    mediaDuration: view.getUint32(mdhd + 16),
    edit:
      elst === null
        ? null
        : { duration: view.getUint32(elst + 8), mediaTime: view.getInt32(elst + 12) },
  };
}

/** An MP4 of AAC packets as an encoder with `lead` samples of lead-in gives them for `frames`
 * samples of sound: the first begins `lead` samples before zero, and the last is said to end at
 * `end` seconds. */
async function muxed(lead: number, frames: number, end: number): Promise<Mp4Times> {
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new BufferTarget(),
  });
  const source = new EncodedAudioPacketSource('aac');
  output.addAudioTrack(source);
  await output.start();
  const meta: EncodedAudioChunkMetadata = {
    decoderConfig: {
      codec: 'mp4a.40.2',
      sampleRate: RATE,
      numberOfChannels: 2,
      description: new Uint8Array([0x11, 0x90]), // AAC-LC, 48 kHz, stereo
    },
  };
  const starts: number[] = [];
  for (let start = -lead; start < frames; start += FRAME) starts.push(start);
  for (const [index, start] of starts.entries()) {
    const last = index === starts.length - 1;
    const timestamp = start / RATE;
    await source.add(
      new EncodedPacket(
        new Uint8Array(16).fill(index + 1),
        'key',
        timestamp,
        last ? end - timestamp : FRAME / RATE,
      ),
      index === 0 ? meta : undefined,
    );
  }
  await output.finalize();
  return mp4Times(new Uint8Array(output.target.buffer!));
}

/** How many samples a reader presents: the edit, counted in the movie's clock, brought back to
 * the media's (FFmpeg and the browsers round it to the nearest sample). */
function presented(times: Mp4Times): number {
  if (!times.edit) return times.mediaDuration;
  return Math.round((times.edit.duration * times.mediaTimescale) / times.movieTimescale);
}

// 0: no lead-in. 312: Opus. 1024: FFmpeg's AAC. 2112: Apple's AAC, the one of a browser on a Mac.
const LEADS = [0, 312, 1024, 2112, 2113, 2114, 2115, 2116];
const LENGTHS = [1, 1500, 47_999, 48_000, 48_001, 48_002, 48_003, 48_004, 96_000, 144_007];

describe('mp4TrackEnd', () => {
  it('counts in the clock the muxer writes', async () => {
    expect((await muxed(0, RATE, 1)).movieTimescale).toBe(MP4_MOVIE_TIMESCALE);
  });

  it('is within half a sample of the true end, and the true end when that is enough', () => {
    for (const lead of LEADS) {
      for (const frames of LENGTHS) {
        const end = mp4TrackEnd(-lead / RATE, frames);
        expect(Math.abs(end * RATE - frames), `${lead}, ${frames}`).toBeLessThan(0.5);
      }
    }
    expect(mp4TrackEnd(0, 48_001)).toBe(48_001 / RATE);
    expect(mp4TrackEnd(-1024 / RATE, 48_001)).toBe(48_001 / RATE);
    expect(mp4TrackEnd(-2112 / RATE, 96_000)).toBe(2);
  });

  it('the muxer alone says a sample too many for some lead-ins: the two it rounds add up', async () => {
    // What a Mac showed: 48001 samples after Apple's lead-in present 48002 (ffprobe: 1.000042 s).
    const plain = await muxed(2112, 48_001, 48_001 / RATE);
    expect(plain.edit).toEqual({ duration: 57_602, mediaTime: 2112 });
    expect(presented(plain)).toBe(48_002);
    // With FFmpeg's lead-in the same length is right, which is why it went unseen.
    expect(presented(await muxed(1024, 48_001, 48_001 / RATE))).toBe(48_001);
  });

  it('makes the file present exactly the samples of the sound, whatever the lead-in', async () => {
    for (const lead of LEADS) {
      for (const frames of LENGTHS) {
        const times = await muxed(lead, frames, mp4TrackEnd(-lead / RATE, frames));
        const label = `lead-in ${lead}, ${frames} samples`;
        expect(presented(times), label).toBe(frames);
        // The media keeps its own count: the lead-in and the sound, in samples.
        expect(times.mediaTimescale, label).toBe(RATE);
        expect(times.mediaDuration, label).toBe(lead + frames);
        expect(times.edit?.mediaTime ?? 0, label).toBe(lead);
        // The movie and the track say the same as the edit: the nearest tick of their clock.
        const ticks = Math.round((frames * MP4_MOVIE_TIMESCALE) / RATE);
        expect(times.trackDuration, label).toBe(ticks);
        expect(times.movieDuration, label).toBe(ticks);
      }
    }
  });
});
