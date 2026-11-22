import { describe, expect, it } from 'vitest';
import { boxCenter, boxSize } from '../../geom';
import { createCompanionClient } from '../companion';
import { createEngine, NO_LATEX_MESSAGE, offlineMessage } from '../engine';
import { renderKey } from '../key';
import { GL_H0_FALLBACK, LATEX_BACKEND_VERSION, latexScale } from '../latex';
import type { CompanionTexRequest, CompanionTexResponse, RenderRequest } from '../types';
import { fakeCompanion, HEALTH } from './fakeCompanion';
import fracSvg from './fixtures/frac.svg?raw';
import fracGlSvg from './fixtures/frac-gl.svg?raw';
import zeroGlSvg from './fixtures/zero-gl.svg?raw';

const LABELS = [
  { label: 'a', kind: 'char' as const, font: 'cmmi10', code: 97 },
  { label: '—', kind: 'rule' as const, font: null, code: null },
  { label: 'b', kind: 'char' as const, font: 'cmmi10', code: 98 },
];

function texHandler(request: CompanionTexRequest): CompanionTexResponse {
  if (request.latex === '\\text{0}' && request.target === 'gl') {
    const zero = { label: '0', kind: 'char' as const, font: 'ec', code: 48 };
    return { ok: true, svg: zeroGlSvg, glyphs: [zero], cached: false, ms: 1, warnings: [] };
  }
  if (request.latex === '\\frac{a}{b}') {
    const svg = request.target === 'gl' ? fracGlSvg : fracSvg;
    return { ok: true, svg, glyphs: LABELS, cached: false, ms: 1, warnings: [] };
  }
  if (request.latex === 'mislabelled') {
    return {
      ok: true,
      svg: fracSvg,
      glyphs: LABELS.slice(0, 2),
      cached: false,
      ms: 1,
      warnings: [],
    };
  }
  return {
    ok: false,
    error: {
      message: 'Undefined control sequence.',
      line: 1,
      log: '! Undefined control sequence.',
    },
  };
}

const request: RenderRequest = {
  kind: 'math',
  latex: '\\frac{a}{b}',
  packages: [],
  preamble: '',
  target: 'ce',
  fontSize: 48,
  prefer: 'auto',
};

function setup() {
  const fake = fakeCompanion(texHandler);
  const client = createCompanionClient({ fetch: fake.fetch, autoStart: false });
  const engine = createEngine({ companion: client });
  return { fake, client, engine };
}

const texCalls = (fake: ReturnType<typeof fakeCompanion>) =>
  fake.calls.filter((c) => c.path === '/tex');

describe('engine with the LaTeX backend', () => {
  it('renders exactly through the companion when online (auto)', async () => {
    const { engine } = setup();
    const result = await engine.render(request);
    if (!result.ok) throw new Error(result.error.message);
    const r = result.render;
    expect(r.backend).toBe('latex');
    expect(r.exact).toBe(true);
    expect(r.key).toBe(renderKey(request, 'latex', LATEX_BACKEND_VERSION));
    expect(r.glyphs.map((g) => [g.label, g.kind])).toEqual([
      ['a', 'char'],
      ['—', 'rule'],
      ['b', 'char'],
    ]);
    const [cx, cy] = boxCenter(r.bbox);
    expect(cx).toBeCloseTo(0, 12);
    expect(cy).toBeCloseTo(0, 12);
    // The fraction bar is 0.398484 SVG units tall: 0.398484 · 48 / 960 scene units.
    expect(boxSize(r.glyphs[1]!.bbox)[1]).toBeCloseTo((0.398484 * 48) / 960, 9);
  });

  it('calibrates GL sizes with h₀ measured on \\text{0}', async () => {
    const { engine, fake } = setup();
    const result = await engine.render({ ...request, target: 'gl' });
    if (!result.ok) throw new Error(result.error.message);
    const bar = boxSize(result.render.glyphs[1]!.bbox)[1];
    expect(bar).toBeCloseTo(0.398484 * latexScale('gl', 48, 6.874222), 6);
    expect(texCalls(fake).some((c) => c.body?.latex === '\\text{0}')).toBe(true);
    expect(result.render.warnings).toEqual([]);
    // Measured once per session.
    await engine.render({ ...request, target: 'gl', fontSize: 30 });
    expect(texCalls(fake).filter((c) => c.body?.latex === '\\text{0}')).toHaveLength(1);
  });

  it('shares in-flight renders and caches results by key', async () => {
    const { engine, fake } = setup();
    const [a, b] = await Promise.all([engine.render(request), engine.render(request)]);
    expect(a).toBe(b);
    await engine.render({ ...request, prefer: 'latex' });
    expect(texCalls(fake)).toHaveLength(1);
    expect(engine.cacheSize()).toBe(1);
  });

  it('returns LaTeX errors with line and log, and caches them', async () => {
    const { engine, fake } = setup();
    const result = await engine.render({ ...request, latex: '\\oops' });
    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Undefined control sequence.',
        backend: 'latex',
        line: 1,
        log: '! Undefined control sequence.',
      },
    });
    await engine.render({ ...request, latex: '\\oops' });
    expect(texCalls(fake)).toHaveLength(1);
  });

  it("does not keep failures of the companion's own setup (no TeX, timeouts)", async () => {
    const { engine, fake } = setup();
    let installed = false;
    fake.tex = (req) =>
      installed
        ? texHandler(req)
        : {
            ok: false,
            error: {
              message: 'latex was not found on PATH; install TeX Live.',
              line: null,
              log: '',
            },
          };
    const before = await engine.render(request);
    expect(!before.ok && before.error.message).toMatch(/not found on PATH/);
    installed = true; // TeX Live installed, the companion restarted
    const after = await engine.render(request);
    expect(after.ok).toBe(true);
    expect(texCalls(fake)).toHaveLength(2);
  });

  it('forgets LaTeX errors when the companion comes back (it may have new packages)', async () => {
    const { engine, fake, client } = setup();
    await client.check();
    await engine.render({ ...request, latex: '\\oops' });
    fake.online = false;
    await client.check();
    fake.online = true;
    await client.check();
    await engine.render({ ...request, latex: '\\oops' });
    expect(texCalls(fake)).toHaveLength(2);
  });

  it('marks labels unknown when the companion list does not align', async () => {
    const { engine } = setup();
    const result = await engine.render({ ...request, latex: 'mislabelled' });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.render.glyphs.map((g) => g.label)).toEqual(['?', '?', '?']);
    expect(result.render.glyphs[1]!.kind).toBe('rule');
    expect(result.render.warnings.join(' ')).toMatch(/labelled 2 glyphs but the SVG has 3/);
  });

  it('uses MathJax when offline (auto) and refuses explicit latex', async () => {
    const { engine, fake } = setup();
    fake.online = false;
    const auto = await engine.render(request);
    expect(auto.ok && auto.render.backend).toBe('mathjax');
    const latex = await engine.render({ ...request, prefer: 'latex' });
    expect(latex).toEqual({ ok: false, error: { message: offlineMessage(), backend: 'latex' } });
  });

  it('uses MathJax when the companion cannot run LaTeX (auto), and says why (LaTeX only)', async () => {
    const { engine, fake, client } = setup();
    fake.health = { ...HEALTH, capabilities: { ...HEALTH.capabilities, latex: false } };
    await client.check();
    const auto = await engine.render(request);
    expect(auto.ok && auto.render.backend).toBe('mathjax');
    expect(texCalls(fake)).toHaveLength(0);
    const latex = await engine.render({ ...request, prefer: 'latex' });
    expect(latex).toEqual({ ok: false, error: { message: NO_LATEX_MESSAGE, backend: 'latex' } });
  });

  it('falls back to MathJax when the companion vanishes mid-session', async () => {
    const { engine, fake, client } = setup();
    await client.check();
    fake.online = false;
    const result = await engine.render(request);
    expect(result.ok && result.render.backend).toBe('mathjax');
    expect(client.state().status).toBe('offline');
    // The failed LaTeX attempt was not cached.
    fake.online = true;
    await client.check();
    const again = await engine.render(request);
    expect(again.ok && again.render.backend).toBe('latex');
  });

  it('uses the GL fallback h₀ when calibration fails, without caching', async () => {
    const fake = fakeCompanion((r) =>
      r.latex === '\\text{0}'
        ? { ok: false, error: { message: 'boom', line: null, log: '' } }
        : texHandler(r),
    );
    const engine = createEngine({
      companion: createCompanionClient({ fetch: fake.fetch, autoStart: false }),
    });
    const result = await engine.render({ ...request, target: 'gl' });
    if (!result.ok) throw new Error(result.error.message);
    expect(boxSize(result.render.glyphs[1]!.bbox)[1]).toBeCloseTo(
      0.398484 * latexScale('gl', 48, GL_H0_FALLBACK),
      6,
    );
    expect(result.render.warnings.join(' ')).toMatch(/calibration/);
    expect(engine.cacheSize()).toBe(0);
  });

  it('exposes companion state and change subscriptions', async () => {
    const { engine, client } = setup();
    const seen: string[] = [];
    const off = engine.onCompanionChange((s) => seen.push(s.status));
    await client.check();
    expect(engine.companion().status).toBe('online');
    off();
    expect(seen).toEqual(['online']);
  });

  it('evicts the least recently used render', async () => {
    const fake = fakeCompanion(texHandler);
    fake.online = false;
    const engine = createEngine({
      companion: createCompanionClient({ fetch: fake.fetch, autoStart: false }),
      cacheSize: 2,
    });
    for (const latex of ['a', 'b', 'c']) await engine.render({ ...request, latex });
    expect(engine.cacheSize()).toBe(2);
  });
});
