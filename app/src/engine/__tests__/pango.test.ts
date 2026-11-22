// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createTextFormula } from '../../model';
import { textGeometry, textResponse } from '../../test/textGeometry';
import { CompanionError, createCompanionClient, type CompanionClient } from '../companion';
import { createEngine, isCurrentRender } from '../engine';
import {
  canRenderPango,
  isTextBoxes,
  isVerifiedText,
  pangoCapability,
  pangoState,
  textArtifactRender,
  textBoxesKey,
  textEnvironment,
} from '../pango';
import { renderRequestFor } from '../producers';
import { TEXT_BOXES_WARNING, textBoxRanges } from '../textBoxes';
import { matchTextGeometry } from '../textMatch';
import type {
  CompanionPango,
  CompanionState,
  CompanionTextResponse,
  TextRenderRequest,
} from '../types';

function setup() {
  const artifact = textGeometry();
  const text = vi.fn(async () => textResponse(artifact));
  const client = createCompanionClient({ fetch: null });
  client.state = () => ({
    status: 'online',
    health: {
      name: 'mfe-companion',
      version: 'test',
      protocol: 1,
      capabilities: {
        latex: false,
        dvisvgm: false,
        ffmpeg: false,
        manimCE: null,
        manimGL: null,
        pango: {
          ce: {
            state: 'ready',
            adapterVersion: 'test-adapter',
            environmentKey: 'test-environment',
          },
        },
      },
    },
  });
  client.text = text;
  return {
    artifact,
    client,
    text,
    engine: createEngine({ companion: client }),
    request: renderRequestFor(
      createTextFormula({ source: 'AB' }),
      { target: 'ce', preamble: '' },
      'mathjax',
    ),
  };
}

/** Observable native calls with explicit completion and real AbortSignal cleanup. */
function controlledNative(client: CompanionClient) {
  const pending = new Map<string, () => void>();
  let active = 0;
  let peak = 0;
  const text = vi.fn<NonNullable<CompanionClient['text']>>((basis, signal) => {
    active++;
    peak = Math.max(peak, active);
    return new Promise<CompanionTextResponse>((resolve, reject) => {
      let complete = false;
      const finish = (error?: unknown) => {
        if (complete) return;
        complete = true;
        active--;
        signal?.removeEventListener('abort', abort);
        pending.delete(basis.source);
        if (error) reject(error);
        else resolve(textResponse(textGeometry(basis.source)));
      };
      const abort = () => finish(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      pending.set(basis.source, () => finish());
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  });
  client.text = text;
  return {
    text,
    peak: () => peak,
    finish(source: string) {
      const complete = pending.get(source);
      if (!complete) throw new Error(`No native request for ${source}`);
      complete();
    },
  };
}

describe('Pango request ownership and saved appearance', () => {
  it('dispatches literal text to Pango even in MathJax mode and separates native availability', async () => {
    const { artifact, client, text, engine, request } = setup();
    try {
      const result = await engine.render(request);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.render.backend).toBe('pango');
      expect(text).toHaveBeenCalledOnce();
      await engine.render({ ...request, preamble: 'irrelevant TeX' });
      expect(text).toHaveBeenCalledOnce();
      expect(textEnvironment(result.render, client.state(), 'ce')).toBe('same');
      expect(isVerifiedText(result.render, client.state(), 'ce')).toBe(true);
      const formula = createTextFormula({ source: 'AB' });
      expect(
        isCurrentRender(textArtifactRender(artifact), formula, { target: 'ce', preamble: '' }),
      ).toBe(true);
      // Without a companion to ask, or with one that shapes no text for the library, nobody
      // knows; with other fonts or versions, they changed. Neither vouches for the text.
      expect(textEnvironment(result.render, { status: 'offline' }, 'ce')).toBe('unknown');
      expect(isVerifiedText(result.render, { status: 'offline' }, 'ce')).toBe(false);
      expect(textEnvironment(result.render, client.state(), 'gl')).toBe('unknown');
      expect(isVerifiedText(result.render, client.state(), 'gl')).toBe(false);
      const state = client.state();
      if (state.status !== 'online') throw new Error('Expected the companion online.');
      const ready = { state: 'ready' } as const;
      for (const pango of [
        { ce: { ...ready, adapterVersion: 'test-adapter', environmentKey: 'other fonts' } },
        { ce: { ...ready, adapterVersion: 'other adapter', environmentKey: 'test-environment' } },
      ]) {
        const moved = {
          ...state,
          health: { ...state.health, capabilities: { ...state.health.capabilities, pango } },
        };
        expect(textEnvironment(result.render, moved, 'ce')).toBe('changed');
        expect(isVerifiedText(result.render, moved, 'ce')).toBe(false);
      }
      // A text without a fingerprint is in the same environment, and still not vouched for.
      const bare = structuredClone(result.render);
      delete bare.text!.provenance.geometrySignature;
      expect(textEnvironment(bare, client.state(), 'ce')).toBe('same');
      expect(isVerifiedText(bare, client.state(), 'ce')).toBe(false);
      expect(
        isCurrentRender(
          result.render,
          { ...formula, source: 'AC' },
          { target: 'ce', preamble: '' },
        ),
      ).toBe(false);
    } finally {
      engine.dispose();
    }
  });

  it('cancels abandoned native work without cancelling another subscriber', async () => {
    const { artifact, client, engine, request } = setup();
    let finish!: (value: ReturnType<typeof textResponse>) => void;
    let signal!: AbortSignal;
    client.text = vi.fn((_request, nextSignal) => {
      signal = nextSignal!;
      return new Promise<CompanionTextResponse>((resolve) => {
        finish = resolve;
      });
    });
    const a = new AbortController();
    const b = new AbortController();
    const first = engine.render(request, a.signal);
    const second = engine.render(request, b.signal);
    await vi.waitFor(() => expect(client.text).toHaveBeenCalledOnce());
    const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    a.abort();
    await aborted;
    expect(signal.aborted).toBe(false);
    finish(textResponse(artifact));
    expect((await second).ok).toBe(true);
    engine.clearCache();
    const last = new AbortController();
    const alone = engine.render(request, last.signal);
    await vi.waitFor(() => expect(client.text).toHaveBeenCalledTimes(2));
    const abandoned = expect(alone).rejects.toMatchObject({ name: 'AbortError' });
    last.abort();
    await abandoned;
    expect(signal.aborted).toBe(true);
    finish(textResponse(artifact));
    engine.dispose();
  });

  it('rejects malformed vectors and never falls back to invented browser glyphs', async () => {
    const { artifact, client, engine, request } = setup();
    artifact.glyphs[0]!.contours[0]![0] = NaN;
    client.text = async () => textResponse(artifact);
    const result = await engine.render(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.backend).toBe('pango');
    engine.dispose();
  });

  it('admits only two active plus four pending jobs and retries an overflow after capacity returns', async () => {
    const { client, engine, request } = setup();
    if (request.kind !== 'text') throw new Error('Expected text request');
    const native = controlledNative(client);
    const jobs = Array.from({ length: 6 }, (_, i) =>
      engine.render({ ...request, source: `Job${i}` }),
    );
    try {
      await vi.waitFor(() => expect(native.text).toHaveBeenCalledTimes(2));
      const overflow = await engine.render({ ...request, source: 'Overflow' });
      expect(overflow).toMatchObject({ ok: false, error: { backend: 'pango', retryAfterMs: 250 } });
      expect(native.text).toHaveBeenCalledTimes(2);
      for (let index = 0; index < 4; index++) {
        native.finish(`Job${index}`);
        await vi.waitFor(() => expect(native.text).toHaveBeenCalledTimes(index + 3));
      }
      native.finish('Job4');
      native.finish('Job5');
      expect((await Promise.all(jobs)).every((result) => result.ok)).toBe(true);
      const retried = engine.render({ ...request, source: 'Overflow' });
      jobs.push(retried);
      await vi.waitFor(() => expect(native.text).toHaveBeenCalledTimes(7));
      native.finish('Overflow');
      expect((await retried).ok).toBe(true);
      expect(native.peak()).toBe(2);
    } finally {
      engine.dispose();
      await Promise.allSettled(jobs);
    }
  });

  it('removes a cancelled pending job before native invocation and reuses its admission slot', async () => {
    const { client, engine, request } = setup();
    if (request.kind !== 'text') throw new Error('Expected text request');
    const native = controlledNative(client);
    const controllers = Array.from({ length: 6 }, () => new AbortController());
    const jobs = controllers.map((controller, index) =>
      engine.render({ ...request, source: `Job${index}` }, controller.signal),
    );
    try {
      await vi.waitFor(() => expect(native.text).toHaveBeenCalledTimes(2));
      const cancelled = expect(jobs[2]).rejects.toMatchObject({ name: 'AbortError' });
      controllers[2]!.abort();
      await cancelled;
      const replacement = engine.render({ ...request, source: 'Replacement' });
      jobs.push(replacement);
      for (const [index, source] of ['Job0', 'Job1', 'Job3', 'Job4'].entries()) {
        native.finish(source);
        await vi.waitFor(() => expect(native.text).toHaveBeenCalledTimes(index + 3));
      }
      native.finish('Job5');
      native.finish('Replacement');
      const results = await Promise.all(jobs.filter((_, index) => index !== 2));
      expect(results.every((result) => result.ok)).toBe(true);
      expect(native.text.mock.calls.some(([basis]) => basis.source === 'Job2')).toBe(false);
      expect(native.peak()).toBe(2);
    } finally {
      engine.dispose();
      await Promise.allSettled(jobs);
    }
  });

  it.each(['environmentKey', 'adapterVersion'] as const)(
    'rejects a response from a changed %s and never caches it under the old capability',
    async (field) => {
      const { artifact, client, text, engine, request } = setup();
      const initialState = client.state();
      if (initialState.status !== 'online') throw new Error('Expected online companion');
      const changed = structuredClone(artifact);
      changed.provenance[field] = 'changed-native-environment';
      changed.key += '-changed';
      text.mockResolvedValue(textResponse(changed));
      const check = vi.fn(async () => initialState);
      client.check = check;
      try {
        const rejected = await engine.render(request);
        expect(rejected).toMatchObject({
          ok: false,
          error: { backend: 'pango', retryAfterMs: 500 },
        });
        expect(check).toHaveBeenCalledOnce();
        const nextState = structuredClone(initialState);
        const capability = nextState.health.capabilities.pango!.ce!;
        if (capability.state !== 'ready') throw new Error('Expected a ready text worker');
        capability[field] = changed.provenance[field];
        client.state = () => nextState;
        const next = await engine.render(request);
        expect(next.ok).toBe(true);
        if (next.ok) expect(next.render.text?.provenance[field]).toBe(changed.provenance[field]);
        client.state = () => initialState;
        text.mockResolvedValue(textResponse(artifact));
        const original = await engine.render(request);
        expect(original.ok).toBe(true);
        if (original.ok)
          expect(original.render.text?.provenance[field]).toBe(artifact.provenance[field]);
        expect(text).toHaveBeenCalledTimes(3);
      } finally {
        engine.dispose();
      }
    },
  );

  it('treats server overload as retryable and releases admission after a native request rejects', async () => {
    const { artifact, text, engine, request } = setup();
    text.mockRejectedValueOnce(new CompanionError('Native queue is full', false, 429));
    try {
      const busy = await engine.render(request);
      expect(busy).toMatchObject({ ok: false, error: { backend: 'pango', retryAfterMs: 500 } });
      text.mockResolvedValue(textResponse(artifact));
      expect((await engine.render(request)).ok).toBe(true);
      expect(text).toHaveBeenCalledTimes(2);
    } finally {
      engine.dispose();
    }
  });
});

/** A companion whose text workers stand as `pango` says. */
function companionWith(pango: Partial<Record<'ce' | 'gl', CompanionPango | null>>): CompanionState {
  return {
    status: 'online',
    health: {
      name: 'mfe-companion',
      version: 'test',
      protocol: 1,
      capabilities: {
        latex: false,
        dvisvgm: false,
        ffmpeg: false,
        manimCE: null,
        manimGL: null,
        pango,
      },
    },
  };
}

describe('the companion’s text workers, as the app reads them', () => {
  const ready = { state: 'ready', adapterVersion: 'a', environmentKey: 'e' } as const;

  it('names the state of each library, and none where there is nothing to ask', () => {
    const state = companionWith({ ce: ready, gl: { state: 'unused' } });
    expect(pangoState(state, 'ce')).toBe('ready');
    expect(pangoState(state, 'gl')).toBe('unused');
    expect(pangoState(companionWith({ ce: { state: 'preparing' } }), 'ce')).toBe('preparing');
    expect(pangoState(companionWith({ ce: { state: 'failed', message: 'no' } }), 'ce')).toBe(
      'failed',
    );
    // No interpreter of the library, a companion without font text, no companion.
    expect(pangoState(companionWith({ ce: null }), 'ce')).toBe('none');
    expect(pangoState(companionWith({}), 'gl')).toBe('none');
    expect(pangoState({ status: 'offline' }, 'ce')).toBe('none');
    expect(pangoState({ status: 'checking' }, 'ce')).toBe('none');
  });

  it('shapes text only with a worker that is ready', () => {
    expect(pangoCapability(companionWith({ ce: ready }), 'ce')).toEqual(ready);
    expect(canRenderPango(companionWith({ ce: ready }), 'ce')).toBe(true);
    for (const other of [
      { state: 'unused' },
      { state: 'preparing' },
      { state: 'failed', message: 'no' },
      null,
    ] as const) {
      expect(pangoCapability(companionWith({ ce: other }), 'ce')).toBeNull();
      expect(canRenderPango(companionWith({ ce: other }), 'ce')).toBe(false);
    }
    expect(canRenderPango(companionWith({ ce: ready }), 'gl')).toBe(false);
  });

  it('draws boxes while the worker is not ready, and asks nothing', async () => {
    for (const state of ['unused', 'preparing', 'failed'] as const) {
      const { client, engine, request, text } = setup();
      client.state = () => companionWith({ ce: { state } });
      try {
        const result = await engine.render(request);
        expect(result).toMatchObject({ ok: true, render: { exact: false } });
        expect(text).not.toHaveBeenCalled();
      } finally {
        engine.dispose();
      }
    }
  });
});

describe('asking the companion to start a text worker', () => {
  function prepared(pango: CompanionPango | null) {
    const made = setup();
    let state = companionWith({ ce: pango });
    made.client.state = () => state;
    const fonts = vi.fn(
      () => new Promise<never>(() => undefined), // answers when the worker is ready: not here
    );
    made.client.fonts = fonts as unknown as CompanionClient['fonts'];
    const check = vi.fn(async () => state);
    made.client.check = check;
    return {
      ...made,
      fonts,
      check,
      become(next: CompanionPango) {
        state = companionWith({ ce: next });
      },
    };
  }

  it('asks for the fonts of a library nothing has started, once', () => {
    vi.useFakeTimers();
    const { engine, fonts, check } = prepared({ state: 'unused' });
    try {
      engine.prepareText('ce');
      engine.prepareText('ce');
      expect(fonts).toHaveBeenCalledOnce();
      expect(fonts).toHaveBeenCalledWith('ce');
      // And looks at the companion soon: it says "preparing" from now on.
      expect(check).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(check).toHaveBeenCalledOnce();
    } finally {
      engine.dispose();
      vi.useRealTimers();
    }
  });

  it('asks nothing of a worker that is starting, ready or failed, nor where there is none', () => {
    for (const pango of [
      { state: 'preparing' },
      { state: 'ready', adapterVersion: 'a', environmentKey: 'e' },
      { state: 'failed', message: 'no' },
      null,
    ] as const) {
      const { engine, fonts } = prepared(pango);
      engine.prepareText('ce');
      expect(fonts).not.toHaveBeenCalled();
      engine.dispose();
    }
    // Nor of the library the companion has no interpreter of.
    const { engine, fonts } = prepared({ state: 'unused' });
    engine.prepareText('gl');
    expect(fonts).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('looks at the companion again when the request ends, however it ends', async () => {
    const { engine, client, check } = prepared({ state: 'unused' });
    client.fonts = vi.fn(async () => {
      throw new CompanionError('The companion did not answer in time.', true);
    }) as unknown as CompanionClient['fonts'];
    try {
      engine.prepareText('ce');
      await vi.waitFor(() => expect(check).toHaveBeenCalled());
      // A request that ended is not in the way of another one.
      engine.prepareText('ce');
      expect(client.fonts).toHaveBeenCalledTimes(2);
    } finally {
      engine.dispose();
    }
  });
});

describe('a font text nothing can shape', () => {
  const offline = () => {
    const made = setup();
    made.client.state = () => ({ status: 'offline' });
    return made;
  };
  const boxesOf = async (engine: ReturnType<typeof setup>['engine'], request: unknown) => {
    const result = await engine.render(request as TextRenderRequest);
    if (!result.ok) throw new Error(result.error.message);
    return result.render;
  };

  it('is drawn as its placeholder boxes without a companion, and nothing is asked', async () => {
    const { engine, request, text } = offline();
    try {
      const render = await boxesOf(engine, request);
      expect(render).toMatchObject({
        key: textBoxesKey(request as TextRenderRequest),
        backend: 'pango',
        exact: false,
        target: 'ce',
        warnings: [TEXT_BOXES_WARNING],
        boxes: { source: 'AB', ranges: textBoxRanges('AB') },
      });
      expect(render.text).toBeUndefined();
      expect(render.glyphs.map((glyph) => glyph.label)).toEqual(['A', 'B']);
      expect(isTextBoxes(render)).toBe(true);
      expect(text).not.toHaveBeenCalled();
      // The same boxes for the same request, laid out once.
      expect(await boxesOf(engine, request)).toBe(render);
    } finally {
      engine.dispose();
    }
  });

  it('is drawn as boxes for the library the companion shapes no text for', async () => {
    const { engine, request, text } = setup();
    try {
      const render = await boxesOf(engine, { ...request, target: 'gl' });
      expect(render).toMatchObject({ exact: false, target: 'gl' });
      expect(render.key).not.toBe(textBoxesKey(request as TextRenderRequest));
      expect(text).not.toHaveBeenCalled();
    } finally {
      engine.dispose();
    }
  });

  it('is drawn as boxes when the companion goes away under the request', async () => {
    const { engine, request, text } = setup();
    text.mockRejectedValueOnce(new CompanionError('The companion is not reachable.', true));
    try {
      expect(isTextBoxes(await boxesOf(engine, request))).toBe(true);
      // Back again: the next request is shaped.
      const shaped = await boxesOf(engine, request);
      expect(shaped.exact).toBe(true);
      expect(shaped.text).toBeDefined();
    } finally {
      engine.dispose();
    }
  });

  it('is an error, not boxes, when the companion says what is wrong with the text', async () => {
    const { engine, request, text } = setup();
    text.mockResolvedValueOnce({
      ok: false,
      error: { message: 'The requested font family is not available in this native environment.' },
      diagnostics: [{ code: 'missing-font', message: 'missing', ranges: [] }],
    });
    try {
      expect(await engine.render(request)).toMatchObject({
        ok: false,
        error: { backend: 'pango', message: expect.stringContaining('font family') },
      });
    } finally {
      engine.dispose();
    }
  });

  it('is shaped as soon as a companion can, the boxes staying what they were', async () => {
    const made = offline();
    try {
      const boxes = await boxesOf(made.engine, made.request);
      const online = setup();
      made.client.state = online.client.state;
      const shaped = await boxesOf(made.engine, made.request);
      expect(shaped.exact).toBe(true);
      expect(shaped.key).not.toBe(boxes.key);
      expect(made.text).toHaveBeenCalledOnce();
      online.engine.dispose();
    } finally {
      made.engine.dispose();
    }
  });
});

describe('Pango source-cluster correspondence', () => {
  it('preserves clusters after an insertion and maps RTL by source ranges, not path order', () => {
    expect(matchTextGeometry(textGeometry('AB'), textGeometry('A🙂B')).map).toEqual([0, 2]);
    const before = textGeometry('אב');
    const after = textGeometry('אב', [
      { start: 1, end: 2 },
      { start: 0, end: 1 },
    ]);
    expect(matchTextGeometry(before, after).map).toEqual([1, 0]);
  });

  it('requires repair for split ligatures and ambiguous deleted repeated occurrences', () => {
    const ligature = textGeometry('office', [
      { start: 0, end: 1 },
      { start: 1, end: 4 },
      { start: 4, end: 5 },
      { start: 5, end: 6 },
    ]);
    expect(matchTextGeometry(ligature, textGeometry('office')).map).toEqual([0, null, 4, 5]);
    expect(matchTextGeometry(textGeometry('AaaaB'), textGeometry('AaaB')).map).toEqual([
      0,
      null,
      null,
      null,
      3,
    ]);
  });
});
