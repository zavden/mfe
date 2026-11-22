// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  chooseEncoderConfig,
  codecCandidates,
  defaultBitrate,
  estimatedVideoBytes,
  probeCodecs,
  type IsConfigSupported,
} from '../codecs';

describe('codec strings', () => {
  it('picks the smallest H.264 level that fits the picture and the macroblock rate', () => {
    expect(codecCandidates('avc', 1280, 720, 30)[0]).toBe('avc1.64001F'); // High, level 3.1
    expect(codecCandidates('avc', 1920, 1080, 30)[0]).toBe('avc1.640028'); // 4.0
    expect(codecCandidates('avc', 1920, 1080, 60)[0]).toBe('avc1.64002A'); // 4.2
    expect(codecCandidates('avc', 3840, 2160, 30)[0]).toBe('avc1.640033'); // 5.1
    expect(codecCandidates('avc', 3840, 2160, 60)[0]).toBe('avc1.640034'); // 5.2
  });

  it('offers High, Main and Baseline per level', () => {
    const list = codecCandidates('avc', 640, 360, 30);
    expect(list.slice(0, 3)).toEqual(['avc1.64001E', 'avc1.4D001E', 'avc1.42E01E']);
    expect(list.length).toBeGreaterThan(3);
  });

  it('has VP9 and AV1 levels by picture size', () => {
    expect(codecCandidates('vp9', 1920, 1080, 30)[0]).toBe('vp09.00.40.08');
    expect(codecCandidates('vp9', 3840, 2160, 60)[0]).toBe('vp09.00.51.08');
    expect(codecCandidates('av1', 1920, 1080, 30)[0]).toBe('av01.0.08M.08');
    expect(codecCandidates('av1', 3840, 2160, 30)[0]).toBe('av01.0.12M.08');
  });

  it('has no candidate for a picture beyond every level', () => {
    expect(codecCandidates('avc', 20000, 20000, 30)).toEqual([]);
  });
});

describe('default bitrate', () => {
  it('grows with the picture and the frame rate, within bounds', () => {
    const hd30 = defaultBitrate('avc', 1920, 1080, 30);
    expect(hd30).toBe(9_300_000);
    expect(defaultBitrate('avc', 1920, 1080, 60)).toBeGreaterThan(hd30);
    expect(defaultBitrate('avc', 3840, 2160, 60)).toBe(74_600_000);
    expect(defaultBitrate('avc', 320, 180, 10)).toBe(500_000);
    expect(defaultBitrate('avc', 7680, 4320, 120)).toBe(80_000_000);
    expect(defaultBitrate('av1', 1920, 1080, 30)).toBeLessThan(hd30);
  });
});

const support = (supported: boolean): VideoEncoderSupport => ({ supported });

describe('chooseEncoderConfig', () => {
  const request = { codec: 'avc' as const, width: 1920, height: 1080, fps: 30, bitrate: null };

  it('returns the first supported candidate, with the default bitrate and the avc format', async () => {
    const seen: string[] = [];
    const isSupported: IsConfigSupported = async (config) => {
      seen.push(config.codec);
      return support(config.codec.startsWith('avc1.4D'));
    };
    const config = await chooseEncoderConfig(request, isSupported);
    expect(seen.slice(0, 2)).toEqual(['avc1.640028', 'avc1.4D0028']);
    expect(config).toMatchObject({
      codec: 'avc1.4D0028',
      width: 1920,
      height: 1080,
      framerate: 30,
      bitrate: 9_300_000,
      latencyMode: 'quality',
      avc: { format: 'avc' },
    });
  });

  it('honours an explicit bitrate and uses the config the browser resolved', async () => {
    const resolved = { codec: 'vp09.00.40.08', width: 1920, height: 1080, bitrate: 1234 };
    const isSupported = vi.fn(async () => ({ supported: true, config: resolved }));
    const config = await chooseEncoderConfig(
      { ...request, codec: 'vp9', bitrate: 5_000_000 },
      isSupported,
    );
    expect(isSupported).toHaveBeenCalledWith(expect.objectContaining({ bitrate: 5_000_000 }));
    expect(config).toBe(resolved);
  });

  it('skips candidates that throw and returns null when none works', async () => {
    let calls = 0;
    const throwing: IsConfigSupported = async () => {
      calls++;
      throw new TypeError('bad codec string');
    };
    expect(await chooseEncoderConfig(request, throwing)).toBeNull();
    expect(calls).toBeGreaterThan(1);
    expect(await chooseEncoderConfig(request, async () => support(false))).toBeNull();
  });

  it('probes every codec at a size', async () => {
    const isSupported: IsConfigSupported = async (config) =>
      support(config.codec.startsWith('avc1') || config.codec.startsWith('vp09'));
    expect(await probeCodecs(1280, 720, 30, isSupported)).toEqual({
      avc: true,
      vp9: true,
      av1: false,
    });
    expect(await probeCodecs(1280, 720, 30, null)).toEqual({ avc: false, vp9: false, av1: false });
  });
});

describe('estimatedVideoBytes', () => {
  it('is the bitrate over the length plus the container, with the default rate', () => {
    const rate = defaultBitrate('avc', 1920, 1080, 60);
    expect(estimatedVideoBytes('avc', 1920, 1080, 60, 10)).toBe(
      Math.round(((rate * 10) / 8) * 1.01),
    );
    expect(estimatedVideoBytes('vp9', 1920, 1080, 60, 10, 4_000_000)).toBe(
      Math.round(((4_000_000 * 10) / 8) * 1.01),
    );
    // Ten minutes at the top rate: about 6 GB, which the dialog warns about.
    expect(estimatedVideoBytes('avc', 7680, 4320, 60, 600)).toBeGreaterThan(5 * 1024 ** 3);
  });
});
