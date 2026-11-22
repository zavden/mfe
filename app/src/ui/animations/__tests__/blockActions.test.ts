import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createLineFormula,
  createMorph,
  createPartTransform,
  defaultIntro,
  defaultOutro,
  setIdGenerator,
  validateProject,
  type ClipAction,
  type GlyphPair,
  type LineKind,
  type MorphAction,
  type Project,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { defaultPreferences, PREFERENCES_STORAGE_KEY, usePreferences } from '../../preferences';
import { useNoticeStore } from '../../project/noticeStore';
import {
  addBlock,
  changeBlockAnimation,
  changeBlockKind,
  changeEmphasisEffect,
  duplicateBlock,
  duplicateBlockForOthers,
  duplicateGroup,
  nudgeBlock,
  setBlockGlyphs,
  splitBlock,
  splitBlockIntoRuns,
} from '../blockActions';
import { derivationScene, oneClipScene } from './fixtures';

/* The store-facing side of a new Morph block: the "Suggest morph pairs" preference decides
 * whether it comes with the pairs Suggest proposes, as part of the one undo step that adds it. */

const pair = (from: number, to: number): GlyphPair => ({ from: [from], to: [to], style: null });

function load() {
  const scene = derivationScene();
  loadProject(scene.project);
  return scene;
}

function morphOf(clipId: string, actionId: string): MorphAction {
  const clip = useProjectStore.getState().project.clips.find((c) => c.id === clipId)!;
  const action = clip.actions.find((a) => a.id === actionId);
  if (action?.kind !== 'morph') throw new Error(`no Morph block ${actionId}`);
  return action;
}

beforeEach(() => {
  window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  usePreferences.setState(defaultPreferences());
});

afterEach(() => {
  useUiStore.setState({ selection: { kind: 'none' } });
  loadProject(createEmptyProject());
});

describe('addBlock at the playhead (D171)', () => {
  it('reports a block that could not start at the playhead, and only for the playhead', () => {
    const { clip } = load(); // 0–10 s, written over the first second
    useNoticeStore.getState().clear();
    const moved = addBlock(clip.id, { kind: 'tween' }, 0.4, { atPlayhead: true });
    if (!moved.ok) throw new Error(moved.reason);
    expect(useNoticeStore.getState().notices.map((n) => [n.kind, n.title, n.message])).toEqual([
      [
        'info',
        'No room at the playhead',
        'The Transform block starts at 1.00 s, not at the playhead (0.40 s): a keyframe stays between the end of the intro and the start of the outro.',
      ],
    ]);
    // Asked for at a clicked time, it moves without a word, as before; at the playhead with room
    // there, it starts there and nothing is said.
    useNoticeStore.getState().clear();
    expect(addBlock(clip.id, { kind: 'tween' }, 0.4).ok).toBe(true);
    expect(addBlock(clip.id, { kind: 'tween' }, 5, { atPlayhead: true }).ok).toBe(true);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });
});

describe('addBlock and the "Suggest morph pairs" preference', () => {
  it('says so when the preference finds no pairs where the block lands', () => {
    const { clip } = load();
    usePreferences.getState().set({ autoSuggestMorphPairs: true });
    useNoticeStore.getState().clear();
    // Both steps are in place: at 6 s every row has arrived and nothing is left to suggest.
    useProjectStore.getState().update((d) => {
      d.clips[0]!.actions.push(
        createMorph(2, { pairs: [pair(1, 4), pair(2, 5)] }),
        createMorph(4, { pairs: [pair(4, 7), pair(5, 8)] }),
      );
    });
    const outcome = addBlock(clip.id, { kind: 'morph' }, 6);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(morphOf(clip.id, outcome.actionId).pairs).toEqual([]);
    expect(useNoticeStore.getState().notices.map((n) => n.title)).toEqual(['No pairs suggested']);
    // With pairs found, no notice.
    useNoticeStore.getState().clear();
    useProjectStore.getState().update((d) => {
      d.clips[0]!.actions = [];
    });
    const first = addBlock(clip.id, { kind: 'morph' }, 2);
    expect(first.ok && morphOf(clip.id, first.actionId).pairs).toHaveLength(2);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });

  it('is off by default: a new Morph block has no pairs', () => {
    const { clip } = load();
    const outcome = addBlock(clip.id, { kind: 'morph' }, 2);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(morphOf(clip.id, outcome.actionId).pairs).toEqual([]);
  });

  it('on, the new block comes with the suggested pairs, in the one undo step that adds it', () => {
    const { clip } = load();
    usePreferences.getState().set({ autoSuggestMorphPairs: true });
    expect(history.canUndo()).toBe(false); // a preference is not a project edit
    const outcome = addBlock(clip.id, { kind: 'morph' }, 2);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(morphOf(clip.id, outcome.actionId)).toMatchObject({
      start: 2,
      pairs: [pair(1, 4), pair(2, 5)],
    });
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: clip.id,
      actionId: outcome.actionId,
    });
    history.undo();
    expect(useProjectStore.getState().project.clips[0]!.actions).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });

  it('never suggests for a copy of a block', () => {
    const { clip } = load();
    usePreferences.getState().set({ autoSuggestMorphPairs: true });
    const first = addBlock(clip.id, { kind: 'morph' }, 2);
    if (!first.ok) throw new Error(first.reason);
    const copy = duplicateBlock(clip.id, first.actionId);
    if (!copy.ok) throw new Error(copy.reason);
    expect(morphOf(clip.id, copy.actionId)).toMatchObject({ start: 3, pairs: [] });
  });

  it('leaves the other kinds of block as they were', () => {
    const { clip } = load();
    usePreferences.getState().set({ autoSuggestMorphPairs: true });
    const outcome = addBlock(clip.id, { kind: 'appear', anim: 'write' }, 3);
    if (!outcome.ok) throw new Error(outcome.reason);
    const action = useProjectStore
      .getState()
      .project.clips[0]!.actions.find((a) => a.id === outcome.actionId);
    expect(action).toMatchObject({ kind: 'appear', glyphs: 'all' });
    expect(action).not.toHaveProperty('pairs');
  });
});

describe('splitting a block', () => {
  /* Five glyphs in a row on a 0–10 s clip, with a Write of glyphs 0, 1, 3 and 4 at 2 s. */
  function loadSplitScene() {
    const block = createAppear(2, 'write', [0, 1, 3, 4], { lagRatio: 0.2 });
    const scene = oneClipScene({ glyphs: 5, start: 0, end: 10, actions: [block] });
    loadProject(scene.project);
    return { ...scene, block };
  }
  const actions = () => useProjectStore.getState().project.clips[0]!.actions;

  it('into runs: one block per run at the same time, the second selected, one undo step', () => {
    const { clip, block } = loadSplitScene();
    const outcome = splitBlockIntoRuns(clip.id, block.id);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(actions().map((a) => ({ id: a.id, glyphs: (a as { glyphs: unknown }).glyphs }))).toEqual(
      [
        { id: block.id, glyphs: [0, 1] },
        { id: outcome.actionId, glyphs: [3, 4] },
      ],
    );
    expect(actions()[1]).toMatchObject({ kind: 'appear', anim: 'write', start: 2, lagRatio: 0.2 });
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: clip.id,
      actionId: outcome.actionId,
    });
    history.undo();
    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({ id: block.id, glyphs: [0, 1, 3, 4] });
    expect(history.canUndo()).toBe(false);
  });

  it('by choice: the chosen glyphs go to the new block', () => {
    const { clip, block } = loadSplitScene();
    const outcome = splitBlock(clip.id, block.id, [4, 1]);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(actions()[0]).toMatchObject({ id: block.id, glyphs: [0, 3] });
    expect(actions()[1]).toMatchObject({ id: outcome.actionId, glyphs: [1, 4] });
  });

  it('is refused, with a reason, when there is nothing to split into or the track is locked', () => {
    const { clip, block } = loadSplitScene();
    expect(splitBlock(clip.id, block.id, [])).toMatchObject({ ok: false });
    expect(splitBlock(clip.id, block.id, [0, 1, 3, 4])).toMatchObject({ ok: false });
    useProjectStore.getState().update((d) => {
      d.clips[0]!.actions[0]!.start = 5;
      (d.clips[0]!.actions[0] as { glyphs: number[] }).glyphs = [1, 2, 3];
    });
    expect(splitBlockIntoRuns(clip.id, block.id)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('single run'),
    });
    useProjectStore.getState().update((d) => {
      d.tracks[0]!.locked = true;
    });
    expect(splitBlock(clip.id, block.id, [1])).toEqual({
      ok: false,
      reason: 'The track of this clip is locked.',
    });
    expect(actions()).toHaveLength(1);
  });
});

/* A command plans with the project it reads. Fired while a gesture of another is open — a key, or
 * a menu opened with Shift+F10, with the button still held on a clip's edge or on a block —, it
 * gives the gesture up before it reads: what it then does is what it does with no gesture. */
describe('the animation of a line’s block (audit S7-N1)', () => {
  /** An arrow (or a line of `kind`) over [0, 6) with an Appear, a Disappear and an Emphasis
   * block a line takes. */
  function lineBlocks(kind: LineKind = 'arrow') {
    const project = createEmptyProject();
    const line = createLineFormula({ name: 'l1', line: kind });
    project.formulas.push(line);
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const clip = createClip(line.id, project.tracks[0]!.id, 0, 6, none);
    const appear = createAppear(0.5, 'create', 'all');
    const disappear = createDisappear(4, 'uncreate', 'all');
    const emphasis = createEmphasis(2, 'circumscribe', 'all');
    clip.actions.push(appear, emphasis, disappear);
    project.clips.push(clip);
    loadProject(project);
    const block = (id: string) =>
      useProjectStore.getState().project.clips[0]!.actions.find((a) => a.id === id)!;
    return {
      clip: clip.id,
      appear: appear.id,
      disappear: disappear.id,
      emphasis: emphasis.id,
      block,
    };
  }
  const errors = () =>
    validateProject(useProjectStore.getState().project).filter((i) => i.severity === 'error');

  it('takes only what a line takes: no growing, shrinking, Indicate nor Wiggle', () => {
    const { clip, appear, disappear, emphasis, block } = lineBlocks();
    changeBlockAnimation(clip, appear, 'appear', 'grow_from_center');
    changeBlockAnimation(clip, appear, 'appear', 'draw_border_then_fill');
    changeBlockAnimation(clip, disappear, 'disappear', 'shrink_to_center');
    changeEmphasisEffect(clip, emphasis, 'indicate');
    changeEmphasisEffect(clip, emphasis, 'wiggle');
    expect(block(appear)).toMatchObject({ anim: 'create' });
    expect(block(disappear)).toMatchObject({ anim: 'uncreate' });
    expect(block(emphasis)).toMatchObject({ effect: 'circumscribe' });
    // What a line takes is changed; an arrow grows with GrowArrow.
    changeBlockAnimation(clip, appear, 'appear', 'grow_arrow');
    changeBlockAnimation(clip, disappear, 'disappear', 'fade_out');
    changeEmphasisEffect(clip, emphasis, 'flash');
    expect(block(appear)).toMatchObject({ anim: 'grow_arrow' });
    expect(block(disappear)).toMatchObject({ anim: 'fade_out' });
    expect(block(emphasis)).toMatchObject({ effect: 'flash' });
    expect(errors()).toEqual([]);
  });

  it('gives no GrowArrow to a line without a tip', () => {
    const { clip, appear, block } = lineBlocks('dashed');
    changeBlockAnimation(clip, appear, 'appear', 'grow_arrow');
    expect(block(appear)).toMatchObject({ anim: 'create' });
  });

  it('takes the whole arrow: no part of it as its glyphs, no split, no copy for others (audit A5-07)', () => {
    const { clip, appear, disappear, block } = lineBlocks('double_arrow');
    const steps = () => useProjectStore.temporal.getState().pastStates.length;
    const before = steps();
    // The shaft alone, or the shaft and one tip: nothing changes, nothing to undo.
    setBlockGlyphs(clip, appear, [0]);
    setBlockGlyphs(clip, disappear, [0, 2]);
    expect(block(appear)).toMatchObject({ glyphs: 'all' });
    expect(block(disappear)).toMatchObject({ glyphs: 'all' });
    expect(steps()).toBe(before);
    const reason =
      'A double arrow is animated whole, its shaft and its tips together, as Manim does: a block of it takes all its glyphs, and is not split or copied for other glyphs.';
    expect(splitBlockIntoRuns(clip, appear)).toEqual({ ok: false, reason });
    expect(splitBlock(clip, appear, [1])).toEqual({ ok: false, reason });
    expect(duplicateBlockForOthers(clip, appear)).toEqual({ ok: false, reason });
    expect(useProjectStore.getState().project.clips[0]!.actions).toHaveLength(3);
    // A block a file gave a part of it takes all of it again, or every glyph listed.
    useProjectStore.getState().update((draft) => {
      const target = draft.clips[0]!.actions.find((a) => a.id === disappear)!;
      (target as { glyphs: number[] }).glyphs = [0];
    });
    expect(errors().map((issue) => issue.code)).toEqual(['arrow-part']);
    setBlockGlyphs(clip, disappear, [0, 1]);
    expect(block(disappear)).toMatchObject({ glyphs: [0] });
    setBlockGlyphs(clip, disappear, 'all');
    expect(block(disappear)).toMatchObject({ glyphs: 'all' });
    expect(errors()).toEqual([]);
    setBlockGlyphs(clip, disappear, [2, 1, 0]);
    expect(block(disappear)).toMatchObject({ glyphs: [0, 1, 2] });
    expect(errors()).toEqual([]);
  });

  it('of a plain line or a dashed one names its glyphs one by one, as before', () => {
    const { clip, appear, block } = lineBlocks('dashed');
    setBlockGlyphs(clip, appear, [0, 2]);
    expect(block(appear)).toMatchObject({ glyphs: [0, 2] });
  });
});

describe('a block command while a gesture of another is open', () => {
  type Command = (clipId: string, blockId: string) => unknown;
  type Write = (draft: Project) => void;

  /** A trim that makes the clip twice as long. */
  const trim: Write = (draft) => {
    draft.clips[0]!.end = 12;
  };
  /** The block dragged from 5 s to 2 s. */
  const drag: Write = (draft) => {
    draft.clips[0]!.actions[0]!.start = 2;
  };

  /** The block of the scene and the glyphs its formula hides: a Transform of glyphs 0, 1, 3 and 4
   * unless a case needs another kind. */
  interface Scene {
    block(): ClipAction;
    hidden?: number[];
  }
  const transform: Scene = { block: () => createPartTransform(5, [0, 1, 3, 4]) };
  const appear: Scene = { block: () => createAppear(5, 'write', [2]), hidden: [2] };
  const emphasis: Scene = { block: () => createEmphasis(5, 'indicate', [0, 1, 3, 4]) };

  /** What `command` leaves of five glyphs on a clip over 0–6 s with the block of `scene` over its
   * last second, fired while a gesture that wrote `during` is open (none without it). The ids are
   * the same in every run. */
  function leaves(command: Command, during?: Write, { block: make, hidden }: Scene = transform) {
    const restoreIds = setIdGenerator(sequentialIds());
    try {
      const block = make();
      const scene = oneClipScene({
        glyphs: 5,
        start: 0,
        end: 6,
        actions: [block],
        hiddenGlyphs: hidden,
      });
      loadProject(scene.project);
      useUiStore.setState({ selection: { kind: 'none' } });
      if (during) history.beginGesture().update(during);
      const returned = command(scene.clip.id, block.id);
      const { project } = useProjectStore.getState();
      return {
        returned,
        gesturing: history.isGesturing(),
        project,
        errors: validateProject(project).filter((issue) => issue.severity === 'error'),
        selection: useUiStore.getState().selection,
        steps: useProjectStore.temporal.getState().pastStates.length,
      };
    } finally {
      restoreIds();
    }
  }

  const commands: [string, Write, Command, Scene?][] = [
    ['addBlock, during a trim', trim, (clip) => addBlock(clip, { kind: 'tween' }, 9)],
    ['duplicateBlock, during a trim', trim, (clip, block) => duplicateBlock(clip, block)],
    ['duplicateGroup, during a trim', trim, (clip, block) => duplicateGroup(clip, block)],
    ['nudgeBlock, during a trim', trim, (clip, block) => nudgeBlock(clip, block, 1)],
    ['nudgeBlock, of the block being dragged', drag, (clip, block) => nudgeBlock(clip, block, -1)],
    [
      'duplicateBlockForOthers, of the block being dragged',
      drag,
      (clip, block) => duplicateBlockForOthers(clip, block),
    ],
    [
      'changeBlockKind, of the block being dragged',
      drag,
      (clip, block) => changeBlockKind(clip, block, 'tween'),
    ],
    [
      'splitBlockIntoRuns, of the block being dragged',
      drag,
      (clip, block) => splitBlockIntoRuns(clip, block),
    ],
    ['splitBlock, of the block being dragged', drag, (clip, block) => splitBlock(clip, block, [1])],
    [
      'changeBlockAnimation, of the block being dragged',
      drag,
      (clip, block) => changeBlockAnimation(clip, block, 'appear', 'fade_in'),
      appear,
    ],
    [
      'changeEmphasisEffect, of the block being dragged',
      drag,
      (clip, block) => changeEmphasisEffect(clip, block, 'wiggle'),
      emphasis,
    ],
  ];

  it.each(commands)('%s: the gesture is given up first', (_name, during, command, scene) => {
    const alone = leaves(command, undefined, scene);
    expect(alone.errors).toEqual([]);
    const fired = leaves(command, during, scene);
    expect(fired.gesturing).toBe(false);
    expect(fired).toEqual(alone);
  });

  it('a block added at 9 s during a trim is inside the 6 s the clip has again', () => {
    const { project, errors } = leaves((clip) => addBlock(clip, { kind: 'tween' }, 9), trim);
    const clip = project.clips[0]!;
    expect(clip.end).toBe(6);
    expect(clip.actions).toHaveLength(2);
    for (const action of clip.actions)
      expect(action.start + action.duration).toBeLessThanOrEqual(6);
    expect(errors).toEqual([]);
  });
});
