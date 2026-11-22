// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createEndsTween,
  createLineFormula,
  createPartTransform,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Easing,
  type LineFormula,
  type Target,
} from '../../../model';
import { exportEvaluator, settleScene } from '../../../scene';
import { generatePython } from '..';

describe.each(['ce', 'gl'] as const)('%s absent tween settlement', (target) => {
  for (const easing of ['there_and_back', 'there_and_back_with_pause'] as const) {
    it.each(['initial', 'return'] as const)(
      `${easing}: %s glyph returns at its actual endpoint`,
      (visibility) => {
        const project = createEmptyProject();
        project.meta.target = target;
        const f = createShapeFormula({ name: 'subject', shape: 'circle', width: 1, height: 1 });
        project.formulas.push(f);
        const clip = createClip(f.id, project.tracks[0]!.id, 0, 6, {
          intro: defaultIntro('none'),
          outro: defaultOutro('none'),
          actions: [
            ...(visibility === 'return'
              ? [
                  createPartTransform(0, [0], {
                    duration: 0.25,
                    color: '#00FF00',
                    opacity: 0.2,
                    easing: 'linear',
                  }),
                  createDisappear(0.25, 'fade_out', 'all', { duration: 0.5 }),
                ]
              : []),
            createTween(
              1,
              1,
              {
                position: [3, 0],
                scale: 2,
                rotation: 40,
                flipX: true,
                color: '#FF0000',
                opacity: 0.5,
              },
              easing,
            ),
            createAppear(3, 'fade_in', 'all', { duration: 1 }),
          ],
        });
        project.clips.push(clip);
        const resolved = refreshLocalRenders(project, new Map());
        const result = generatePython(resolved.project, resolved.formulas, {
          target,
          indexing: 'auto',
          sceneName: 'Hidden',
          comments: false,
        });
        expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(result.code).not.toContain('.apply_matrix(');
        expect(result.code).not.toContain('.shift(3 * RIGHT)');
        expect(result.code).not.toContain('.set_color("#FF0000")');
        if (visibility === 'return') {
          expect(result.code).toContain(`.set_color("${f.color}")`);
          expect(result.code).toContain('.set_stroke(opacity=1)');
        }
      },
    );
  }
});

/* A Transform of a line's ends whose easing comes back leaves the line as it was (FORMAT,
 * `TweenEnds`; audit A5-05). Played while the line is away — a Disappear block before it, an
 * Appear block after —, the export applies nothing: the line comes back at its own ends, where
 * the preview draws it. On screen it plays as `Transform`, which Manim's `finish()` ends where it
 * started. */
describe('a Transform of the ends of a hidden line that comes back', () => {
  const SPLINE = {
    shape: 'spline',
    nodes: [
      { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
      { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
    ],
  } as const;

  /** A line from (−1, 2) to (1, 2) over [0, 6): faded out at 0.5 s, its ends carried to
   * (−2, −2)–(2, −1) and back over [1.5, 2.5), faded in again at 3 s. */
  function hiddenAndBack(target: Target, fields: Partial<LineFormula>, easing: Easing) {
    const project = createEmptyProject();
    project.meta.target = target;
    const formula = createLineFormula({ name: 'l1', vector: [2, 0], ...fields });
    project.formulas.push(formula);
    const clip = createClip(formula.id, project.tracks[0]!.id, 0, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    clip.initial.position = [0, 2];
    clip.actions.push(
      createDisappear(0.5, 'fade_out', 'all', { duration: 0.5 }),
      createEndsTween(
        1.5,
        1,
        { start: { point: [-2, -2] }, end: { point: [2, -1] } },
        { strokeWidth: 9 },
        easing,
      ),
      createAppear(3, 'fade_in', 'all', { duration: 0.5 }),
    );
    project.clips.push(clip);
    const local = refreshLocalRenders(project, new Map());
    const settled = settleScene(local.project, local.formulas, refreshLocalRenders);
    const first = exportEvaluator(settled.project, settled.formulas)
      .evaluate(4)
      .filter((d) => d.clipId === clip.id)[0]!.path.contours[0]!;
    const code = generatePython(settled.project, settled.formulas, {
      target,
      sceneName: 'S',
      indexing: 'auto',
      comments: false,
    }).code;
    const errors = validateProject(settled.project).filter((i) => i.severity === 'error');
    return { first, code, errors };
  }

  describe.each(['ce', 'gl'] as const)('(%s)', (target) => {
    it.each([
      ['an arrow, built anew', { line: 'arrow' }],
      ['a line, carried', { line: 'line' }],
      ['a dashed spline, carried by `_carried`', { line: 'dashed', curve: SPLINE }],
    ] as [string, Partial<LineFormula>][])('%s: left where it was', (_name, fields) => {
      for (const easing of ['there_and_back', 'there_and_back_with_pause'] as const) {
        const made = hiddenAndBack(target, fields, easing);
        expect(made.errors).toEqual([]);
        // The preview: back at its own start once it is shown again.
        expect(made.first[0]).toBeCloseTo(-1, 6);
        expect(made.first[1]).toBeCloseTo(2, 6);
        // The export applies nothing of the tween to the hidden line.
        const applied = made.code
          .split('\n')
          .map((line) => line.trim())
          .filter((line) =>
            /^l1(_to)? = |^l1\.(become|put_start_and_end_on|set_stroke)\(/.test(line),
          )
          .filter((line) => !line.startsWith('l1 = '));
        expect(applied, easing).toEqual([]);
      }
    });

    it('an easing that ends at the new ends still applies them', () => {
      const made = hiddenAndBack(target, { line: 'arrow' }, 'smooth');
      expect(made.code).toContain('l1.become(l1_to)');
      expect(made.first[0]).toBeCloseTo(-2, 6);
      expect(made.first[1]).toBeCloseTo(-2, 6);
    });
  });
});
