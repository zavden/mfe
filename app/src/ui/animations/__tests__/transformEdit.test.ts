// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClip, createPartTransform, createTween, type Clip } from '../../../model';
import {
  endStateTime,
  hasTransforms,
  partEditOf,
  partTurn,
  previewEdit,
  startStateTime,
} from '../transformEdit';

/** A clip on [1, 9] with a tween to x = 2 during [3, 4) and a pulse during [5, 6). */
function clipWithTweens(): Clip {
  return createClip('f', 't', 1, 9, {
    intro: { kind: 'none', duration: 0, easing: 'linear', lagRatio: null, shift: [0, 0], scale: 1 },
    actions: [
      { ...createTween(2, 1, { position: [2, 0] }), id: 'move' },
      { ...createTween(4, 1, { scale: 2 }, 'there_and_back'), id: 'pulse' },
    ],
  });
}

describe('transform edit', () => {
  it('places the start and end states of a tween', () => {
    const clip = clipWithTweens();
    const [move, pulse] = clip.actions;
    if (move?.kind !== 'tween' || pulse?.kind !== 'tween') throw new Error('tweens expected');
    expect([startStateTime(clip, move), endStateTime(clip, move)]).toEqual([3, 4]);
    // A pulse reaches its target half way.
    expect(endStateTime(clip, pulse)).toBe(5.5);
    expect(hasTransforms(clip)).toBe(true);
    expect(hasTransforms({ ...clip, actions: [] })).toBe(false);
  });

  it('places the states of a part transform, which does not lock the clip', () => {
    const part = { ...createPartTransform(2, [1], { duration: 1, shift: [1, 0] }), id: 'part' };
    const clip: Clip = { ...clipWithTweens(), actions: [part] };
    expect([startStateTime(clip, part), endStateTime(clip, part)]).toEqual([3, 4]);
    expect(hasTransforms(clip)).toBe(false);
    expect(partEditOf(clip, { clipId: clip.id, actionId: 'part', time: 4 })).toBe(part);
    expect(partEditOf(clip, { clipId: 'other', actionId: 'part', time: 4 })).toBeNull();
    expect(partEditOf(clipWithTweens(), { clipId: clip.id, actionId: 'move', time: 4 })).toBeNull();
    expect(partEditOf(clip, null)).toBeNull();
    // A part under edit never blocks the clip's own keyframe edits.
    expect(previewEdit(clip, 5, null, [])).toMatchObject({ ref: { kind: 'initial' } });
  });

  it('edits the initial state freely, and later keyframes only when unlocked', () => {
    const clip = clipWithTweens();
    expect(previewEdit(clip, 2, null, [])).toMatchObject({ ref: { kind: 'initial' } });
    expect(previewEdit(clip, 3.5, null, [])).toEqual({ blocked: true });
    expect(previewEdit(clip, 8, null, [])).toEqual({ blocked: true });
    expect(previewEdit(clip, 8, null, [clip.id])).toMatchObject({
      ref: { kind: 'action', actionId: 'move' },
    });
  });

  it('edits the target of the tween whose end state is edited, wherever the playhead is', () => {
    const clip = clipWithTweens();
    const editing = { clipId: clip.id, actionId: 'move', time: 4 };
    expect(previewEdit(clip, 4, editing, [])).toEqual({
      ref: { kind: 'action', actionId: 'move' },
      state: expect.objectContaining({ position: [2, 0] }),
    });
    // Another clip's edit does not unlock this one.
    expect(previewEdit(clip, 4, { ...editing, clipId: 'other' }, [])).toEqual({ blocked: true });
  });

  it('adds up how far a part has turned when it reaches its target, or says the glyphs differ', () => {
    const part = (
      id: string,
      start: number,
      glyphs: number[],
      rotation: number,
      easing?: 'there_and_back',
    ) => ({
      ...createPartTransform(start, glyphs, {
        duration: 0.5,
        rotation,
        ...(easing ? { easing } : {}),
      }),
      id,
    });
    const earlier = part('earlier', 0.5, [0, 1], 30);
    const pulse = part('pulse', 1, [0, 1], 90, 'there_and_back'); // comes back: nothing left
    const other = part('other', 1.5, [2], 10);
    const edited = part('edited', 2, [0, 1], 15);
    const later = part('later', 3, [0], 45); // after the edited block: not yet
    const clip: Clip = {
      ...clipWithTweens(),
      actions: [later, edited, other, pulse, earlier],
    };
    expect(partTurn(clip, edited)).toBe(45);
    // Glyph 2 turned once more before: the angles differ, unless only the others count.
    const mixed = { ...edited, glyphs: [0, 1, 2] };
    expect(partTurn({ ...clip, actions: [later, mixed, other, pulse, earlier] }, mixed)).toBeNull();
    expect(partTurn(clip, mixed, [0, 1])).toBe(45);
    expect(partTurn(clip, earlier)).toBe(30);
  });
});
