import { describe, expect, it, vi } from 'vitest';
import { createAudioPlan } from '../../../audio';
import type { AudioReader } from '../../../audio/types';
import type { CompanionClient, CompanionJobStatus } from '../../../engine';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import type { Renderer } from '../../../render';
import type { SceneEvaluator } from '../../../scene';
import {
  CompanionJobError,
  exportVideoViaCompanion,
  MAX_FRAMES_PER_REQUEST,
  renderWithManim,
  type CompanionVideoDeps,
  type CompanionVideoOptions,
} from '../companion';

function status(patch: Partial<CompanionJobStatus> = {}): CompanionJobStatus {
  return {
    ok: true,
    id: 'job1',
    kind: 'video',
    state: 'receiving',
    elapsedS: 0,
    frames: 0,
    ...patch,
  };
}

interface FakeClient extends CompanionClient {
  sent: { first: number; size: number }[];
  calls: string[];
}

function fakeClient(overrides: Partial<CompanionClient> = {}): FakeClient {
  const calls: string[] = [];
  const sent: { first: number; size: number }[] = [];
  const client = {
    calls,
    sent,
    createVideoJob: vi.fn(async (request) => {
      calls.push(`create:${request.format}:${request.frames}`);
      return status({ frames: request.frames, maxFrameBytes: 1000, maxRequestBytes: 100_000 });
    }),
    sendVideoFrames: vi.fn(async (_id: string, first: number, body: Blob) => {
      calls.push(`frames:${first}`);
      sent.push({ first, size: body.size });
      return status();
    }),
    finishVideoJob: vi.fn(async () => {
      calls.push('finish');
      return status({ state: 'done', bytes: 4 });
    }),
    jobResult: vi.fn(async () => {
      calls.push('result');
      return new Blob(['mp4']);
    }),
    cancelJob: vi.fn(async (kind: string) => {
      calls.push(`cancel:${kind}`);
      return true;
    }),
    sendJobAudio: vi.fn(async (kind: string, _id: string, offset: number, body: Blob) => {
      calls.push(`audio:${kind}:${offset}:${body.size}`);
      return status();
    }),
    startManimRender: vi.fn(),
    jobStatus: vi.fn(),
    ...overrides,
  };
  return client as unknown as FakeClient;
}

const OPTIONS: CompanionVideoOptions = {
  background: '#000000',
  width: 64,
  height: 48,
  fps: 10,
  format: 'mp4',
  quality: 'medium',
  range: null,
};

function deps(frameBytes = 100): CompanionVideoDeps & { drawn: number } {
  const state = { drawn: 0 };
  const renderer: Renderer = {
    draw: () => {
      state.drawn++;
    },
    pick: () => null,
    toScene: () => [0, 0],
  };
  return {
    renderer,
    createCanvas: () => ({
      ctx: {} as OffscreenCanvasRenderingContext2D,
      toPng: async () => new Blob([new Uint8Array(frameBytes)], { type: 'image/png' }),
    }),
    get drawn() {
      return state.drawn;
    },
  };
}

const scene = (duration: number): SceneEvaluator => ({
  duration,
  events: [],
  evaluate: () => [],
  geometry: () => [],
  measure: () => null,
  points: () => null,
});

describe('exportVideoViaCompanion', () => {
  it('streams the result into the sink of the options, through the client', async () => {
    const sink = { write: vi.fn(async () => undefined) };
    const client = fakeClient({
      jobResult: vi.fn(async (_kind, _id, _signal, given) => {
        await given!.write(new Uint8Array([1, 2]), 0);
        return null;
      }),
    });
    const result = await exportVideoViaCompanion(
      client,
      scene(1),
      { ...OPTIONS, sink },
      () => {},
      new AbortController().signal,
      deps(),
    );
    expect(result).toBeNull();
    expect(client.jobResult).toHaveBeenCalledWith(
      'video',
      expect.any(String),
      expect.any(AbortSignal),
      sink,
    );
    expect(sink.write).toHaveBeenCalledWith(new Uint8Array([1, 2]), 0);
  });

  it('creates the job, sends the frames in order and in batches, finishes and downloads', async () => {
    const client = fakeClient();
    const progress: string[] = [];
    const blob = await exportVideoViaCompanion(
      client,
      scene(7), // 70 frames
      OPTIONS,
      (p) => progress.push(`${p.phase}:${p.frame}`),
      new AbortController().signal,
      deps(),
    );
    expect(await blob!.text()).toBe('mp4');
    expect(client.calls[0]).toBe('create:mp4:70');
    expect(client.sent.map((s) => s.first)).toEqual([
      0,
      MAX_FRAMES_PER_REQUEST,
      2 * MAX_FRAMES_PER_REQUEST,
    ]);
    expect(client.sent.reduce((n, s) => n + s.size, 0)).toBe(70 * 100);
    expect(client.calls.slice(-3)).toEqual(['finish', 'result', 'cancel:video']);
    expect(progress[0]).toBe('rendering:1');
    expect(progress).toContain('rendering:70');
    expect(progress.slice(-2)).toEqual(['encoding:70', 'downloading:70']);
  });

  it('splits batches by the companion request limit', async () => {
    const client = fakeClient();
    await exportVideoViaCompanion(
      client,
      scene(1), // 10 frames of 40 kB: 100 kB per request allowed
      OPTIONS,
      () => {},
      new AbortController().signal,
      deps(40_000),
    ).catch(() => {});
    // frames above maxFrameBytes (1000) are refused before anything is sent
    expect(client.sent).toEqual([]);
    const ok = fakeClient({
      createVideoJob: vi.fn(async (request) =>
        status({ frames: request.frames, maxFrameBytes: 50_000, maxRequestBytes: 100_000 }),
      ),
    });
    await exportVideoViaCompanion(
      ok,
      scene(1),
      OPTIONS,
      () => {},
      new AbortController().signal,
      deps(40_000),
    );
    expect(ok.sent.map((s) => s.size)).toEqual([80_000, 80_000, 80_000, 80_000, 80_000]);
    expect(ok.sent.map((s) => s.first)).toEqual([0, 2, 4, 6, 8]);
  });

  it('cancels the job and rejects with AbortError when aborted', async () => {
    const client = fakeClient();
    const controller = new AbortController();
    const promise = exportVideoViaCompanion(
      client,
      scene(5),
      OPTIONS,
      (p) => {
        if (p.frame === 10) controller.abort();
      },
      controller.signal,
      deps(),
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.calls).toContain('cancel:video');
    expect(client.calls).not.toContain('finish');
  });

  it('deletes the job when cancelled while the create request is in flight', async () => {
    let finishCreate: (status: CompanionJobStatus) => void = () => {};
    const client = fakeClient({
      createVideoJob: vi.fn(
        () =>
          new Promise<CompanionJobStatus>((resolve) => {
            finishCreate = resolve;
          }),
      ),
    });
    const controller = new AbortController();
    const promise = exportVideoViaCompanion(
      client,
      scene(1),
      OPTIONS,
      () => {},
      controller.signal,
      deps(),
    );
    controller.abort();
    // the request itself was not given the signal, so its answer (the id) still arrives
    expect(vi.mocked(client.createVideoJob).mock.calls[0]).toHaveLength(1);
    finishCreate(status({ id: 'late', frames: 10 }));
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.cancelJob).toHaveBeenCalledWith('video', 'late');
    expect(client.sendVideoFrames).not.toHaveBeenCalled();
  });

  it('surfaces ffmpeg failures with the log and still deletes the job', async () => {
    const client = fakeClient({
      finishVideoJob: vi.fn(async () =>
        status({ state: 'failed', error: { message: 'Invalid data', line: null, log: 'the log' } }),
      ),
    });
    const error = await exportVideoViaCompanion(
      client,
      scene(0.5),
      OPTIONS,
      () => {},
      new AbortController().signal,
      deps(),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanionJobError);
    expect((error as CompanionJobError).message).toBe('Invalid data');
    expect((error as CompanionJobError).log).toBe('the log');
    expect(client.calls.at(-1)).toBe('cancel:video');
  });

  it('stops at an upload error', async () => {
    const client = fakeClient({
      sendVideoFrames: vi.fn(async () => {
        throw new Error('The companion is not reachable.');
      }),
    });
    await expect(
      exportVideoViaCompanion(
        client,
        scene(20),
        OPTIONS,
        () => {},
        new AbortController().signal,
        deps(),
      ),
    ).rejects.toThrow('not reachable');
    expect(client.calls.at(-1)).toBe('cancel:video');
  });

  it('exports only the chosen range', async () => {
    const client = fakeClient();
    const d = deps();
    await exportVideoViaCompanion(
      client,
      scene(10),
      { ...OPTIONS, range: [1, 2] },
      () => {},
      new AbortController().signal,
      d,
    );
    expect(client.calls[0]).toBe('create:mp4:10');
    expect(d.drawn).toBe(10);
  });
});

/** The mix of `seconds` of a project with one recording; every sample is `level`. */
function soundtrack(seconds: number, start = 0, level = 0.25) {
  const { project, clip } = audioProject();
  clip.start = 0;
  clip.end = 60;
  clip.sourceStart = 0;
  clip.volume = [];
  const reader: AudioReader = {
    read: async (_asset, startFrame, frameCount) => ({
      startFrame,
      sampleRate: 48000,
      channels: [
        new Float32Array(frameCount).fill(level),
        new Float32Array(frameCount).fill(level),
      ] as const,
    }),
  };
  return { plan: createAudioPlan(project, { start, duration: seconds }), reader };
}

describe('exportVideoViaCompanion with a soundtrack', () => {
  it('asks for a job with audio and sends the whole sound before the first frame', async () => {
    const client = fakeClient();
    const progress: string[] = [];
    const blob = await exportVideoViaCompanion(
      client,
      scene(2), // 20 frames: 96000 samples
      { ...OPTIONS, soundtrack: soundtrack(2, 0, 1.5) },
      (p) => progress.push(`${p.phase}:${p.frame}/${p.totalFrames}:${p.clippedSamples ?? '-'}`),
      new AbortController().signal,
      deps(),
    );
    expect(await blob!.text()).toBe('mp4');
    expect(vi.mocked(client.createVideoJob).mock.calls[0]![0]).toEqual({
      format: 'mp4',
      quality: 'medium',
      width: 64,
      height: 48,
      fps: 10,
      frames: 20,
      audio: true,
    });
    expect(client.calls).toEqual([
      'create:mp4:20',
      `audio:video:0:${44 + 96000 * 4}`,
      'frames:0',
      'finish',
      'result',
      'cancel:video',
    ]);
    // the sound is counted in samples; every later phase keeps the count of clipped ones
    expect(progress[0]).toMatch(/^sound:4096\/96000:8192$/);
    expect(progress).toContain('sound:96000/96000:192000');
    expect(progress.at(-1)).toBe('downloading:20/20:192000');
    expect(progress.findIndex((p) => p.startsWith('rendering'))).toBeGreaterThan(
      progress.findLastIndex((p) => p.startsWith('sound')),
    );
  });

  it('keeps to the request size the companion announces', async () => {
    const client = fakeClient({
      createVideoJob: vi.fn(async (request) =>
        status({ frames: request.frames, maxFrameBytes: 1000, maxAudioRequestBytes: 150_000 }),
      ),
    });
    await exportVideoViaCompanion(
      client,
      scene(2),
      { ...OPTIONS, soundtrack: soundtrack(2) },
      () => {},
      new AbortController().signal,
      deps(),
    );
    const audio = client.calls.filter((call) => call.startsWith('audio:'));
    expect(audio).toEqual([
      'audio:video:0:150000',
      'audio:video:150000:150000',
      `audio:video:300000:${44 + 96000 * 4 - 300_000}`,
    ]);
  });

  it('covers the exported range, from its start', async () => {
    const client = fakeClient();
    await exportVideoViaCompanion(
      client,
      scene(10),
      { ...OPTIONS, range: [1, 2], soundtrack: soundtrack(1, 1) },
      () => {},
      new AbortController().signal,
      deps(),
    );
    expect(client.calls.slice(0, 2)).toEqual(['create:mp4:10', `audio:video:0:${44 + 48000 * 4}`]);
  });

  it('refuses a sound of another length before it creates a job', async () => {
    const client = fakeClient();
    await expect(
      exportVideoViaCompanion(
        client,
        scene(2),
        { ...OPTIONS, soundtrack: soundtrack(1.5) },
        () => {},
        new AbortController().signal,
        deps(),
      ),
    ).rejects.toThrow('same frame-quantized output range');
    expect(client.createVideoJob).not.toHaveBeenCalled();
  });

  it('a sound that cannot be sent stops the export and deletes the job', async () => {
    const client = fakeClient({
      sendJobAudio: vi.fn(async () => {
        throw new Error('The soundtrack must last what the video lasts');
      }),
    });
    const d = deps();
    await expect(
      exportVideoViaCompanion(
        client,
        scene(2),
        { ...OPTIONS, soundtrack: soundtrack(2) },
        () => {},
        new AbortController().signal,
        d,
      ),
    ).rejects.toThrow('must last what the video lasts');
    expect(d.drawn).toBe(0);
    expect(client.sendVideoFrames).not.toHaveBeenCalled();
    expect(client.calls.at(-1)).toBe('cancel:video');
  });

  it('without a soundtrack the request is the one of before', async () => {
    const client = fakeClient();
    await exportVideoViaCompanion(
      client,
      scene(1),
      { ...OPTIONS, soundtrack: null },
      () => {},
      new AbortController().signal,
      deps(),
    );
    expect(vi.mocked(client.createVideoJob).mock.calls[0]![0]).not.toHaveProperty('audio');
    expect(client.sendJobAudio).not.toHaveBeenCalled();
  });
});

describe('renderWithManim with a soundtrack', () => {
  const sized = {
    target: 'ce' as const,
    code: 'x',
    scene: 'Demo',
    width: 64,
    height: 48,
    fps: 10,
    frames: 20,
  };
  const manim = (patch: Partial<CompanionJobStatus>) => status({ kind: 'manim', ...patch });

  it('asks for audio, sends the sound, then follows Manim and the pass that adds the sound', async () => {
    const states = [
      manim({ state: 'running', frame: 0, frames: 20 }),
      manim({ state: 'running', frame: 20, frames: 20, animation: 1 }),
      manim({ state: 'encoding', frame: 20, frames: 20, animation: 1 }),
      manim({ state: 'done', frame: 20, frames: 20, animation: 1 }),
    ];
    const client = fakeClient({
      startManimRender: vi.fn(async () => manim({ state: 'receiving', frames: 20 })),
      jobStatus: vi.fn(async () => {
        client.calls.push('status');
        return states.shift()!;
      }),
    });
    const seen: string[] = [];
    const blob = await renderWithManim(
      client,
      sized,
      (p) => seen.push(`${p.phase}:${p.frame}:${p.clippedSamples ?? '-'}`),
      new AbortController().signal,
      { pollMs: 1, soundtrack: soundtrack(2, 0, 1.5) },
    );
    expect(await blob!.text()).toBe('mp4');
    expect(vi.mocked(client.startManimRender).mock.calls[0]![0]).toEqual({ ...sized, audio: true });
    // the whole sound first: Manim starts when the companion has it
    expect(client.calls.slice(0, 2)).toEqual([`audio:manim:0:${44 + 96000 * 4}`, 'status']);
    expect(seen[0]).toBe('sound:4096:8192');
    expect(seen.filter((s) => !s.startsWith('sound'))).toEqual([
      'running:0:192000',
      'running:20:192000',
      'encoding:20:192000',
      'running:20:192000',
      'downloading:20:192000',
    ]);
    expect(client.calls.slice(-2)).toEqual(['result', 'cancel:manim']);
  });

  it('needs the frame rate and the frames of the request, and a sound of that length', async () => {
    const client = fakeClient();
    const run = (request: Parameters<typeof renderWithManim>[1], seconds: number) =>
      renderWithManim(client, request, () => {}, new AbortController().signal, {
        soundtrack: soundtrack(seconds),
      });
    await expect(run({ target: 'ce', code: 'x', scene: 'Demo', frames: 20 }, 2)).rejects.toThrow(
      'needs its frame rate and its number of frames',
    );
    await expect(run(sized, 1.9)).rejects.toThrow('same frame-quantized output range');
    expect(client.startManimRender).not.toHaveBeenCalled();
  });

  it('a sound that cannot be sent stops the render and deletes the job', async () => {
    const client = fakeClient({
      startManimRender: vi.fn(async () => manim({ state: 'receiving', frames: 20 })),
      sendJobAudio: vi.fn(async () => {
        throw new Error('The companion is not reachable.');
      }),
    });
    await expect(
      renderWithManim(client, sized, () => {}, new AbortController().signal, {
        soundtrack: soundtrack(2),
      }),
    ).rejects.toThrow('not reachable');
    expect(client.jobStatus).not.toHaveBeenCalled();
    expect(client.cancelJob).toHaveBeenCalledWith('manim', 'job1');
  });

  it('without a soundtrack the request is the one of before', async () => {
    const client = fakeClient({
      startManimRender: vi.fn(async () => manim({ state: 'done', frames: 20 })),
    });
    await renderWithManim(client, sized, () => {}, new AbortController().signal, {
      soundtrack: null,
    });
    expect(vi.mocked(client.startManimRender).mock.calls[0]![0]).toEqual(sized);
    expect(client.sendJobAudio).not.toHaveBeenCalled();
  });
});

describe('renderWithManim', () => {
  const request = { target: 'ce' as const, code: 'x', scene: 'Demo', frames: 30 };

  it('polls until done, then downloads and cleans up', async () => {
    const states = [
      status({ kind: 'manim', state: 'running', frame: 5, frames: 30, animation: 0 }),
      status({ kind: 'manim', state: 'running', frame: 20, frames: 30, animation: 1 }),
      status({ kind: 'manim', state: 'done', frame: 30, frames: 30, animation: 1 }),
    ];
    const client = fakeClient({
      startManimRender: vi.fn(async () => status({ kind: 'manim', state: 'running', frames: 30 })),
      jobStatus: vi.fn(async () => states.shift()!),
    });
    const seen: string[] = [];
    const blob = await renderWithManim(
      client,
      request,
      (p) => seen.push(`${p.phase}:${p.frame}/${p.totalFrames}:${p.animation}`),
      new AbortController().signal,
      { pollMs: 1 },
    );
    expect(await blob!.text()).toBe('mp4');
    expect(seen).toEqual([
      'running:0/30:null',
      'running:5/30:0',
      'running:20/30:1',
      'running:30/30:1',
      'downloading:30/30:1',
    ]);
    expect(client.cancelJob).toHaveBeenCalledWith('manim', 'job1');
  });

  it('reports a failed render with the end of the log', async () => {
    const client = fakeClient({
      startManimRender: vi.fn(async () => status({ kind: 'manim', state: 'running' })),
      jobStatus: vi.fn(async () =>
        status({
          kind: 'manim',
          state: 'failed',
          error: { message: "NameError: name 'x' is not defined", line: null, log: 'Traceback…' },
        }),
      ),
    });
    const error = await renderWithManim(client, request, () => {}, new AbortController().signal, {
      pollMs: 1,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanionJobError);
    expect((error as CompanionJobError).log).toBe('Traceback…');
    expect(client.cancelJob).toHaveBeenCalled();
  });

  it('cancelling aborts the wait and deletes the job', async () => {
    const client = fakeClient({
      startManimRender: vi.fn(async () => status({ kind: 'manim', state: 'running' })),
      jobStatus: vi.fn(async () => status({ kind: 'manim', state: 'running' })),
    });
    const controller = new AbortController();
    const promise = renderWithManim(client, request, () => {}, controller.signal, {
      pollMs: 10_000,
    });
    await vi.waitFor(() => expect(client.startManimRender).toHaveBeenCalled());
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.cancelJob).toHaveBeenCalledWith('manim', 'job1');
  });

  it('deletes the render when cancelled while the start request is in flight', async () => {
    let finishStart: (status: CompanionJobStatus) => void = () => {};
    const client = fakeClient({
      startManimRender: vi.fn(
        () =>
          new Promise<CompanionJobStatus>((resolve) => {
            finishStart = resolve;
          }),
      ),
    });
    const controller = new AbortController();
    const promise = renderWithManim(client, request, () => {}, controller.signal, { pollMs: 1 });
    controller.abort();
    expect(vi.mocked(client.startManimRender).mock.calls[0]).toHaveLength(1);
    finishStart(status({ id: 'late', kind: 'manim', state: 'running' }));
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.cancelJob).toHaveBeenCalledWith('manim', 'late');
    expect(client.jobStatus).not.toHaveBeenCalled();
  });

  it('a cancelled job is an AbortError', async () => {
    const client = fakeClient({
      startManimRender: vi.fn(async () => status({ kind: 'manim', state: 'cancelled' })),
    });
    await expect(
      renderWithManim(client, request, () => {}, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
