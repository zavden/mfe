// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createFormula,
  createFormulaOfKind,
  createShapeFormula,
  createTexFormula,
  diagonalOf,
  glyphMembers,
  INTRO_KINDS,
  isBlank,
  isFittedRule,
  KINDS,
  kindOf,
  nextFormulaName,
  OUTRO_KINDS,
  overCorners,
  packagesOf,
  SHAPE_COLORS,
  SHAPE_STYLES,
  type FormulaKind,
} from '../index';

describe('object kinds', () => {
  it('has a row per kind, each with a lower-case letter of its own as name prefix', () => {
    const kinds = Object.keys(KINDS) as FormulaKind[];
    expect(kinds).toEqual(['math', 'tex', 'text', 'brace', 'shape', 'line']);
    const prefixes = kinds.map((kind) => KINDS[kind].namePrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) expect(prefix).toMatch(/^[a-z]$/);
    expect(kindOf(createFormula())).toBe(KINDS.math);
    expect(KINDS.math.label).toBe('Formula');
    expect(KINDS.tex).toMatchObject({ label: 'Text (LaTeX)', namePrefix: 't', mark: 'T' });
    for (const kind of kinds) expect([...KINDS[kind].mark]).toHaveLength(1);
    expect(kindOf(createTexFormula())).toBe(KINDS.tex);
    // A brace: no source, no glyph colours, no transfers, reached from its clip, not the list.
    expect(KINDS.brace).toMatchObject({
      label: 'Brace',
      namePrefix: 'b',
      mark: '⏟',
      source: false,
      glyphColors: false,
      latex: false,
      transfers: false,
      listed: false,
    });
    expect(kindOf(createBraceFormula())).toBe(KINDS.brace);
    // A shape: the same, named `s1`, `s2`…
    expect(KINDS.shape).toMatchObject({
      label: 'Shape',
      namePrefix: 's',
      mark: '▢',
      source: false,
      glyphColors: false,
      latex: false,
      transfers: false,
      listed: false,
    });
    expect(kindOf(createShapeFormula())).toBe(KINDS.shape);
  });

  it('knows the rule that fits an object to its target: a brace, a shape; nothing else', () => {
    expect(KINDS.math.fitted).toBeNull();
    expect(KINDS.tex.fitted).toBeNull();
    expect(KINDS.brace.fitted).toBe('brace');
    expect(KINDS.shape.fitted).toBe('shape');
    expect(isFittedRule('brace')).toBe(true);
    expect(isFittedRule('shape')).toBe(true);
    expect(isFittedRule('next_to')).toBe(false);
    expect(isFittedRule('tip')).toBe(false);
  });

  it('makes a shape in the colour and style Manim gives it, a box unless told otherwise', () => {
    const box = createShapeFormula();
    expect(box).toMatchObject({
      kind: 'shape',
      shape: 'box',
      color: '#FFFF00',
      style: { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 },
      cornerRadius: 0,
      width: 0,
      height: 0,
    });
    expect(box.intro?.kind).toBe('create');
    const cross = createShapeFormula({ shape: 'cross', cornerRadius: 0.2 });
    expect(cross).toMatchObject({ shape: 'cross', color: SHAPE_COLORS.cross, cornerRadius: 0.2 });
    expect(cross.style).toEqual(SHAPE_STYLES.cross);
    expect(cross.style).not.toBe(SHAPE_STYLES.cross); // a copy: editing it leaves the table alone
    // A cross line is one line of a cross: its colour and its stroke, over the rising diagonal
    // unless it names the other; like a cross it lies over the corners of its target, gap or not.
    const line = createShapeFormula({ shape: 'cross_line' });
    expect(line).toMatchObject({ shape: 'cross_line', color: SHAPE_COLORS.cross });
    expect(line.style).toEqual(SHAPE_STYLES.cross);
    expect('diagonal' in line).toBe(false);
    expect(diagonalOf(line)).toBe('dl_ur');
    expect(diagonalOf({ diagonal: 'ul_dr' })).toBe('ul_dr');
    expect(
      (['box', 'circle', 'underline', 'cross', 'cross_line'] as const).map(overCorners),
    ).toEqual([false, false, false, true, true]);
    // One mobject that is its glyph, where a cross is a group of two.
    expect(glyphMembers(line, 'ce')).toBe('self');
    expect(glyphMembers(line, 'gl')).toBe('self');
    expect(glyphMembers(cross, 'gl')).toBe('submobjects');
    expect(createShapeFormula({ shape: 'underline', color: '#123456' }).color).toBe('#123456');
    expect(createFormulaOfKind('shape', { name: 's9' })).toMatchObject({
      kind: 'shape',
      name: 's9',
    });
  });

  it('knows an empty object: one with a source and none written; a brace or a shape never is', () => {
    expect(isBlank(createFormula())).toBe(true);
    expect(isBlank(createFormula({ source: ' \n' }))).toBe(true);
    expect(isBlank(createFormula({ source: 'x' }))).toBe(false);
    expect(isBlank(createTexFormula({ source: 'Hi' }))).toBe(false);
    expect(isBlank(createBraceFormula())).toBe(false);
    expect(isBlank(createShapeFormula())).toBe(false);
  });

  it('knows the packages of an object: a formula has them, a text has none of its own', () => {
    expect(packagesOf(createFormula({ packages: ['physics'] }))).toEqual(['physics']);
    expect(packagesOf(createTexFormula())).toEqual([]);
  });

  it('lets a formula use every intro and outro, "none" first', () => {
    expect(INTRO_KINDS[0]).toBe('none');
    expect(OUTRO_KINDS[0]).toBe('none');
    expect(INTRO_KINDS).toContain('write');
    expect(OUTRO_KINDS).toContain('unwrite');
    expect(KINDS.math.intros).toEqual(INTRO_KINDS);
    expect(KINDS.math.outros).toEqual(OUTRO_KINDS);
  });

  it('names a new object after its kind, counting the objects of that kind', () => {
    const f = (name: string) => createFormula({ name });
    expect(nextFormulaName('math', [])).toBe('f1');
    expect(nextFormulaName('math', [f('f1'), f('f2')])).toBe('f3');
    expect(nextFormulaName('math', [f('f2')])).toBe('f3'); // f1 is free, but the count is 1
    expect(nextFormulaName('math', [f('energy')])).toBe('f2');
    expect(nextFormulaName('tex', [f('f1'), createTexFormula({ name: 't1' })])).toBe('t2');
    expect(createFormulaOfKind('tex', { name: 'title' })).toMatchObject({
      kind: 'tex',
      name: 'title',
      layout: { width: null, align: 'center', lineSpacing: 1 },
    });
    expect(createFormulaOfKind('math', { name: 'a' })).toMatchObject({
      kind: 'math',
      packages: [],
    });
    expect(nextFormulaName('brace', [createBraceFormula({ name: 'b1' })])).toBe('b2');
    // A brace grows from the centre by default, as Manim's BraceLabel makes one.
    expect(createFormulaOfKind('brace', { name: 'b1' })).toMatchObject({
      kind: 'brace',
      source: '',
      sharpness: 2,
      width: 0,
      intro: { kind: 'grow_from_center', duration: 1 },
    });
  });
});
