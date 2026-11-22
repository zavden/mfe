/* The check a generated scene makes of a font text, run by a real Python on stand-ins of Manim's
 * mobjects: what it says and, above all, that the scene goes on (D82), also when the text comes
 * out with fewer glyphs than the scene names. Real Manim runs it in `npm run export-check`. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pythonCommand } from '../../../../build/python';
import { TEXT_GEOMETRY_HELPER } from '../textHelper';

/** Points with the arithmetic the ManimGL branch asks of numpy rows, and stand-ins of a text and
 * its glyphs: a glyph is its subpaths, each a list of points. */
const STAND_INS = `
class P(list):
    def __add__(self, other):
        return P(a + b for a, b in zip(self, other))
    def __rmul__(self, factor):
        return P(factor * a for a in self)
    def __truediv__(self, divisor):
        return P(a / divisor for a in self)


class Glyph:
    def __init__(self, paths):
        self.paths = [[P(point) for point in path] for path in paths]

    def get_subpaths(self):
        return self.paths


class VMobject(Glyph):
    """What the scene's namespace calls an empty mobject."""
    def __init__(self):
        super().__init__([])


class Text:
    def __init__(self, glyphs):
        self.submobjects = [Glyph(paths) for paths in glyphs]

    def add(self, *mobjects):
        self.submobjects.extend(mobjects)
`;

type Path = [number, number, number][];

/** A unit square as ManimCE holds it (four cubic curves, four points each) and as ManimGL does
 * (four quadratic ones sharing their ends). */
// prettier-ignore
const CE_SQUARE: Path = [
  [0, 0, 0], [0.25, 0, 0], [0.75, 0, 0], [1, 0, 0],
  [1, 0, 0], [1, 0.25, 0], [1, 0.75, 0], [1, 1, 0],
  [1, 1, 0], [0.75, 1, 0], [0.25, 1, 0], [0, 1, 0],
  [0, 1, 0], [0, 0.75, 0], [0, 0.25, 0], [0, 0, 0],
];
// prettier-ignore
const GL_SQUARE: Path = [
  [0, 0, 0], [0.5, 0, 0], [1, 0, 0], [1, 0.5, 0], [1, 1, 0],
  [0.5, 1, 0], [0, 1, 0], [0, 0.5, 0], [0, 0, 0],
];

/** The fingerprint of glyphs given as cubic contours (x0, y0, then three points per curve), as
 * the companion takes it: every coordinate in millionths, rounded half up. */
function fingerprint(glyphs: number[][][]): string {
  const quantized = glyphs.map((glyph) =>
    glyph.map((contour) => contour.map((value) => Math.floor(value * 1_000_000 + 0.5))),
  );
  return createHash('sha256').update(JSON.stringify(quantized)).digest('hex');
}

/** The square as one cubic contour: the same for both libraries (a quadratic curve raised to a
 * cubic keeps its shape). */
// prettier-ignore
const SQUARE_CONTOUR = [
  0, 0,
  1 / 3, 0, 2 / 3, 0, 1, 0,
  1, 1 / 3, 1, 2 / 3, 1, 1,
  2 / 3, 1, 1 / 3, 1, 0, 1,
  0, 2 / 3, 0, 1 / 3, 0, 0,
];

interface Check {
  glyphs: Path[][];
  target: 'ce' | 'gl';
  /** The glyphs the editor saved of the text; default: as many as Manim built. */
  count?: number;
  /** The saved fingerprint, or none to compare (a text the other library shaped). */
  expected?: string;
  /** Python that runs before the check, with `text` built. */
  before?: string;
}

function run({ glyphs, target, count = glyphs.length, expected, before = '' }: Check) {
  const fingerprintArg = expected === undefined ? '' : `, ${JSON.stringify(expected)}`;
  const script = [
    TEXT_GEOMETRY_HELPER,
    STAND_INS,
    `text = Text(${JSON.stringify(glyphs)})`,
    before,
    `_mfe_verify_text(text, 'Title "one"', ${JSON.stringify(target)}, ${count}${fingerprintArg})`,
    "print('the scene goes on with', len(text.submobjects), 'glyphs,',",
    "      sum(1 for glyph in text.submobjects if not glyph.get_subpaths()), 'of them empty')",
  ].join('\n');
  const result = spawnSync(pythonCommand(), ['-c', script], { encoding: 'utf8', timeout: 20_000 });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

const quiet = (glyphs: number) => ({
  status: 0,
  stdout: `the scene goes on with ${glyphs} glyphs, 0 of them empty`,
  stderr: '',
});

describe("the generated scene's check of a font text", () => {
  it('says nothing when ManimGL built the outlines the editor saved', () => {
    const expected = fingerprint([[SQUARE_CONTOUR]]);
    expect(run({ glyphs: [[GL_SQUARE]], target: 'gl', expected })).toEqual(quiet(1));
  });

  it('says nothing when ManimCE built them', () => {
    // ManimCE's own cubic points are the contour: no thirds to round.
    const contour = [0, 0, ...CE_SQUARE.filter((_, i) => i % 4 !== 0).flatMap(([x, y]) => [x, y])];
    const expected = fingerprint([[contour]]);
    expect(run({ glyphs: [[CE_SQUARE]], target: 'ce', expected })).toEqual(quiet(1));
  });

  it.each(['ce', 'gl'] as const)('takes the fingerprint as the companion does (%s)', (target) => {
    // The companion's own functions, on the same stand-ins: the two copies of the walk and of
    // the quantization must stay one.
    const companion = path.resolve('../companion');
    const before = [
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(companion)})`,
      'import mfe_companion',
      `saved = mfe_companion._pango_geometry_signature(`,
      `    [mfe_companion._pango_contours(glyph, ${JSON.stringify(target)}) for glyph in text.submobjects])`,
    ].join('\n');
    const square = target === 'ce' ? CE_SQUARE : GL_SQUARE;
    const script = [
      TEXT_GEOMETRY_HELPER,
      STAND_INS,
      `text = Text(${JSON.stringify([[square], [square, square]])})`,
      before,
      `_mfe_verify_text(text, 'Title', ${JSON.stringify(target)}, 2, saved)`,
      "print('same' if len(saved) == 64 else 'no fingerprint')",
    ].join('\n');
    const result = spawnSync(pythonCommand(), ['-c', script], {
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect({ status: result.status, out: result.stdout.trim(), err: result.stderr.trim() }).toEqual(
      { status: 0, out: 'same', err: '' },
    );
  });

  it.each(['ce', 'gl'] as const)(
    'names the text on stderr and goes on when %s drew something else',
    (target) => {
      const glyphs = [[target === 'ce' ? CE_SQUARE : GL_SQUARE]];
      const result = run({ glyphs, target, expected: '0'.repeat(64) });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('the scene goes on with 1 glyphs, 0 of them empty');
      expect(result.stderr).toMatch(/^Warning: the text 'Title "one"' is not drawn here as in/);
      expect(result.stderr).toContain('It may look different');
      expect(result.stderr).not.toContain('Traceback');
    },
  );

  it('adds the glyphs Manim did not build, empty, so that the scene can name every one', () => {
    // Another font here makes one glyph of what were three there (a ligature, say): the scene
    // goes on to name glyph 2, which must exist.
    const expected = fingerprint([[SQUARE_CONTOUR], [SQUARE_CONTOUR], [SQUARE_CONTOUR]]);
    const result = run({ glyphs: [[GL_SQUARE]], target: 'gl', count: 3, expected });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('the scene goes on with 3 glyphs, 2 of them empty');
    expect(result.stderr).toMatch(/^Warning: the text 'Title "one"' is not drawn here as in/);
    expect(result.stderr).toContain('It has 1 glyphs here and 3 there');
  });

  it('says so when Manim built more glyphs, and leaves them be', () => {
    const expected = fingerprint([[SQUARE_CONTOUR]]);
    const result = run({ glyphs: [[GL_SQUARE], [GL_SQUARE]], target: 'gl', count: 1, expected });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('the scene goes on with 2 glyphs, 0 of them empty');
    expect(result.stderr).toContain('It has 2 glyphs here and 1 there');
  });

  it('counts the glyphs of a text it has no fingerprint of', () => {
    // A text the other library shaped: its outlines are not this library's, its glyphs are.
    expect(run({ glyphs: [[GL_SQUARE], [GL_SQUARE]], target: 'gl' })).toEqual(quiet(2));
    const fewer = run({ glyphs: [[CE_SQUARE]], target: 'ce', count: 2 });
    expect(fewer.status).toBe(0);
    expect(fewer.stdout).toBe('the scene goes on with 2 glyphs, 1 of them empty');
    expect(fewer.stderr).toContain('It has 1 glyphs here and 2 there');
  });

  it('warns, and goes on, when the outlines cannot even be read', () => {
    // Six points are not cubic curves: ManimCE never makes such a path, and the check must not
    // stop the scene over it.
    const expected = fingerprint([[SQUARE_CONTOUR]]);
    const result = run({ glyphs: [[CE_SQUARE.slice(0, 6)]], target: 'ce', expected });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('the scene goes on with 1 glyphs, 0 of them empty');
    expect(result.stderr).toMatch(/^Warning: the text/);
    expect(result.stderr).not.toContain('Traceback');
  });

  it('goes on when it cannot even say it: stderr is closed', () => {
    const result = run({
      glyphs: [[GL_SQUARE]],
      target: 'gl',
      expected: '0'.repeat(64),
      before: 'import sys\nsys.stderr.close()',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('the scene goes on with 1 glyphs, 0 of them empty');
  });
});
