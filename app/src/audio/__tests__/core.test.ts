// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyProject, TIME_EPSILON } from '../../model';
import type { AudioAsset, Project } from '../../model/types';
import { ByteBudgetCache } from '../cache';
import { stereoChannelWeights } from '../channels';
import { createAudioEngine } from '../engine';
import { audioPresentationDuration, inspectAudio } from '../inspect';
import { mp3GaplessFrames } from '../mp3';
import { createAudioPlan, mixAudioBlock } from '../plan';
import { resampleStereo } from '../resample';
import type { AudioReader } from '../types';
import { createWaveform, waveformBand } from '../waveform';
import { pcm16Bytes, wavHeader } from '../../export/audio/wav';

const asset: AudioAsset = {
  id: 'asset',
  name: 'Tone',
  originalName: 'tone.wav',
  mimeType: 'audio/wav',
  contentHash: 'a'.repeat(64),
  byteLength: 1,
  duration: 1,
  sampleRate: 44100,
  channels: 1,
};
const reader: AudioReader = {
  async read(source, startFrame, count, signal) {
    signal?.throwIfAborted();
    const channel = Float32Array.from(
      { length: count },
      (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * (startFrame + i)) / source.sampleRate),
    );
    return { startFrame, sampleRate: source.sampleRate, channels: [channel, channel] };
  },
};
function project(): Project {
  const project = createEmptyProject();
  project.audioAssets = [asset];
  project.tracks.push({
    id: 'audio',
    kind: 'audio',
    name: 'Audio',
    hidden: false,
    locked: false,
    muted: false,
  });
  project.audioClips = [
    {
      id: 'clip',
      assetId: asset.id,
      trackId: 'audio',
      start: 0.004,
      end: 0.09,
      sourceStart: 0.012,
      volume: [
        { id: 'a', time: 0.01, gain: 0.3 },
        { id: 'b', time: 0.1, gain: 1.4 },
      ],
    },
  ];
  return project;
}

describe('bounded audio planning and resampling', () => {
  it.each(['missing', 'visual'] as const)('rejects a participating clip on a %s track', (kind) => {
    const p = project();
    p.audioClips[0]!.trackId = kind === 'missing' ? 'missing-track' : p.tracks[0]!.id;
    expect(() => createAudioPlan(p, { duration: 0.1 })).toThrow('audio track');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.95])(
    'rejects an invalid participating source window starting at %s',
    (sourceStart) => {
      const p = project();
      p.audioClips[0]!.sourceStart = sourceStart;
      expect(() => createAudioPlan(p, { duration: 0.1 })).toThrow('source window');
    },
  );

  it('preserves the model epsilon at the end of a valid source window', () => {
    const p = project();
    const clip = p.audioClips[0]!;
    clip.end = clip.start + asset.duration - clip.sourceStart + TIME_EPSILON / 2;
    expect(createAudioPlan(p, { duration: 0.1 }).clips).toHaveLength(1);
    clip.end += TIME_EPSILON;
    expect(() => createAudioPlan(p, { duration: 0.1 })).toThrow('source window');
  });

  it('ignores damaged metadata on muted clips and clips outside the chosen range', () => {
    const p = project();
    const clip = p.audioClips[0]!;
    const track = p.tracks.at(-1)!;
    if (track.kind === 'audio') track.muted = true;
    clip.sourceStart = Number.NaN;
    clip.assetId = 'missing-muted-asset';
    p.audioClips.push({ ...clip, id: 'outside', start: 2, end: 3, trackId: 'missing-track' });
    expect(createAudioPlan(p, { duration: 0.1 }).clips).toHaveLength(0);
  });

  it('leaves out the clips whose original is known to be missing, and keeps the range', () => {
    const p = project();
    const first = p.audioClips[0]!;
    const other: AudioAsset = { ...asset, id: 'other', contentHash: 'b'.repeat(64) };
    p.audioAssets.push(other);
    // The last thing on the timeline is a clip of the other recording.
    p.audioClips.push({ ...first, id: 'late', assetId: other.id, start: 5, end: 5.5 });
    const whole = createAudioPlan(p);
    expect(whole.clips.map((clip) => clip.id)).toEqual([first.id, 'late']);
    const without = createAudioPlan(p, { unavailable: new Set([other.contentHash]) });
    expect(without.clips.map((clip) => clip.id)).toEqual([first.id]);
    expect(without.duration).toBe(whole.duration);
    expect(without.frameCount).toBe(whole.frameCount);
    // A hash nothing uses changes nothing.
    expect(createAudioPlan(p, { unavailable: new Set(['c'.repeat(64)]) }).clips).toHaveLength(2);
  });

  it('preserves quad and 5.0 surrounds instead of treating their fourth channel as LFE', () => {
    expect(stereoChannelWeights(1, 0)).toEqual([1, 1]);
    expect(stereoChannelWeights(2, 1)).toEqual([0, 1]);
    expect(stereoChannelWeights(4, 2)).toEqual([Math.SQRT1_2, 0]);
    expect(stereoChannelWeights(4, 3)).toEqual([0, Math.SQRT1_2]);
    expect(stereoChannelWeights(5, 3)).toEqual([Math.SQRT1_2, 0]);
    expect(stereoChannelWeights(6, 3)).toEqual([0, 0]);
    expect(stereoChannelWeights(7, 4)).toEqual([0.5, 0.5]);
  });
  it('keeps split ramps and arbitrary output blocks sample-identical', async () => {
    const p = project();
    const original = await mixAudioBlock(createAudioPlan(p, { duration: 0.1 }), reader, 0, 4800);
    const clip = p.audioClips[0]!;
    const cut = 0.037;
    p.audioClips = [
      { ...clip, end: cut },
      {
        ...clip,
        id: 'split',
        start: cut,
        sourceStart: clip.sourceStart + cut - clip.start,
        volume: clip.volume.map((point) => ({ ...point })),
      },
    ];
    const plan = createAudioPlan(p, { duration: 0.1 });
    const split = await mixAudioBlock(plan, reader, 0, 4800);
    expect(split.channels[0]).toEqual(original.channels[0]);
    const seek = await mixAudioBlock(plan, reader, 2017, 1403);
    expect(seek.channels[0]).toEqual(original.channels[0].slice(2017, 3420));
    expect(original.channels[0].slice(0, 192).every((value) => value === 0)).toBe(true);
  });

  it('mutes authored audio before attempting to read missing originals', async () => {
    const p = project();
    const track = p.tracks.at(-1)!;
    if (track.kind === 'audio') track.muted = true;
    const plan = createAudioPlan(p, { duration: 0.1 });
    expect(plan.clips).toHaveLength(0);
    const block = await mixAudioBlock(
      plan,
      {
        read() {
          throw new Error('Must not read');
        },
      },
      0,
      4800,
    );
    expect(block.peak).toBe(0);
  });

  it('keeps an hour plan bounded and reports clipping without normalization', async () => {
    const p = project();
    p.audioAssets = [{ ...asset, duration: 3600 }];
    p.audioClips[0] = {
      ...p.audioClips[0]!,
      start: 3599,
      end: 3600,
      sourceStart: 0,
      volume: [{ id: 'gain', time: 0, gain: 4 }],
    };
    const plan = createAudioPlan(p, { duration: 3600 });
    const block = await mixAudioBlock(plan, reader, 3599 * 48000, 4096);
    expect(block.channels[0]).toHaveLength(4096);
    expect(block.peak).toBeGreaterThan(1.19);
    expect(block.clippedSamples).toBeGreaterThan(0);
  });

  it('plans a scene of any length: only a file has a longest range', async () => {
    const p = project();
    p.meta.duration = 2 * 3600;
    p.audioAssets = [{ ...asset, duration: 3600 }];
    p.audioClips[0] = { ...p.audioClips[0]!, start: 3599, end: 3600, sourceStart: 0, volume: [] };
    const plan = createAudioPlan(p);
    expect(plan.duration).toBe(7200);
    expect(plan.frameCount).toBe(7200 * 48000);
    expect((await mixAudioBlock(plan, reader, 3599 * 48000, 4096)).peak).toBeGreaterThan(0.2);
    // Past the last clip there is nothing to read.
    const silent: AudioReader = {
      read() {
        throw new Error('Must not read');
      },
    };
    expect((await mixAudioBlock(plan, silent, 7000 * 48000, 4096)).peak).toBe(0);
    for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => createAudioPlan(p, { duration })).toThrow('audio range');
  });

  it('suppresses frequencies above the downsampled Nyquist and preserves DC at edges', () => {
    const rate = 96000;
    const input = Float32Array.from({ length: 9600 }, (_, i) =>
      Math.sin((2 * Math.PI * 36000 * i) / rate),
    );
    const output = resampleStereo(
      { startFrame: 0, sampleRate: rate, channels: [input, input] },
      100,
      2,
      4000,
      48000,
    )[0];
    expect(Math.max(...output.map(Math.abs))).toBeLessThan(0.002);
    const dc = new Float32Array(200).fill(0.37);
    const converted = resampleStereo(
      { startFrame: 0, sampleRate: 44100, channels: [dc, dc] },
      0,
      44100 / 48000,
      215,
      48000,
    )[0];
    expect(Math.max(...converted) - Math.min(...converted)).toBeLessThan(1e-6);
  });
});

describe('derived audio memory and media reads', () => {
  it('uses one byte budget across sources and makes a read refresh recency', () => {
    const cache = new ByteBudgetCache<string>(16);
    cache.set('a', 'a', 8);
    cache.set('b', 'b', 8);
    cache.get('a');
    cache.set('c', 'c', 8);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('a');
    expect(cache.bytes).toBe(16);
    expect(cache.peakBytes).toBe(16);
    cache.set('huge', 'x', 17);
    expect(cache.bytes).toBe(16);
  });

  it('decodes adjacent PCM pages and seeks without duplicating samples', async () => {
    const frames = 70001;
    const left = Float32Array.from({ length: frames }, (_, i) => ((i % 100) - 50) / 100);
    const bytes = pcm16Bytes({ startFrame: 0, sampleRate: 48000, channels: [left, left] });
    const blob = new Blob([wavHeader(frames), bytes]);
    const info = await inspectAudio(blob);
    expect(info.duration).toBeCloseTo(frames / 48000, 8);
    const wavAsset = { ...asset, ...info, contentHash: 'b'.repeat(64), byteLength: blob.size };
    const engine = createAudioEngine(async () => blob, { pcmBudgetBytes: 32768 * 8 });
    try {
      await engine.read(wavAsset, 0, 20);
      await engine.read(wavAsset, 65536, 20);
      await engine.read(wavAsset, 32768, 20);
      expect(engine.stats.readerCount).toBe(2);
      expect(engine.stats.continuousPages).toBe(1);
      for (const start of [32700, 65500, 23, 32700]) {
        const data = await engine.read(wavAsset, start, 501);
        for (let i = 0; i < 501; i++) expect(data.channels[0][i]).toBeCloseTo(left[start + i]!, 4);
      }
      expect(engine.stats.cacheBytes).toBeLessThanOrEqual(32768 * 8);
      expect(engine.stats.peakCacheBytes).toBeLessThanOrEqual(32768 * 8);
      await expect(engine.read(wavAsset, 0, 262145)).rejects.toThrow('bounded');
    } finally {
      await engine.dispose();
    }
  });

  it('uses both LAME delay and trailing padding for MP3 presentation length', () => {
    const bytes = new Uint8Array(256);
    bytes.set([0xff, 0xfb, 0x90, 0]);
    bytes.set(new TextEncoder().encode('Info'), 36);
    new DataView(bytes.buffer).setUint32(40, 3);
    new DataView(bytes.buffer).setUint32(44, 155);
    bytes.set(new TextEncoder().encode('Lavc'), 52);
    bytes[73] = 576 >> 4;
    bytes[74] = ((576 & 15) << 4) | (1584 >> 8);
    bytes[75] = 1584 & 255;
    expect(mp3GaplessFrames(bytes)).toBe(176400);
    expect(mp3GaplessFrames(new Uint8Array(256))).toBeNull();
    expect(audioPresentationDuration(4.0239229, -1105 / 44100, 44100, 176400)).toBe(4);
    expect(() => audioPresentationDuration(3, -1105 / 44100, 44100, 176400)).toThrow('incomplete');
  });

  it('rejects premature decoder EOF instead of padding a damaged source with silence', async () => {
    const samples = new Float32Array(1000).fill(0.25);
    const blob = new Blob([
      wavHeader(1000),
      pcm16Bytes({ startFrame: 0, sampleRate: 48000, channels: [samples, samples] }),
    ]);
    const damagedAsset = {
      ...asset,
      sampleRate: 48000,
      channels: 2,
      duration: 3200 / 48000,
      contentHash: 'e'.repeat(64),
      byteLength: blob.size,
    };
    const engine = createAudioEngine(async () => blob);
    try {
      await expect(engine.read(damagedAsset, 2400, 100)).rejects.toThrow(
        'ended before its declared duration',
      );
      expect(engine.stats.cacheBytes).toBe(0);
    } finally {
      await engine.dispose();
    }
  });

  it('keeps two distant streaming cursors after unrelated cold seeks fill the reader pool', async () => {
    const samples = new Float32Array(48000).fill(0.25);
    const second = new Blob([
      pcm16Bytes({ startFrame: 0, sampleRate: 48000, channels: [samples, samples] }),
    ]);
    const blob = new Blob([wavHeader(70 * 48000), ...Array.from({ length: 70 }, () => second)]);
    const source = {
      ...asset,
      sampleRate: 48000,
      channels: 2,
      duration: 70,
      contentHash: 'f'.repeat(64),
      byteLength: blob.size,
    };
    const engine = createAudioEngine(async () => blob, { pcmBudgetBytes: 32768 * 8 });
    try {
      for (const page of [90, 80, 70, 60, 0, 10, 1, 11, 2, 12])
        await engine.read(source, page * 32768, 1);
      expect(engine.stats.readerCount).toBe(4);
      expect(engine.stats.decoderSeeks).toBe(6);
      expect(engine.stats.continuousPages).toBe(4);
    } finally {
      await engine.dispose();
    }
  });

  it('summarizes a waveform pyramid and reads only viewport-sized bands', async () => {
    const waveform = await createWaveform(
      { ...asset, duration: 0.1, contentHash: 'c'.repeat(64) },
      reader,
    );
    expect(waveform.levels.at(-1)!.min).toHaveLength(1);
    const band = waveformBand(waveform, 0.025, 0.06, 17);
    expect(band.min).toHaveLength(17);
    expect(band.min.every((value) => value < -0.29)).toBe(true);
    expect(band.max.every((value) => value > 0.29)).toBe(true);
  });
});
