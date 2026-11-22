// @vitest-environment node
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAudioClip, createAudioTrack, sceneDuration } from '../../model';
import { smallProject } from '../../model/__tests__/fixtures';
import { createVisualProjectSelector } from '../visualProject';

function scene() {
  const project = smallProject();
  const track = createAudioTrack('Voice');
  project.tracks.unshift(track);
  project.audioClips.push(createAudioClip('asset', track.id, 0, 20));
  return project;
}

describe('visual project selector', () => {
  it('keeps preview geometry stable through gain edits, mute and audio row reordering', () => {
    const original = scene();
    const select = createVisualProjectSelector(true);
    const first = select({ project: original });
    expect(sceneDuration(first)).toBe(20);
    expect(first.audioClips).toEqual([]);
    const edited = produce(original, (draft) => {
      draft.audioClips[0]!.volume = [{ id: 'point', time: 2, gain: 0.5 }];
      const track = draft.tracks.shift()!;
      if (track.kind === 'audio') track.muted = true;
      draft.tracks.push(track);
    });
    expect(select({ project: edited })).toBe(first);
    expect(select({ project: edited })).toBe(first);
    expect(original.meta.duration).toBeNull();
  });

  it('invalidates preview when audio duration changes but leaves Python geometry stable', () => {
    const original = scene();
    const preview = createVisualProjectSelector(true);
    const native = createVisualProjectSelector();
    const firstPreview = preview({ project: original });
    const firstNative = native({ project: original });
    const longer = produce(original, (draft) => {
      draft.audioClips[0]!.end = 25;
    });
    expect(preview({ project: longer })).not.toBe(firstPreview);
    expect(sceneDuration(preview({ project: longer }))).toBe(25);
    expect(native({ project: longer })).toBe(firstNative);
    expect(sceneDuration(firstNative)).toBe(6);
  });

  it('invalidates visual edits, metadata and visual order, and preserves a fixed duration', () => {
    const original = scene();
    original.meta.duration = 10;
    const select = createVisualProjectSelector(true);
    const first = select({ project: original });
    const audio = produce(original, (draft) => {
      draft.audioClips[0]!.end = 25;
    });
    expect(select({ project: audio })).toBe(first);
    const visual = produce(audio, (draft) => {
      draft.clips[0]!.initial.scale = 2;
    });
    expect(select({ project: visual })).not.toBe(first);
    expect(select({ project: visual }).meta).toBe(original.meta);
    const reordered = produce(visual, (draft) => {
      draft.tracks.reverse();
    });
    expect(select({ project: reordered }).tracks.map((track) => track.id)).toEqual(
      original.tracks
        .filter((track) => track.kind === 'visual')
        .reverse()
        .map((track) => track.id),
    );
  });
});
