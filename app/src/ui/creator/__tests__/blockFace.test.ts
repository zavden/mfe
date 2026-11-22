// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFormula, TAG_COLORS } from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { COMPACT_BLOCK_WIDTH, statusMark } from '../blockFace';
import { formulaStatus } from '../formulaStatus';

const creatorCss = readFileSync(new URL('../creator.css', import.meta.url), 'utf8');
const stylesCss = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

/** The text between the braces of the first block that `head` opens in `css`. */
function blockOf(css: string, head: string): string {
  const at = css.indexOf(`${head} {`);
  if (at < 0) throw new Error(`no "${head} {"`);
  const open = at + head.length + 1;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`"${head}" is not closed`);
}

/** One declaration of a block, its whitespace made single spaces. */
function declaration(block: string, property: string): string {
  const found = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`).exec(block);
  if (!found) throw new Error(`no ${property}`);
  return found[1]!.replace(/\s+/g, ' ').trim();
}

type Rgb = [number, number, number];

const hex = (color: string): Rgb => {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
};

/** `color-mix(in srgb, a p, b)`, and a colour of opacity `alpha` laid over another. */
const mix = (a: Rgb, b: Rgb, p: number): Rgb => a.map((v, i) => v * p + b[i]! * (1 - p)) as Rgb;

function luminance(color: Rgb): number {
  const [r, g, b] = color.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** A theme's colours (styles.css): its hex tokens, and its sheen at its strongest (the top). */
function theme(name: 'dark' | 'light') {
  const body = blockOf(
    stylesCss,
    name === 'dark' ? ":root,\n:root[data-theme='dark']" : ":root[data-theme='light']",
  );
  const token = (property: string) => hex(declaration(body, property));
  const sheen = /^linear-gradient\(180deg, rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(
    declaration(body, '--sheen'),
  );
  if (!sheen) throw new Error('the sheen is not the gradient this test reads');
  const [r, g, b, alpha] = sheen.slice(1).map(Number) as [number, number, number, number];
  return { token, sheen: { color: [r / 255, g / 255, b / 255] as Rgb, alpha } };
}

/** The compact face's rules: the container query on a block's own width. */
const compact = blockOf(
  creatorCss,
  `@container formula-block (max-width: ${COMPACT_BLOCK_WIDTH - 2}px)`,
);
const face = blockOf(compact, '  .formula-block-face');
const lightFace = blockOf(compact, "  :root[data-theme='light'] .formula-block-face");

describe('the glass of a compact block', () => {
  it('is a tint of the tag over the panel, under the sheen, with the name in the text’s colour', () => {
    expect(declaration(face, 'background')).toBe(
      'var(--sheen), linear-gradient( 180deg, ' +
        'color-mix(in srgb, var(--tag) var(--glass-top), var(--panel)), ' +
        'color-mix(in srgb, var(--tag) var(--glass-foot), var(--panel)) )',
    );
    expect(declaration(face, 'color')).toBe('var(--text)');
    // Glass, not the tag's colour: at most half of it, more at the top than at the foot.
    for (const rule of [face, lightFace]) {
      const [top, foot] = ['--glass-top', '--glass-foot'].map((p) =>
        parseFloat(declaration(rule, p)),
      );
      expect(top).toBeGreaterThan(foot!);
      expect(top).toBeLessThanOrEqual(50);
    }
    // Only these two rules say how much: the pointer and the selection change the edges alone.
    expect(compact.match(/--glass-top:/g)).toHaveLength(2);
    expect(compact.match(/--glass-foot:/g)).toHaveLength(2);
  });

  /* The name may lie on any part of the pane: both ends of its gradient are checked against the
   * text's colour, bare and under the sheen at its strongest. Between them the pane is a mix of
   * the two, never lighter than the lighter end, nor darker than the darker one where the panel
   * is white (the light theme, the one whose dark text minds a dark pane). A mix in sRGB grows with
   * each channel of the tag, so white makes the lightest pane any tag can make and black the
   * darkest: the two stand for every custom colour a tag can be given. */
  const extremes = ['#FFFFFF', '#000000'];
  const worst = (name: 'dark' | 'light', colors: readonly string[]) => {
    const { token, sheen } = theme(name);
    const rule = name === 'dark' ? face : lightFace;
    const [top, foot] = ['--glass-top', '--glass-foot'].map(
      (p) => parseFloat(declaration(rule, p)) / 100,
    );
    const ink = token('--text');
    let found = { ratio: Infinity, color: '' };
    for (const color of colors) {
      for (const share of [top!, foot!]) {
        const pane = mix(hex(color), token('--panel'), share);
        for (const surface of [pane, mix(sheen.color, pane, sheen.alpha)]) {
          const ratio = contrast(ink, surface);
          if (ratio < found.ratio) found = { ratio, color };
        }
      }
    }
    return found;
  };

  it('keeps the name at 4.5 to 1 over every tag colour, in the dark theme', () => {
    // The lightest tags are the hard ones under light text: yellow of the palette, white of all.
    const palette = worst('dark', TAG_COLORS);
    const any = worst('dark', extremes);
    expect(Math.min(palette.ratio, any.ratio)).toBeGreaterThanOrEqual(4.5);
    expect(palette).toEqual({ ratio: expect.closeTo(4.97, 2), color: '#FFFF00' });
    expect(any).toEqual({ ratio: expect.closeTo(4.7, 2), color: '#FFFFFF' });
  });

  it('keeps the name at 4.5 to 1 over every tag colour, in the light theme', () => {
    // The darkest tags are the hard ones under dark text: pink of the palette, black of all.
    const palette = worst('light', TAG_COLORS);
    const any = worst('light', extremes);
    expect(Math.min(palette.ratio, any.ratio)).toBeGreaterThanOrEqual(4.5);
    expect(palette).toEqual({ ratio: expect.closeTo(8.86, 2), color: '#D147BD' });
    expect(any).toEqual({ ratio: expect.closeTo(5.29, 2), color: '#000000' });
  });
});

describe('the mark of a render on the compact face', () => {
  const formula = createFormula({ name: 'f', source: 'x' });
  const blank = createFormula({ name: 'g', source: '' });
  const entry = (patch: Partial<FormulaRenderEntry>): FormulaRenderEntry => ({
    status: 'ok',
    resolved: null,
    error: null,
    ...patch,
  });
  const rendered = (exact: boolean) =>
    entry({ resolved: { render: { exact, warnings: [] } } as never });

  it('is M for MathJax and e for exact glyphs, as the owner asked', () => {
    expect(statusMark(formulaStatus(rendered(false), formula))).toBe('M');
    expect(statusMark(formulaStatus(rendered(true), formula))).toBe('e');
  });

  it('says what else a render may be: not there yet, empty, failed', () => {
    expect(statusMark(formulaStatus(undefined, formula))).toBe('…');
    expect(statusMark(formulaStatus(undefined, blank))).toBe('∅');
    expect(statusMark(formulaStatus(entry({ status: 'idle' }), formula))).toBe('…');
    expect(statusMark(formulaStatus(entry({ status: 'loading' }), formula))).toBe('…');
    expect(statusMark(formulaStatus(entry({ status: 'error' }), formula))).toBe('!');
  });

  it('is a question for a font text nothing has shaped', () => {
    expect(
      statusMark({
        status: 'ok',
        exact: false,
        needsCompanion: true,
        label: 'needs the companion',
        title: undefined,
      }),
    ).toBe('?');
  });
});

describe('the width under which a block is compact', () => {
  it('is the one the stylesheet asks its container for, less the block’s border', () => {
    expect(creatorCss).toContain(
      `@container formula-block (max-width: ${COMPACT_BLOCK_WIDTH - 2}px)`,
    );
    expect(creatorCss).toContain(`narrower than ${COMPACT_BLOCK_WIDTH} px`);
  });
});
