// @vitest-environment node
/* The Python of a line object (D137): ManimCE's `Line`, `DashedLine`, `Arrow` and `DoubleArrow`;
 * ManimGL's `Line` and `DashedLine`, an arrow as a `Line` with a tip and a double arrow by the
 * `_arrow` helper, with ManimCE's values; an arc by `path_arc=`, a spline by the `_spline` helper,
 * and the tips that are not Manim's triangle (D145, D146). The whole scene of a project of them is pinned
 * (`arrows`) and rendered in both libraries by the export check; here, what the lines are made
 * of. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import { arcDrawn } from '../../../geom';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createEndsAttach,
  createEndsTween,
  createLineFormula,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  LINE_BUFFS,
  setIdGenerator,
  type Clip,
  type LineAnchor,
  type LineCurve,
  type LineEndSpec,
  type LineFormula,
  type Project,
  type Target,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { lineCentre, settleScene } from '../../../scene';
import { generatePython } from '..';
import {
  ARROW_HELPER,
  CARRIED_HELPER,
  DASHED_HELPERS,
  GLYPHS_HELPER,
  SPLINE_LINE_HELPERS,
  TRACE_ARROW_HELPERS,
} from '../helpers';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** The Python for `target` of a project `build` fills, and its lines that say `name`. `how`: the
 * helper asked for every formula («Always use the positional helper»), or the project made for
 * the other library than the one it is exported to. */
function python(
  target: Target,
  build: (project: Project) => void,
  name = 'l1',
  how: { positional?: boolean; madeFor?: Target } = {},
) {
  const restore = setIdGenerator(sequentialIds());
  try {
    const project = createEmptyProject();
    project.meta.target = how.madeFor ?? target;
    build(project);
    const local = refreshLocalRenders(project, new Map());
    const settled = settleScene(local.project, local.formulas, refreshLocalRenders);
    const out = generatePython(settled.project, settled.formulas, {
      target,
      sceneName: 'Lines',
      indexing: how.positional ? 'positional' : 'auto',
      comments: false,
    });
    const lines = out.code.split('\n').map((line) => line.trim());
    return {
      code: out.code,
      errors: out.issues.filter((issue) => issue.severity === 'error'),
      named: lines.filter((line) => line.includes(name)),
    };
  } finally {
    restore();
  }
}

/** A line object `fields` on the first track over [0, 4), its clip changed by `clip`. */
function free(fields: Partial<LineFormula>, change: (clip: Clip) => void = () => {}) {
  return (project: Project) => {
    const formula = createLineFormula({ name: 'l1', ...fields });
    project.formulas.push(formula);
    const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, none);
    change(clip);
    project.clips.push(clip);
  };
}

describe('the helpers of a bent line and of its tips', () => {
  it('are the ones the fixtures of both libraries were sampled with', () => {
    // gen_curved_lines.py holds each helper under the branch of its library, four spaces in.
    const generator = readFileSync(
      fileURLToPath(
        new URL('../../../scene/__tests__/fixtures/manim/gen_curved_lines.py', import.meta.url),
      ),
      'utf8',
    );
    const nested = (helper: string) =>
      helper
        .trimEnd()
        .split('\n')
        .map((line) => (line === '' ? '' : `    ${line}`))
        .join('\n');
    for (const helper of [
      ARROW_HELPER,
      SPLINE_LINE_HELPERS.ce,
      SPLINE_LINE_HELPERS.gl,
      DASHED_HELPERS.ce,
      DASHED_HELPERS.gl,
      TRACE_ARROW_HELPERS.ce,
      TRACE_ARROW_HELPERS.gl,
    ]) {
      expect(generator).toContain(nested(helper));
    }
  });
});

describe('the Python of a line between two free ends', () => {
  it('is built between its two points by its class, with what differs from Manim’s defaults', () => {
    // A line two units long to the right, its middle at (1, 2): from (0, 2) to (2, 2).
    const at = (clip: Clip) => void (clip.initial.position = [1, 2]);
    const ce = python('ce', free({ line: 'line', vector: [2, 0] }, at));
    expect(ce.errors).toEqual([]);
    expect(ce.named).toEqual([
      'l1 = Line([0, 2, 0], [2, 2, 0])',
      'l1.set_z_index(1)',
      'self.add(l1)',
    ]);
    // ManimGL's line is light grey unless told: its colour is always written there.
    expect(python('gl', free({ line: 'line', vector: [2, 0] }, at)).named[0]).toBe(
      'l1 = Line([0, 2, 0], [2, 2, 0], color="#FFFFFF")',
    );
    // Its colour, its stroke and its dashes are said when they are not the class's.
    expect(
      python(
        'ce',
        free({ line: 'dashed', vector: [0, 3], color: '#58C4DD', strokeWidth: 2, dashLength: 0.2 }),
      ).named[0],
    ).toBe(
      'l1 = DashedLine([0, -1.5, 0], [0, 1.5, 0], dash_length=0.2, color="#58C4DD", stroke_width=2)',
    );
    // ManimGL's last dash ends a little before the line does: the middle of what is drawn is
    // the clip's position, so the line starts and ends a little higher.
    const dashed = python('gl', free({ line: 'dashed', vector: [0, 3] })).named[0]!;
    const [, from, to] =
      /^l1 = DashedLine\(\[0, ([-\d.]+), 0\], \[0, ([-\d.]+), 0\], color="#FFFFFF"\)$/.exec(
        dashed,
      )!;
    expect(Number(to) - Number(from)).toBeCloseTo(3, 5);
    expect(Number(from)).toBeGreaterThan(-1.5);
    expect(Number(from)).toBeLessThan(-1.499);
  });

  it('writes an arrow at no gap: ManimCE’s class, ManimGL’s line with a tip of ManimCE’s size', () => {
    const ce = python('ce', free({ line: 'arrow', vector: [3, 0] }));
    expect(ce.named[0]).toBe('l1 = Arrow([-1.5, 0, 0], [1.5, 0, 0], buff=0)');
    const gl = python('gl', free({ line: 'arrow', vector: [3, 0] }));
    expect(gl.named[0]).toBe(
      'l1 = Line([-1.5, 0, 0], [1.5, 0, 0], stroke_width=6, color="#FFFFFF").add_tip(length=0.35, width=0.35)',
    );
    // A short one: ManimCE caps the tip and the stroke itself; for ManimGL they are worked out.
    expect(python('ce', free({ line: 'arrow', vector: [0.8, 0], tipLength: 0.5 })).named[0]).toBe(
      'l1 = Arrow([-0.4, 0, 0], [0.4, 0, 0], buff=0, tip_length=0.5)',
    );
    expect(python('gl', free({ line: 'arrow', vector: [0.8, 0] })).named[0]).toBe(
      'l1 = Line([-0.4, 0, 0], [0.4, 0, 0], stroke_width=4, color="#FFFFFF").add_tip(length=0.2, width=0.2)',
    );
  });

  it('writes a double arrow with ManimCE’s class, and with a helper in ManimGL', () => {
    const ce = python('ce', free({ line: 'double_arrow', vector: [3, 0], color: '#FFFF00' }));
    expect(ce.named[0]).toBe(
      'l1 = DoubleArrow([-1.5, 0, 0], [1.5, 0, 0], buff=0, color="#FFFF00")',
    );
    expect(ce.code).not.toContain('_arrow');
    const gl = python('gl', free({ line: 'double_arrow', vector: [0.8, 0] }));
    // Thinner than the arrow of its length: the stroke is capped by what the tips leave.
    expect(gl.named[0]).toBe(
      'l1 = _arrow(Line([-0.4, 0, 0], [0.4, 0, 0], stroke_width=2, color="#FFFFFF"), tip=0.2, start="triangle")',
    );
    expect(gl.code).toContain('def _arrow(line, tip=0.35, end="triangle", start=None):');
  });

  it('writes an arc as the path_arc of its class, in degrees', () => {
    const arc = { shape: 'arc', degrees: 30, trim: 0 } as const;
    // The clip is placed by the centre the library reads of the arc, which bulges off the line
    // between its two ends: those are not at the clip's height.
    const ends = '\\[-1, [-\\d.e]+, 0\\], \\[1, [-\\d.e]+, 0\\]';
    expect(python('ce', free({ line: 'line', vector: [2, 0], curve: arc })).named[0]).toMatch(
      new RegExp(`^l1 = Line\\(${ends}, path_arc=30 \\* DEGREES\\)$`),
    );
    expect(
      python('ce', free({ line: 'arrow', vector: [2, 0], curve: { ...arc, degrees: -45 } }))
        .named[0],
    ).toMatch(new RegExp(`^l1 = Arrow\\(${ends}, buff=0, path_arc=-45 \\* DEGREES\\)$`));
    expect(python('gl', free({ line: 'dashed', vector: [2, 0], curve: arc })).named[0]).toMatch(
      /^l1 = DashedLine\(\[[-\d.e]+, [-\d.e]+, 0\], \[[-\d.e]+, [-\d.e]+, 0\], path_arc=30 \* DEGREES, color="#FFFFFF"\)$/,
    );
    expect(python('gl', free({ line: 'arrow', vector: [2, 0], curve: arc })).named[0]).toMatch(
      new RegExp(
        `^l1 = Line\\(${ends}, path_arc=30 \\* DEGREES, stroke_width=6, color="#FFFFFF"\\)\\.add_tip\\(length=0\\.35, width=0\\.35\\)$`,
      ),
    );
    // An arc of no degrees is the straight line.
    expect(
      python('ce', free({ line: 'line', vector: [2, 0], curve: { ...arc, degrees: 0 } })).named[0],
    ).toBe('l1 = Line([-1, 0, 0], [1, 0, 0])');
  });

  it('writes an arc whose gap took a part of it between the points it was built from', () => {
    // A quarter turn between (−1, 0) and (1, 0), a gap of 0.25 at each end: what the sync holds.
    const whole = { start: [-1, 0] as [number, number], end: [1, 0] as [number, number] };
    for (const target of ['ce', 'gl'] as const) {
      const cut = arcDrawn(target, whole.start, whole.end, 90, 0.25);
      expect(cut.trim).toBeGreaterThan(0);
      const out = python(
        target,
        free(
          {
            line: 'line',
            vector: [cut.end[0] - cut.start[0], cut.end[1] - cut.start[1]],
            curve: { shape: 'arc', degrees: 90, trim: cut.trim },
          },
          (clip) => {
            // Where the centre of what is drawn is: the ends are then where the cut left them.
            const centre = lineCentre(
              target,
              {
                ...createLineFormula({ line: 'line' }),
                curve: { shape: 'arc', degrees: 90, trim: cut.trim },
              },
              cut.start,
              [cut.end[0] - cut.start[0], cut.end[1] - cut.start[1]],
            );
            clip.initial.position = centre;
          },
        ),
      ).named[0]!;
      const [, x0, y0, x1, y1, buff] =
        /^l1 = Line\(\[([-\d.e]+), ([-\d.e]+), 0\], \[([-\d.e]+), ([-\d.e]+), 0\], buff=([\d.]+), path_arc=90 \* DEGREES/.exec(
          out,
        )!;
      expect([Number(x0), Number(y0), Number(x1), Number(y1)]).toEqual(
        [-1, 0, 1, 0].map((v) => expect.closeTo(v, 4)),
      );
      expect(Number(buff)).toBeCloseTo(0.25, 4);
    }
  });

  it('bends a line into a spline with a helper, and cuts its dashes with another', () => {
    const spline = {
      shape: 'spline',
      nodes: [
        { at: [0, 0], in: null, out: [0.3, 0.4], smooth: true },
        { at: [1, 0], in: null, out: null, smooth: false },
      ],
    } as const satisfies LineFormula['curve'];
    const curves = '[((0.3, 0.4), (0.766667, 0.133333), (1, 0))]';
    const ends = '\\[-1, [-\\d.e]+, 0\\], \\[1, [-\\d.e]+, 0\\]';
    const literal = curves.replace(/[[\]().]/g, '\\$&');
    const ce = python('ce', free({ line: 'arrow', vector: [2, 0], curve: spline }));
    expect(ce.errors).toEqual([]);
    expect(ce.named[0]).toMatch(
      new RegExp(`^l1 = _spline\\(Arrow\\(${ends}, buff=0\\), ${literal}\\)$`),
    );
    expect(ce.code).toContain('def _spline(line, curves):');
    expect(ce.code).toContain('line.pop_tips()');
    const gl = python('gl', free({ line: 'double_arrow', vector: [2, 0], curve: spline }));
    expect(gl.named[0]).toMatch(
      new RegExp(
        `^l1 = _arrow\\(_spline\\(Line\\(${ends}, stroke_width=6, color="#FFFFFF"\\), ${literal}\\), tip=0\\.35, start="triangle"\\)$`,
      ),
    );
    expect(gl.code).toContain('def _spline(line, curves):');
    expect(gl.code).not.toContain('pop_tips');
    // The def of the spline comes before the one that uses its result.
    expect(gl.code.indexOf('def _spline')).toBeLessThan(gl.code.indexOf('def _arrow'));
    for (const target of ['ce', 'gl'] as const) {
      const dashed = python(
        target,
        free({ line: 'dashed', vector: [2, 0], curve: spline, dashLength: 0.2 }),
      );
      expect(dashed.named[0]).toMatch(
        /^l1 = _dashed\(_spline\(Line\(\[[^)]*\), \[\(\(0\.3, 0\.4\), [^\]]*\]\), dash_length=0\.2\)$/,
      );
      expect(dashed.code).toContain('def _dashed(line, dash_length=0.05):');
    }
  });

  it('grows an arrow from its start with GrowArrow, in both libraries', () => {
    const grows = (clip: Clip) => {
      clip.intro = { ...defaultIntro('grow_arrow'), duration: 1 };
    };
    for (const target of ['ce', 'gl'] as const) {
      const out = python(target, free({ line: 'arrow', vector: [3, 0] }, grows));
      expect(out.errors).toEqual([]);
      // The arrow itself, not a group of its members: ManimCE scales it with its tips.
      expect(out.named).toContain('self.play(GrowArrow(l1), run_time=1)');
      expect(out.code).not.toContain('_TraceArrow');
      // A bent arrow is drawn along its way, its tip leading the stroke (D149): neither library
      // has that animation, and the scene carries it as a helper.
      const bent = python(
        target,
        free(
          { line: 'double_arrow', vector: [3, 0], curve: { shape: 'arc', degrees: 60, trim: 0 } },
          (clip) => {
            clip.intro = { ...defaultIntro('grow_arrow'), duration: 0.5, easing: 'linear' };
          },
        ),
      );
      expect(bent.errors).toEqual([]);
      expect(bent.named).toContain('self.play(_TraceArrow(l1, rate_func=linear), run_time=0.5)');
      expect(bent.code).toContain(TRACE_ARROW_HELPERS[target]);
      expect(bent.code.split('class _TraceArrow(Animation):')).toHaveLength(2);
      const spline = python(
        target,
        free(
          {
            line: 'arrow',
            vector: [3, 0],
            curve: {
              shape: 'spline',
              nodes: [
                { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
                { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
              ],
            },
          },
          grows,
        ),
      );
      expect(spline.errors).toEqual([]);
      expect(spline.named).toContain('self.play(_TraceArrow(l1), run_time=1)');
    }
  });

  it('passes a lag ratio of its own on, which staggers the members as the preview does', () => {
    // Manim's GrowArrow is a Transform and the export's _TraceArrow an Animation: a `lag_ratio`
    // staggers the shaft and the tips (audit A5-03; the export check's `grow-arrow-lags`).
    const lagged = (clip: Clip) => {
      clip.intro = { ...defaultIntro('grow_arrow'), duration: 1, easing: 'linear', lagRatio: 0.5 };
    };
    for (const target of ['ce', 'gl'] as const) {
      const straight = python(target, free({ line: 'arrow', vector: [3, 0] }, lagged));
      expect(straight.errors).toEqual([]);
      expect(straight.named).toContain(
        'self.play(GrowArrow(l1, rate_func=linear, lag_ratio=0.5), run_time=1)',
      );
      const arc: LineCurve = { shape: 'arc', degrees: 60, trim: 0 };
      const bent = python(target, free({ line: 'arrow', vector: [3, 0], curve: arc }, lagged));
      expect(bent.errors).toEqual([]);
      expect(bent.named).toContain(
        'self.play(_TraceArrow(l1, rate_func=linear, lag_ratio=0.5), run_time=1)',
      );
    }
  });

  it('names the shape of a tip that is not the triangle', () => {
    expect(python('ce', free({ line: 'arrow', vector: [3, 0], tip: 'stealth' })).named[0]).toBe(
      'l1 = Arrow([-1.5, 0, 0], [1.5, 0, 0], buff=0, tip_shape=StealthTip)',
    );
    expect(
      python('ce', free({ line: 'double_arrow', vector: [3, 0], tip: 'dot', startTip: 'stealth' }))
        .named[0],
    ).toBe(
      'l1 = DoubleArrow([-1.5, 0, 0], [1.5, 0, 0], buff=0, tip_shape_end=ArrowCircleFilledTip, tip_shape_start=StealthTip)',
    );
    // A line keeps the shape for when it is an arrow, and writes none.
    expect(python('ce', free({ line: 'line', vector: [3, 0], tip: 'dot' })).named[0]).toBe(
      'l1 = Line([-1.5, 0, 0], [1.5, 0, 0])',
    );
    // ManimGL: its own dot, asked twice as long; the stealth tip and two tips, by the helper.
    const dot = python('gl', free({ line: 'arrow', vector: [3, 0], tip: 'dot' }));
    expect(dot.named[0]).toMatch(
      /^l1 = Line\(\[[^)]*, stroke_width=6, color="#FFFFFF"\)\.add_tip\(length=0\.7, tip_style=2\)$/,
    );
    expect(dot.code).not.toContain('def _arrow');
    expect(python('gl', free({ line: 'arrow', vector: [3, 0], tip: 'stealth' })).named[0]).toMatch(
      /^l1 = _arrow\(Line\(\[[^)]*\), tip=0\.35, end="stealth"\)$/,
    );
    expect(
      python('gl', free({ line: 'double_arrow', vector: [3, 0], tip: 'dot', startTip: 'stealth' }))
        .named[0],
    ).toMatch(/^l1 = _arrow\(Line\(\[[^)]*\), tip=0\.35, end="dot", start="stealth"\)$/);
  });

  it('puts the ends where the clip’s first state has them, and moves nothing afterwards', () => {
    // Turned a quarter: the line that ran to the right runs up.
    const turned = python(
      'ce',
      free({ line: 'line', vector: [2, 0] }, (clip) => {
        clip.initial.position = [1, 1];
        clip.initial.rotation = 90;
        clip.initial.opacity = 0.5;
      }),
    );
    expect(turned.named).toEqual([
      'l1 = Line([1, 0, 0], [1, 2, 0])',
      'l1.set_opacity(0.5)',
      'l1.set_z_index(1)',
      'self.add(l1)',
    ]);
    // An arrow's centre is not the middle of its line when its tip widens its box; the points
    // are still the two ends.
    const arrow = python(
      'ce',
      free({ line: 'arrow', vector: [1, 0.2] }, (clip) => void (clip.initial.position = [0, 0])),
    );
    const [, x0, y0, x1, y1] =
      /Arrow\(\[([-\d.]+), ([-\d.]+), 0\], \[([-\d.]+), ([-\d.]+), 0\]/.exec(arrow.named[0]!)!;
    expect(Number(x1) - Number(x0)).toBeCloseTo(1, 5);
    expect(Number(y1) - Number(y0)).toBeCloseTo(0.2, 5);
    expect((Number(y0) + Number(y1)) / 2).not.toBeCloseTo(0, 3);
  });
});

/** Two shapes `host` (a box at the left) and `other` (a cross at the right) over [0, 6), and a
 * line `l1` of `fields` over [1, 6) between the ends `ends` gives for the two clips. */
function attached(
  fields: Partial<LineFormula>,
  ends: (host: string, other: string) => [LineEndSpec, LineEndSpec],
  buff: number,
  twice = false,
) {
  return (project: Project) => {
    const host = createShapeFormula({ name: 'host', width: 2, height: 1 });
    const other = createShapeFormula({ name: 'other', width: 1, height: 1, shape: 'cross' });
    const formula = createLineFormula({ name: 'l1', ...fields });
    project.formulas.push(host, other, formula);
    project.tracks.push({ ...project.tracks[0]!, id: 't3', name: 'Track 3' });
    const a = createClip(host.id, project.tracks[0]!.id, 0, 6, none);
    a.initial.position = [-3, 1];
    const b = createClip(other.id, project.tracks[1]!.id, 0, 6, none);
    b.initial.position = [3, -1];
    const [start, end] = ends(a.id, b.id);
    const clip = createClip(formula.id, 't3', 1, 6, {
      ...none,
      attach: createEndsAttach(start, end, buff),
    });
    project.clips.push(a, b, clip);
    if (twice) project.clips.push({ ...structuredClone(clip), id: 'again', start: 6, end: 8 });
  };
}

describe('the Python of a line with ends on glyphs', () => {
  it('builds it on what its ends are on, where its clip starts', () => {
    const both = attached(
      { line: 'arrow' },
      (host, other) => [
        { clipId: host, glyphs: 'all' },
        { clipId: other, glyphs: [1] },
      ],
      0.25,
    );
    const ce = python('ce', both);
    // (The hosts here are boxes, which need no render; validation asks for formulas or texts.)
    expect(ce.errors.map((issue) => issue.code)).toEqual(['attach-rule', 'attach-rule']);
    // Manim finds the edges and caps the tip: the defaults of `Arrow` need no word.
    expect(ce.named).toEqual(['l1 = Arrow(host, other[1])', 'self.add(l1)']);
    // Nothing of it before the step where its clip starts.
    expect(ce.code.indexOf('l1 = Arrow')).toBeGreaterThan(ce.code.indexOf('self.add(host)'));
    // ManimGL: a line with a tip, of the size the editor worked out for the line it measured.
    expect(python('gl', both).named[0]).toBe(
      'l1 = Line(host, other[1], buff=0.25, stroke_width=6, color="#FFFFFF").add_tip(length=0.35, width=0.35)',
    );
  });

  it('takes a point for a free end, and says a gap that is not the class’s', () => {
    const mixed = (line: 'line' | 'dashed' | 'double_arrow', buff: number) =>
      python(
        'ce',
        attached({ line }, (host) => [{ point: [0, 3] }, { clipId: host, glyphs: 'all' }], buff),
      ).named[0];
    expect(mixed('line', 0)).toBe('l1 = Line([0, 3, 0], host)');
    expect(mixed('dashed', 0.1)).toBe('l1 = DashedLine([0, 3, 0], host, buff=0.1)');
    expect(mixed('double_arrow', 0)).toBe('l1 = DoubleArrow([0, 3, 0], host, buff=0)');
    expect(
      python(
        'gl',
        attached(
          { line: 'double_arrow', color: '#FFFF00' },
          (host) => [{ point: [0, 3] }, { clipId: host, glyphs: 'all' }],
          0.25,
        ),
      ).named[0],
    ).toBe(
      'l1 = _arrow(Line([0, 3, 0], host, buff=0.25, stroke_width=6, color="#FFFF00"), tip=0.35, start="triangle")',
    );
  });

  it('reads an end with an anchor off its glyphs: a corner, the middle of a side, the centre', () => {
    const anchored = (
      target: Target,
      line: 'line' | 'arrow' | 'double_arrow',
      start: LineAnchor,
      end: LineAnchor,
    ) =>
      python(
        target,
        attached(
          { line },
          (host, other) => [
            { clipId: host, glyphs: 'all', anchor: start },
            { clipId: other, glyphs: [1], anchor: end },
          ],
          LINE_BUFFS[line],
        ),
      ).named[0];
    expect(anchored('ce', 'arrow', 'dr', 'left')).toBe(
      'l1 = Arrow(host.get_corner(DR), other[1].get_left())',
    );
    expect(anchored('ce', 'line', 'up', 'center')).toBe(
      'l1 = Line(host.get_top(), other[1].get_center())',
    );
    // One end left to Manim, the other said.
    expect(anchored('ce', 'double_arrow', 'auto', 'ul')).toBe(
      'l1 = DoubleArrow(host, other[1].get_corner(UL))',
    );
    expect(anchored('gl', 'line', 'down', 'right')).toBe(
      'l1 = Line(host.get_bottom(), other[1].get_right(), color="#FFFFFF")',
    );
    expect(anchored('gl', 'arrow', 'ur', 'dl')).toMatch(
      /^l1 = Line\(host\.get_corner\(UR\), other\[1\]\.get_corner\(DL\), buff=0\.25, stroke_width=6, color="#FFFFFF"\)\.add_tip\(/,
    );
    expect(anchored('gl', 'double_arrow', 'center', 'auto')).toMatch(
      /^l1 = _arrow\(Line\(host\.get_center\(\), other\[1\], buff=0\.25, /,
    );
  });

  it('builds each clip of an object with two between the points the project has it at', () => {
    const shared = python(
      'ce',
      attached(
        { line: 'line' },
        (host, other) => [
          { clipId: host, glyphs: 'all' },
          { clipId: other, glyphs: 'all' },
        ],
        0,
        true,
      ),
    );
    const built = shared.named.filter((line) => /^l1(_2)? = /.test(line));
    expect(built).toHaveLength(2);
    for (const line of built) {
      expect(line).toMatch(/^l1(_2)? = Line\(\[[-\d., ]+\], \[[-\d., ]+\]\)$/);
    }
  });
});

describe('a tween that carries the ends of a line (D144)', () => {
  const S: LineCurve = {
    shape: 'spline',
    nodes: [
      { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
      { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
    ],
  };
  const to = (x0: number, y0: number, x1: number, y1: number) => ({
    start: { point: [x0, y0] as [number, number] },
    end: { point: [x1, y1] as [number, number] },
  });

  it('builds an arrow anew between its new ends, and Transform carries it there', () => {
    for (const target of ['ce', 'gl'] as const) {
      const out = python(
        target,
        free({ line: 'arrow', vector: [2, 0] }, (clip) => {
          clip.actions.push(
            createEndsTween(1, 1, to(-1, -1, 3, 2), { strokeWidth: 3, color: '#FF0000' }),
          );
        }),
      );
      expect(out.errors).toEqual([]);
      expect(out.named).toContain(
        target === 'ce'
          ? 'l1_to = Arrow([-1, -1, 0], [3, 2, 0], buff=0, color="#FF0000", stroke_width=3)'
          : 'l1_to = Line([-1, -1, 0], [3, 2, 0], stroke_width=3, color="#FF0000").add_tip(length=0.35, width=0.35)',
      );
      expect(out.named).toContain('self.play(Transform(l1, l1_to), run_time=1)');
      // ManimCE's Arrow sets its stroke again from the width it was first asked when it is scaled.
      expect(out.named.includes('l1.initial_stroke_width = 3')).toBe(target === 'ce');
    }
  });

  it('carries a line and a dashed line as they are, with their stroke, colour and opacity', () => {
    for (const target of ['ce', 'gl'] as const) {
      const out = python(
        target,
        free(
          { line: 'dashed', vector: [2, 0], curve: { shape: 'arc', degrees: 60, trim: 0 } },
          (clip) => {
            clip.actions.push(
              createEndsTween(1, 1, to(-1, -1, 3, 2), { strokeWidth: 2, opacity: 0.5 }, 'linear'),
            );
          },
        ),
      );
      expect(out.errors).toEqual([]);
      expect(out.named).toContain(
        // A long play is written over several lines: the animation is one of them.
        'l1.animate(rate_func=linear).put_start_and_end_on(np.array([-1, -1, 0]), np.array([3, 2, 0])).set_stroke(width=2).set_stroke(opacity=0.5),',
      );
      expect(out.code).not.toContain('_carried');
    }
  });

  it('reads the two points off a plain line on the glyphs an end is on', () => {
    for (const target of ['ce', 'gl'] as const) {
      const out = python(target, (project) => {
        const host = createShapeFormula({ name: 's1', shape: 'box', width: 2, height: 1 });
        project.formulas.push(host);
        const hostClip = createClip(host.id, project.tracks[1]!.id, 0, 4, none);
        hostClip.initial.position = [3, 1];
        project.clips.push(hostClip);
        free({ vector: [2, 0], curve: { shape: 'arc', degrees: 60, trim: 0 } }, (clip) => {
          clip.actions.push(
            createEndsTween(1, 1, {
              start: { point: [-2, -1] },
              end: { clipId: hostClip.id, glyphs: 'all', anchor: 'left' },
              buff: 0.2,
            }),
          );
        })(project);
      });
      // (The host is a box, which needs no render; validation asks for a formula or a text, at
      // the ends a Transform carries a line to as at an attachment's.)
      expect(out.errors.map((issue) => issue.code)).toEqual(['attach-rule']);
      const colour = target === 'ce' ? '' : ', color="#FFFFFF"';
      expect(out.named).toContain(
        `l1_at = Line([-2, -1, 0], s1.get_left(), buff=0.2, path_arc=60 * DEGREES${colour})`,
      );
      expect(out.named).toContain(
        'self.play(l1.animate.put_start_and_end_on(l1_at.get_start(), l1_at.get_end()), run_time=1)',
      );
    }
  });

  it('builds a line anew for an arc that takes other degrees; a spline’s dashes by a helper', () => {
    for (const target of ['ce', 'gl'] as const) {
      const turned = python(
        target,
        free({ vector: [2, 0], curve: { shape: 'arc', degrees: 60, trim: 0 } }, (clip) => {
          clip.actions.push(createEndsTween(1, 1, { ...to(-1, -1, 3, 2), degrees: -45 }));
        }),
      );
      expect(turned.errors).toEqual([]);
      const colour = target === 'ce' ? '' : ', color="#FFFFFF"';
      expect(turned.named).toContain(
        `l1_to = Line([-1, -1, 0], [3, 2, 0], path_arc=-45 * DEGREES${colour})`,
      );
      expect(turned.named).toContain('self.play(Transform(l1, l1_to), run_time=1)');
      const dashes = python(
        target,
        free({ line: 'dashed', vector: [2, 0], curve: S }, (clip) => {
          clip.actions.push(createEndsTween(1, 1, to(-1, -1, 3, 2), { strokeWidth: 6 }));
        }),
      );
      expect(dashes.errors).toEqual([]);
      expect(dashes.named).toContain(
        'l1_to = _carried(l1, np.array([-1, -1, 0]), np.array([3, 2, 0])).set_stroke(width=6)',
      );
      expect(dashes.named).toContain('self.play(Transform(l1, l1_to), run_time=1)');
      expect(dashes.code).toContain(CARRIED_HELPER);
    }
  });

  it('writes the helper the fixtures of both libraries were sampled with', () => {
    const generator = readFileSync(
      fileURLToPath(
        new URL('../../../scene/__tests__/fixtures/manim/gen_line_moves.py', import.meta.url),
      ),
      'utf8',
    );
    expect(generator).toContain(CARRIED_HELPER);
  });
});

describe('a line and the positional helper (audit A4-04)', () => {
  const kinds = [
    ['line', {}],
    ['dashed', {}],
    ['arrow', {}],
    ['double_arrow', {}],
    ['arrow', { curve: { shape: 'arc', degrees: 60 } as LineCurve }],
  ] as const;
  /** Drawn in, so that the scene names the line's glyphs. */
  const drawn = (line: LineFormula['line'], fields: Partial<LineFormula>) =>
    free({ line, vector: [4, 0], ...fields }, (clip) => {
      clip.intro = { ...defaultIntro('create'), duration: 1 };
    });

  it.each(['ce', 'gl'] as const)(
    'is never matched by position, asked for or not: its glyphs are its mobject’s (%s)',
    (target) => {
      for (const [line, fields] of kinds) {
        const plain = python(target, drawn(line, fields));
        expect(plain.errors).toEqual([]);
        expect(plain.code).not.toContain('_glyphs(');
        // «Always use the positional helper», and a project made for the other library: a
        // horizontal line has no height for `_glyphs` to measure by, and an arrow's own
        // animations need the arrow, not a list of its parts. The scene is the same.
        const asked = python(target, drawn(line, fields), 'l1', { positional: true });
        expect(asked.code).toBe(plain.code);
        const other = python(target, drawn(line, fields), 'l1', {
          madeFor: target === 'ce' ? 'gl' : 'ce',
        });
        expect(other.errors).toEqual([]);
        expect(other.code).not.toContain('_glyphs(');
        expect(other.code).not.toContain('l1_g');
      }
    },
  );

  it('the helper measures a flat mobject by 1, as the layout it is given was', () => {
    expect(GLYPHS_HELPER).toContain('if height < 1e-6:\n        height = 1.0');
  });
});

describe('a loose line made for the other library (audit A4-05)', () => {
  /** The two points a line's constructor is written with, and the call that moves it. */
  const written = (out: { named: string[] }) => {
    const made = out.named.find((line) => line.startsWith('l1 = '))!;
    const ends = /\(\[(-?[\d.]+), (-?[\d.]+), 0\], \[(-?[\d.]+), (-?[\d.]+), 0\]/.exec(made)!;
    return {
      ends: ends.slice(1).map(Number),
      move: out.named.find((line) => line.includes('l1.animate'))!,
    };
  };
  const moved = (clip: Clip) => {
    clip.initial.position = [1, 1];
    clip.actions.push(createTween(1, 1, { position: [2, 0.5] }, 'linear'));
  };

  it.each([
    ['an arc', { vector: [3, 0.5], curve: { shape: 'arc', degrees: 120, trim: 0 } }],
    [
      'a bent arrow',
      { line: 'arrow', vector: [3, 0.5], curve: { shape: 'arc', degrees: 60, trim: 0 } },
    ],
    ['an arrow with a dot', { line: 'arrow', vector: [2, 1], tip: 'dot' }],
  ] as [string, Partial<LineFormula>][])(
    '%s: built between the ends its project’s library gives, and moved by a vector',
    (_name, fields) => {
      for (const target of ['ce', 'gl'] as const) {
        const madeFor = target === 'ce' ? 'gl' : 'ce';
        // The clip's position is the centre the project's library reads of the line: the
        // export to that library writes the ends it gives, and moves the line there.
        const own = written(python(madeFor, free(fields, moved)));
        expect(own.move).toContain('.move_to([2, 0.5, 0])');
        const other = python(target, free(fields, moved), 'l1', { madeFor });
        expect(other.errors).toEqual([]);
        const drawn = written(other);
        drawn.ends.forEach((v, k) => expect(v, `number ${k}`).toBeCloseTo(own.ends[k]!, 5));
        expect(drawn.move).toContain('.shift(np.array([1, -0.5, 0]))');
        expect(drawn.move).not.toContain('move_to');
      }
    },
  );
});

describe('a block on a part of an arrow (audit A5-07)', () => {
  // The Python names an arrow's shaft by the arrow itself, whose family holds its tips: a block on
  // the shaft alone fades, frames or grows the whole arrow in the video and the part of it in the
  // preview. The blocks of an arrow animate it whole (the owner's decision): one that names a
  // part of it is an error, which the export says as validation does.
  const parts = (out: { errors: { code: string; path: (string | number)[] }[] }) =>
    out.errors.filter((issue) => issue.code === 'arrow-part').map((issue) => issue.path.join('.'));

  it('is an error: a Disappear and then an Appear of the shaft alone', () => {
    for (const target of ['ce', 'gl'] as const) {
      const shaft = python(
        target,
        free({ line: 'arrow', vector: [2, 0] }, (clip) => {
          clip.end = 6;
          clip.actions.push(
            createDisappear(1, 'fade_out', [0], { duration: 0.5 }),
            createAppear(3, 'fade_in', [0], { duration: 0.5 }),
          );
        }),
      );
      expect(parts(shaft)).toEqual(['clips.0.actions.0.glyphs', 'clips.0.actions.1.glyphs']);
      // The same blocks on every glyph: the whole arrow, in the preview as in the Python.
      const whole = python(
        target,
        free({ line: 'arrow', vector: [2, 0] }, (clip) => {
          clip.end = 6;
          clip.actions.push(
            createDisappear(1, 'fade_out', 'all', { duration: 0.5 }),
            createAppear(3, 'fade_in', 'all', { duration: 0.5 }),
          );
        }),
      );
      expect(whole.errors).toEqual([]);
      expect(whole.named).toContain('self.play(FadeOut(l1), run_time=0.5)');
    }
  });

  it('is an error: a Circumscribe of the shaft, a GrowArrow of the tip', () => {
    for (const target of ['ce', 'gl'] as const) {
      const framed = python(
        target,
        free({ line: 'double_arrow', vector: [2, 0] }, (clip) => {
          clip.actions.push(createEmphasis(1, 'circumscribe', [0, 1]));
        }),
      );
      expect(parts(framed)).toEqual(['clips.0.actions.0.glyphs']);
      const grown = python(
        target,
        free({ line: 'arrow', vector: [2, 0] }, (clip) => {
          clip.end = 6;
          clip.actions.push(
            createDisappear(1, 'fade_out', [1], { duration: 0.5 }),
            createAppear(3, 'grow_arrow', [1], { duration: 0.5 }),
          );
        }),
      );
      expect(parts(grown)).toEqual(['clips.0.actions.0.glyphs', 'clips.0.actions.1.glyphs']);
    }
  });
});
