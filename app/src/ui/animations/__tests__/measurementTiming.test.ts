import { describe, expect, it } from 'vitest';
import {
  actionConflicts,
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createMorph,
  createPartTransform,
  createRelation,
  createTween,
  type ClipAction,
} from '../../../model';
import {
  attachmentConsumer,
  noPhases,
  timingErrorsOf,
  timingScene,
  withActionTiming,
} from '../../../model/__tests__/timingFixtures';
import { loadProject, useProjectStore } from '../../../store/projectStore';
import { usePreferences } from '../../preferences';
import { addBlock, duplicateBlock, nudgeBlock, setBlockTiming } from '../blockActions';
import { blockConflicts, clampTiming, findBlockSlot } from '../blockRange';

describe('attachment measurement instants in block timing', () => {
  it.each([4.5, 3])(
    'a public nudge towards %s stops exactly before the target is busy or gone',
    (at) => {
      const fade = createDisappear(6, 'fade_out', [0]);
      const { project, clip } = timingScene([fade]);
      attachmentConsumer(project, clip);
      expect(timingErrorsOf(project)).toEqual([]);
      loadProject(project);
      nudgeBlock(clip.id, fade.id, (at - fade.start) * project.meta.fps);
      const after = useProjectStore.getState().project;
      expect(after.clips[0]!.actions[0]).toMatchObject({ start: 5, duration: 1 });
      expect(timingErrorsOf(after)).toEqual([]);
      nudgeBlock(clip.id, fade.id, -1);
      expect(useProjectStore.getState().project.clips[0]!.actions[0]!.start).toBe(5);
    },
  );

  it.each([
    ['Appear move', () => createAppear(2, 'write', [0]), [0], 'move', 4.5, 5.5, 4, 1],
    ['Appear duration', () => createAppear(2, 'write', [0]), [0], 'end', 2, 6, 2, 3],
    ['Appear start', () => createAppear(6, 'write', [0]), [0], 'start', 4.5, 7, 5, 2],
    ['Disappear start', () => createDisappear(6, 'fade_out', [0]), [0], 'start', 4.5, 7, 5, 2],
    [
      'Morph source',
      () => createMorph(6, { style: 'transform', pairs: [{ from: [0], to: [1], style: null }] }),
      [0],
      'move',
      3,
      4,
      5,
      1,
    ],
    [
      'Morph start',
      () => createMorph(6, { style: 'transform', pairs: [{ from: [0], to: [1], style: null }] }),
      [0],
      'start',
      4.5,
      7,
      5,
      2,
    ],
    [
      'Morph target',
      () => createMorph(2, { pairs: [{ from: [0], to: [1], style: null }] }),
      [1],
      'move',
      4.5,
      5.5,
      4,
      1,
    ],
    [
      'Morph duration',
      () => createMorph(2, { pairs: [{ from: [0], to: [1], style: null }] }),
      [1],
      'end',
      2,
      6,
      2,
      3,
    ],
  ] as const)(
    '%s respects exact measurement boundaries',
    (_name, make, glyphs, edit, start, end, expectedStart, expectedDuration) => {
      const action = make();
      const { project, clip } = timingScene([action]);
      attachmentConsumer(project, clip, 5, [...glyphs]);
      expect(timingErrorsOf(project)).toEqual([]);
      const timing = clampTiming(project, clip, action.id, { start, end }, edit);
      expect(timing).toEqual({ start: expectedStart, duration: expectedDuration });
      expect(timingErrorsOf(withActionTiming(project, clip, action.id, timing))).toEqual([]);
    },
  );

  it('includes every direct branch while keeping a descendant fixed after its own attachment', () => {
    const fade = createDisappear(8, 'fade_out', [0]);
    const { project, clip } = timingScene([fade]);
    const first = attachmentConsumer(project, clip, 5);
    attachmentConsumer(project, clip, 6);
    attachmentConsumer(project, first, 9);
    const timing = clampTiming(project, clip, fade.id, { start: 3, end: 4 }, 'move');
    expect(timing).toEqual({ start: 6, duration: 1 });
    expect(timingErrorsOf(withActionTiming(project, clip, fade.id, timing))).toEqual([]);
  });

  it('adds a Disappear at the nearest safe measurement boundary with its requested duration', () => {
    const { project, clip } = timingScene();
    attachmentConsumer(project, clip);
    loadProject(project);
    const result = addBlock(clip.id, { kind: 'disappear', anim: 'fade_out' }, 4.5);
    expect(result.ok).toBe(true);
    const after = useProjectStore.getState().project;
    expect(after.clips[0]!.actions[0]).toMatchObject({ start: 5, duration: 1 });
    expect(timingErrorsOf(after)).toEqual([]);
  });

  it('shortens a new Appear exactly to the attachment measurement when that is the nearest slot', () => {
    const { project, clip } = timingScene();
    attachmentConsumer(project, clip);
    loadProject(project);
    expect(addBlock(clip.id, { kind: 'appear', anim: 'write' }, 4.5).ok).toBe(true);
    const after = useProjectStore.getState().project;
    expect(after.clips[0]!.actions[0]).toMatchObject({ start: 4.5, duration: 0.5 });
    expect(timingErrorsOf(after)).toEqual([]);
  });

  it('finds the nearest full slot for a new incoming Morph', () => {
    const { project, clip } = timingScene();
    attachmentConsumer(project, clip, 5, [1]);
    const block = createMorph(0, { pairs: [{ from: [0], to: [1], style: null }] });
    const slot = findBlockSlot(project, clip, { block, at: 4.5 });
    expect(slot).toEqual({ start: 4, duration: 1 });
    const after = {
      ...project,
      clips: [{ ...clip, actions: [{ ...block, ...slot! }] }, ...project.clips.slice(1)],
    };
    expect(timingErrorsOf(after)).toEqual([]);
  });

  it('checks a new Morph after automatic suggestions have filled its pairs', () => {
    const { project, clip } = timingScene();
    attachmentConsumer(project, clip);
    const previous = usePreferences.getState().autoSuggestMorphPairs;
    try {
      usePreferences.getState().set({ autoSuggestMorphPairs: true });
      loadProject(project);
      const result = addBlock(clip.id, { kind: 'morph' }, 4.5);
      expect(result.ok).toBe(true);
      const after = useProjectStore.getState().project;
      expect(after.clips[0]!.actions[0]).toMatchObject({
        start: 4.5,
        duration: 0.5,
        pairs: [{ from: [0], to: [1], style: null }],
      });
      expect(timingErrorsOf(after)).toEqual([]);
    } finally {
      usePreferences.getState().set({ autoSuggestMorphPairs: previous });
    }
  });

  it('duplicates after a returning glyph without putting its attached consumer inside FadeOut', () => {
    const fade = createDisappear(1, 'fade_out', [0]);
    const back = createAppear(2, 'write', [0]);
    const { project, clip } = timingScene([fade, back]);
    attachmentConsumer(project, clip, 3.5);
    expect(timingErrorsOf(project)).toEqual([]);
    loadProject(project);
    const result = duplicateBlock(clip.id, fade.id);
    expect(result.ok).toBe(true);
    const after = useProjectStore.getState().project;
    const copy = after.clips[0]!.actions.find((a) => a.id === (result.ok && result.actionId));
    expect(copy).toMatchObject({ start: 3.5, duration: 1 });
    expect(timingErrorsOf(after)).toEqual([]);
  });

  it.each([
    () => createTween(6, 1, { position: [2, 0] }),
    () => createPartTransform(6, [0], { shift: [2, 0] }),
  ])('allows a moving target to be measured by an attachment', (make) => {
    const action = make();
    const { project, clip } = timingScene([action]);
    attachmentConsumer(project, clip);
    const timing = clampTiming(project, clip, action.id, { start: 4.5, end: 5.5 }, 'move');
    expect(timing).toEqual({ start: 4.5, duration: 1 });
    expect(timingErrorsOf(withActionTiming(project, clip, action.id, timing))).toEqual([]);
  });
});

describe.each(['morph', 'relation'] as const)('measuring effects alongside a %s', (origin) => {
  function scene(effect: 'circumscribe' | 'flash' | 'focus_on', include = true) {
    const emphasis = createEmphasis(4, effect, [0], { duration: 1 });
    const { project, clip } = timingScene(include ? [emphasis] : []);
    if (origin === 'morph') {
      clip.actions.push(createMorph(5, { pairs: [{ from: [0], to: [1], style: 'copy' }] }));
    } else {
      const other = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10, noPhases());
      project.clips.push(other);
      project.relations.push(
        createRelation(clip.id, other.id, {
          offset: 5,
          duration: 1,
          style: 'copy',
          pairs: [{ from: [0], to: [1], style: null }],
        }),
      );
    }
    return { project, clip, emphasis };
  }

  it.each(['circumscribe', 'flash', 'focus_on'] as const)(
    '%s allows nudge, duration, and Add routes before a later transfer',
    (effect) => {
      const { project, clip, emphasis } = scene(effect);
      expect(timingErrorsOf(project)).toEqual([]);
      const legal = withActionTiming(project, clip, emphasis.id, { start: 4.5, duration: 3 });
      expect(timingErrorsOf(legal)).toEqual([]);
      expect(blockConflicts(legal, legal.clips[0]!, emphasis.id)).toBeNull();
      for (const action of legal.clips[0]!.actions) {
        expect(actionConflicts(legal, legal.clips[0]!, action.id)).toBeNull();
      }
      loadProject(project);
      nudgeBlock(clip.id, emphasis.id, 1);
      expect(
        useProjectStore.getState().project.clips[0]!.actions.find((a) => a.id === emphasis.id)!
          .start,
      ).toBeCloseTo(4 + 1 / project.meta.fps, 6);
      const duration = clampTiming(project, clip, emphasis.id, { start: 4, end: 7 }, 'end');
      expect(duration).toEqual({ start: 4, duration: 3 });
      setBlockTiming(clip.id, emphasis.id, duration);
      expect(timingErrorsOf(useProjectStore.getState().project)).toEqual([]);

      const empty = scene(effect, false);
      loadProject(empty.project);
      expect(addBlock(empty.clip.id, { kind: 'emphasis', effect }, 4.5).ok).toBe(true);
      const after = useProjectStore.getState().project;
      expect(after.clips[0]!.actions.find((a) => a.kind === 'emphasis')).toMatchObject({
        start: 4.5,
        duration: effect === 'focus_on' ? 2 : 1,
      });
      expect(timingErrorsOf(after)).toEqual([]);
    },
  );

  it.each(['circumscribe', 'flash', 'focus_on'] as const)(
    '%s owns only its start instant, including both exact boundaries',
    (effect) => {
      const { project, clip, emphasis } = scene(effect);
      for (const start of [5, 6]) {
        const exact = withActionTiming(project, clip, emphasis.id, { start, duration: 2 });
        expect(timingErrorsOf(exact)).toEqual([]);
        expect(actionConflicts(exact, exact.clips[0]!, emphasis.id)).toBeNull();
      }
      const inside = withActionTiming(project, clip, emphasis.id, { start: 5.5, duration: 1 });
      expect(timingErrorsOf(inside).map((i) => i.code)).toEqual(['emphasis-target-busy']);
      expect(actionConflicts(inside, inside.clips[0]!, emphasis.id)).toMatchObject({
        kind: 'half-drawn',
      });
      expect(clampTiming(project, clip, emphasis.id, { start: 5.5, end: 6.5 }, 'move')).toEqual({
        start: 5,
        duration: 1,
      });
      const without = scene(effect, false);
      const block: ClipAction = { ...emphasis, duration: 2 };
      expect(findBlockSlot(without.project, without.clip, { block, at: 5.25 })).toEqual({
        start: 5,
        duration: 2,
      });
    },
  );

  it.each(['circumscribe', 'flash', 'focus_on'] as const)(
    '%s refuses to measure a target still arriving through the transfer',
    (effect) => {
      const { project, clip } = scene(effect, false);
      const receiver = origin === 'morph' ? clip : project.clips[1]!;
      const action = createEmphasis(5.5, effect, [1]);
      receiver.actions.push(action);
      expect(timingErrorsOf(project).map((i) => i.code)).toEqual(['emphasis-target-busy']);
      expect(actionConflicts(project, receiver, action.id)).toMatchObject({ kind: 'half-drawn' });
      for (const start of [5, 6]) {
        const exact = withActionTiming(project, receiver, action.id, { start, duration: 1 });
        expect(timingErrorsOf(exact)).toEqual([]);
        expect(
          actionConflicts(
            exact,
            exact.clips.find((c) => c.id === receiver.id)!,
            action.id,
          ),
        ).toBeNull();
      }
    },
  );
});
