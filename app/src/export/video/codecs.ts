/* Codec strings, levels and bitrates for the WebCodecs encoder.
 *
 * `codecCandidates` lists the codec strings to try for a codec at a size and frame rate, best
 * first (H.264: High, Main, Baseline at the smallest level that fits the picture and the macroblock
 * rate); `chooseEncoderConfig` returns the first one `isConfigSupported` accepts. */
import type { VideoOptions } from '../types';

export type VideoCodec = VideoOptions['codec'];
export const VIDEO_CODECS: readonly VideoCodec[] = ['avc', 'vp9', 'av1'];

export function codecLabel(codec: VideoCodec): string {
  return codec === 'avc' ? 'H.264' : codec === 'vp9' ? 'VP9' : 'AV1';
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

/** H.264 levels: [level_idc, max macroblocks per frame, max macroblocks per second]. */
const AVC_LEVELS: readonly (readonly [number, number, number])[] = [
  [0x1e, 1620, 40500], // 3.0
  [0x1f, 3600, 108000], // 3.1
  [0x20, 5120, 216000], // 3.2
  [0x28, 8192, 245760], // 4.0
  [0x29, 8192, 245760], // 4.1
  [0x2a, 8704, 522240], // 4.2
  [0x32, 22080, 589824], // 5.0
  [0x33, 36864, 983040], // 5.1
  [0x34, 36864, 2073600], // 5.2
  [0x3c, 139264, 4177920], // 6.0
  [0x3d, 139264, 8355840], // 6.1
  [0x3e, 139264, 16711680], // 6.2
];

/** VP9 levels: [level × 10, max luma picture size, max luma sample rate]. */
const VP9_LEVELS: readonly (readonly [number, number, number])[] = [
  [10, 36864, 829440],
  [11, 73728, 2764800],
  [20, 122880, 4608000],
  [21, 245760, 9216000],
  [30, 552960, 20736000],
  [31, 983040, 36864000],
  [40, 2228224, 83558400],
  [41, 2228224, 160432128],
  [50, 8912896, 311951360],
  [51, 8912896, 588251136],
  [52, 8912896, 1176502272],
  [60, 35651584, 1176502272],
  [61, 35651584, 2353004544],
  [62, 35651584, 4706009088],
];

/** AV1 levels: [seq_level_idx, max picture size in luma samples]. */
const AV1_LEVELS: readonly (readonly [number, number])[] = [
  [0, 147456], // 2.0
  [1, 278784], // 2.1
  [4, 665856], // 3.0
  [5, 1065024], // 3.1
  [8, 2359296], // 4.0
  [9, 2359296], // 4.1
  [12, 8912896], // 5.0
  [13, 8912896], // 5.1
  [14, 8912896], // 5.2
  [16, 35651584], // 6.0
  [17, 35651584], // 6.1
  [18, 35651584], // 6.2
];

/** Indices of the levels in `table` that fit, smallest first (then a few larger ones as spares). */
function fitting<T>(table: readonly T[], fits: (entry: T) => boolean): T[] {
  const first = table.findIndex(fits);
  return first < 0 ? [] : table.slice(first, first + 3);
}

export function codecCandidates(
  codec: VideoCodec,
  width: number,
  height: number,
  fps: number,
): string[] {
  if (codec === 'avc') {
    const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
    const levels = fitting(
      AVC_LEVELS,
      ([, maxFs, maxMbps]) => mbs <= maxFs && mbs * fps <= maxMbps,
    );
    // profile_idc + constraint flags: High 64 00, Main 4D 00, Constrained Baseline 42 E0
    return levels.flatMap(([idc]) => [
      `avc1.6400${hex2(idc)}`,
      `avc1.4D00${hex2(idc)}`,
      `avc1.42E0${hex2(idc)}`,
    ]);
  }
  if (codec === 'vp9') {
    const samples = width * height;
    return fitting(
      VP9_LEVELS,
      ([, maxPs, maxSr]) => samples <= maxPs && samples * fps <= maxSr,
    ).map(([level]) => `vp09.00.${level}.08`);
  }
  const samples = width * height;
  return fitting(AV1_LEVELS, ([, maxPs]) => samples <= maxPs).map(
    ([idx]) => `av01.0.${String(idx).padStart(2, '0')}M.08`,
  );
}

/** Bits per second for flat vector graphics with sharp text: bits per pixel per frame by codec,
 * clamped to 0.5–80 Mbit/s and rounded to 100 kbit/s. */
export function defaultBitrate(codec: VideoCodec, width: number, height: number, fps: number) {
  const bitsPerPixel = codec === 'avc' ? 0.15 : codec === 'vp9' ? 0.1 : 0.08;
  const raw = width * height * fps * bitsPerPixel;
  return Math.round(Math.min(80_000_000, Math.max(500_000, raw)) / 100_000) * 100_000;
}

/** About how large the file comes out: the bitrate over the length, plus the container's
 * share (about 1 %). Flat scenes with little motion come out smaller (the rate is variable). */
export function estimatedVideoBytes(
  codec: VideoCodec,
  width: number,
  height: number,
  fps: number,
  seconds: number,
  bitrate: number | null = null,
): number {
  const rate = bitrate ?? defaultBitrate(codec, width, height, fps);
  return Math.round(((rate * seconds) / 8) * 1.01);
}

export interface EncoderRequest {
  codec: VideoCodec;
  width: number;
  height: number;
  fps: number;
  bitrate: number | null;
}

export type IsConfigSupported = (config: VideoEncoderConfig) => Promise<VideoEncoderSupport>;

/** The first supported configuration for the request, or null when the browser cannot encode it. */
export async function chooseEncoderConfig(
  request: EncoderRequest,
  isConfigSupported: IsConfigSupported,
): Promise<VideoEncoderConfig | null> {
  const { codec, width, height, fps } = request;
  const bitrate = request.bitrate ?? defaultBitrate(codec, width, height, fps);
  for (const codecString of codecCandidates(codec, width, height, fps)) {
    const config: VideoEncoderConfig = {
      codec: codecString,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality',
      bitrateMode: 'variable',
      ...(codec === 'avc' ? { avc: { format: 'avc' as const } } : {}),
    };
    try {
      const support = await isConfigSupported(config);
      if (support.supported) return support.config ?? config;
    } catch {
      // an invalid string for this browser: try the next one
    }
  }
  return null;
}

/** Which codecs this browser can encode at the given size (for the dialog). */
export async function probeCodecs(
  width: number,
  height: number,
  fps: number,
  isConfigSupported: IsConfigSupported | null = defaultIsConfigSupported(),
): Promise<Record<VideoCodec, boolean>> {
  const result: Record<VideoCodec, boolean> = { avc: false, vp9: false, av1: false };
  if (!isConfigSupported || width < 2 || height < 2 || fps < 1) return result;
  await Promise.all(
    VIDEO_CODECS.map(async (codec) => {
      result[codec] =
        (await chooseEncoderConfig(
          { codec, width, height, fps, bitrate: null },
          isConfigSupported,
        )) !== null;
    }),
  );
  return result;
}

export function defaultIsConfigSupported(): IsConfigSupported | null {
  return typeof VideoEncoder === 'function' && typeof VideoEncoder.isConfigSupported === 'function'
    ? (config) => VideoEncoder.isConfigSupported(config)
    : null;
}

/** True when this browser has what the in-browser export needs. */
export function browserCanEncode(): boolean {
  return (
    defaultIsConfigSupported() !== null &&
    typeof VideoFrame === 'function' &&
    typeof OffscreenCanvas === 'function'
  );
}
