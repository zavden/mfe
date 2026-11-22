// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ClipId } from '../../../model';
import type { Drawable } from '../../../scene';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  fadeLocked,
  isPreviewLocked,
  previewEditableClips,
  previewLockedIds,
  reachable,
} from '../previewLock';

describe('clips locked in the preview', () => {
  it('are the clips that carry the mark, and no others', () => {
    const project = smallProject();
    const [first, second] = project.clips;
    expect(previewLockedIds(project).size).toBe(0);
    // No locked clip: the same empty set each time (what depends on it stays as it was).
    expect(previewLockedIds(project)).toBe(previewLockedIds(smallProject()));
    first!.previewLocked = true;
    second!.previewLocked = false;
    expect(isPreviewLocked(first!)).toBe(true);
    expect(isPreviewLocked(second!)).toBe(false);
    expect([...previewLockedIds(project)]).toEqual([first!.id]);
  });

  it('are out of reach of the pointer: their drawables are not hit', () => {
    const items = [{ clipId: 'a' as ClipId }, { clipId: 'b' as ClipId }, { clipId: 'a' as ClipId }];
    expect(reachable(items, new Set())).toBe(items);
    expect(reachable(items, new Set(['a' as ClipId]))).toEqual([{ clipId: 'b' }]);
  });

  it('are painted faded: their fill and stroke at the opacity asked for, of their own', () => {
    const drawable = (clipId: string, fill: number | null, stroke: number | null) =>
      ({
        key: `${clipId}:0`,
        clipId: clipId as ClipId,
        glyph: 0,
        fill: fill === null ? null : { color: '#ffffff', opacity: fill },
        stroke: stroke === null ? null : { color: '#58C4DD', opacity: stroke, width: 4 },
      }) as unknown as Drawable;
    const drawn = [drawable('a', 1, null), drawable('b', 0.5, 1), drawable('a', null, 0.5)];
    const locked = new Set(['a' as ClipId]);
    const faded = fadeLocked(drawn, locked, 0.4);
    expect(faded[0]!.fill).toEqual({ color: '#ffffff', opacity: 0.4 });
    expect(faded[0]!.stroke).toBeNull();
    expect(faded[2]!.stroke).toEqual({ color: '#58C4DD', opacity: 0.2, width: 4 });
    // The others are the same objects, and what was given is not changed.
    expect(faded[1]).toBe(drawn[1]);
    expect(drawn[0]!.fill!.opacity).toBe(1);
    // Nothing locked, or no fade: the same array.
    expect(fadeLocked(drawn, new Set(), 0.4)).toBe(drawn);
    expect(fadeLocked(drawn, locked, 1)).toBe(drawn);
  });

  it('are not what the preview may change, like the clips of a locked track', () => {
    const project = smallProject();
    const ids = project.clips.map((clip) => clip.id);
    expect(previewEditableClips(project, ids).map((clip) => clip.id)).toEqual(ids);
    project.clips[0]!.previewLocked = true;
    expect(previewEditableClips(project, ids).map((clip) => clip.id)).toEqual(ids.slice(1));
    // A locked track takes its clips out too, locked in the preview or not.
    const track = project.tracks.find((t) => t.id === project.clips[1]!.trackId)!;
    track.locked = true;
    const left = project.clips.filter((clip) => clip.trackId !== track.id && !clip.previewLocked);
    expect(previewEditableClips(project, ids)).toEqual(left);
  });
});
