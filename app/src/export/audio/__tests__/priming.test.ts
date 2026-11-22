// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AAC_FRAME_SAMPLES, aacPriming, leadInSamples } from '../priming';

const RATE = 48_000;

describe('leadInSamples', () => {
  it('reads how far before zero the first packet starts, in samples', () => {
    expect(leadInSamples(0)).toBe(0); // Chrome on Windows (Media Foundation)
    expect(leadInSamples(-1024 / RATE)).toBe(1024); // FFmpeg's AAC
    expect(leadInSamples(-2112 / RATE)).toBe(2112); // Apple's AAC, Chrome on a Mac
    expect(leadInSamples(-312 / RATE)).toBe(312); // Opus
    // A timestamp that went through microseconds still says a whole number of samples.
    expect(leadInSamples(-0.021333)).toBe(1024);
    expect(leadInSamples(-0.044)).toBe(2112);
  });

  it('says none for a first packet at zero or after it', () => {
    expect(leadInSamples(1024 / RATE)).toBe(0);
  });
});

describe('aacPriming', () => {
  it('gives one frame of silence to an encoder that starts its stream with the sound', () => {
    expect(AAC_FRAME_SAMPLES).toBe(1024);
    expect(aacPriming(0)).toBe(1024); // Chrome on Windows
  });

  it('adds nothing where the encoder primes a frame or more itself', () => {
    // What Chrome on a Mac and FFmpeg give: their files stay what they were.
    for (const lead of [1024, 1025, 2048, 2112, 2116]) expect(aacPriming(lead)).toBe(0);
  });

  it('completes a lead-in shorter than a frame to exactly one frame', () => {
    for (const lead of [0, 1, 312, 1000, 1023]) {
      expect(aacPriming(lead)).toBeGreaterThan(0);
      expect(lead + aacPriming(lead)).toBe(AAC_FRAME_SAMPLES);
    }
  });

  it('reads a negative lead-in as none', () => {
    expect(aacPriming(-5)).toBe(1024);
  });
});
