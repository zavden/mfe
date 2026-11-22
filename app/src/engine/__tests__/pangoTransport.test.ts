// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createTextFormula } from '../../model';
import { textGeometry, textResponse } from '../../test/textGeometry';
import { CompanionError, createCompanionClient, type CompanionClient } from '../companion';
import { createEngine } from '../engine';
import { canRenderPango } from '../pango';
import { renderRequestFor } from '../producers';
import type { CompanionFontCatalog, CompanionHealth, CompanionTextRequest } from '../types';

const clients: CompanionClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
});

const oldHealth: CompanionHealth = {
  name: 'mfe-companion',
  version: '1.3.0',
  protocol: 1,
  capabilities: {
    latex: true,
    dvisvgm: true,
    ffmpeg: false,
    manimCE: null,
    manimGL: null,
    textMode: true,
  },
};
const face = { name: 'Regular', weight: 'normal', slant: 'normal', synthetic: false };
const catalog: CompanionFontCatalog = {
  ok: true,
  target: 'ce',
  adapterVersion: 'test-adapter',
  environmentKey: 'test-environment',
  fonts: [{ family: 'Noto Sans', faces: [face], variable: false }],
};
const request: CompanionTextRequest = {
  source: 'AB',
  target: 'ce',
  fontSize: 48,
  font: { family: 'Noto Sans', weight: 'normal', slant: 'normal' },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client(fetchFn: typeof fetch): CompanionClient {
  const value = createCompanionClient({ fetch: fetchFn, autoStart: false, watchFocus: false });
  clients.push(value);
  return value;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Pango companion transport', () => {
  it('reads a typed font catalog and literal text response through actual Response bodies', async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ path: url.pathname + url.search, method: init?.method ?? 'GET', body });
      return json(url.pathname === '/fonts' ? catalog : textResponse(textGeometry()));
    };
    const connection = client(fetchFn);
    expect(await connection.fonts!('ce')).toEqual(catalog);
    expect((await connection.text!({ ...request, requestId: 'literal-source-request' })).ok).toBe(
      true,
    );
    expect(calls).toEqual([
      { path: '/fonts?target=ce', method: 'GET', body: null },
      { path: '/text', method: 'POST', body: { ...request, requestId: 'literal-source-request' } },
    ]);
  });

  it.each(['null', 'target', 'fonts', 'family', 'face', 'face-limit'] as const)(
    'rejects an invalid %s catalog as a protocol failure',
    async (invalid) => {
      const body =
        invalid === 'null'
          ? null
          : invalid === 'target'
            ? { ...catalog, target: 'gl' }
            : invalid === 'fonts'
              ? { ...catalog, fonts: {} }
              : invalid === 'family'
                ? { ...catalog, fonts: [{ family: 'x'.repeat(257), faces: [face] }] }
                : invalid === 'face'
                  ? {
                      ...catalog,
                      fonts: [{ family: 'Noto Sans', faces: [{ ...face, synthetic: 'no' }] }],
                    }
                  : {
                      ...catalog,
                      fonts: [
                        { family: 'Noto Sans', faces: Array.from({ length: 257 }, () => face) },
                      ],
                    };
      const connection = client(async () => json(body));
      await expect(connection.fonts!('ce')).rejects.toMatchObject({
        name: 'CompanionError',
        unavailable: false,
        message: expect.stringMatching(/invalid font catalog/i),
      });
    },
  );

  it.each(['json', 'utf8'] as const)(
    'classifies malformed %s as readable transport with invalid data',
    async (invalid) => {
      const connection = client(async (input, init) => {
        if (init?.method === 'DELETE') return new Response(null, { status: 204 });
        if (new URL(String(input)).pathname === '/health') return json(oldHealth);
        return new Response(invalid === 'json' ? '{"ok":' : new Uint8Array([0xc3, 0x28]));
      });
      await expect(connection.fonts!('ce')).rejects.toMatchObject({
        name: 'CompanionError',
        unavailable: false,
      });
      await expect(connection.text!(request)).rejects.toMatchObject({
        name: 'CompanionError',
        unavailable: false,
      });
    },
  );

  it.each([
    ['fonts', 200],
    ['fonts', 500],
    ['text', 200],
    ['text', 500],
  ] as const)(
    'bounds declared %s response bytes on HTTP %s before reading JSON',
    async (endpoint, status) => {
      const connection = client(async (_input, init) => {
        if (init?.method === 'DELETE') return new Response(null, { status: 204 });
        // Only a few body bytes are allocated; the untrusted header already exceeds the budget.
        return new Response('{"error":{"message":"small fixture"}}', {
          status,
          headers: { 'Content-Length': String(16 * 1024 * 1024 + 1) },
        });
      });
      const pending = endpoint === 'fonts' ? connection.fonts!('ce') : connection.text!(request);
      await expect(pending).rejects.toMatchObject({
        name: 'CompanionError',
        unavailable: false,
        message: expect.stringMatching(/size limit/i),
      });
    },
  );

  it('aborts an unfinished text request and sends DELETE for exactly its request ID', async () => {
    const started = deferred();
    const deleted: string[] = [];
    const transport: { signal?: AbortSignal | null } = {};
    const connection = client(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === 'DELETE') {
        deleted.push(url.pathname);
        return new Response(null, { status: 204 });
      }
      transport.signal = init?.signal;
      started.resolve();
      return new Promise<Response>((_resolve, reject) => {
        transport.signal?.addEventListener('abort', () => reject(transport.signal?.reason), {
          once: true,
        });
      });
    });
    const abort = new AbortController();
    const reason = new DOMException('Superseded text draft', 'AbortError');
    const pending = connection.text!({ ...request, requestId: 'owned-text-request' }, abort.signal);
    const rejected = expect(pending).rejects.toBe(reason);
    await started.promise;
    abort.abort(reason);
    await rejected;
    expect(transport.signal?.aborted).toBe(true);
    expect(deleted.length).toBeGreaterThan(0);
    expect(new Set(deleted)).toEqual(new Set(['/text/owned-text-request']));
  });

  it('keeps cancellation active while the text response body is still arriving', async () => {
    const reading = deferred();
    const deleted: string[] = [];
    const streaming: { body?: ReadableStream<Uint8Array> } = {};
    const connection = client(async (input, init) => {
      if (init?.method === 'DELETE') {
        deleted.push(new URL(String(input)).pathname);
        return new Response(null, { status: 204 });
      }
      const signal = init?.signal;
      streaming.body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"ok":'));
          // Real fetch ties a response stream to its request signal as well as its headers.
          signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        },
        pull() {
          reading.resolve();
        },
      });
      return new Response(streaming.body);
    });
    const abort = new AbortController();
    const reason = new DOMException('Body no longer needed', 'AbortError');
    const pending = connection.text!(
      { ...request, requestId: 'streaming-text-request' },
      abort.signal,
    );
    const rejected = expect(pending).rejects.toBe(reason);
    await reading.promise;
    abort.abort(reason);
    await rejected;
    expect(streaming.body?.locked).toBe(false);
    expect(deleted.length).toBeGreaterThan(0);
    expect(new Set(deleted)).toEqual(new Set(['/text/streaming-text-request']));
  });

  it('preserves legacy protocol-v1 LaTeX while Pango is unavailable on an older companion', async () => {
    const calls: string[] = [];
    const connection = client(async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path === '/health') return json(oldHealth);
      if (path === '/tex')
        return json({ ok: true, svg: '<svg/>', glyphs: [], cached: false, ms: 1, warnings: [] });
      return json({ ok: false, error: { message: 'Unknown path.' } }, 404);
    });
    expect((await connection.check()).status).toBe('online');
    expect(canRenderPango(connection.state(), 'ce')).toBe(false);
    const engine = createEngine({ companion: connection });
    try {
      const result = await engine.render(
        renderRequestFor(
          createTextFormula({ source: 'AB' }),
          { target: 'ce', preamble: '' },
          'auto',
        ),
      );
      // Nothing shapes the text: it is drawn as its placeholder boxes, which are not exact.
      expect(result).toMatchObject({
        ok: true,
        render: { backend: 'pango', exact: false, boxes: { source: 'AB' } },
      });
      expect(calls).not.toContain('/text');
      expect(
        (await connection.tex({ latex: 'x', packages: [], preamble: '', target: 'ce' })).ok,
      ).toBe(true);
      await expect(connection.fonts!('ce')).rejects.toEqual(
        new CompanionError('Unknown path.', false, 404),
      );
      expect(connection.state().status).toBe('online');
    } finally {
      engine.dispose();
    }
  });
});
