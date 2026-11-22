// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClip, createTween } from '../../model';
import { placementAt, stateAt } from '../state';

/* `stateAt`: the whole clip state as shown at a time — the finished tweens' result, or a blend of
 * a running one; `placementAt` is its placement. */

function clip() {
  const c = createClip('f', 't', 0, 10);
  c.initial = {
    ...c.initial,
    position: [0, 0],
    scale: 1,
    opacity: 1,
    color: null,
    glyphColors: { '0': '#FF0000' },
  };
  c.actions.push(
    createTween(
      2,
      2,
      {
        position: [4, 0],
        scale: 2,
        rotation: 90,
        flipX: true,
        opacity: 0,
        color: '#00FF00',
        glyphColors: { '1': '#0000FF' },
      },
      'linear',
    ),
  );
  return c;
}

describe('stateAt', () => {
  it('is the initial state before the tween and its result after', () => {
    const c = clip();
    expect(stateAt(c, 1, 'ce')).toBe(c.initial);
    expect(stateAt(c, 5, 'ce')).toEqual({
      position: [4, 0],
      scale: 2,
      rotation: 90,
      flipX: true,
      flipY: false,
      opacity: 0,
      color: '#00FF00',
      glyphColors: { '0': '#FF0000', '1': '#0000FF' }, // a tween's glyph colours merge
    });
  });

  it('blends the numbers of a running tween and takes the rest from the nearer keyframe', () => {
    const c = clip();
    expect(stateAt(c, 2.5, 'ce')).toEqual({
      position: [1, 0],
      scale: 1.25,
      rotation: 22.5,
      flipX: false,
      flipY: false,
      opacity: 0.75,
      color: null,
      glyphColors: { '0': '#FF0000' },
    });
    expect(stateAt(c, 3.5, 'ce')).toEqual({
      position: [3, 0],
      scale: 1.75,
      rotation: 67.5,
      flipX: true,
      flipY: false,
      opacity: 0.25,
      color: '#00FF00',
      glyphColors: { '0': '#FF0000', '1': '#0000FF' },
    });
  });

  it('gives placementAt its placement', () => {
    const c = clip();
    expect(placementAt(c, 2.5, 'ce')).toEqual({
      position: [1, 0],
      scale: 1.25,
      rotation: 22.5,
      flipX: false,
      flipY: false,
    });
    expect(placementAt(c, 1, 'ce')).toEqual({
      position: [0, 0],
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
    });
  });
});
