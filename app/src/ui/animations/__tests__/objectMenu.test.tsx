/* A clip's own entries in a context menu (ObjectMenuItems.tsx) and what they do
 * (objectActions.ts, D118, D120): the intro and the outro of the clip — asked about when they
 * would run into what the clip has —, Remove animations, a formula's Remove relations, and a
 * brace's or a shape's colour, side and Detach. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { ContextMenu } from '../../ContextMenu';
import { useDialogStore } from '../../project/dialogStore';
import { useNoticeStore } from '../../project/noticeStore';
import {
  clipHasAnimations,
  clipHasTransformations,
  removeClipAnimations,
  removeClipTransformations,
  setClipPhase,
  setObjectColour,
} from '../objectActions';
import { ObjectMenuItems } from '../ObjectMenuItems';

const project = () => useProjectStore.getState().project;
const clipOf = (id: string) => project().clips.find((c) => c.id === id)!;
const formulaOf = (id: string) => project().formulas.find((f) => f.id === clipOf(id).formulaId)!;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
const change = (recipe: Parameters<ReturnType<typeof useProjectStore.getState>['update']>[0]) => {
  useProjectStore.getState().update(recipe);
  history.clear();
};
/** The dialog on screen, and a press of one of its buttons. */
const dialog = () => useDialogStore.getState().queue[0];
const answer = (id: string) => useDialogStore.getState().settle(dialog()!.key, id);

const snapshot = {
  backend: 'mathjax' as const,
  key: 'k',
  glyphs: [0, 1, 2].map((i) => ({
    label: String(i),
    center: [i, 0] as [number, number],
    size: [1, 1] as [number, number],
  })),
};

/** A formula on clip `cf` over [0, 8); a brace `cb` under it over [2, 8), growing in 1 s, with a
 * tween and an Indicate; a box `cs` around it over [2, 8), created in 1 s and fading out. */
beforeEach(() => {
  const p = createEmptyProject();
  p.tracks = ['Track 3', 'Track 2', 'Track 1'].map((name) => createTrack(name));
  const f = { ...createFormula({ name: 'f1', source: 'a+b', snapshot }), id: 'f1' };
  const b = { ...createBraceFormula({ name: 'b1' }), id: 'b1' };
  const s = { ...createShapeFormula({ name: 's1' }), id: 's1' };
  p.formulas.push(f, b, s);
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const cf = { ...createClip('f1', p.tracks[2]!.id, 0, 8, none), id: 'cf' };
  const cb = {
    ...createClip('b1', p.tracks[1]!.id, 2, 8, {
      intro: defaultIntro('grow_from_center'),
      outro: defaultOutro('none'),
      attach: createBraceAttach('cf', 'all', { direction: 180 }),
      actions: [createTween(2, 1, { opacity: 0.5 }), createEmphasis(4, 'indicate', 'all')],
    }),
    id: 'cb',
  };
  const cs = {
    ...createClip('s1', p.tracks[0]!.id, 2, 8, {
      intro: defaultIntro('create'),
      outro: defaultOutro('fade_out'),
      attach: createShapeAttach('cf', 'all'),
    }),
    id: 'cs',
  };
  p.clips.push(cf, cb, cs);
  loadProject(p);
  useUiStore.setState({ selection: { kind: 'clips', ids: ['cb'] }, time: 3 });
  useDialogStore.setState({ queue: [] });
  useNoticeStore.setState({ notices: [] });
});

describe('what the menu does', () => {
  it('knows a clip with an intro, an outro or a block from one with none', () => {
    expect(clipHasAnimations(clipOf('cb'))).toBe(true);
    expect(clipHasAnimations(clipOf('cs'))).toBe(true);
    expect(clipHasAnimations(clipOf('cf'))).toBe(false);
  });

  it('gives the clip an intro or an outro, at the animation’s own length, or takes it off', async () => {
    expect(await setClipPhase('cb', 'outro', 'shrink_to_center')).toBe(true);
    expect(clipOf('cb').outro).toMatchObject({ kind: 'shrink_to_center', duration: 1 });
    expect(undoSteps()).toBe(1);
    expect(await setClipPhase('cb', 'intro', 'none')).toBe(true);
    expect(clipOf('cb').intro).toMatchObject({ kind: 'none', duration: 0 });
    // The one it has already: nothing to do, no undo step.
    expect(await setClipPhase('cb', 'intro', 'none')).toBe(false);
    expect(undoSteps()).toBe(2);
    expect(dialog()).toBeUndefined();
  });

  it('makes «Appears with» of the object say the intro its clip was given', async () => {
    // A second clip of the formula, with an intro of its own.
    change((draft) => {
      const twin = createClip('f1', draft.tracks[2]!.id, 10, 14, { intro: defaultIntro('create') });
      draft.clips.push({ ...twin, id: 'cg' });
    });
    expect(formulaOf('cf').intro).toBeNull(); // "Default": no intro, by the preference
    expect(await setClipPhase('cf', 'intro', 'write')).toBe(true);
    expect(clipOf('cf').intro).toMatchObject({ kind: 'write', duration: 1 });
    expect(formulaOf('cf').intro).toMatchObject({ kind: 'write', duration: 1 });
    // One undo step for both, and the formula's other clip is not touched.
    expect(undoSteps()).toBe(1);
    expect(clipOf('cg').intro.kind).toBe('create');
    // Taken off, «Appears with» is None, said and not "Default".
    expect(await setClipPhase('cf', 'intro', 'none')).toBe(true);
    expect(formulaOf('cf').intro).toMatchObject({ kind: 'none', duration: 0 });
    // The outro is the clip's alone.
    expect(await setClipPhase('cf', 'outro', 'fade_out')).toBe(true);
    expect(formulaOf('cf').intro).toMatchObject({ kind: 'none' });
    // A brace is an object like the others.
    expect(await setClipPhase('cb', 'intro', 'write')).toBe(true);
    expect(formulaOf('cb').intro).toMatchObject({ kind: 'write' });
  });

  it('leaves «Appears with» on "Default" when that gives the same intro', async () => {
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.intro = defaultIntro('write');
    });
    expect(await setClipPhase('cf', 'intro', 'none')).toBe(true);
    expect(formulaOf('cf').intro).toBeNull();
  });

  it('asks before an intro that runs into a block, and shortens it to what fits', async () => {
    // An Indicate of the whole formula over [0.4, 1.4) of the clip.
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions = [createEmphasis(0.4, 'indicate', 'all')];
    });
    const asked = setClipPhase('cf', 'intro', 'write');
    expect(dialog()).toMatchObject({
      title: 'Write runs into what is already there',
      message: 'On “f1”, the Write intro (1.00 s) would run into:',
    });
    expect(dialog()!.details).toHaveLength(1);
    expect(dialog()!.details![0]).toContain('The Indicate block and the intro animate');
    expect(dialog()!.buttons.map((b) => b.label)).toEqual([
      'Cancel',
      'Add it anyway',
      'Shorten it to 0.40 s',
    ]);
    // Nothing happens until the answer.
    expect(clipOf('cf').intro.kind).toBe('none');
    answer('fit');
    expect(await asked).toBe(true);
    expect(clipOf('cf').intro).toMatchObject({ kind: 'write', duration: 0.4 });
    // «Appears with» says what the clip shows.
    expect(formulaOf('cf').intro).toMatchObject({ kind: 'write', duration: 0.4 });
    expect(undoSteps()).toBe(1);
  });

  it('asks about what a drag still held leaves, not about what it showed', async () => {
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions = [createEmphasis(0.4, 'indicate', 'all')];
    });
    // The Indicate dragged clear of the intro, the button still held when the command comes.
    history.beginGesture().update((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions[0]!.start = 3;
    });
    const asked = setClipPhase('cf', 'intro', 'write');
    expect(history.isGesturing()).toBe(false);
    expect(clipOf('cf').actions[0]!.start).toBe(0.4);
    expect(dialog()).toMatchObject({ title: 'Write runs into what is already there' });
    expect(clipOf('cf').intro.kind).toBe('none');
    answer('cancel');
    expect(await asked).toBe(false);
    expect(undoSteps()).toBe(0);
  });

  it('adds it anyway when told so, and leaves the clip alone when the question is dismissed', async () => {
    // A keyframe over [0.5, 1.5) of the clip: an outro is far from it, an intro would cut it.
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions = [createTween(0.5, 1, { opacity: 0.5 })];
    });
    let asked = setClipPhase('cf', 'intro', 'fade_in');
    expect(dialog()!.details).toEqual([
      'The Transform of the whole formula at 0.50 s would be cut from 1.00 s to 0.50 s.',
    ]);
    answer('cancel');
    expect(await asked).toBe(false);
    expect(clipOf('cf').intro.kind).toBe('none');
    expect(clipOf('cf').actions[0]).toMatchObject({ start: 0.5, duration: 1 });
    expect(undoSteps()).toBe(0);
    asked = setClipPhase('cf', 'intro', 'fade_in');
    answer('whole');
    expect(await asked).toBe(true);
    expect(clipOf('cf').intro).toMatchObject({ kind: 'fade_in', duration: 1 });
    expect(clipOf('cf').actions[0]).toMatchObject({ start: 1, duration: 0.5 });
    expect(undoSteps()).toBe(1);
    // The outro meets nothing: no question.
    expect(await setClipPhase('cf', 'outro', 'fade_out')).toBe(true);
    expect(dialog()).toBeUndefined();
  });

  it('does nothing when the project changed while the question was open', async () => {
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions = [createTween(0.5, 1, { opacity: 0.5 })];
    });
    const asked = setClipPhase('cf', 'intro', 'write');
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.end = 9;
    });
    answer('whole');
    expect(await asked).toBe(false);
    expect(clipOf('cf').intro.kind).toBe('none');
  });

  it('says so when the other animation leaves no room', async () => {
    change((draft) => {
      const clip = draft.clips.find((c) => c.id === 'cf')!;
      clip.outro = { ...defaultOutro('fade_out'), duration: 8 };
    });
    expect(await setClipPhase('cf', 'intro', 'write')).toBe(false);
    expect(clipOf('cf').intro.kind).toBe('none');
    expect(useNoticeStore.getState().notices[0]).toMatchObject({ title: 'No room for Write' });
    expect(undoSteps()).toBe(0);
  });

  it('removes the intro, the outro and every block in one undo step, and selects the clip', () => {
    const block = clipOf('cb').actions[1]!.id;
    useUiStore.setState({ selection: { kind: 'action', clipId: 'cb', actionId: block } });
    expect(removeClipAnimations('cb')).toBe(true);
    expect(clipOf('cb')).toMatchObject({
      intro: { kind: 'none', duration: 0 },
      outro: { kind: 'none', duration: 0 },
      actions: [],
    });
    // The attachment is not an animation: it stays.
    expect(clipOf('cb').attach).toMatchObject({ rule: 'brace', direction: 180 });
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: ['cb'] });
    expect(undoSteps()).toBe(1);
    expect(removeClipAnimations('cb')).toBe(false);
    expect(undoSteps()).toBe(1);
    history.undo();
    expect(clipOf('cb').intro.kind).toBe('grow_from_center');
    expect(clipOf('cb').actions).toHaveLength(2);
  });

  it('colours the object of the clip', () => {
    setObjectColour('cb', '#FC6255');
    expect(formulaOf('cb').color).toBe('#FC6255');
    expect(formulaOf('cs').color).not.toBe('#FC6255');
    expect(undoSteps()).toBe(1);
  });

  it('leaves a clip on a locked track as it is', async () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[1]!.locked = true;
    });
    const before = project();
    expect(await setClipPhase('cb', 'intro', 'none')).toBe(false);
    expect(removeClipAnimations('cb')).toBe(false);
    expect(removeClipTransformations('cb')).toBe(false);
    setObjectColour('cb', '#FC6255');
    expect(project()).toBe(before);
  });
});

describe('animations and transformations of a formula', () => {
  /** `cf` with a Write, a FadeOut, a keyframe, an Indicate and a Morph; a second formula `f2`
   * on `cg` over [4, 12) of a fourth track, and the relations cf → cg and cg → cf. */
  beforeEach(() => {
    change((draft) => {
      draft.formulas.push({ ...createFormula({ name: 'f2', source: 'c', snapshot }), id: 'f2' });
      draft.tracks.push(createTrack('Track 0'));
      const clip = draft.clips.find((c) => c.id === 'cf')!;
      clip.intro = defaultIntro('write');
      clip.outro = defaultOutro('fade_out');
      clip.actions = [
        createTween(1, 1, { opacity: 0.5 }),
        createEmphasis(2.5, 'indicate', [0]),
        { ...createMorph(4, { pairs: [{ from: [0], to: [1], style: null }] }), id: 'morph' },
      ];
      draft.clips.push({
        ...createClip('f2', draft.tracks[3]!.id, 4, 12, {
          intro: defaultIntro('none'),
          outro: defaultOutro('none'),
        }),
        id: 'cg',
      });
      draft.relations.push(
        { ...createRelation('cf', 'cg', { offset: 2 }), id: 'out' },
        { ...createRelation('cg', 'cf', { offset: 5.5 }), id: 'in' },
      );
      draft.formulas.find((f) => f.id === 'f1')!.intro = defaultIntro('write');
    });
  });

  it('Remove animations takes the intro, the outro and the blocks, but not the Morph ones', () => {
    expect(clipHasAnimations(clipOf('cf'))).toBe(true);
    expect(removeClipAnimations('cf')).toBe(true);
    expect(clipOf('cf')).toMatchObject({
      intro: { kind: 'none', duration: 0 },
      outro: { kind: 'none', duration: 0 },
      actions: [{ id: 'morph', kind: 'morph' }],
    });
    // The relations are not animations of the clip, and «Appears with» says None now.
    expect(project().relations.map((r) => r.id)).toEqual(['out', 'in']);
    expect(formulaOf('cf').intro).toMatchObject({ kind: 'none' });
    expect(undoSteps()).toBe(1);
    // A Morph block alone is nothing to remove here.
    expect(clipHasAnimations(clipOf('cf'))).toBe(false);
    expect(removeClipAnimations('cf')).toBe(false);
  });

  it('Remove animations keeps the selection of a Morph block, which stays', () => {
    useUiStore.setState({ selection: { kind: 'action', clipId: 'cf', actionId: 'morph' } });
    removeClipAnimations('cf');
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: 'cf',
      actionId: 'morph',
    });
  });

  it('Remove relations takes the relations of the clip, both ways, and its Morph blocks', () => {
    expect(clipHasTransformations(project(), clipOf('cf'))).toBe(true);
    useUiStore.setState({ selection: { kind: 'relation', id: 'in' } });
    expect(removeClipTransformations('cf')).toBe(true);
    expect(project().relations).toEqual([]);
    expect(clipOf('cf').actions.map((a) => a.kind)).toEqual(['tween', 'emphasis']);
    // Its animations stay.
    expect(clipOf('cf').intro.kind).toBe('write');
    expect(clipOf('cf').outro.kind).toBe('fade_out');
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: ['cf'] });
    expect(undoSteps()).toBe(1);
    expect(clipHasTransformations(project(), clipOf('cf'))).toBe(false);
    expect(removeClipTransformations('cf')).toBe(false);
    history.undo();
    expect(project().relations).toHaveLength(2);
    expect(clipOf('cf').actions).toHaveLength(3);
  });

  it('leaves a relation with a clip on a locked track, and says so', () => {
    change((draft) => {
      draft.tracks[3]!.locked = true;
      draft.clips.find((c) => c.id === 'cf')!.actions = [];
    });
    // Nothing of it may go: the entry has nothing to do.
    expect(clipHasTransformations(project(), clipOf('cf'))).toBe(false);
    expect(removeClipTransformations('cf')).toBe(false);
    // With a Morph block it has: the block goes, the relations stay.
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions = [createMorph(4)];
    });
    expect(removeClipTransformations('cf')).toBe(true);
    expect(clipOf('cf').actions).toEqual([]);
    expect(project().relations).toHaveLength(2);
    expect(useNoticeStore.getState().notices[0]).toMatchObject({ title: '2 relations stayed' });
  });
});

describe('ObjectMenuItems', () => {
  const open = (clipId: string, onClose = vi.fn()) => {
    render(
      <ContextMenu x={0} y={0} label="Clip" testId="menu" onClose={onClose}>
        <ObjectMenuItems clipId={clipId} testIdPrefix="m" onClose={onClose} />
      </ContextMenu>,
    );
    return onClose;
  };
  const submenu = (id: string) => fireEvent.mouseEnter(screen.getByTestId(`m-${id}`));

  it('turns an attached brace, ticking the side it is on', () => {
    const onClose = open('cb');
    submenu('direction');
    expect(screen.getByTestId('m-direction-up')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('m-direction-down')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('m-direction-left'));
    expect(clipOf('cb').attach).toMatchObject({ direction: -90 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets the intro and the outro of the clip, the current one ticked', () => {
    open('cb');
    submenu('intro');
    expect(screen.getByTestId('m-intro-grow_from_center')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('m-intro-none'));
    expect(clipOf('cb').intro.kind).toBe('none');
    submenu('outro');
    expect(screen.getByTestId('m-outro-none')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('m-outro-shrink_to_center'));
    expect(clipOf('cb').outro.kind).toBe('shrink_to_center');
  });

  it('colours the object, removes its animations and detaches it', () => {
    const onClose = open('cs');
    // A shape has no side to point to.
    expect(screen.queryByTestId('m-direction')).toBeNull();
    submenu('color');
    fireEvent.click(screen.getByTestId('m-color-BLUE'));
    expect(formulaOf('cs').color).toBe('#58C4DD');
    fireEvent.click(screen.getByTestId('m-remove-animations'));
    expect(clipOf('cs')).toMatchObject({ intro: { kind: 'none' }, outro: { kind: 'none' } });
    fireEvent.click(screen.getByTestId('m-detach'));
    expect(clipOf('cs').attach).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('has nothing to remove, to turn or to detach on a free object without animations', () => {
    removeClipAnimations('cb');
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === 'cb')!.attach = null;
    });
    open('cb');
    expect(screen.getByTestId('m-remove-animations')).toBeDisabled();
    expect(screen.queryByTestId('m-direction')).toBeNull();
    expect(screen.queryByTestId('m-detach')).toBeNull();
    expect(screen.getByTestId('m-color')).toBeEnabled();
    expect(screen.getByTestId('m-intro')).toBeEnabled();
  });

  it('gives a formula its intro, its outro and the two removals, and nothing of an object', () => {
    change((draft) => {
      draft.formulas.push({ ...createFormula({ name: 'f2', source: 'c', snapshot }), id: 'f2' });
      draft.clips.push({ ...createClip('f2', draft.tracks[0]!.id, 9, 12), id: 'cg' });
      draft.relations.push(createRelation('cf', 'cg', { offset: 0 }));
    });
    const onClose = open('cf');
    for (const id of ['color', 'direction', 'detach'])
      expect(screen.queryByTestId(`m-${id}`)).toBeNull();
    // Nothing to remove yet but the relation.
    expect(screen.getByTestId('m-remove-animations')).toBeDisabled();
    expect(screen.getByTestId('m-remove-relations')).toBeEnabled();
    submenu('intro');
    expect(screen.getByTestId('m-intro-none')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('m-intro-write'));
    expect(clipOf('cf').intro.kind).toBe('write');
    expect(formulaOf('cf').intro).toMatchObject({ kind: 'write' });
    submenu('outro');
    fireEvent.click(screen.getByTestId('m-outro-fade_out'));
    expect(clipOf('cf').outro.kind).toBe('fade_out');
    fireEvent.click(screen.getByTestId('m-remove-relations'));
    expect(project().relations).toEqual([]);
    expect(screen.getByTestId('m-remove-relations')).toBeDisabled();
    fireEvent.click(screen.getByTestId('m-remove-animations'));
    expect(clipOf('cf')).toMatchObject({ intro: { kind: 'none' }, outro: { kind: 'none' } });
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('says that Remove relations takes the Morph blocks too, when the clip has some', () => {
    change((draft) => {
      draft.clips.find((c) => c.id === 'cf')!.actions = [createMorph(4)];
    });
    open('cf');
    expect(screen.getByTestId('m-remove-relations')).toHaveTextContent(
      'Remove relationsand Morph blocks',
    );
    expect(screen.getByTestId('m-remove-relations')).toBeEnabled();
  });

  it('has no Remove relations on a brace or a shape', () => {
    open('cs');
    expect(screen.queryByTestId('m-remove-relations')).toBeNull();
  });

  it('is off on a locked track', () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[1]!.locked = true;
    });
    open('cb');
    for (const id of ['color', 'direction', 'intro', 'outro', 'remove-animations', 'detach'])
      expect(screen.getByTestId(`m-${id}`)).toBeDisabled();
  });

  it('unlinks a formula’s clip into a copy, off when the formula has no other clip', () => {
    const only = open('cf');
    const entry = screen.getByTestId('m-unlink');
    expect(entry).toHaveTextContent('Unlink formula (make a copy)');
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute(
      'title',
      '“f1” has no other clip: there is nothing to unlink this clip from.',
    );
    // Right after Remove relations, before «Split at playhead (S)»: the last of the clip's own
    // entries.
    const items = screen.getAllByRole('menuitem').map((item) => item.dataset.testid);
    expect(items.slice(-3)).toEqual(['m-remove-relations', 'm-unlink', 'm-split']);
    expect(only).not.toHaveBeenCalled();
    cleanup();

    change((draft) => {
      draft.clips.push({ ...createClip('f1', draft.tracks[2]!.id, 10, 14), id: 'cg' });
    });
    const onClose = open('cf');
    expect(screen.getByTestId('m-unlink')).toBeEnabled();
    expect(screen.getByTestId('m-unlink')).toHaveAttribute(
      'title',
      'This clip gets a copy of “f1” of its own, a new formula in the Creator. Editing a formula or its copy no longer changes the clips of the other.',
    );
    fireEvent.click(screen.getByTestId('m-unlink'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(formulaOf('cf')).toMatchObject({ name: 'f2', source: 'a+b', snapshot });
    expect(formulaOf('cg').id).toBe('f1');
    expect(undoSteps()).toBe(1);
  });

  it('has no Unlink on a brace or a shape, and has it off on a locked track', () => {
    open('cb');
    expect(screen.queryByTestId('m-unlink')).toBeNull();
    cleanup();
    open('cs');
    expect(screen.queryByTestId('m-unlink')).toBeNull();
    cleanup();
    change((draft) => {
      draft.clips.push({ ...createClip('f1', draft.tracks[0]!.id, 10, 14), id: 'cg' });
      draft.tracks[2]!.locked = true;
    });
    open('cf');
    expect(screen.getByTestId('m-unlink')).toBeDisabled();
    expect(screen.getByTestId('m-unlink')).toHaveAttribute(
      'title',
      'The clip is on a locked track.',
    );
  });
});
