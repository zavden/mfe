// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createColorMatch,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createPartTransform,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  createTween,
} from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { applyPalettePlan, planApplyPalette } from '../applyPalette';
import type { PaletteColors } from '../palette';

const colors: PaletteColors = {
  background: '#102030',
  formula: '#F1F2F3',
  variable: '#AABBCC',
  constant: '#CCDDEE',
  operator: '#345678',
  result: '#56789A',
  text: '#C1C2C3',
  muted: '#919293',
  rectangle: '#123456',
  circle: '#789ABC',
  arrow: '#ABCDEF',
};

describe('planApplyPalette', () => {
  it('deduplicates shared objects, skips every use of a locked object, and allows hidden tracks', () => {
    const project = smallProject();
    const [locked, hidden] = project.tracks;
    locked!.locked = true;
    hidden!.hidden = true;
    const [a, b] = project.formulas;
    project.clips.push(createClip(a!.id, hidden!.id, 7, 9), createClip(b!.id, hidden!.id, 10, 12));
    const unused = createFormula({ name: 'unused' });
    project.formulas.push(unused);
    const before = structuredClone(project);

    const plan = planApplyPalette(project, colors);

    expect(plan.changes.map((change) => change.id)).toEqual([b!.id, unused.id]);
    expect(plan.skipped).toEqual([{ id: a!.id, name: a!.name, reasons: ['locked-track'] }]);
    expect(plan.background).toEqual({
      selected: true,
      from: '#000000',
      to: colors.background,
      changed: true,
    });
    expect(project).toEqual(before);
  });

  it('skips every kind of object with glyph colours, while retaining brace and individual cross-line colours', () => {
    const project = createEmptyProject();
    const math = createFormula({ name: 'math', glyphColors: { 0: '#112233' } });
    const tex = createTexFormula({ name: 'text', glyphColors: { 0: '#445566' } });
    // A Pango text colours its glyphs like a formula does, and is protected like one.
    const pango = createTextFormula({ name: 'pango', glyphColors: { 2: '#DDEEFF' } });
    const plainPango = createTextFormula({ name: 'plain' });
    const brace = createBraceFormula({ name: 'brace', glyphColors: { 0: '#778899' } });
    const cross = createShapeFormula({
      name: 'cross',
      shape: 'cross',
      glyphColors: { 1: '#AABBCC' },
    });
    project.formulas.push(math, tex, pango, plainPango, brace, cross);

    const plan = planApplyPalette(project, colors);
    applyPalettePlan(project, plan);

    expect(plan.skipped).toEqual(
      [math, tex, pango].map(({ id, name }) => ({ id, name, reasons: ['glyph-colors'] })),
    );
    expect(project.formulas.map((formula) => formula.color)).toEqual([
      '#FFFFFF',
      '#FFFFFF',
      '#FFFFFF',
      colors.text,
      colors.muted,
      colors.arrow,
    ]);
    expect(project.formulas.map((formula) => formula.glyphColors)).toEqual([
      { 0: '#112233' },
      { 0: '#445566' },
      { 2: '#DDEEFF' },
      {},
      { 0: '#778899' },
      { 1: '#AABBCC' },
    ]);
  });

  it('maps each object kind and changes only base colours and the selected background', () => {
    const project = smallProject();
    const tex = createTexFormula({
      name: 'text',
      layout: { width: 2, align: 'left', lineSpacing: 1.4 },
    });
    const brace = createBraceFormula({ name: 'brace', width: 2, sharpness: 3 });
    const box = createShapeFormula({
      name: 'box',
      shape: 'box',
      width: 2,
      height: 3,
      cornerRadius: 0.2,
    });
    const highlight = createShapeFormula({
      name: 'highlight',
      shape: 'box',
      style: { fillOpacity: 0.4, strokeWidth: 0, strokeOpacity: 0.7 },
    });
    const circle = createShapeFormula({ name: 'circle', shape: 'circle' });
    const underline = createShapeFormula({ name: 'underline', shape: 'underline' });
    const cross = createShapeFormula({
      name: 'cross',
      shape: 'cross',
      glyphColors: { 1: '#C0FFEE' },
    });
    project.formulas.push(tex, brace, box, highlight, circle, underline, cross);
    const clip = project.clips[0]!;
    clip.initial = {
      ...clip.initial,
      color: clip.initial.color ?? '#FFFFFF',
      glyphColors: { 1: '#FEDCBA' },
      opacity: 0.6,
    };
    clip.actions = [
      createTween(1, 0.5, { color: '#FFFFFF', glyphColors: { 0: '#FF0000' } }),
      createTween(2, 0.5, { position: [2, 3] }),
      createPartTransform(3, [1], { color: '#AAFFAA' }),
      createEmphasis(4, 'indicate', [2]),
    ];
    project.clips[1]!.attach = {
      rule: 'next_to',
      clipId: clip.id,
      glyphs: [0],
      side: 'up',
      buff: 0.3,
    };
    project.colorMatches.push(createColorMatch('keep', [{ pattern: 'x', color: '#FFFFFF' }]));
    const expected = structuredClone(project);
    const expectedColors = [
      colors.formula,
      colors.formula,
      colors.text,
      colors.muted,
      colors.rectangle,
      colors.rectangle,
      colors.circle,
      colors.rectangle,
      colors.arrow,
    ];
    expected.formulas.forEach((formula, index) => {
      formula.color = expectedColors[index]!;
    });
    expected.meta.background = colors.background;

    const plan = planApplyPalette(project, colors);
    applyPalettePlan(project, plan);

    expect(plan.changes).toHaveLength(expectedColors.length);
    expect(project).toEqual(expected);
    expect(project.clips[1]!.initial.color).toBeNull();
    expect(project.clips[0]!.actions[1]).not.toHaveProperty('to.color');
  });

  it('compares hex canonically and can leave the global background unchanged', () => {
    const project = createEmptyProject();
    project.meta.background = colors.background.toLowerCase();
    project.formulas.push(createFormula({ color: colors.formula.toLowerCase() }));
    const before = structuredClone(project);
    const plan = planApplyPalette(project, colors);
    expect(plan.hasChanges).toBe(false);
    expect(plan.unchanged).toBe(1);
    applyPalettePlan(project, plan);
    expect(project).toEqual(before);

    project.meta.background = '#000000';
    const withoutBackground = planApplyPalette(project, colors, { includeBackground: false });
    expect(withoutBackground.background).toMatchObject({ selected: false, changed: false });
    expect(withoutBackground.hasChanges).toBe(false);
    applyPalettePlan(project, withoutBackground);
    expect(project.meta.background).toBe('#000000');
  });
});
