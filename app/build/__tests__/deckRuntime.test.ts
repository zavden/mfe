// @vitest-environment node
/* The engine of an exported page as the app carries it: one classic script built from
 * `src/deck/`, with nothing in it that the page has no use for, its licences, and able to run
 * without a page (what `check.mjs` of an exported folder does). */
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { css, licenses, mfeTypes, runtime, sceneTypes } from 'virtual:mfe-deck-runtime';
import {
  ALLOWED_PACKAGES,
  buildRuntime,
  licensesText,
  runtimeComponents,
  type BuiltRuntime,
} from '../deckRuntime';
import { thirdPartyComponents } from '../thirdParty';

let built: BuiltRuntime;
beforeAll(async () => {
  built = await buildRuntime();
}, 60_000);

describe('the runtime of the exported page', () => {
  it('is one script that says what it is, under a megabyte', () => {
    expect(built.code.startsWith('/* mfe-runtime.js ')).toBe(true);
    expect(built.code).toContain('Manim Formula Editor (MIT)');
    expect(built.code.endsWith('\n')).toBe(true);
    expect(built.code).not.toMatch(/^\s*(import|export)\s/m);
    expect(built.code.length).toBeGreaterThan(50_000);
    expect(built.code.length).toBeLessThan(600_000);
  });

  it('is what the app imports as a module', () => {
    expect(runtime).toBe(built.code);
    expect(licenses).toBe(built.licenses);
    expect(css).toBe(built.css);
    expect(mfeTypes).toBe(built.mfeTypes);
    expect(sceneTypes).toBe(built.sceneTypes);
    expect(css).toContain('.mfe-deck .mfe-stage');
  });

  it('holds only the packages it is allowed, and nothing of the editor’s interface', () => {
    expect(built.packages.every((name) => name in ALLOWED_PACKAGES)).toBe(true);
    const own = built.modules.map((id) => id.replaceAll('\\', '/'));
    for (const part of ['/src/ui/', '/src/store/', '/src/media/', '/src/audio/', '/src/data/']) {
      expect(own.filter((id) => id.includes(part))).toEqual([]);
    }
    // Nothing typesets LaTeX in the page, and nothing of React is in it.
    expect(own.filter((id) => /mathjax|react/i.test(id))).toEqual([]);
    expect(built.code).not.toContain('MathJax');
    // Of the exporter, the identifiers of the Python alone (the clips' names).
    expect(
      own.filter((id) => id.includes('/src/export/')).map((id) => id.split('/src/export/')[1]),
    ).toEqual(expect.arrayContaining(['codegen/python.ts']));
    expect(own.filter((id) => id.includes('/src/export/')).length).toBeLessThanOrEqual(2);
  });

  it('carries the licence of the app and of each component inside it, in full', () => {
    expect(built.licenses).toContain('MANIM FORMULA EDITOR RUNTIME');
    expect(built.licenses).toContain('License: MIT');
    for (const name of built.packages) expect(built.licenses).toContain(name);
    const components = runtimeComponents(built.modules, new Set(built.packages));
    for (const component of components) expect(built.licenses).toContain(component.text);
    // Code of others inside the app's modules gives its notice when the runtime has the module.
    // The rate functions are ports of the two libraries' own, and the page eases with them; the
    // brace is Manim's own curve, and the page draws braces from their outlines, without it.
    const has = (file: string) =>
      built.modules.some((id) => id.replaceAll('\\', '/').endsWith(file));
    expect(has('/src/scene/easing.ts')).toBe(true);
    expect(
      components
        .filter((component) => component.within === 'Manim Formula Editor')
        .map((component) => component.name),
    ).toEqual(['Manim Community Edition', 'ManimGL']);
    const all = thirdPartyComponents();
    const noticesOf = (modules: string[]) =>
      runtimeComponents(modules, new Set(), all).map((component) => component.name);
    expect(noticesOf(['/x/src/geom/brace.ts'])).toEqual(['Manim Community Edition']);
    expect(noticesOf(['/x/src/scene/easing.ts'])).toEqual(['Manim Community Edition', 'ManimGL']);
    expect(noticesOf(['/x/src/scene/evaluator.ts'])).toEqual([]);
    expect(licensesText([], '1.2.3')).toContain('COMPONENTS\n  (none)');
    expect(() =>
      licensesText([{ ...thirdPartyComponents()[0]!, license: 'Proprietary' }], '1'),
    ).toThrow('a licence build/thirdParty.ts does not allow');
  });

  it('runs without a page: it sets MFE, registers a scene and checks it', () => {
    const context: Record<string, unknown> = { console, TextEncoder, URL, URLSearchParams };
    context.globalThis = context;
    runInNewContext(built.code, context);
    const mfe = context.MFE as {
      version: string;
      scene(name: string, project: unknown): void;
      glyphs(name: string, data: unknown): void;
      scenes: string[];
      check(name?: string): { scene: string; problems: { severity: string; message: string }[] }[];
      rates: Record<string, (t: number) => number>;
    };
    expect(mfe.version).toMatch(/^\d+\.\d+\.\d+$/);
    mfe.glyphs('broken', { version: 1, formulas: {} });
    mfe.scene('broken', { format: 'manim-formula-editor', version: 35 });
    expect(mfe.scenes).toEqual(['broken']);
    const [report] = mfe.check();
    expect(report!.scene).toBe('broken');
    expect(report!.problems.length).toBeGreaterThan(0);
    expect(report!.problems.every((problem) => problem.severity === 'error')).toBe(true);
    expect(mfe.check('missing')[0]!.problems[0]!.message).toBe(
      'No scene named "missing" was loaded.',
    );
    expect(mfe.rates.smooth!(0)).toBe(0);
    expect(mfe.rates.smooth!(1)).toBe(1);
  });
});
