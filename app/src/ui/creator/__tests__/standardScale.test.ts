// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createFormula,
  createLineFormula,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  type Formula,
} from '../../../model';
import {
  applyScaleBlocker,
  applyScaleQuestion,
  countOfKind,
  DEFAULT_STANDARD_SCALE,
  fontSizeOfScale,
  formatStandardScale,
  hasOwnScale,
  isStandardScale,
  newFontSize,
  parseStandardScale,
  planStandardScale,
  scaleChanges,
  scaleFieldError,
  scaleKindOf,
  scaleOfFontSize,
  sharedScale,
  unscaledNote,
} from '../standardScale';

describe('the standard scale of new objects', () => {
  it('reads a number or a fraction between 0.1 and 10, and refuses the rest', () => {
    expect(parseStandardScale('1')).toBe(1);
    expect(parseStandardScale('1.5')).toBe(1.5);
    expect(parseStandardScale(' 3/2 ')).toBe(1.5);
    expect(parseStandardScale('0,5')).toBe(0.5);
    expect(parseStandardScale('0.05')).toBeNull();
    expect(parseStandardScale('11')).toBeNull();
    expect(parseStandardScale('big')).toBeNull();
    expect(parseStandardScale('')).toBeNull();
    expect(isStandardScale(DEFAULT_STANDARD_SCALE)).toBe(true);
    expect(isStandardScale({ math: '2', tex: '1/2' })).toBe(true);
    expect(isStandardScale({ math: '2' })).toBe(false);
    expect(isStandardScale({ math: '2', tex: 'x' })).toBe(false);
    expect(isStandardScale('2')).toBe(false);
  });

  it('gives a new formula or text 48 × the scale of its kind; a brace or a shape 48', () => {
    const scale = { math: '1.5', tex: '1/2' };
    expect(scaleKindOf('math')).toBe('math');
    expect(scaleKindOf('tex')).toBe('tex');
    expect(scaleKindOf('brace')).toBeNull();
    expect(scaleKindOf('shape')).toBeNull();
    expect(newFontSize('math', scale)).toBe(72);
    expect(newFontSize('tex', scale)).toBe(24);
    expect(newFontSize('brace', scale)).toBe(48);
    expect(newFontSize('shape', scale)).toBe(48);
    expect(newFontSize('math', DEFAULT_STANDARD_SCALE)).toBe(48);
  });

  it('converts between a font size and the scale it means, to four decimals', () => {
    expect(scaleOfFontSize(48)).toBe(1);
    expect(scaleOfFontSize(72)).toBe(1.5);
    expect(scaleOfFontSize(16)).toBe(0.3333);
    expect(fontSizeOfScale(2)).toBe(96);
    expect(fontSizeOfScale(1 / 3)).toBe(16);
  });

  it('shows a scale as typed, restating a fraction or a comma decimal', () => {
    expect(formatStandardScale('1.5')).toBe('1.5');
    expect(formatStandardScale('3/2')).toBe('3/2 = 1.5');
    expect(formatStandardScale('0,5')).toBe('0,5 = 0.5');
    expect(formatStandardScale('x')).toBe('x');
  });
});

describe('«Apply to all»: a scale for every object of a kind', () => {
  /** Formulas at scales 1, 2 and 1.5, a LaTeX text at 1, a font text and a shape. */
  const formulas: Formula[] = [
    { ...createFormula({ name: 'f1', fontSize: 48 }), id: 'a' },
    { ...createTexFormula({ name: 't1', fontSize: 48 }), id: 'b' },
    { ...createFormula({ name: 'f2', fontSize: 96 }), id: 'c' },
    { ...createTextFormula({ name: 'p1', fontSize: 48 }), id: 'd' },
    { ...createShapeFormula({ name: 's1' }), id: 'e' },
    { ...createFormula({ name: 'f3', fontSize: 72 }), id: 'f' },
  ];

  it('gives every object of the kind the font size a new one has at that scale, whatever its own', () => {
    const plan = planStandardScale(formulas, 'math', 1.5);
    expect(plan).toMatchObject({ kind: 'math', scale: 1.5, fontSize: 72, total: 3 });
    // f3 has it already: the others change, in the project's order.
    expect(plan.changes).toEqual([
      { id: 'a', name: 'f1', from: 48, to: 72 },
      { id: 'c', name: 'f2', from: 96, to: 72 },
    ]);
    // The texts are their own kind; a font text and a shape have no standard scale.
    const texts = planStandardScale(formulas, 'tex', 0.5);
    expect(texts).toMatchObject({ fontSize: 24, total: 1 });
    expect(texts.changes).toEqual([{ id: 'b', name: 't1', from: 48, to: 24 }]);
    // A scale is a font size to four decimals, as a new object's is.
    expect(planStandardScale(formulas, 'math', 1 / 3).fontSize).toBe(16);
    expect(planStandardScale(formulas, 'tex', 2 / 3).changes[0]!.to).toBe(32);
  });

  it('says why it cannot act: no scale typed, none of the kind, or all have it already', () => {
    expect(applyScaleBlocker('math', null)).toMatch(/^Type a scale first/);
    expect(applyScaleBlocker('math', planStandardScale([], 'math', 2))).toBe(
      'The project has no formulas.',
    );
    expect(applyScaleBlocker('tex', planStandardScale(formulas.slice(2), 'tex', 1))).toBe(
      'The project has no LaTeX texts.',
    );
    expect(applyScaleBlocker('tex', planStandardScale(formulas, 'tex', 1))).toBe(
      "The project's one LaTeX text has scale 1 already.",
    );
    const same = formulas.map((f) => ({ ...f, fontSize: 72 }));
    expect(applyScaleBlocker('math', planStandardScale(same, 'math', 1.5))).toBe(
      'Every formula of the project has scale 1.5 already.',
    );
    expect(applyScaleBlocker('math', planStandardScale(formulas, 'math', 1.5))).toBeNull();
  });

  it('asks first, saying how many change, to what, and each one from what', () => {
    expect(applyScaleQuestion(planStandardScale(formulas, 'math', 1.5))).toEqual({
      title: 'Apply scale 1.5 to every formula?',
      message:
        '2 formulas change to scale 1.5 (font_size 72), the size a new one is born with; 1 has it ' +
        'already. Their clips keep their own scale and their animations. One undo step takes it back.',
      details: ['f1: 1 → 1.5', 'f2: 2 → 1.5'],
      confirmLabel: 'Apply to 2 formulas',
    });
    const one = applyScaleQuestion(planStandardScale(formulas, 'tex', 1 / 3));
    expect(one.title).toBe('Apply scale 0.3333 to every LaTeX text?');
    expect(one.message).toMatch(/^1 LaTeX text changes to scale 0\.3333 \(font_size 16\), /);
    expect(one.message).not.toMatch(/already/);
    expect(one.message).toMatch(/\. Its clips keep their own scale and their animations\. /);
    expect(one.confirmLabel).toBe('Apply to 1 LaTeX text');
    expect(countOfKind('math', 1)).toBe('1 formula');
    expect(countOfKind('tex', 3)).toBe('3 LaTeX texts');
  });
});

describe('the Scale of «Edit together»: one value for all', () => {
  const at = (fontSize: number, id: string) => ({ ...createFormula({ fontSize, name: id }), id });
  const brace = { ...createBraceFormula({ name: 'b1' }), id: 'b' };
  const line = { ...createLineFormula({ name: 'l1' }), id: 'l' };

  it('is what the formula editor has a Size for: formulas and texts, no brace, shape or line', () => {
    expect(hasOwnScale(createFormula())).toBe(true);
    expect(hasOwnScale(createTexFormula())).toBe(true);
    expect(hasOwnScale(createTextFormula())).toBe(true);
    expect(hasOwnScale(brace)).toBe(false);
    expect(hasOwnScale(createShapeFormula())).toBe(false);
    expect(hasOwnScale(line)).toBe(false);
  });

  it('shows the scale they share, or nothing ("mixed") while they differ', () => {
    const tex = { ...createTexFormula({ fontSize: 72 }), id: 't' };
    expect(sharedScale([at(72, 'a'), tex])).toEqual({ text: '1.5', scaled: 2, unscaled: 0 });
    expect(sharedScale([at(48, 'a'), tex])).toEqual({ text: '', scaled: 2, unscaled: 0 });
    // Font sizes that differ under the four decimals of the scale still differ.
    expect(sharedScale([at(48, 'a'), at(48.00001, 'b')]).text).toBe('');
    // The objects without a scale do not count.
    expect(sharedScale([at(24, 'a'), brace, line])).toEqual({
      text: '0.5',
      scaled: 1,
      unscaled: 2,
    });
    expect(sharedScale([brace, line])).toEqual({ text: '', scaled: 0, unscaled: 2 });
  });

  it('says how many objects it leaves out, and why', () => {
    expect(unscaledNote({ text: '1', scaled: 2, unscaled: 0 })).toBeNull();
    expect(unscaledNote({ text: '1', scaled: 2, unscaled: 1 })).toBe(
      'Not for 1 of them: braces, shapes and lines take the size of what they mark.',
    );
    expect(unscaledNote({ text: '', scaled: 0, unscaled: 3 })).toBe(
      'None of them has a scale: braces, shapes and lines take the size of what they mark.',
    );
  });

  it('lists what giving a scale changes, as «Apply to all» does', () => {
    expect(scaleChanges([at(48, 'a'), at(72, 'b'), at(96, 'c')], 1.5)).toEqual([
      { id: 'a', name: 'a', from: 48, to: 72 },
      { id: 'c', name: 'c', from: 96, to: 72 },
    ]);
  });

  it('refuses in its field what the formula editor refuses', () => {
    expect(scaleFieldError('1.5')).toBeNull();
    expect(scaleFieldError('3/2')).toBeNull();
    expect(scaleFieldError('20')).toBe('A number or a fraction from 0.1 to 10.');
    expect(scaleFieldError('mixed')).toBe('A number or a fraction from 0.1 to 10.');
  });
});
