// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lineTo, rectContour, type Box, type Contour } from '../../../geom';
import { createClip, createEmptyProject, createTween } from '../../../model';
import { createCanvasRenderer } from '../../../render';
import type { Drawable } from '../../../scene';
import type { Selection } from '../../../store';
import {
  clickSelection,
  clipBoxes,
  clipsOnScreen,
  draggedPosition,
  marqueeSelection,
  pickClip,
  pickGlyph,
  placementAt,
  sameSelection,
} from '../interaction';

const renderer = createCanvasRenderer();

const glyph = (clipId: string, index: number, box: Box, z = 0): Drawable => ({
  key: `${clipId}:${index}`,
  clipId,
  glyph: index,
  path: { contours: [rectContour(box)] },
  fill: { color: '#FFFFFF', opacity: 1 },
  stroke: null,
  role: 'object',
  partial: false,
  z,
});

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

// Clip a: two glyphs with a gap between them. Clip b overlaps it and is in front.
const drawables = [
  glyph('a', 0, box(-2, -0.5, -1, 0.5)),
  glyph('a', 1, box(1, -0.5, 2, 0.5)),
  glyph('b', 0, box(0.5, -1, 3, 1), 1),
];

describe('clipBoxes', () => {
  it('unions the glyph boxes of each clip', () => {
    const boxes = clipBoxes(drawables);
    expect([...boxes.keys()].sort()).toEqual(['a', 'b']);
    expect(boxes.get('a')!.box).toEqual(box(-2, -0.5, 2, 0.5));
    expect(boxes.get('b')!.z).toBe(1);
  });
});

describe('pickClip', () => {
  it('prefers the glyph under the point', () => {
    const hit = pickClip(renderer, drawables, [-1.5, 0]);
    expect(hit).toMatchObject({ clipId: 'a' });
    expect(hit?.drawable?.key).toBe('a:0');
  });

  it('takes the front-most clip where glyphs overlap', () => {
    expect(pickClip(renderer, drawables, [1.5, 0])?.clipId).toBe('b');
  });

  it('falls back to the clip box in the gap between glyphs', () => {
    const hit = pickClip(renderer, drawables, [-0.2, 0]);
    expect(hit).toEqual({ clipId: 'a', drawable: null });
  });

  it('is generous near thin glyphs and misses far-away points', () => {
    expect(pickClip(renderer, drawables, [-2.05, 0])?.clipId).toBe('a'); // within the padding
    expect(pickClip(renderer, drawables, [-2.5, 0])).toBeNull();
    expect(pickClip(renderer, drawables, [0, 5])).toBeNull();
    expect(pickClip(renderer, [], [0, 0])).toBeNull();
  });

  describe('around a hollow outline and an open stroke', () => {
    /** A stroked outline with nothing inside it: a box, as wide as `b`, in front (z 2). */
    const outline = (clipId: string, b: Box, z = 2): Drawable => ({
      ...glyph(clipId, 0, b, z),
      fill: null,
      stroke: { color: '#FFFF00', opacity: 1, width: 4 },
    });
    /** One straight stroke from a corner of `b` to the opposite one, in front (z 2). */
    const stroke = (clipId: string, b: Box, index = 0): Drawable => {
      const contour: Contour = [b.minX, b.minY];
      lineTo(contour, b.maxX, b.maxY);
      return {
        ...outline(clipId, b),
        key: `${clipId}:${index}`,
        glyph: index,
        path: { contours: [contour] },
      };
    };

    it('gives the gap between the glyphs of a formula to the formula, not to the box around it', () => {
      const boxed = [...drawables.slice(0, 2), outline('s', box(-2.2, -0.7, 2.2, 0.7))];
      // The gap between the two glyphs of `a`, inside the box that is in front of them.
      expect(pickClip(renderer, boxed, [-0.2, 0])).toEqual({ clipId: 'a', drawable: null });
      // On the box's own line it is the box, and so it is inside it where nothing else is.
      expect(pickClip(renderer, boxed, [-2.2, 0.2])?.clipId).toBe('s');
      expect(pickClip(renderer, boxed, [-0.2, 0.62])?.clipId).toBe('s');
    });

    it('takes the inside of a box that holds nothing', () => {
      expect(pickClip(renderer, [outline('s', box(-1, -1, 1, 1))], [0.3, 0.2])).toEqual({
        clipId: 's',
        drawable: null,
      });
    });

    it('hits an open stroke on its line alone: the box of a line is not the line', () => {
      const line = [stroke('l', box(-3, -2, 3, 2))];
      expect(pickClip(renderer, line, [1.5, 1])?.clipId).toBe('l'); // on the line
      expect(pickClip(renderer, line, [2.5, -1.5])).toBeNull(); // in its box, far from it
      // A filled tip beside it gives the arrow the tip's box, no more.
      const tip = glyph('l', 1, box(2.8, 1.8, 3.2, 2.2), 2);
      expect(pickClip(renderer, [...line, tip], [3.22, 1.78])?.clipId).toBe('l');
      expect(pickClip(renderer, [...line, tip], [2.5, -1.5])).toBeNull();
    });
  });

  it('with a reach (the circle selector), takes the clip of the glyph nearest within it', () => {
    // 0.4 left of clip a, outside its padded box: nothing without a reach, a with one.
    expect(pickClip(renderer, drawables, [-2.4, 0])).toBeNull();
    const near = pickClip(renderer, drawables, [-2.4, 0], { reach: 0.5 });
    expect(near).toMatchObject({ clipId: 'a' });
    expect(near?.drawable?.key).toBe('a:0');
    // Out of reach, nothing; the ink under the point still comes first.
    expect(pickClip(renderer, drawables, [-2.4, 0], { reach: 0.3 })).toBeNull();
    expect(pickClip(renderer, drawables, [1.5, 0], { reach: 0.5 })?.drawable?.key).toBe('b:0');
    // In the gap of clip a, the nearest glyph within reach is its own first one…
    expect(pickClip(renderer, drawables, [-0.6, 0], { reach: 0.5 })?.drawable?.key).toBe('a:0');
    // …and with none in reach, the clip's box still counts, as without the circle.
    expect(pickClip(renderer, drawables, [-0.2, 0], { reach: 0.1 })).toEqual({
      clipId: 'a',
      drawable: null,
    });
    // A glyph of another clip within reach wins over the box the point is in.
    expect(pickClip(renderer, drawables, [0.2, 0], { reach: 0.4 })?.drawable?.key).toBe('b:0');
  });

  it('hits a stroked line on its stroke, with the slack the preview adds', () => {
    const line: Contour = [-3, 2];
    lineTo(line, 3, 2);
    const stroked: Drawable = {
      ...glyph('c', 0, box(-3, 2, 3, 2), 2),
      path: { contours: [line] },
      fill: null,
      stroke: { color: '#FFFFFF', opacity: 1, width: 4 },
    };
    const all = [...drawables, stroked];
    expect(pickClip(renderer, all, [0, 2.015])).toMatchObject({ clipId: 'c' });
    expect(pickClip(renderer, all, [0, 2.05])?.drawable).toBeNull(); // the padded box only
    expect(pickClip(renderer, all, [0, 2.05], { slack: 0.04 })?.drawable?.key).toBe('c:0');
    expect(pickGlyph(renderer, all, [0, 2.05], 0, 0.04)?.key).toBe('c:0');
  });
});

describe('clickSelection', () => {
  const none: Selection = { kind: 'none' };
  const clips = (...ids: string[]): Selection => ({ kind: 'clips', ids });

  it('a plain click selects the clip alone, unless it is already selected', () => {
    expect(clickSelection(none, 'a', false)).toEqual(clips('a'));
    expect(clickSelection(clips('b'), 'a', false)).toEqual(clips('a'));
    const both = clips('a', 'b');
    expect(clickSelection(both, 'a', false)).toBe(both);
    const block: Selection = { kind: 'action', clipId: 'a', actionId: 'x' };
    expect(clickSelection(block, 'a', false)).toBe(block);
    expect(clickSelection(block, 'b', false)).toEqual(clips('b'));
  });

  it('a modifier click adds the clip to the highlighted ones or takes it out', () => {
    expect(clickSelection(none, 'a', true)).toEqual(clips('a'));
    expect(clickSelection(clips('a'), 'b', true)).toEqual(clips('a', 'b'));
    expect(clickSelection(clips('a', 'b'), 'a', true)).toEqual(clips('b'));
    expect(clickSelection(clips('a'), 'a', true)).toEqual(none);
    const block: Selection = { kind: 'action', clipId: 'a', actionId: 'x' };
    expect(clickSelection(block, 'b', true)).toEqual(clips('a', 'b'));
    const formula: Selection = { kind: 'formula', id: 'f' };
    expect(clickSelection(formula, 'a', true)).toEqual(clips('a'));
  });
});

describe('clipsOnScreen', () => {
  const project = createEmptyProject();
  project.tracks = [
    { id: 't_shown', kind: 'visual', name: 'A', hidden: false, muted: false, locked: false },
    { id: 't_hidden', kind: 'visual', name: 'B', hidden: true, muted: false, locked: false },
  ];
  project.clips = [
    { ...createClip('f', 't_shown', 0, 2), id: 'early' },
    { ...createClip('f', 't_shown', 1, 3), id: 'late' },
    { ...createClip('f', 't_hidden', 0, 3), id: 'hidden' },
  ];

  it('lists the clips the playhead is inside, on shown tracks, in project order', () => {
    expect(clipsOnScreen(project, 0)).toEqual(['early']);
    expect(clipsOnScreen(project, 1.5)).toEqual(['early', 'late']);
    expect(clipsOnScreen(project, 2)).toEqual(['late']); // a clip ends at its end
  });

  it('lists a clip ending at the scene end at t = duration, as the evaluator draws it', () => {
    expect(clipsOnScreen(project, 3)).toEqual(['late']); // the scene lasts 3 s
    const longer = { ...project, meta: { ...project.meta, duration: 5 } };
    expect(clipsOnScreen(longer, 3)).toEqual([]);
    expect(clipsOnScreen(longer, 5)).toEqual([]);
  });
});

describe('draggedPosition', () => {
  it('moves the keyframe by the pointer travel in scene units', () => {
    expect(draggedPosition([1, 2], [0, 0], [0.5, -1])).toEqual([1.5, 1]);
    expect(draggedPosition([-3, 0], [2, 2], [2, 2])).toEqual([-3, 0]);
  });
});

describe('placementAt', () => {
  // A 4 s clip from 1 s to 5 s with a linear tween over [2, 4): position → (2, 0), scale → 2,
  // rotation → 90, flipped horizontally.
  const clip = createClip('f', 't', 1, 5, {
    actions: [
      createTween(1, 2, { position: [2, 0], scale: 2, rotation: 90, flipX: true }, 'linear'),
    ],
  });

  it('is the initial state before the tween and the target after it', () => {
    expect(placementAt(clip, 1.5, 'ce')).toMatchObject({ position: [0, 0], scale: 1, rotation: 0 });
    expect(placementAt(clip, 4, 'ce')).toMatchObject({
      position: [2, 0],
      scale: 2,
      rotation: 90,
      flipX: true,
    });
  });

  it('blends position, scale and rotation with the eased alpha while the tween runs', () => {
    const half = placementAt(clip, 3, 'ce');
    expect(half.position[0]).toBeCloseTo(1);
    expect(half.scale).toBeCloseTo(1.5);
    expect(half.rotation).toBeCloseTo(45);
    expect(placementAt(clip, 2.5, 'ce').rotation).toBeCloseTo(22.5);
  });

  it('flips at the middle of the tween', () => {
    expect(placementAt(clip, 2.9, 'ce').flipX).toBe(false);
    expect(placementAt(clip, 3.1, 'ce').flipX).toBe(true);
  });

  it('chains tweens from the state the previous one ended in', () => {
    const chained = createClip('f', 't', 0, 10, {
      actions: [
        createTween(0, 1, { rotation: 30 }, 'linear'),
        createTween(2, 2, { rotation: 90 }, 'linear'),
      ],
    });
    expect(placementAt(chained, 1.5, 'ce').rotation).toBe(30);
    expect(placementAt(chained, 3, 'ce').rotation).toBeCloseTo(60);
  });
});

describe('marqueeSelection', () => {
  const none: Selection = { kind: 'none' };
  it('selects the clips the rectangle touches, or nothing', () => {
    expect(marqueeSelection(none, ['a', 'b'])).toEqual({ kind: 'clips', ids: ['a', 'b'] });
    expect(marqueeSelection({ kind: 'clips', ids: ['a'] }, [])).toEqual(none);
  });
  it('keeps the selection from before when the clips are exactly the ones it highlighted', () => {
    const block: Selection = { kind: 'action', clipId: 'a', actionId: 'x' };
    expect(marqueeSelection(block, ['a'])).toBe(block);
    const clips: Selection = { kind: 'clips', ids: ['a', 'b'] };
    expect(marqueeSelection(clips, ['a', 'b'])).toBe(clips);
    expect(marqueeSelection(clips, ['b', 'a'])).toEqual({ kind: 'clips', ids: ['b', 'a'] });
    expect(marqueeSelection(none, [])).toBe(none);
  });
});

describe('sameSelection', () => {
  it('compares by kind and by what is named', () => {
    expect(sameSelection({ kind: 'none' }, { kind: 'none' })).toBe(true);
    expect(sameSelection({ kind: 'clips', ids: ['a'] }, { kind: 'clips', ids: ['a'] })).toBe(true);
    expect(sameSelection({ kind: 'clips', ids: ['a'] }, { kind: 'clips', ids: ['a', 'b'] })).toBe(
      false,
    );
    expect(sameSelection({ kind: 'clips', ids: ['a'] }, { kind: 'formulas', ids: ['a'] })).toBe(
      false,
    );
    expect(sameSelection({ kind: 'formula', id: 'f' }, { kind: 'formula', id: 'f' })).toBe(true);
    expect(sameSelection({ kind: 'cameraMove', id: 'n' }, { kind: 'cameraMove', id: 'n' })).toBe(
      true,
    );
    expect(sameSelection({ kind: 'cameraMove', id: 'n' }, { kind: 'cameraMove', id: 'm' })).toBe(
      false,
    );
    expect(sameSelection({ kind: 'cameraMove', id: 'n' }, { kind: 'targetCamera', id: 'n' })).toBe(
      false,
    );
    expect(
      sameSelection({ kind: 'targetCamera', id: 'k' }, { kind: 'targetCamera', id: 'k' }),
    ).toBe(true);
    expect(sameSelection({ kind: 'camera' }, { kind: 'camera' })).toBe(true);
    expect(sameSelection({ kind: 'relation', id: 'r' }, { kind: 'relation', id: 's' })).toBe(false);
    expect(
      sameSelection(
        { kind: 'action', clipId: 'a', actionId: 'x' },
        { kind: 'action', clipId: 'a', actionId: 'y' },
      ),
    ).toBe(false);
  });
});

describe('pickGlyph', () => {
  // An "=" (one glyph, two bars with a gap between them) and a solid square of another clip.
  const equals: Drawable = {
    ...glyph('a', 0, box(0, 0.4, 1, 0.5)),
    path: { contours: [rectContour(box(0, 0.4, 1, 0.5)), rectContour(box(0, 0, 1, 0.1))] },
  };
  const glyphs = [equals, glyph('b', 2, box(3, 0, 4, 1))];
  it('takes the inked glyph first, else the nearest box within reach', () => {
    expect(pickGlyph(renderer, glyphs, [0.5, 0.45], 0.1)?.glyph).toBe(0); // on the upper bar
    expect(pickGlyph(renderer, glyphs, [0.5, 0.25], 0.1)?.glyph).toBe(0); // in the gap of the "="
    expect(pickGlyph(renderer, glyphs, [3.5, 0.5], 0.1)?.glyph).toBe(2);
    expect(pickGlyph(renderer, glyphs, [0.5, 0.6], 0.2)?.glyph).toBe(0); // 0.1 above the "="
    expect(pickGlyph(renderer, glyphs, [0.5, 0.6], 0.05)).toBeNull(); // out of reach
    expect(pickGlyph(renderer, glyphs, [2, 0.5], 0.5)).toBeNull(); // 1 from both
    expect(pickGlyph(renderer, glyphs, [2.2, 0.5], 1)?.glyph).toBe(2); // the nearer one
    expect(pickGlyph(renderer, glyphs, [1.03, 0.25], 0.04)?.glyph).toBe(0);
  });
});
