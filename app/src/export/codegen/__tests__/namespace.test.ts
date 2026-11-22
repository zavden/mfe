// @vitest-environment node
import { expect, it } from 'vitest';
import {
  namespaceCases,
  namespaceSymbols as symbols,
} from '../../../../../tests/export/namespaceCases';
import { preparePaintCase } from '../../../../../tests/export/paintFixture';
import { identifier, isValidClassName, NameAllocator, sceneClassName } from '../python';
import { EMITTERS, SHAPE_CLASSES } from '../emitters';
import * as helpers from '../helpers';
import { EMITTED_SYMBOLS } from '../symbols';

/** The Python of a helper: one text, or one per library (`{ ce, gl }`: a bent line, the dashes
 * of a dashed one, a traced arrow). */
const helperTexts = (helper: unknown): string[] =>
  typeof helper === 'string'
    ? [helper]
    : helper !== null && typeof helper === 'object'
      ? Object.values(helper).filter((text): text is string => typeof text === 'string')
      : [];

it('covers the emitter registry and every generated helper declaration', () => {
  for (const emitter of Object.values(EMITTERS)) {
    for (const name of Object.values(emitter.className))
      expect(EMITTED_SYMBOLS.has(name)).toBe(true);
  }
  for (const name of Object.values(SHAPE_CLASSES)) expect(EMITTED_SYMBOLS.has(name)).toBe(true);
  // Those declared per library too (audit B4-03: they were skipped).
  const declared: string[] = [];
  for (const text of Object.values(helpers).flatMap(helperTexts)) {
    for (const match of text.matchAll(/^(?:def|class) (\w+)\(/gm)) declared.push(match[1]!);
  }
  expect(declared).toEqual(expect.arrayContaining(['_spline', '_dashed', '_TraceArrow']));
  for (const name of declared) expect(EMITTED_SYMBOLS.has(name), name).toBe(true);
});

/** The independent list (`namespaceSymbols`) and the emitter's reserved names part in neither
 * direction unseen. A name added to the emitter joins the list too, which adds its cases to the
 * native namespace probe (`generate-paint.mjs`, `paint_native.py`): that probe constructs every
 * case in real ManimCE and ManimGL, and is run before the name is committed (audit B4-03). */
it('names in its independent list every name the emitter reserves, and no other', () => {
  expect(new Set(symbols)).toEqual(new Set(EMITTED_SYMBOLS));
  expect(symbols.length).toBe(EMITTED_SYMBOLS.size);
});

it('reserves emitted names consistently for object and scene identifiers', () => {
  for (const symbol of symbols) {
    expect(isValidClassName(symbol), symbol).toBe(false);
    expect(symbols, symbol).not.toContain(identifier(symbol));
    expect(isValidClassName(sceneClassName(symbol)), symbol).toBe(true);
  }
});

it('keeps scene, object and generated temporary names in the same allocation domain', () => {
  const names = new NameAllocator(['Demo']);
  expect(names.take('Demo')).toBe('Demo_2');
  expect(names.take('shape', ['_g'])).toBe('shape');
  expect(names.take('shape_g')).toBe('shape_g_2');
  expect(names.take('shape_pivot')).toBe('shape_pivot');
  expect(names.take('shape_pivot')).toBe('shape_pivot_2');
});

for (const target of ['ce', 'gl'] as const) {
  for (const role of ['object', 'scene'] as const) {
    it(`${target}: emitted symbols used as ${role} names still construct`, () => {
      const failures: string[] = [];
      for (const { symbol, fixture } of namespaceCases(target, role)) {
        const { result } = preparePaintCase(fixture, target);
        expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
        const variable = result.code.match(/^ {8}(\w+) = Circle\(/m)![1]!;
        const sceneName = result.code.match(/^class (\w+)\(Scene\):/m)![1]!;
        if (symbols.includes(variable) || symbols.includes(sceneName)) failures.push(symbol);
      }
      expect(failures).toEqual([]);
    });
  }
}
