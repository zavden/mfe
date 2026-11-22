// @vitest-environment node
// Regression coverage of publication, cleanup and destination ownership across the real pipelines.
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../../model';
import { createCompanionClient } from '../../../engine/companion';
import {
  createVideoExporter,
  type EncoderLike,
  type VideoEnv,
} from '../../../export/video/exporter';
import { createMuxer } from '../../../export/video/muxer';
import { exportVideoViaCompanion, renderWithManim } from '../../../export/video/companion';
import {
  runVideoExport,
  type VideoRun,
  type VideoRunDeps,
  type VideoJob,
} from '../../../ui/export/videoExportRun';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const project = createEmptyProject('Lifecycle probe');
project.meta.duration = 0.1;
const values = { width: 64, height: 48, fps: 10, range: null, frames: 1, seconds: 0.1 };
const renderer = { draw: vi.fn(), pick: () => null, toScene: () => [0, 0] as [number, number] };
const noop = async () => undefined;
function deps(over: Partial<VideoRunDeps> = {}): VideoRunDeps {
  return {
    companionClient: () => {
      throw new Error('not used');
    },
    exportVideo: async () => {
      throw new Error('not used');
    },
    exportVideoViaCompanion,
    renderWithManim,
    generatePython: () => ({
      code: 'class LifecycleProbe(Scene): pass',
      sceneName: 'LifecycleProbe',
      issues: [],
      usedPositionalHelper: false,
    }),
    hasFileSystemAccess: () => false,
    openDestination: async () => null,
    downloadBlob: vi.fn(),
    notify: vi.fn(),
    ...over,
  };
}

class FakeChunk {
  type = 'key' as const;
  byteLength = 8;
  constructor(
    readonly timestamp: number,
    readonly duration: number,
  ) {}
  copyTo(destination: ArrayBuffer | ArrayBufferView) {
    const view =
      destination instanceof ArrayBuffer
        ? new Uint8Array(destination)
        : new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);
  }
}
(globalThis as { EncodedVideoChunk?: unknown }).EncodedVideoChunk = FakeChunk;

function fileDestination(write: (data: Uint8Array, position: number) => Promise<void>) {
  const writable = { write: vi.fn(noop), close: vi.fn(noop), abort: vi.fn(noop) };
  const file = { name: 'probe.webm', writable, sink: { write }, size: () => 1234 };
  return { writable, file };
}

describe('video output ownership', () => {
  it('still classifies a failed body read as a transport failure and refreshes health', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new TypeError('Network stream failed'));
        },
      }),
    );
    const paths: string[] = [];
    const client = createCompanionClient({
      autoStart: false,
      watchFocus: false,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path === '/health')
          return Response.json({
            name: 'mfe-companion',
            protocol: 1,
            version: '1.2.0',
            capabilities: {},
          });
        return response;
      },
    });
    const write = vi.fn(noop);
    await expect(client.jobResult('video', 'result', undefined, { write })).rejects.toMatchObject({
      name: 'CompanionError',
      message: 'The companion is not reachable.',
      unavailable: true,
    });
    expect(paths).toEqual(['/video/result/result', '/health']);
    expect(write).not.toHaveBeenCalled();
    expect(response.body!.locked).toBe(false);
  });

  it('aborts a failed destination once and reports its disk error through the run', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
      }),
    );
    const client = createCompanionClient({ autoStart: false, fetch: async () => response });
    const failure = new DOMException('No space left on device', 'QuotaExceededError');
    const { file, writable } = fileDestination(async () => {
      throw failure;
    });
    const states: VideoRun[] = [];
    const d = deps({
      hasFileSystemAccess: () => true,
      openDestination: async () => file,
      exportVideo: async (_scene, options, _progress, signal) =>
        client.jobResult('video', 'result', signal, options.sink),
    });
    await runVideoExport(
      {
        project,
        resolved: new Map(),
        values,
        job: { encoder: 'browser', codec: 'vp9', container: 'webm' },
      },
      (state) => states.push(state),
      new AbortController().signal,
      d,
    );
    expect(states.at(-1)).toMatchObject({ status: 'error', message: 'No space left on device' });
    expect(writable.abort).toHaveBeenCalledOnce();
    expect(writable.close).not.toHaveBeenCalled();
    expect(d.downloadBlob).not.toHaveBeenCalled();
    expect(response.body!.locked).toBe(false);
  });

  it('cancels and releases a body reader blocked on the next result chunk', async () => {
    const read = deferred();
    const cancelled = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          read.resolve();
        },
        cancel: cancelled,
      }),
    );
    const fetch = vi.fn(async () => response);
    const client = createCompanionClient({ autoStart: false, fetch });
    const abort = new AbortController();
    const write = vi.fn(noop);
    const pending = client.jobResult('video', 'result', abort.signal, { write });
    await read.promise;
    abort.abort();
    await expect(pending).rejects.toBe(abort.signal.reason);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('releases a successful result reader and preserves its byte positions', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3]));
          controller.close();
        },
      }),
    );
    const client = createCompanionClient({ autoStart: false, fetch: async () => response });
    const write = vi.fn<(data: Uint8Array, position: number) => Promise<void>>(noop);
    await expect(client.jobResult('video', 'result', undefined, { write })).resolves.toBeNull();
    expect(write.mock.calls.map((call) => call[1])).toEqual([0, 2]);
    expect(response.body!.locked).toBe(false);
  });

  it('aborts the file during WebM drain and never writes a duration patch after cancellation', async () => {
    const entered = deferred();
    const release = deferred();
    let writes = 0;
    const { file, writable } = fileDestination(async () => {
      writes++;
      if (writes === 1) {
        entered.resolve();
        await release.promise;
      }
    });
    let encoder!: EncoderLike;
    const env: VideoEnv = {
      renderer,
      createMuxer,
      now: () => 0,
      yieldToUi: noop,
      isConfigSupported: async (config) => ({ supported: true, config }),
      createCanvas: () => ({
        ctx: {} as OffscreenCanvasRenderingContext2D,
        toFrame: (timestamp, duration) => ({ timestamp, duration, close() {} }) as VideoFrame,
      }),
      createEncoder(init) {
        let state: CodecState = 'configured';
        encoder = {
          get state() {
            return state;
          },
          encodeQueueSize: 0,
          configure() {},
          encode(frame) {
            queueMicrotask(() =>
              init.output(
                new FakeChunk(frame.timestamp, frame.duration!) as unknown as EncodedVideoChunk,
              ),
            );
          },
          flush: noop,
          close() {
            state = 'closed';
          },
          addEventListener() {},
          removeEventListener() {},
        };
        return encoder;
      },
    };
    const controller = new AbortController();
    const states: VideoRun[] = [];
    let settled = false;
    const pending = runVideoExport(
      {
        project,
        resolved: new Map(),
        values,
        job: { encoder: 'browser', codec: 'vp9', container: 'webm' },
      },
      (state) => states.push(state),
      controller.signal,
      deps({
        exportVideo: createVideoExporter(env),
        hasFileSystemAccess: () => true,
        openDestination: async () => file,
      }),
    ).finally(() => {
      settled = true;
    });
    await entered.promise;
    controller.abort();
    await Promise.resolve();
    expect(encoder.state).toBe('closed');
    expect(settled).toBe(false);
    expect(writable.abort).toHaveBeenCalledOnce();
    release.resolve();
    await pending;
    expect(writes).toBe(1); // Cancellation drops every queued write, including the duration patch.
    expect(states.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(writable.close).not.toHaveBeenCalled();
    expect(writable.abort).toHaveBeenCalledOnce();
  });

  for (const encoder of ['ffmpeg', 'manim'] as const) {
    for (const toFile of [false, true]) {
      it(`${encoder}: cancellation during normal DELETE cleanup prevents ${toFile ? 'file commit' : 'download'}`, async () => {
        const cleanupEntered = deferred();
        const cleanupRelease = deferred();
        const calls: string[] = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(String(input)).pathname;
          const method = init?.method ?? 'GET';
          calls.push(`${method} ${path}`);
          if (method === 'DELETE') {
            cleanupEntered.resolve();
            await cleanupRelease.promise;
            return Response.json({ ok: true }, { status: 200 });
          }
          if (path.endsWith('/result'))
            return new Response(new Uint8Array([0, 1, 2, 3]), {
              headers: { 'content-type': 'video/mp4' },
            });
          const kind = encoder === 'ffmpeg' ? 'video' : 'manim';
          const base = { ok: true, id: 'normal-job', kind, elapsedS: 0, frames: 1 };
          if (path === '/video')
            return Response.json(
              {
                ...base,
                state: 'receiving',
                received: 0,
                encoded: 0,
                maxFrameBytes: 64 * 1024 * 1024,
                maxRequestBytes: 128 * 1024 * 1024,
              },
              { status: 201 },
            );
          if (path.endsWith('/frames'))
            return Response.json({
              ...base,
              state: 'receiving',
              received: 1,
              encoded: 1,
              accepted: 1,
            });
          if (path === '/manim-render')
            return Response.json(
              { ...base, state: 'running', frame: 0, animation: null, sandboxed: true },
              { status: 201 },
            );
          return Response.json({
            ...base,
            state: 'done',
            bytes: 4,
            mime: 'video/mp4',
            frame: 1,
            animation: 0,
          });
        });
        const client = createCompanionClient({
          fetch: fetchMock,
          autoStart: false,
          watchFocus: false,
        });
        const { file, writable } = fileDestination(noop);
        const d = deps({
          companionClient: () => client,
          exportVideoViaCompanion: (client, evaluator, options, progress, signal) =>
            exportVideoViaCompanion(client, evaluator, options, progress, signal, {
              renderer,
              createCanvas: () => ({
                ctx: {} as OffscreenCanvasRenderingContext2D,
                toPng: async () => new Blob(['tiny PNG stand-in']),
              }),
            }),
          renderWithManim: (client, request, progress, signal, options) =>
            renderWithManim(client, request, progress, signal, { ...options, pollMs: 0 }),
          hasFileSystemAccess: () => toFile,
          openDestination: async () => file,
        });
        const job: VideoJob =
          encoder === 'ffmpeg'
            ? { encoder, format: 'mp4', quality: 'medium' }
            : { encoder, target: 'ce', quality: 'medium' };
        const controller = new AbortController();
        const states: VideoRun[] = [];
        const pending = runVideoExport(
          { project, resolved: new Map(), values, job },
          (state) => states.push(state),
          controller.signal,
          d,
        );
        await cleanupEntered.promise;
        expect(states.at(-1)?.status).toBe('running');
        controller.abort();
        cleanupRelease.resolve();
        await pending;
        expect(states.at(-1)?.status).toBe('cancelled');
        expect(states.filter((s) => s.status === 'cancelled')).toHaveLength(1);
        expect(writable.close).not.toHaveBeenCalled();
        expect(d.downloadBlob).not.toHaveBeenCalled();
        if (toFile) expect(writable.abort).toHaveBeenCalledOnce();
        client.stop();
      });
    }
  }

  it('preserves a local destination error without probing companion health', async () => {
    const calls: string[] = [];
    const client = createCompanionClient({
      autoStart: false,
      watchFocus: false,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        if (path === '/health')
          return Response.json({
            name: 'mfe-companion',
            version: '1.2.0',
            protocol: 1,
            capabilities: {
              latex: true,
              dvisvgm: true,
              ffmpeg: true,
              manimCE: null,
              manimGL: null,
            },
          });
        return new Response(new Uint8Array([1, 2, 3]));
      },
    });
    const localFailure = new DOMException('No space left on device', 'QuotaExceededError');
    let caught: unknown;
    try {
      await client.jobResult('video', 'normal-job', undefined, {
        write: async () => {
          throw localFailure;
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(localFailure);
    expect(calls).not.toContain('/health');
    client.stop();
  });

  it('cancels the failed result transfer and releases its owned reader', async () => {
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const bodyCancelled = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          bodyController = controller;
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel: bodyCancelled,
      }),
    );
    let fetchSignal: AbortSignal | null | undefined;
    const client = createCompanionClient({
      autoStart: false,
      watchFocus: false,
      fetch: async (input, init) => {
        if (new URL(String(input)).pathname === '/health')
          return Response.json({
            name: 'mfe-companion',
            version: '1.2.0',
            protocol: 1,
            capabilities: {
              latex: true,
              dvisvgm: true,
              ffmpeg: true,
              manimCE: null,
              manimGL: null,
            },
          });
        fetchSignal = init?.signal;
        return response;
      },
    });
    await expect(
      client.jobResult('video', 'normal-job', undefined, {
        write: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(bodyCancelled).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
    expect(fetchSignal?.aborted).toBe(true);
    if (response.body!.locked) bodyController.close(); // Keep a red regression bounded too.
    client.stop();
  });
});
