// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioAsset } from '../../model/types';
import type { AudioPlan } from '../plan';
import { createAudioPlayback } from '../playback';
import type { AudioPcm, AudioReader } from '../types';

interface FakeGain {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
  };
  connect(): void;
  disconnect(): void;
}

class FakeContext {
  currentTime = 0;
  baseLatency = 0;
  destination = {};
  nodes: FakeNode[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => undefined);
  suspend = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createBuffer(channels: number, frames: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(frames));
    return {
      duration: frames / rate,
      data,
      copyToChannel(values: Float32Array, channel: number) {
        data[channel]!.set(values);
      },
    };
  }
  createBufferSource() {
    const node = new FakeNode();
    this.nodes.push(node);
    return node;
  }
  createGain(): FakeGain {
    const gain = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelAndHoldAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect() {},
      disconnect() {},
    };
    this.gains.push(gain);
    return gain;
  }
  asAudioContext() {
    return this as unknown as AudioContext;
  }
}
class FakeNode {
  buffer: ReturnType<FakeContext['createBuffer']> | null = null;
  started = -1;
  stopped = -1;
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start(at: number) {
    this.started = at;
  }
  stop(at: number) {
    this.stopped = at;
  }
}
const asset: AudioAsset = {
  id: 'asset',
  name: 'One',
  originalName: 'one.wav',
  mimeType: 'audio/wav',
  byteLength: 0,
  contentHash: 'd'.repeat(64),
  duration: 1,
  sampleRate: 48000,
  channels: 1,
};
const reader: AudioReader = {
  async read(_asset, startFrame, count) {
    const channel = new Float32Array(count).fill(0.5);
    return { startFrame, sampleRate: 48000, channels: [channel, channel] };
  },
};
const plan: AudioPlan = {
  start: 0,
  duration: 0.05,
  sampleRate: 48000,
  frameCount: 2400,
  clips: [{ id: 'clip', asset, startFrame: 0, endFrame: 2400, sourceBaseFrame: 0, volume: [] }],
};

afterEach(() => vi.useRealTimers());

describe('audio-clock playback scheduling', () => {
  it('schedules loop boundaries ahead and wraps the audible project clock', async () => {
    vi.useFakeTimers();
    const context = new FakeContext();
    const playback = createAudioPlayback(reader, { createContext: () => context.asAudioContext() });
    await playback.start(plan, 0, { loop: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(context.nodes.length).toBeGreaterThanOrEqual(4);
    expect(context.nodes[1]!.started).toBeCloseTo(context.nodes[0]!.started + 0.05, 9);
    expect(playback.stats.queuedNodes).toBeLessThanOrEqual(6);
    context.currentTime = 0.13;
    expect(playback.currentTime()).toBeCloseTo(0.02, 8);
    playback.pause();
    expect(
      context.nodes
        .filter((node) => node.started + node.buffer!.duration > context.currentTime)
        .every((node) => node.stopped >= 0),
    ).toBe(true);
    await playback.dispose();
  });

  it('replaces live envelope audio at one future sample boundary without moving the clock', async () => {
    vi.useFakeTimers();
    const context = new FakeContext();
    const playback = createAudioPlayback(reader, { createContext: () => context.asAudioContext() });
    await playback.start(plan, 0, { loop: true });
    await vi.advanceTimersByTimeAsync(1);
    context.currentTime = 0.07;
    const before = playback.currentTime();
    const oldCount = context.nodes.length;
    playback.update({
      ...plan,
      clips: [{ ...plan.clips[0]!, volume: [{ id: 'zero', time: 0, gain: 0 }] }],
    });
    await vi.advanceTimersByTimeAsync(30);
    expect(playback.currentTime()).toBeCloseTo(before, 9);
    expect(context.nodes[0]!.stopped).toBeCloseTo(0.1, 9);
    const replacement = context.nodes[oldCount]!;
    expect(replacement.started).toBeCloseTo(0.095, 9);
    expect(replacement.buffer!.data[0]!.every((sample) => sample === 0)).toBe(true);
    expect(context.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.1);
    expect(context.gains[oldCount]!.gain.setValueAtTime).toHaveBeenCalledWith(0, 0.095);
    expect(context.gains[oldCount]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 0.1);
    await playback.dispose();
  });

  it('cancels a pending preparation before any stale node can start', async () => {
    const context = new FakeContext();
    let release!: (pcm: AudioPcm) => void;
    const deferred: AudioReader = {
      read: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    };
    const playback = createAudioPlayback(deferred, {
      createContext: () => context.asAudioContext(),
    });
    const start = playback.start(plan, 0);
    expect(context.resume).toHaveBeenCalledOnce();
    playback.pause();
    const samples = new Float32Array(2500);
    release({ startFrame: 0, sampleRate: 48000, channels: [samples, samples] });
    await expect(start).rejects.toMatchObject({ name: 'AbortError' });
    expect(context.nodes).toHaveLength(0);
    await playback.dispose();
  });
});
