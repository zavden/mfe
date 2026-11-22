// @vitest-environment node
/* Part states (scene/anim/part.ts): what a transform block leaves on its glyphs, how they move
 * while it runs, and how a later tween of the whole formula takes colours over. */
import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  boxCenter,
  contoursBox,
  rectContour,
  transformContour,
  type Contour,
  type Mat2D,
} from '../../geom';
import { createFormula, createTween, type Easing } from '../../model';
import { rateFunction } from '../easing';
import { buildPartSegments, partStateAt, PLAIN_PART, type PartSegment } from '../anim/part';
import { staticPose } from '../anim/pose';
import { placementMatrix } from '../placement';
import type { PartTransformEvent, TweenEvent } from '../types';

const formula = createFormula({ name: 'f', source: 'ab', color: '#FFFFFF' });
// Glyph 0 is a 1×1 square centred on (−1, 0); glyph 1 one centred on (1, 0).
const local = new Map<number, readonly Contour[]>([
  [0, [rectContour({ minX: -1.5, minY: -0.5, maxX: -0.5, maxY: 0.5 })]],
  [1, [rectContour({ minX: 0.5, minY: -0.5, maxX: 1.5, maxY: 0.5 })]],
]);
const initial = {
  position: [0, 0] as [number, number],
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  color: null,
  glyphColors: {},
};

function event(fields: Partial<PartTransformEvent> & { id: string }): PartTransformEvent {
  return {
    kind: 'transform',
    start: 1,
    end: 2,
    easing: 'linear',
    clipId: 'c',
    actionId: fields.id,
    glyphs: [1],
    shift: [0, 0],
    scale: 1,
    rotation: 0,
    color: null,
    opacity: null,
    ...fields,
  };
}

function segments(
  events: PartTransformEvent[],
  tweens: TweenEvent[] = [],
  state = initial,
  gone?: (glyph: number, time: number) => boolean,
): Map<number, PartSegment[]> {
  return buildPartSegments({
    events,
    local,
    tweens,
    formula,
    target: 'ce',
    poseAt: () => staticPose(state, formula),
    rateOf: (easing: Easing) => rateFunction(easing, 'ce'),
    gone,
  });
}

/** Scene box of glyph `g` under the clip placement and its part matrix. */
function sceneBox(g: number, placement: Mat2D, part: Mat2D) {
  const m: Mat2D = [
    placement[0] * part[0] + placement[2] * part[1],
    placement[1] * part[0] + placement[3] * part[1],
    placement[0] * part[2] + placement[2] * part[3],
    placement[1] * part[2] + placement[3] * part[3],
    placement[0] * part[4] + placement[2] * part[5] + placement[4],
    placement[1] * part[4] + placement[3] * part[5] + placement[5],
  ];
  return contoursBox(local.get(g)!.map((c) => transformContour(m, c)));
}

const r = (v: number) => +v.toFixed(6) + 0;
const near = (box: { minX: number; minY: number; maxX: number; maxY: number }, want: number[]) => {
  expect([box.minX, box.minY, box.maxX, box.maxY].map(r)).toEqual(want.map(r));
};

describe('part states', () => {
  it('shifts, scales and rotates about the centre of the glyphs, relative to where they are', () => {
    const segs = segments([
      event({ id: 'a', glyphs: [1], shift: [1, 0.5], scale: 2 }),
      event({ id: 'b', start: 3, end: 4, glyphs: [1], rotation: 90 }),
    ]);
    const id = placementMatrix(initial);
    expect(partStateAt(segs.get(0), 1.5)).toBe(PLAIN_PART);
    expect(partStateAt(segs.get(1), 0.5)).toBe(PLAIN_PART);
    // Half way (linear): scale 1.5 about (1, 0), shifted by (0.5, 0.25).
    const mid = partStateAt(segs.get(1), 1.5);
    expect(mid.key).toBe('');
    near(sceneBox(1, id, mid.matrix), [0.75, -0.5, 2.25, 1]);
    // Settled: scale 2 about (1, 0), shifted by (1, 0.5): x 1…3, y −0.5…1.5.
    const after = partStateAt(segs.get(1), 2.5);
    expect(after.key).toBe('a:1');
    near(sceneBox(1, id, after.matrix), [1, -0.5, 3, 1.5]);
    // The rotation turns about the centre the glyph has then, (2, 0.5): half way it is a true
    // 45° rotation of the 2×2 square (a diamond of half-diagonal √2), not a cut across.
    const turning = partStateAt(segs.get(1), 3.5);
    near(sceneBox(1, id, turning.matrix), [
      2 - Math.SQRT2,
      0.5 - Math.SQRT2,
      2 + Math.SQRT2,
      0.5 + Math.SQRT2,
    ]);
    near(sceneBox(1, id, partStateAt(segs.get(1), 4).matrix), [1, -0.5, 3, 1.5]);
    expect(partStateAt(segs.get(1), 4).key).toBe('b:1');
  });

  it('works in screen axes and about the scene centre even when the formula is placed', () => {
    const state = { ...initial, position: [3, 1] as [number, number], scale: 2, rotation: 90 };
    const placement = placementMatrix(state);
    const segs = segments(
      [event({ id: 'a', glyphs: [0, 1], shift: [1, 0], scale: 0.5 })],
      [],
      state,
    );
    const after = partStateAt(segs.get(0), 2);
    // Both glyphs form a 6×2 box (rotated: 2 wide, 6 tall) centred on (3, 1); each glyph's box
    // halves towards that centre, then moves right by 1.
    const box0 = sceneBox(0, placement, after.matrix);
    const centre0 = boxCenter(
      contoursBox(local.get(0)!.map((c) => transformContour(placement, c))),
    );
    const want0 = applyToPoint([0.5, 0, 0, 0.5, 1.5 + 1, 0.5], centre0);
    expect(boxCenter(box0).map(r)).toEqual(want0.map(r));
    expect(+(box0.maxX - box0.minX).toFixed(6)).toBe(1);
  });

  it('eases with the block, settles at rate(1) and comes back for there_and_back', () => {
    const segs = segments([
      event({ id: 'a', glyphs: [1], shift: [2, 0], easing: 'smooth' }),
      event({ id: 'b', start: 3, end: 4, glyphs: [1], shift: [0, 2], easing: 'there_and_back' }),
    ]);
    const smooth = rateFunction('smooth', 'ce');
    const id = placementMatrix(initial);
    const t = 1.3;
    near(sceneBox(1, id, partStateAt(segs.get(1), t).matrix), [
      0.5 + 2 * smooth(0.3),
      -0.5,
      1.5 + 2 * smooth(0.3),
      0.5,
    ]);
    // there_and_back: up by 2 at its middle, back where it was afterwards.
    near(sceneBox(1, id, partStateAt(segs.get(1), 3.5).matrix), [2.5, 1.5, 3.5, 2.5]);
    near(sceneBox(1, id, partStateAt(segs.get(1), 4.5).matrix), [2.5, -0.5, 3.5, 0.5]);
  });

  it('recolours and fades, keeping the override until a tween changes that glyph', () => {
    const tween: TweenEvent = {
      kind: 'tween',
      id: 'tween:t',
      start: 3,
      end: 4,
      easing: 'linear',
      clipId: 'c',
      actionId: 't',
      from: initial,
      to: { ...initial, glyphColors: { '1': '#00FF00' } },
    };
    const segs = segments(
      [event({ id: 'a', glyphs: [0, 1], color: '#FF0000', opacity: 0.5 })],
      [tween],
    );
    const mid = partStateAt(segs.get(1), 1.5);
    expect(mid.color).toBe('#FF8080');
    expect(mid.opacity).toBe(0.75);
    const after = partStateAt(segs.get(1), 2.5);
    expect(after).toMatchObject({ color: '#FF0000', opacity: 0.5 });
    // The tween recolours glyph 1 (not glyph 0): its colour override ends there, the opacity stays.
    const later = partStateAt(segs.get(1), 3.5);
    expect(later).toMatchObject({ color: null, opacity: 0.5 });
    expect(later.key).toBe('a:1|c');
    expect(partStateAt(segs.get(0), 3.5)).toMatchObject({ color: '#FF0000', opacity: 0.5 });
    // A second block that changes nothing keeps the overrides; one with a colour lerps from it.
    const more = segments([
      event({ id: 'a', glyphs: [1], color: '#FF0000' }),
      event({ id: 'b', start: 3, end: 4, glyphs: [1], shift: [1, 0] }),
      event({ id: 'c', start: 5, end: 6, glyphs: [1], color: '#0000FF' }),
    ]);
    expect(partStateAt(more.get(1), 3.5).color).toBe('#FF0000');
    expect(partStateAt(more.get(1), 4.5).color).toBe('#FF0000');
    expect(partStateAt(more.get(1), 5.5).color).toBe('#800080');
  });

  it('ignores glyphs it cannot draw and tweens that end before it', () => {
    const tween = createTween(0, 0.5, { scale: 2 });
    void tween;
    const segs = segments([event({ id: 'a', glyphs: [1, 7] })]);
    expect([...segs.keys()]).toEqual([1]);
  });

  it('pivots on the glyphs still in the formula; a collapsed formula cannot be moved', () => {
    // Glyph 0 has left for good: glyph 1 scales about its own centre (1, 0), not the pair's (0, 0).
    const segs = segments(
      [event({ id: 'a', glyphs: [0, 1], scale: 2 })],
      [],
      initial,
      (g) => g === 0,
    );
    near(sceneBox(1, placementMatrix(initial), partStateAt(segs.get(1), 2).matrix), [0, -1, 2, 1]);
    // A clip scaled to 0 has no inverse placement: the part stays as it was, never NaN.
    const flat = { ...initial, scale: 0 };
    const still = segments([event({ id: 'a', glyphs: [1], shift: [1, 0] })], [], flat);
    expect(partStateAt(still.get(1), 1.5).matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(partStateAt(still.get(1), 3).matrix.every(Number.isFinite)).toBe(true);
  });
});
