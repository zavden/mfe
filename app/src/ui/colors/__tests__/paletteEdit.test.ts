// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFormulaOfKind,
  createShapeFormula,
  type ShapeKind,
} from '../../../model';
import { createEditorFormula } from '../../creator/newFormula';
import { DEFAULT_STANDARD_SCALE } from '../../creator/standardScale';
import { PALETTE_ROLES, normalizePalette, parsePalette } from '../palette';
import {
  changeCustomRoles,
  DEFAULT_PALETTE_COLORS,
  namedSource,
  newPaletteSource,
  recolorSource,
} from '../paletteEdit';

// A verbatim Chroma Lab export: seeded, with its recipe and no linked roles.
const chroma = () =>
  parsePalette(readFileSync(new URL('./fixtures/chromalab-dark.json', import.meta.url), 'utf8'))
    .palette;

/** The same theme with Text, Secondary text and Operators sharing one color, locked. */
const linked = () => {
  const source = chroma();
  return normalizePalette({
    ...source,
    colors: { ...source.colors, muted: source.colors.text, operator: source.colors.text },
    groups: [
      ['formula'],
      ['variable'],
      ['constant'],
      ['result'],
      ['text', 'muted', 'operator'],
      ['rectangle'],
      ['circle'],
      ['arrow'],
    ],
    locks: { ...source.locks, text: true, muted: true, operator: true },
  }).palette;
};

describe('a palette made in the editor', () => {
  it('starts from the colors the editor uses without a palette', () => {
    const source = newPaletteSource('New palette');
    expect(source.name).toBe('New palette');
    expect(source.colors).toEqual(DEFAULT_PALETTE_COLORS);
    expect(source.colors.background).toBe(createEmptyProject().meta.background);
    // Activating it leaves each kind born in the color it has without a palette (but the
    // underline, below).
    for (const kind of ['math', 'tex', 'text', 'brace'] as const) {
      const born = createEditorFormula(kind, [], DEFAULT_STANDARD_SCALE, {}, source.colors);
      expect(born.color).toBe(createFormulaOfKind(kind).color);
    }
    for (const shape of ['box', 'underline', 'circle', 'cross'] as ShapeKind[]) {
      const born = createEditorFormula(
        'shape',
        [],
        DEFAULT_STANDARD_SCALE,
        { shape },
        source.colors,
      );
      const plain = createShapeFormula({ shape }).color;
      // An underline is Manim's white; the palette gives it the rectangle role, like a box.
      expect(born.color).toBe(shape === 'underline' ? source.colors.rectangle : plain);
    }
  });

  it('is a complete portable theme: every role on its own, nothing locked, no recipe', () => {
    const source = newPaletteSource('Mine');
    expect(source.groups.map((group) => group.length)).toEqual(Array(10).fill(1));
    expect(Object.values(source.locks)).toEqual(Array(11).fill(false));
    expect(source.generation).toBeUndefined();
    expect(source.backgroundMode).toBe('manual');
    const again = parsePalette(JSON.stringify(source));
    expect(again.palette).toEqual(source);
    expect(again.warnings).toEqual([]);
  });
});

describe('one role in another color', () => {
  it('changes that role alone, as upper-case hex, and stays a valid theme', () => {
    const source = chroma();
    const next = recolorSource(source, 'variable', '#12abef');
    expect(next.colors).toEqual({ ...source.colors, variable: '#12ABEF' });
    expect(recolorSource(source, 'variable', '1af').colors.variable).toBe('#11AAFF');
    expect(parsePalette(JSON.stringify(next))).toEqual({ palette: next, warnings: [] });
    expect(Object.isFrozen(next) && Object.isFrozen(next.colors)).toBe(true);
    // The source it came from is untouched.
    expect(source).toEqual(chroma());
  });

  it('drops the recipe and keeps name, seeds, style, mode and locks', () => {
    const source = chroma();
    expect(source.generation).toBeDefined();
    const next = recolorSource(source, 'result', '#00FF00');
    expect(next.generation).toBeUndefined();
    const expected: Record<string, unknown> = { ...source, colors: next.colors };
    delete expected.generation;
    expect(next).toEqual(expected);
  });

  it('leaves a manual background: a calculated one would no longer match the colors', () => {
    // In Chroma Lab an automatic background is recalculated from the foreground colors on every
    // edit. The editor has no such calculation, so a theme it changed cannot go on saying "auto".
    const source = normalizePalette({ ...chroma(), backgroundMode: 'auto' }).palette;
    const foreground = recolorSource(source, 'formula', '#FFFFFE');
    expect(foreground.backgroundMode).toBe('manual');
    expect(foreground.colors.background).toBe(source.colors.background);
    const background = recolorSource(source, 'background', '#102030');
    expect(background.backgroundMode).toBe('manual');
    expect(background.groups).toEqual(source.groups);
    // The color it already has changes nothing, the mode included.
    expect(recolorSource(source, 'formula', source.colors.formula)).toBe(source);
  });

  it('takes the role out of a linked group; the others keep their color and their lock', () => {
    const source = linked();
    const next = recolorSource(source, 'muted', '#808080');
    expect(next.colors.muted).toBe('#808080');
    expect(next.colors.text).toBe(source.colors.text);
    expect(next.colors.operator).toBe(source.colors.text);
    expect(next.groups).toContainEqual(['operator', 'text']);
    expect(next.groups).toContainEqual(['muted']);
    expect(next.groups.flat().sort()).toEqual(
      PALETTE_ROLES.filter((r) => r !== 'background').sort(),
    );
    expect(next.locks).toEqual(source.locks);
    expect(parsePalette(JSON.stringify(next)).palette).toEqual(next);
  });

  it('returns the source itself for the color it has, and refuses what is not a color', () => {
    const source = chroma();
    expect(recolorSource(source, 'text', source.colors.text.toLowerCase())).toBe(source);
    expect(() => recolorSource(source, 'text', 'blue')).toThrow(/HEX/);
    expect(() => recolorSource(source, 'text', '#12345678')).toThrow(/HEX/);
  });
});

describe('the name a palette is exported under', () => {
  it('replaces the name of the source and nothing else', () => {
    const source = chroma();
    const named = namedSource(source, 'Lesson 3');
    expect(named).toEqual({ ...source, name: 'Lesson 3' });
    expect(Object.keys(named)).toEqual(Object.keys(source));
  });
});

describe('the roles the user adds to a palette', () => {
  const two = () =>
    changeCustomRoles(
      changeCustomRoles(chroma(), { do: 'add', name: 'highlight', color: '#ffd400' }),
      { do: 'add', name: 'Accent 2', color: '#00bbff' },
    );

  it('adds a role after the others, and leaves the eleven and their recipe as they were', () => {
    const source = chroma();
    const next = two();
    expect(next.customRoles).toEqual([
      { name: 'highlight', color: '#FFD400' },
      { name: 'Accent 2', color: '#00BBFF' },
    ]);
    const rest: Record<string, unknown> = { ...next };
    delete rest.customRoles;
    expect(rest).toEqual(source);
    expect(next.generation).toEqual(source.generation);
    expect(parsePalette(JSON.stringify(next)).palette).toEqual(next);
  });

  it('gives a role another name or another color, in its place', () => {
    const renamed = changeCustomRoles(two(), { do: 'rename', role: 'highlight', name: ' Glow ' });
    expect(renamed.customRoles).toEqual([
      { name: 'Glow', color: '#FFD400' },
      { name: 'Accent 2', color: '#00BBFF' },
    ]);
    const recolored = changeCustomRoles(renamed, { do: 'recolor', role: 'Glow', color: '#123' });
    expect(recolored.customRoles![0]).toEqual({ name: 'Glow', color: '#112233' });
    // Its own name in another case is a rename, not a clash with itself.
    expect(
      changeCustomRoles(recolored, { do: 'rename', role: 'Glow', name: 'GLOW' }).customRoles![0],
    ).toEqual({ name: 'GLOW', color: '#112233' });
  });

  it('deletes a role; the last one takes the field with it', () => {
    const one = changeCustomRoles(two(), { do: 'delete', role: 'highlight' });
    expect(one.customRoles).toEqual([{ name: 'Accent 2', color: '#00BBFF' }]);
    const none = changeCustomRoles(one, { do: 'delete', role: 'Accent 2' });
    expect(none).toEqual(chroma());
    expect(none).not.toHaveProperty('customRoles');
  });

  it('returns the source itself when nothing changes', () => {
    const source = two();
    expect(changeCustomRoles(source, { do: 'delete', role: 'gone' })).toBe(source);
    expect(changeCustomRoles(source, { do: 'rename', role: 'highlight', name: 'highlight' })).toBe(
      source,
    );
    expect(changeCustomRoles(source, { do: 'recolor', role: 'highlight', color: '#FFD400' })).toBe(
      source,
    );
  });

  it('refuses a name the palette cannot have, what is not a color and a role that is gone', () => {
    const source = two();
    expect(() =>
      changeCustomRoles(source, { do: 'add', name: 'Highlight', color: '#000' }),
    ).toThrow('already has a role named');
    expect(() => changeCustomRoles(source, { do: 'add', name: 'text', color: '#000' })).toThrow(
      'one of the roles every palette has',
    );
    expect(() => changeCustomRoles(source, { do: 'add', name: '', color: '#000' })).toThrow(
      '1 to 32 characters',
    );
    expect(() => changeCustomRoles(source, { do: 'add', name: 'new', color: 'red' })).toThrow(
      /HEX/,
    );
    expect(() =>
      changeCustomRoles(source, { do: 'rename', role: 'highlight', name: 'accent 2' }),
    ).toThrow('already has a role named');
    expect(() => changeCustomRoles(source, { do: 'rename', role: 'gone', name: 'x' })).toThrow(
      'no longer in this palette',
    );
    expect(() => changeCustomRoles(source, { do: 'recolor', role: 'gone', color: '#000' })).toThrow(
      'no longer in this palette',
    );
  });

  it('keeps them through a recolor of one of the eleven and through a rename of the palette', () => {
    const source = two();
    expect(recolorSource(source, 'text', '#000000').customRoles).toEqual(source.customRoles);
    expect(namedSource(source, 'Lesson 3').customRoles).toEqual(source.customRoles);
  });
});
