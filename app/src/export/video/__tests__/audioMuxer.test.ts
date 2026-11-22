// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createAudioPlan } from '../../../audio/plan';
import type { AudioPcm, AudioReader } from '../../../audio/types';
import {
  createAudioAsset,
  createAudioClip,
  createAudioTrack,
  createEmptyProject,
} from '../../../model';
import type { SceneEvaluator } from '../../../scene';
import { exportVideoWithAudio } from '../audioMuxer';

const output = vi.hoisted(() => ({ create: vi.fn(), aac: true }));
vi.mock('../../audio/encoding', async (original) => ({
  ...(await original<typeof import('../../audio/encoding')>()),
  createAudioEncoder: output.create,
  canEncodeAac: async () => output.aac,
}));
vi.mock('../../../render', () => ({ createCanvasRenderer: () => ({}) }));
vi.mock('../frames', async (original) => ({
  ...(await original<typeof import('../frames')>()),
  offscreen2d: () => ({ canvas: {}, ctx: {} }),
  frameDrawer: () => () => undefined,
}));

class Frame {
  timestamp: number;
  duration: number;
  constructor(_source: unknown, options: VideoFrameInit) {
    this.timestamp = options.timestamp ?? 0;
    this.duration = options.duration ?? 0;
  }
  close() {}
}

class Encoder {
  static async isConfigSupported(config: VideoEncoderConfig) {
    return { supported: true, config };
  }
  state = 'configured';
  private queued: EncodedVideoChunk[] = [];
  constructor(private init: VideoEncoderInit) {}
  configure() {}
  encode(frame: Frame) {
    this.queued.push({
      timestamp: frame.timestamp,
      duration: frame.duration,
      type: 'key',
    } as EncodedVideoChunk);
  }
  async flush() {
    for (const chunk of this.queued.splice(0)) this.init.output(chunk, undefined);
  }
  close() {
    this.state = 'closed';
  }
}

afterEach(() => vi.unstubAllGlobals());

/** A scene of one audio clip, silent but for a 10 ms pulse 100 ms before its end. */
function pulseScene(seconds: number) {
  const project = createEmptyProject();
  project.meta.duration = seconds;
  const track = createAudioTrack('Pulse');
  const asset = createAudioAsset({
    name: 'Pulse',
    originalName: 'pulse.wav',
    mimeType: 'audio/wav',
    byteLength: 1,
    duration: seconds,
    sampleRate: 48000,
    channels: 2,
    contentHash: 'a'.repeat(64),
  });
  project.tracks.push(track);
  project.audioAssets.push(asset);
  project.audioClips.push(createAudioClip(asset.id, track.id, 0, seconds));
  const pulseStart = Math.round((seconds - 0.1) * 48000);
  const reader: AudioReader = {
    async read(_asset, startFrame, count) {
      const channel = Float32Array.from({ length: count }, (_, i) =>
        startFrame + i >= pulseStart && startFrame + i < pulseStart + 480 ? 0.5 : 0,
      );
      return { startFrame, sampleRate: 48000, channels: [channel, channel] };
    },
  };
  const evaluator: SceneEvaluator = {
    duration: seconds,
    events: [],
    evaluate: () => [],
    geometry: () => [],
    measure: () => null,
    points: () => null,
  };
  return { plan: createAudioPlan(project), reader, evaluator };
}

it.each([
  { fps: 1, seconds: 1 },
  { fps: 1, seconds: 4 },
  { fps: 2, seconds: 2 },
])(
  'encodes the final audio pulse and complete soundtrack at $fps fps over $seconds seconds',
  async ({ fps, seconds }) => {
    vi.stubGlobal('VideoEncoder', Encoder);
    vi.stubGlobal('VideoFrame', Frame);
    const { plan, reader, evaluator } = pulseScene(seconds);
    let audioFrames = 0;
    let videoEndFrame = 0;
    let maxAudioLeadFrames = 0;
    let audibleFrames = 0;
    const muxer = {
      async add(block: AudioPcm) {
        expect(block.startFrame).toBe(audioFrames);
        audioFrames += block.channels[0].length;
        audibleFrames += block.channels[0].filter((sample) => sample > 0).length;
        maxAudioLeadFrames = Math.max(maxAudioLeadFrames, audioFrames - videoEndFrame);
      },
      finishAudio: vi.fn(async () => {
        expect(audioFrames).toBe(plan.frameCount);
      }),
      addVideo: vi.fn(async (chunk: EncodedVideoChunk) => {
        videoEndFrame = Math.round(((chunk.timestamp + (chunk.duration ?? 0)) * 48000) / 1e6);
      }),
      finalize: vi.fn(async () => new Blob(['complete'])),
      cancel: vi.fn(async () => undefined),
    };
    output.create.mockResolvedValue(muxer);
    await exportVideoWithAudio(
      evaluator,
      {
        width: 64,
        height: 64,
        fps,
        codec: 'vp9',
        container: 'webm',
        background: '#000000',
        bitrate: null,
        range: null,
      },
      plan,
      reader,
      () => undefined,
      new AbortController().signal,
    );
    expect(audioFrames).toBe(seconds * 48000);
    expect(audibleFrames).toBe(480);
    expect(muxer.addVideo).toHaveBeenCalledTimes(seconds * fps);
    expect(muxer.finishAudio).toHaveBeenCalled();
    expect(maxAudioLeadFrames).toBeLessThanOrEqual((4 / fps) * 48000);
    expect(muxer.cancel).not.toHaveBeenCalled();
  },
);

// The app carries no AAC encoder: an MP4 gets the browser's, and Opus where it has none.
it.each([
  { container: 'mp4', codec: 'avc', aac: true, sound: 'mp4-aac' },
  { container: 'mp4', codec: 'avc', aac: false, sound: 'mp4-opus' },
  { container: 'mp4', codec: 'av1', aac: false, sound: 'mp4-opus' },
  { container: 'webm', codec: 'vp9', aac: true, sound: 'webm-opus' },
  { container: 'webm', codec: 'vp9', aac: false, sound: 'webm-opus' },
] as const)(
  'a $container ($codec) gets $sound when the browser encodes AAC: $aac',
  async ({ container, codec, aac, sound }) => {
    vi.stubGlobal('VideoEncoder', Encoder);
    vi.stubGlobal('VideoFrame', Frame);
    output.aac = aac;
    const { plan, reader, evaluator } = pulseScene(1);
    output.create.mockClear();
    output.create.mockResolvedValue({
      add: async () => undefined,
      finishAudio: async () => undefined,
      addVideo: async () => undefined,
      finalize: async () => new Blob(['complete']),
      cancel: async () => undefined,
    });
    await exportVideoWithAudio(
      evaluator,
      {
        width: 64,
        height: 64,
        fps: 1,
        codec,
        container,
        background: '#000',
        bitrate: null,
        range: null,
      },
      plan,
      reader,
      () => undefined,
      new AbortController().signal,
    );
    expect(output.create).toHaveBeenCalledTimes(1);
    expect(output.create).toHaveBeenCalledWith(
      sound,
      expect.objectContaining({ video: { codec, width: 64, height: 64, fps: 1 } }),
    );
  },
);

it('starts a long video without a file to write to: no size is refused beforehand', async () => {
  vi.stubGlobal('VideoEncoder', Encoder);
  vi.stubGlobal('VideoFrame', Frame);
  // An hour of 1080p at 30 fps is gigabytes. Its first frame is enough to know it began.
  const { plan, reader, evaluator } = pulseScene(3600);
  const cancel = vi.fn(async () => undefined);
  output.create.mockResolvedValue({
    add: async () => undefined,
    finishAudio: async () => undefined,
    addVideo: async () => undefined,
    finalize: async () => new Blob(['complete']),
    cancel,
  });
  const abort = new AbortController();
  const frames: number[] = [];
  const running = exportVideoWithAudio(
    evaluator,
    {
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'avc',
      container: 'mp4',
      background: '#000',
      bitrate: null,
      range: null,
    },
    plan,
    reader,
    (progress) => {
      frames.push(progress.frame);
      abort.abort(new DOMException('Enough', 'AbortError'));
    },
    abort.signal,
  );
  await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  expect(frames).toEqual([1]);
  expect(cancel).toHaveBeenCalled();
});
