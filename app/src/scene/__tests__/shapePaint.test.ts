// @vitest-environment node
/* A shape whose Transforms repaint it (D123), in the evaluator: the width of its stroke, the
 * opacity of its stroke and of its fill and the colour of its fill go linearly from one keyframe
 * to the next, as Manim's `Transform` interpolates them — the numbers here are the ones measured
 * in both libraries (MANIM-QUIRKS, "5 bis"). */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createClip,
  createEmptyProject,
  createPartTransform,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  type ClipAction,
  type ClipState,
  type ShapeFormula,
  type Target,
} from '../../model';
import { createEvaluator } from '../index';
import { stateAt } from '../state';

const RED = '#FF0000';
const BLUE = '#0000FF';
const GREEN = '#00FF00';
const ORANGE = '#FF8800';

/** A box 2 × 1 on a clip over [0, 8) with `actions`, and what is drawn of it at an instant. */
function scene(
  object: Partial<ShapeFormula>,
  actions: ClipAction[],
  initial: Partial<ClipState> = {},
  lib: Target = 'ce',
  intro = defaultIntro('none'),
) {
  const project = createEmptyProject();
  project.meta.target = lib;
  const box = createShapeFormula({ name: 's1', width: 2, height: 1, color: RED, ...object });
  const clip = createClip(box.id, project.tracks[0]!.id, 0, 8, {
    intro,
    outro: defaultOutro('none'),
    actions,
  });
  Object.assign(clip.initial, initial);
  project.formulas.push(box);
  project.clips.push(clip);
  const rendered = refreshLocalRenders(project, new Map());
  const evaluator = createEvaluator(rendered.project, rendered.formulas);
  const at = (t: number) => {
    const [drawn, ...rest] = evaluator.evaluate(t);
    expect(rest).toEqual([]);
    return { fill: drawn?.fill ?? null, stroke: drawn?.stroke ?? null };
  };
  return { at, clip };
}

const close = (got: number | undefined, want: number) => expect(got).toBeCloseTo(want, 9);

describe.each(['ce', 'gl'] as const)('a shape repainted by a Transform (%s)', (lib) => {
  it('goes linearly from its paint to the Transform’s: width, opacities and the two colours', () => {
    // Stroke red, 2 wide, opaque, fill green and invisible → stroke blue, 8 wide at 40 %, fill
    // orange at 80 %: what the probe of both libraries animated.
    const { at } = scene(
      { style: { strokeWidth: 2, strokeOpacity: 1, fillOpacity: 0 }, fillColor: GREEN },
      [
        createTween(
          1,
          2,
          { color: BLUE, strokeWidth: 8, strokeOpacity: 0.4, fillOpacity: 0.8, fillColor: ORANGE },
          'linear',
        ),
      ],
      {},
      lib,
    );
    expect(at(0.5)).toEqual({ fill: null, stroke: { color: RED, opacity: 1, width: 2 } });
    const mid = at(2);
    close(mid.stroke!.width, 5);
    close(mid.stroke!.opacity, 0.7);
    expect(mid.stroke!.color).toBe('#800080');
    close(mid.fill!.opacity, 0.4);
    // An invisible fill has a colour all the same: it is mixed on the way (Manim's 0.5, 0.7667,
    // 0; the green lands a hair under 195.5 of 255).
    expect(mid.fill!.color).toBe('#80C300');
    const quarter = at(1.5);
    close(quarter.stroke!.width, 3.5);
    close(quarter.fill!.opacity, 0.2);
    const end = at(3.5);
    expect(end.stroke).toEqual({ color: BLUE, opacity: 0.4, width: 8 });
    expect(end.fill).toEqual({ color: ORANGE, opacity: 0.8 });
  });

  it('keeps what a Transform does not name, and chains from one Transform to the next', () => {
    const { at } = scene(
      { style: { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 0.5 } },
      [
        createTween(1, 1, { strokeWidth: 10 }, 'linear'),
        createTween(3, 1, { fillOpacity: 1 }, 'linear'),
        createTween(5, 1, { strokeOpacity: 0 }, 'linear'),
      ],
      {},
      lib,
    );
    // The fill follows the stroke's colour while the shape has no fill colour of its own.
    expect(at(0)).toEqual({
      fill: { color: RED, opacity: 0.5 },
      stroke: { color: RED, opacity: 1, width: 4 },
    });
    close(at(1.5).stroke!.width, 7);
    close(at(1.5).fill!.opacity, 0.5);
    close(at(2.5).stroke!.width, 10);
    close(at(3.5).fill!.opacity, 0.75);
    close(at(3.5).stroke!.width, 10);
    close(at(5.5).stroke!.opacity, 0.5);
    expect(at(7)).toEqual({ fill: { color: RED, opacity: 1 }, stroke: null });
  });

  it('interpolates the opacities with the clip’s in them, not the two apart', () => {
    // The clip fades from 1 to 0 while the fill goes from 0 to 1: Manim holds the products, 0
    // and 0, so nothing of the fill shows on the way (the two apart would show a quarter).
    const { at } = scene(
      { style: { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 0 } },
      [createTween(1, 2, { opacity: 0, fillOpacity: 1 }, 'linear')],
      {},
      lib,
    );
    const mid = at(2);
    expect(mid.fill).toBeNull();
    close(mid.stroke!.opacity, 0.5);
    // And the other way round: both rise, from 0.5 × 0.2 to 1 × 1.
    const rising = scene(
      { style: { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 0.2 } },
      [createTween(1, 2, { opacity: 1, fillOpacity: 1 }, 'linear')],
      { opacity: 0.5 },
      lib,
    );
    close(rising.at(0).fill!.opacity, 0.1);
    close(rising.at(2).fill!.opacity, 0.55);
    close(rising.at(2).stroke!.opacity, 0.75);
    close(rising.at(4).fill!.opacity, 1);
  });

  it('a stroke that changes colour takes a fill without a colour of its own along', () => {
    const style = { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 1 };
    const follows = scene({ style }, [createTween(1, 2, { color: BLUE }, 'linear')], {}, lib);
    expect(follows.at(2).fill!.color).toBe('#800080');
    expect(follows.at(2).stroke!.color).toBe('#800080');
    expect(follows.at(4).fill!.color).toBe(BLUE);
    // With one of its own, the fill stays as it is.
    const own = scene(
      { style, fillColor: ORANGE },
      [createTween(1, 2, { color: BLUE }, 'linear')],
      {},
      lib,
    );
    expect(own.at(2).fill!.color).toBe(ORANGE);
    expect(own.at(2).stroke!.color).toBe('#800080');
    // A Transform that gives it one: from the stroke's colour to it.
    const given = scene({ style }, [createTween(1, 2, { fillColor: ORANGE }, 'linear')], {}, lib);
    expect(given.at(0).fill!.color).toBe(RED);
    expect(given.at(2).fill!.color).toBe('#FF4400');
    expect(given.at(2).stroke!.color).toBe(RED);
    expect(given.at(4).fill!.color).toBe(ORANGE);
  });
});

describe('a shape with a fill colour of its own', () => {
  const style = { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 0.5 };

  it('is filled in it, at the clip’s opacity, with no Transform at all', () => {
    const { at } = scene({ style, fillColor: ORANGE }, [], { opacity: 0.5 });
    expect(at(1)).toEqual({
      fill: { color: ORANGE, opacity: 0.25 },
      stroke: { color: RED, opacity: 0.5, width: 4 },
    });
  });

  it('keeps it under the clip’s colour override, which is the stroke’s', () => {
    const { at } = scene({ style, fillColor: ORANGE }, [], { color: BLUE });
    expect(at(1).fill!.color).toBe(ORANGE);
    expect(at(1).stroke!.color).toBe(BLUE);
    const plain = scene({ style }, [], { color: BLUE });
    expect(plain.at(1).fill!.color).toBe(BLUE);
  });

  it('fills in it while it is drawn border then fill', () => {
    const { at } = scene({ style, fillColor: ORANGE }, [], {}, 'ce', {
      ...defaultIntro('draw_border_then_fill'),
      duration: 2,
      easing: 'linear',
    });
    // The first half traces the outline; the second fills, in the fill's colour.
    expect(at(0.5).fill).toBeNull();
    expect(at(1.5).fill!.color).toBe(ORANGE);
    expect(at(1.5).stroke!.color).toBe(RED);
  });
});

describe('what stays as it was', () => {
  it('a shape no Transform repaints is drawn with its render’s style at the clip’s opacity', () => {
    const { at } = scene({ style: { strokeWidth: 6, strokeOpacity: 0.5, fillOpacity: 0.3 } }, [
      createTween(1, 2, { opacity: 0.2 }, 'linear'),
    ]);
    close(at(2).fill!.opacity, 0.3 * 0.6);
    close(at(2).stroke!.opacity, 0.5 * 0.6);
    expect(at(2).stroke!.width).toBe(6);
  });

  it('a part transform that sets the opacity sets it over the paint’s own, as before', () => {
    const { at } = scene({ style: { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 0.5 } }, [
      createTween(0.5, 0.5, { strokeWidth: 8 }, 'linear'),
      createPartTransform(2, [0], { duration: 1, opacity: 0.2, easing: 'linear' }),
    ]);
    close(at(4).fill!.opacity, 0.5 * 0.2);
    close(at(4).stroke!.opacity, 0.2);
    expect(at(4).stroke!.width).toBe(8);
  });

  it('the state shown to the editor carries the paint of the nearer keyframe', () => {
    const { clip } = scene({}, [
      createTween(1, 2, { strokeWidth: 8, fillColor: ORANGE }, 'linear'),
    ]);
    expect(stateAt(clip, 0.5, 'ce')).not.toHaveProperty('strokeWidth');
    expect(stateAt(clip, 1.5, 'ce')).not.toHaveProperty('strokeWidth');
    expect(stateAt(clip, 2.5, 'ce')).toMatchObject({ strokeWidth: 8, fillColor: ORANGE });
    expect(stateAt(clip, 5, 'ce')).toMatchObject({ strokeWidth: 8, fillColor: ORANGE });
  });
});
