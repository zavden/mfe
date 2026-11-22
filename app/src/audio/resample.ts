import type { AudioPcm } from './types';
import { ByteBudgetCache } from './cache';

const PHASES = 1024;
const filters = new ByteBudgetCache<Float32Array>(8 * 1024 * 1024);

/** A Blackman-windowed sinc filter. Its phase comes from absolute source coordinates, so
 * blocks and seeks never reset phase. Adjacent windows supply the same filter halo. */
export function resampleRadius(sourceRate: number, targetRate: number): number {
  return Math.ceil(24 / Math.min(1, targetRate / sourceRate));
}

function sinc(x: number): number {
  return Math.abs(x) < 1e-10 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
}

function filter(sourceRate: number, targetRate: number): Float32Array {
  const key = `${sourceRate}:${targetRate}`;
  const cached = filters.get(key);
  if (cached) return cached;
  const cutoff = Math.min(1, targetRate / sourceRate);
  const radius = resampleRadius(sourceRate, targetRate);
  const taps = 2 * radius;
  const weights = new Float32Array(PHASES * taps);
  for (let phase = 0; phase < PHASES; phase++) {
    let total = 0;
    for (let tap = 0; tap < taps; tap++) {
      const distance = phase / PHASES - (tap - radius + 1);
      const window =
        0.42 +
        0.5 * Math.cos((Math.PI * distance) / radius) +
        0.08 * Math.cos((2 * Math.PI * distance) / radius);
      const weight = cutoff * sinc(distance * cutoff) * window;
      weights[phase * taps + tap] = weight;
      total += weight;
    }
    for (let tap = 0; tap < taps; tap++) weights[phase * taps + tap]! /= total;
  }
  filters.set(key, weights, weights.byteLength);
  return weights;
}

export function resampleStereo(
  pcm: AudioPcm,
  firstSourceFrame: number,
  sourceStep: number,
  count: number,
  targetRate: number,
): readonly [Float32Array, Float32Array] {
  const left = new Float32Array(count);
  const right = new Float32Array(count);
  const length = pcm.channels[0].length;
  if (length === 0) return [left, right];
  const cutoff = Math.min(1, targetRate / pcm.sampleRate);
  const radius = resampleRadius(pcm.sampleRate, targetRate);
  const weights = filter(pcm.sampleRate, targetRate);
  for (let i = 0; i < count; i++) {
    const position = firstSourceFrame + i * sourceStep - pcm.startFrame;
    const nearest = Math.round(position);
    if (cutoff === 1 && Math.abs(position - nearest) < 1e-8) {
      const at = Math.max(0, Math.min(length - 1, nearest));
      left[i] = pcm.channels[0][at]!;
      right[i] = pcm.channels[1][at]!;
      continue;
    }
    let l = 0;
    let r = 0;
    let base = Math.floor(position);
    let phase = Math.round((position - base) * PHASES);
    if (phase === PHASES) {
      base++;
      phase = 0;
    }
    for (let tap = 0; tap < 2 * radius; tap++) {
      const n = base + tap - radius + 1;
      const weight = weights[phase * 2 * radius + tap]!;
      const at = Math.max(0, Math.min(length - 1, n));
      l += pcm.channels[0][at]! * weight;
      r += pcm.channels[1][at]! * weight;
    }
    left[i] = l;
    right[i] = r;
  }
  return [left, right];
}
