import { describe, expect, it, vi } from 'vitest';
import { CompanionError, createCompanionClient } from '../companion';
import { HEALTH } from './fakeCompanion';

interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/** A fetch that answers /health and records every other call; `reply` decides the answer. */
function jobFetch(reply: (call: Call) => { status?: number; json?: unknown; blob?: Blob }) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/health') {
      return { ok: true, status: 200, json: async () => HEALTH } as Response;
    }
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const { status = 200, json, blob } = reply(call);
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      blob: async () => blob,
    } as Response;
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

const request = {
  format: 'mp4',
  quality: 'medium',
  width: 64,
  height: 48,
  fps: 10,
  frames: 20,
} as const;

describe('companion client: jobs', () => {
  it('creates a video job with a JSON body', async () => {
    const { fetch, calls } = jobFetch(() => ({
      status: 201,
      json: { ok: true, id: 'abc', state: 'receiving' },
    }));
    const client = createCompanionClient({ fetch, autoStart: false });
    const job = await client.createVideoJob(request);
    expect(job.id).toBe('abc');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/video', body: request });
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
  });

  it('sends frames as a binary body with the index of the first one', async () => {
    const { fetch, calls } = jobFetch(() => ({ json: { ok: true, received: 2 } }));
    const client = createCompanionClient({ fetch, autoStart: false });
    const body = new Blob([new Uint8Array(5)]);
    await client.sendVideoFrames('abc', 12, body);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/video/abc/frames?first=12', body });
    expect(calls[0]!.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('sends a piece of the soundtrack to the job of either kind, with its position', async () => {
    const { fetch, calls } = jobFetch(() => ({ json: { ok: true, audioReceived: 1044 } }));
    const client = createCompanionClient({ fetch, autoStart: false });
    const body = new Blob([new Uint8Array(1000)]);
    expect((await client.sendJobAudio('video', 'abc', 44, body)).audioReceived).toBe(1044);
    await client.sendJobAudio('manim', 'x1', 0, body);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /video/abc/audio?offset=44',
      'POST /manim-render/x1/audio?offset=0',
    ]);
    expect(calls[0]!.body).toBe(body);
    expect(calls[0]!.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('a refused piece carries the companion’s reason', async () => {
    const { fetch } = jobFetch(() => ({
      status: 400,
      json: { ok: false, error: { message: 'The soundtrack is not a WAV file.' } },
    }));
    const client = createCompanionClient({ fetch, autoStart: false });
    await expect(client.sendJobAudio('video', 'abc', 0, new Blob(['x']))).rejects.toMatchObject({
      message: 'The soundtrack is not a WAV file.',
      status: 400,
    });
  });

  it('finishes, polls, downloads and cancels', async () => {
    const result = new Blob(['video']);
    const { fetch, calls } = jobFetch((call) =>
      call.path.endsWith('/result') ? { blob: result } : { json: { ok: true, state: 'done' } },
    );
    const client = createCompanionClient({ fetch, autoStart: false });
    expect((await client.finishVideoJob('abc')).state).toBe('done');
    expect((await client.jobStatus('manim', 'x1')).state).toBe('done');
    expect(await client.jobResult('video', 'abc')).toBe(result);
    expect(await client.cancelJob('manim', 'x1')).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /video/abc/finish',
      'GET /manim-render/x1',
      'GET /video/abc/result',
      'DELETE /manim-render/x1',
    ]);
  });

  it('starts a Manim render', async () => {
    const { fetch, calls } = jobFetch(() => ({
      status: 201,
      json: { ok: true, id: 'm1', state: 'running' },
    }));
    const client = createCompanionClient({ fetch, autoStart: false });
    const manim = { target: 'ce', code: 'x', scene: 'S', width: 64, height: 48, fps: 10 } as const;
    await client.startManimRender(manim);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/manim-render', body: manim });
  });

  it('turns the companion’s error body into a CompanionError message', async () => {
    const { fetch } = jobFetch(() => ({
      status: 403,
      json: { ok: false, error: { message: 'Rendering with Manim is disabled.' } },
    }));
    const client = createCompanionClient({ fetch, autoStart: false });
    const error = await client
      .startManimRender({ target: 'ce', code: 'x', scene: 'S' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanionError);
    expect(error).toMatchObject({
      message: 'Rendering with Manim is disabled.',
      status: 403,
      unavailable: false,
    });
  });

  it('falls back to a generic message when the body has none', async () => {
    const { fetch } = jobFetch(() => ({ status: 500, json: 'nope' }));
    const client = createCompanionClient({ fetch, autoStart: false });
    await expect(client.jobStatus('video', 'a')).rejects.toThrow(
      'The companion answered with an error (HTTP 500). Check its terminal for details.',
    );
  });

  it('says what to do with an answer it cannot read', async () => {
    const fetchFn = (async (input: RequestInfo | URL) =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          if (String(input).endsWith('/health')) return HEALTH;
          throw new SyntaxError('Unexpected token <');
        },
      }) as Response) as typeof fetch;
    const client = createCompanionClient({ fetch: fetchFn, autoStart: false });
    await expect(client.jobStatus('video', 'a')).rejects.toThrow(
      'The companion sent an answer the app cannot read. Restart it, or update ' +
        'companion/mfe_companion.py if it is older than the app.',
    );
  });

  it('reports an unreachable companion as unavailable', async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/health')) throw new TypeError('offline');
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const client = createCompanionClient({ fetch: fetchFn, autoStart: false });
    const error = await client.createVideoJob(request).catch((e: unknown) => e);
    expect(error).toMatchObject({ unavailable: true, message: 'The companion is not reachable.' });
  });

  it('times out a job request', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = ((_: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        })) as typeof fetch;
      const client = createCompanionClient({
        fetch: fetchFn,
        autoStart: false,
        jobTimeoutMs: 1000,
      });
      const pending = client.createVideoJob(request).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await pending).toMatchObject({
        unavailable: true,
        message: expect.stringMatching(/in time/),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with the abort reason when the caller cancels, not with a CompanionError', async () => {
    const fetchFn = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      })) as typeof fetch;
    const client = createCompanionClient({ fetch: fetchFn, autoStart: false });
    const controller = new AbortController();
    const pending = client.sendVideoFrames('abc', 0, new Blob(['x']), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const aborted = new AbortController();
    aborted.abort();
    await expect(client.finishVideoJob('abc', aborted.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('keeps abort and timeout in force while a result is downloaded', async () => {
    // headers arrive at once, the body never does (until the request is aborted)
    const slowBody = (signal: AbortSignal | null | undefined) =>
      new Promise<Blob>((_resolve, reject) => {
        if (signal?.aborted) reject(signal.reason ?? new Error('aborted'));
        signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')));
      });
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/health')) throw new TypeError('offline');
      return { ok: true, status: 200, blob: () => slowBody(init?.signal) } as Response;
    }) as typeof fetch;

    const client = createCompanionClient({ fetch: fetchFn, autoStart: false });
    const controller = new AbortController();
    const pending = client.jobResult('video', 'abc', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    vi.useFakeTimers();
    try {
      const timed = createCompanionClient({
        fetch: fetchFn,
        autoStart: false,
        finishTimeoutMs: 5000,
      });
      const result = timed.jobResult('video', 'abc').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(5100);
      expect(await result).toMatchObject({
        unavailable: true,
        message: expect.stringMatching(/in time/),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelJob never rejects', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const client = createCompanionClient({ fetch: fetchFn, autoStart: false });
    expect(await client.cancelJob('video', 'abc')).toBe(false);
  });

  it('without fetch the job methods fail as unavailable', async () => {
    const client = createCompanionClient({ fetch: null });
    await expect(client.createVideoJob(request)).rejects.toMatchObject({ unavailable: true });
  });
});
