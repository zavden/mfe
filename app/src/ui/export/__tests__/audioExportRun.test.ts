// @vitest-environment node
/* The runner owns the captured document, original leases and final publication; codecs and
 * geometry are independent services here, so failures can be placed at each async boundary. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioReader } from '../../../audio';
import type { CompanionClient } from '../../../engine';
import type { MediaLease } from '../../../media';
import { createAudioClip, createAudioTrack, createClip } from '../../../model';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import type { SceneEvaluator } from '../../../scene';
import {
  runVideoExport,
  type FileDestination,
  type VideoRun,
  type VideoRunDeps,
  type VideoRunInput,
} from '../videoExportRun';

const scene = vi.hoisted(() => ({ evaluate: vi.fn() }));
vi.mock('../../../scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../scene')>()),
  exportEvaluator: scene.evaluate,
}));

const evaluator: SceneEvaluator = {
  duration: 10,
  events: [],
  evaluate: () => [],
  geometry: () => [],
  measure: () => null,
  points: () => null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function audioInput(): VideoRunInput {
  const { project, clip } = audioProject();
  clip.start = 0;
  clip.end = 10;
  return {
    project,
    resolved: new Map(),
    job: { encoder: 'audio', format: 'wav' },
    values: {
      width: 0,
      height: 0,
      fps: 0,
      range: [0.25, 0.25 + 48000.6 / 48000],
      frames: 48001,
      seconds: 48000.6 / 48000,
    },
  };
}

function destination() {
  const file: FileDestination = {
    name: 'chosen.wav',
    writable: {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    },
    sink: { write: vi.fn(async () => undefined) },
    size: () => 4096,
  };
  return file;
}

function harness(file: FileDestination | null = null) {
  const lease: MediaLease = { ownerId: 'test-export', release: vi.fn(async () => undefined) };
  const reader: AudioReader = {
    read: vi.fn<AudioReader['read']>(async (_asset, startFrame) => ({
      startFrame,
      sampleRate: 48000,
      channels: [new Float32Array(), new Float32Array()] as const,
    })),
  };
  const deps: VideoRunDeps = {
    companionClient: () => ({}) as CompanionClient,
    exportVideo: vi.fn(async () => new Blob(['legacy video'])),
    exportVideoWithAudio: vi.fn(async () => new Blob(['audio and video'])),
    exportAudio: vi.fn(async () => new Blob(['audio'])),
    audioReader: reader,
    pinAudio: vi.fn(async () => lease),
    exportVideoViaCompanion: vi.fn(async () => new Blob(['companion video'])),
    renderWithManim: vi.fn(async () => new Blob(['native video'])),
    generatePython: vi.fn(() => ({
      code: '',
      sceneName: 'S',
      issues: [],
      usedPositionalHelper: false,
    })),
    hasFileSystemAccess: () => file !== null,
    openDestination: vi.fn(async () => file),
    downloadBlob: vi.fn(),
    notify: vi.fn(),
  };
  const states: VideoRun[] = [];
  const abort = new AbortController();
  const run = (input: VideoRunInput, owns = () => true) =>
    runVideoExport(input, (state) => states.push(state), abort.signal, deps, owns);
  return { deps, lease, reader, states, abort, run };
}

beforeEach(() => {
  scene.evaluate.mockReset();
  scene.evaluate.mockReturnValue(evaluator);
});

describe('audio export runner ownership', () => {
  it('exports a sample-quantized audible range with fps zero despite unusable visuals', async () => {
    const input = audioInput();
    input.project.clips.push(createClip('unrendered-formula', input.project.tracks[0]!.id, 0, 5));
    const muted = createAudioTrack('Muted missing source');
    muted.muted = true;
    input.project.tracks.push(muted);
    input.project.audioClips.push(createAudioClip('missing-muted-original', muted.id, 0, 8));
    scene.evaluate.mockImplementation(() => {
      throw new Error('Visual geometry unavailable');
    });
    const { deps, lease, reader, states, run } = harness();
    vi.mocked(deps.exportAudio!).mockImplementation(async (plan, actualReader, options) => {
      expect(actualReader).toBe(reader);
      expect(plan).toMatchObject({ start: 0.25, frameCount: 48001, sampleRate: 48000 });
      expect(plan.duration).toBe(48001 / 48000);
      expect(plan.clips.map((clip) => clip.id)).toEqual([input.project.audioClips[0]!.id]);
      options.onProgress?.({ frame: 48001, totalFrames: 48001, peak: 1.2, clippedSamples: 7 });
      return new Blob(['audio']);
    });
    await run(input);
    expect(scene.evaluate).not.toHaveBeenCalled();
    expect(deps.exportVideo).not.toHaveBeenCalled();
    expect(deps.generatePython).not.toHaveBeenCalled();
    expect(deps.pinAudio).toHaveBeenCalledWith(
      input.project,
      expect.objectContaining({ frameCount: 48001 }),
    );
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'warning', title: 'Audio peaks exceeded 100%' }),
    );
    expect(states).toContainEqual({
      status: 'running',
      label: 'Mixing audio',
      frame: 48001,
      total: 48001,
    });
    expect(states.at(-1)).toMatchObject({ status: 'done', fileName: 'Audio.wav' });
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('aligns browser audio to the exported video frame count rather than the draft seconds', async () => {
    const input = audioInput();
    input.job = { encoder: 'browser', codec: 'vp9', container: 'webm' };
    input.values = {
      width: 640,
      height: 360,
      fps: 24,
      range: [0.125, 1.137],
      frames: 24,
      seconds: 1.012,
    };
    const { deps, reader, lease, run } = harness();
    await run(input);
    const [actualEvaluator, options, plan, actualReader] = vi.mocked(deps.exportVideoWithAudio!)
      .mock.calls[0]!;
    expect(actualEvaluator).toBe(evaluator);
    // The scene is evaluated in the frame of the video, not in the project's.
    expect(scene.evaluate).toHaveBeenCalledWith(input.project, input.resolved, {
      width: 640,
      height: 360,
    });
    expect(options).toMatchObject({ fps: 24, range: [0.125, 1.137], codec: 'vp9' });
    expect(plan).toMatchObject({ start: 0.125, duration: 1, frameCount: 48000 });
    expect(actualReader).toBe(reader);
    expect(deps.exportVideo).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('ffmpeg: the mix of the exported frames goes to the companion with the video, held until the end', async () => {
    const input = audioInput();
    input.job = { encoder: 'ffmpeg', format: 'mp4', quality: 'medium', includeAudio: true };
    input.values = { width: 640, height: 360, fps: 30, range: [1, 3], frames: 60, seconds: 2.02 };
    const { deps, lease, reader, states, run } = harness();
    vi.mocked(deps.exportVideoViaCompanion).mockImplementation(
      async (_client, actual, options, onProgress) => {
        expect(actual).toBe(evaluator);
        expect(options).toMatchObject({ format: 'mp4', quality: 'medium', range: [1, 3] });
        // as long as the frames, not as the seconds typed; from where the range starts
        expect(options.soundtrack!.plan).toMatchObject({
          start: 1,
          duration: 2,
          frameCount: 96000,
        });
        expect(options.soundtrack!.reader).toBe(reader);
        expect(lease.release).not.toHaveBeenCalled();
        onProgress({ phase: 'sound', frame: 48000, totalFrames: 96000, clippedSamples: 3 });
        onProgress({ phase: 'rendering', frame: 60, totalFrames: 60, clippedSamples: 3 });
        return new Blob(['companion video']);
      },
    );
    await run(input);
    expect(deps.pinAudio).toHaveBeenCalledWith(
      input.project,
      expect.objectContaining({ frameCount: 96000 }),
    );
    expect(states.map((s) => (s.status === 'running' ? s.label : s.status))).toEqual([
      'Starting…',
      'Sending the sound (50%)',
      'Sending frames',
      'committing',
      'done',
    ]);
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'warning', title: 'Audio peaks exceeded 100%' }),
    );
    expect(lease.release).toHaveBeenCalledOnce();
    expect(deps.exportVideoWithAudio).not.toHaveBeenCalled();
  });

  it('ffmpeg: without Include audio, or for a project without audio, nothing is mixed', async () => {
    const silent = audioInput();
    silent.job = { encoder: 'ffmpeg', format: 'mp4', quality: 'medium' };
    silent.values = { width: 640, height: 360, fps: 30, range: null, frames: 60, seconds: 2 };
    const first = harness();
    await first.run(silent);
    expect(vi.mocked(first.deps.exportVideoViaCompanion).mock.calls[0]![2]).not.toHaveProperty(
      'soundtrack',
    );
    expect(first.deps.pinAudio).not.toHaveBeenCalled();

    const noClips = audioInput();
    noClips.job = { encoder: 'ffmpeg', format: 'mp4', quality: 'medium', includeAudio: true };
    noClips.values = silent.values;
    noClips.project.audioClips = [];
    const second = harness();
    await second.run(noClips);
    expect(vi.mocked(second.deps.exportVideoViaCompanion).mock.calls[0]![2]).not.toHaveProperty(
      'soundtrack',
    );
    expect(second.deps.pinAudio).not.toHaveBeenCalled();
  });

  it('Manim: the sound of the captured project, as long as the pictures and no longer', async () => {
    const input = audioInput(); // ten seconds of sound
    input.project.clips.push(createClip('formula', input.project.tracks[0]!.id, 0, 5));
    input.job = { encoder: 'manim', target: 'ce', quality: 'low', includeAudio: true };
    // what the dialog had on screen is not what counts: the run takes the visual scene
    input.values = { width: 640, height: 360, fps: 30, range: [1, 2], frames: 300, seconds: 10 };
    const { deps, lease, reader, states, run } = harness();
    vi.mocked(deps.renderWithManim).mockImplementation(
      async (_client, request, onProgress, _signal, options) => {
        expect(request).toMatchObject({ width: 640, height: 360, fps: 30, frames: 150 });
        expect(options!.soundtrack!.plan).toMatchObject({
          start: 0,
          duration: 5,
          frameCount: 240000,
        });
        expect(options!.soundtrack!.reader).toBe(reader);
        expect(lease.release).not.toHaveBeenCalled();
        onProgress({ phase: 'sound', frame: 240000, totalFrames: 240000, animation: null });
        onProgress({
          phase: 'encoding',
          frame: 150,
          totalFrames: 150,
          animation: 2,
          clippedSamples: 5,
        });
        return new Blob(['native video']);
      },
    );
    await run(input);
    // the Python is still the visual project's: the sound never reaches the code generator
    expect(vi.mocked(deps.generatePython).mock.calls[0]![0].audioClips).toEqual([]);
    expect(states.map((s) => (s.status === 'running' ? s.label : s.status))).toEqual([
      'Starting…',
      'Sending the sound (100%)',
      'ffmpeg is adding the sound…',
      'committing',
      'done',
    ]);
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'warning', title: 'Audio peaks exceeded 100%' }),
    );
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it('Manim: without Include audio the render is the one of before', async () => {
    const input = audioInput();
    input.project.clips.push(createClip('formula', input.project.tracks[0]!.id, 0, 5));
    input.job = { encoder: 'manim', target: 'ce', quality: 'low' };
    input.values = { width: 640, height: 360, fps: 30, range: null, frames: 300, seconds: 10 };
    const { deps, run } = harness();
    await run(input);
    expect(vi.mocked(deps.renderWithManim).mock.calls[0]![4]).toEqual({ sink: null });
    expect(deps.pinAudio).not.toHaveBeenCalled();
  });

  it('ffmpeg: a recording that cannot be held stops the export before the companion is asked', async () => {
    const input = audioInput();
    input.job = { encoder: 'ffmpeg', format: 'webm', quality: 'low', includeAudio: true };
    input.values = { width: 640, height: 360, fps: 30, range: null, frames: 60, seconds: 2 };
    const { deps, states, run } = harness();
    vi.mocked(deps.pinAudio!).mockRejectedValue(new Error('Original audio is missing: Narration.'));
    await run(input);
    expect(deps.exportVideoViaCompanion).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      message: 'Original audio is missing: Narration.',
    });
  });

  it.each([
    ['audio', { encoder: 'audio', format: 'wav' }, 'Export a shorter range.'],
    [
      'browser',
      { encoder: 'browser', codec: 'avc', container: 'mp4' },
      'Export a shorter range, or the video without its sound.',
    ],
    [
      'ffmpeg',
      { encoder: 'ffmpeg', format: 'mp4', quality: 'low', includeAudio: true },
      'Export a shorter range, or the video without its sound.',
    ],
  ] as const)(
    '%s: more than an hour of sound is refused before anything is held or written',
    async (_name, job, advice) => {
      const input = audioInput();
      input.project.meta.duration = 4000;
      input.job = job;
      input.values =
        job.encoder === 'audio'
          ? { width: 0, height: 0, fps: 0, range: [0, 3601], frames: 3601 * 48000, seconds: 3601 }
          : { width: 640, height: 360, fps: 30, range: null, frames: 120000, seconds: 4000 };
      const { deps, states, run } = harness();
      await run(input);
      expect(states.at(-1)).toMatchObject({
        status: 'error',
        message:
          `An export takes at most 60 minutes of sound, and this one lasts ${
            job.encoder === 'audio' ? '60.1' : '66.7'
          } minutes. ` + advice,
      });
      expect(deps.pinAudio).not.toHaveBeenCalled();
      expect(deps.exportAudio).not.toHaveBeenCalled();
      expect(deps.exportVideoWithAudio).not.toHaveBeenCalled();
      expect(deps.exportVideoViaCompanion).not.toHaveBeenCalled();
    },
  );

  it('keeps Include audio off on the legacy video path without requiring missing originals', async () => {
    const input = audioInput();
    input.job = { encoder: 'browser', codec: 'avc', container: 'mp4', includeAudio: false };
    input.project.audioAssets = [];
    input.values = { width: 640, height: 360, fps: 30, range: null, frames: 300, seconds: 10 };
    const { deps, lease, states, run } = harness();
    await run(input);
    expect(deps.exportVideo).toHaveBeenCalledTimes(1);
    expect(deps.exportVideoWithAudio).not.toHaveBeenCalled();
    expect(deps.exportAudio).not.toHaveBeenCalled();
    expect(deps.pinAudio).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ status: 'done', fileName: 'Audio.mp4' });
  });

  it('aborts the selected destination when original pinning fails before any encoding', async () => {
    const file = destination();
    const { deps, lease, states, run } = harness(file);
    vi.mocked(deps.pinAudio!).mockRejectedValue(new Error('Original audio is missing: Narration'));
    await run(audioInput());
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      message: 'Original audio is missing: Narration',
    });
    expect(states.some((state) => state.status === 'done' || state.status === 'committing')).toBe(
      false,
    );
    expect(deps.exportAudio).not.toHaveBeenCalled();
    expect(file.writable.abort).toHaveBeenCalledTimes(1);
    expect(file.writable.close).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it('rejects an invalid participating source window before pinning, encoding or publication', async () => {
    const input = audioInput();
    input.project.audioClips[0]!.sourceStart = input.project.audioAssets[0]!.duration;
    const file = destination();
    const { deps, lease, states, run } = harness(file);
    await run(input);
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('source window'),
    });
    expect(deps.pinAudio).not.toHaveBeenCalled();
    expect(deps.exportAudio).not.toHaveBeenCalled();
    expect(file.sink.write).not.toHaveBeenCalled();
    expect(file.writable.abort).toHaveBeenCalledTimes(1);
    expect(file.writable.close).not.toHaveBeenCalled();
    expect(deps.downloadBlob).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it('releases a lease acquired after ownership was lost without encoding or closing the file', async () => {
    const file = destination();
    const { deps, lease, states, run } = harness(file);
    const entered = deferred<void>();
    const pin = deferred<MediaLease>();
    let owned = true;
    vi.mocked(deps.pinAudio!).mockImplementation(() => {
      entered.resolve();
      return pin.promise;
    });
    const running = run(audioInput(), () => owned);
    await entered.promise;
    owned = false;
    pin.resolve(lease);
    await running;
    expect(states.at(-1)).toEqual({ status: 'cancelled' });
    expect(deps.exportAudio).not.toHaveBeenCalled();
    expect(deps.downloadBlob).not.toHaveBeenCalled();
    expect(file.writable.abort).toHaveBeenCalledTimes(1);
    expect(file.writable.close).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('discards partial audio output and releases the source after a decoder failure', async () => {
    const file = destination();
    const { deps, lease, states, run } = harness(file);
    vi.mocked(deps.exportAudio!).mockImplementation(async (_plan, _reader, options) => {
      await options.sink!.write(new Uint8Array([1, 2, 3]), 0);
      throw new Error('The original could not be decoded');
    });
    await run(audioInput());
    expect(file.sink.write).toHaveBeenCalledTimes(1);
    expect(file.writable.abort).toHaveBeenCalledTimes(1);
    expect(file.writable.close).not.toHaveBeenCalled();
    expect(deps.downloadBlob).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      message: 'The original could not be decoded',
    });
    expect(states.some((state) => state.status === 'done')).toBe(false);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('audio the browser cannot hold in memory: the advice is about audio', async () => {
    const { deps, lease, states, run } = harness();
    vi.mocked(deps.exportAudio!).mockRejectedValue('out of memory');
    await run(audioInput());
    expect(states.at(-1)).toEqual({
      status: 'error',
      message:
        'The browser ran out of memory while it assembled the file (it said: “out of memory”). ' +
        'Export a shorter range or a compressed format, or use a browser that writes the file ' +
        'as it is encoded (Chrome or Edge).',
      log: '',
    });
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it('holds originals through irreversible close and does not cancel a completed publication', async () => {
    const file = destination();
    const { deps, lease, states, abort, run } = harness(file);
    const entered = deferred<void>();
    const closed = deferred<void>();
    let owned = true;
    vi.mocked(file.writable.close).mockImplementation(() => {
      entered.resolve();
      return closed.promise;
    });
    vi.mocked(deps.exportAudio!).mockResolvedValue(null);
    const running = run(audioInput(), () => owned);
    await entered.promise;
    expect(states.at(-1)).toEqual({ status: 'committing' });
    expect(lease.release).not.toHaveBeenCalled();
    owned = false;
    abort.abort();
    closed.resolve();
    await running;
    expect(file.writable.close).toHaveBeenCalledTimes(1);
    expect(file.writable.abort).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ status: 'done', fileName: 'chosen.wav', blob: null });
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});
