// @vitest-environment node
/* The actions on the glyphs picked in the preview (glyphActions.ts): colouring and hiding them
 * through the formula, a brace or a shape on them, what the clip's menu reads of the pick, and
 * their colours copied as a sequence and pasted onto another pick. */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import type { Box } from '../../../geom';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { useGlyphsDialog } from '../../animations/glyphsDialogStore';
import { useNoticeStore } from '../../project/noticeStore';
import {
  braceOnPickedGlyphs,
  colourPickedGlyphs,
  colourSequencePairing,
  copyPickedColourSequence,
  hidePickedGlyphs,
  openPickedGlyphsDialog,
  pastePickedColourSequence,
  pickColourState,
  pickHasColour,
  pickedGlyphsOf,
  pickedTargetOf,
  shapeOnPickedGlyphs,
  useColourSequenceClipboard,
} from '../glyphActions';
import { withServices } from '../../../test/services';
import { startGlyphPickTracking, useGlyphPick } from '../glyphPickStore';
import { boxSnapshot } from './resolvedBoxes';

withServices(startGlyphPickTracking);

const project = () => useProjectStore.getState().project;
const formula = () => project().formulas[0]!;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
const box = (minX: number, maxX: number): Box => ({ minX, minY: -0.5, maxX, maxY: 0.5 });
const pick = (clipId: string, glyphs: number[]) => ({
  parts: [{ clipId, selection: { selected: new Set(glyphs), anchor: glyphs[0] ?? null } }],
});

/** Add clip `b`, of another formula (f2, three glyphs), and pick glyphs 0 and 2 of `a` with
 * glyph 1 of `b`: the two clips are the selection. */
function secondClip(): void {
  useProjectStore.getState().update((draft) => {
    const f = { ...createFormula({ name: 'f2', source: 'xyz' }), id: 'f2' };
    f.snapshot = boxSnapshot([box(-2, -1), box(-0.5, 0.5), box(1, 2)]);
    draft.formulas.push(f);
    const b = createClip('f2', draft.tracks[2]!.id, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('none'),
    });
    b.id = 'b';
    draft.clips.push(b);
  });
  useProjectStore.temporal.getState().clear();
  useUiStore.setState({ selection: { kind: 'clips', ids: ['a', 'b'] } });
  useGlyphPick.getState().set({ parts: [...pick('a', [0, 2]).parts, ...pick('b', [1]).parts] });
}

beforeEach(() => {
  const p = createEmptyProject();
  const f = { ...createFormula({ name: 'f1', source: 'abc' }), id: 'f1' };
  f.snapshot = boxSnapshot([box(-2, -1), box(-0.5, 0.5), box(1, 2)]);
  p.formulas = [f];
  p.tracks = [createTrack('Track 3'), createTrack('Track 2'), createTrack('Track 1')];
  const a = createClip('f1', p.tracks[1]!.id, 0, 6, {
    intro: defaultIntro('write'),
    outro: defaultOutro('none'),
  });
  a.id = 'a';
  p.clips = [a];
  loadProject(p);
  useUiStore.setState({ selection: { kind: 'clips', ids: ['a'] }, time: 2 });
  useGlyphPick.getState().set(pick('a', [0, 2]));
  useColourSequenceClipboard.getState().set(null);
  useGlyphsDialog.getState().close();
});

describe('colouring and hiding the pick', () => {
  it('colours the picked glyphs of the formula as one undo step, and takes the colour off', () => {
    const before = undoSteps();
    colourPickedGlyphs('#FC6255');
    expect(formula().glyphColors).toEqual({ '0': '#FC6255', '2': '#FC6255' });
    expect(undoSteps()).toBe(before + 1);
    colourPickedGlyphs(null);
    expect(formula().glyphColors).toEqual({});
  });

  it('hides them at the start of every clip, and shows them again', () => {
    hidePickedGlyphs(true);
    expect(formula().hiddenGlyphs).toEqual([0, 2]);
    expect(pickColourState(formula(), [0, 2])).toEqual({
      canClearColor: false,
      canHide: false,
      canShow: true,
    });
    hidePickedGlyphs(false);
    expect(formula().hiddenGlyphs).toEqual([]);
  });

  it('colours the glyphs picked in several formulas as one undo step, and clears them', () => {
    secondClip();
    const colours = () => project().formulas.map((f) => f.glyphColors);
    const picked = () => useGlyphPick.getState().pick!;
    expect(pickHasColour(project(), picked())).toBe(false);
    colourPickedGlyphs('#FC6255');
    expect(colours()).toEqual([{ '0': '#FC6255', '2': '#FC6255' }, { '1': '#FC6255' }]);
    expect(undoSteps()).toBe(1);
    expect(pickHasColour(project(), picked())).toBe(true);
    colourPickedGlyphs(null);
    expect(colours()).toEqual([{}, {}]);
    expect(undoSteps()).toBe(2);
  });

  it('does nothing of one formula on glyphs picked in several: hiding, a sequence, a dialog', () => {
    secondClip();
    colourPickedGlyphs('#FC6255');
    const before = project();
    hidePickedGlyphs(true);
    expect(copyPickedColourSequence()).toBe(false);
    expect(useColourSequenceClipboard.getState().sequence).toBeNull();
    openPickedGlyphsDialog('brace', useGlyphPick.getState().pick!);
    expect(useGlyphsDialog.getState().clipId).toBeNull();
    expect(project()).toBe(before);
  });

  it('says what the colour items can do: a colour to clear, shown to hide, hidden to show', () => {
    colourPickedGlyphs('#83C167');
    useGlyphPick.getState().set(pick('a', [1]));
    hidePickedGlyphs(true);
    expect(pickColourState(formula(), [0, 1])).toEqual({
      canClearColor: true,
      canHide: true,
      canShow: true,
    });
    expect(pickColourState(formula(), [1])).toEqual({
      canClearColor: false,
      canHide: false,
      canShow: true,
    });
  });
});

describe('a brace or a shape on the pick', () => {
  it('attaches a brace to the picked glyphs on the side asked, and selects its clip', () => {
    const id = braceOnPickedGlyphs('up');
    const brace = project().clips.find((c) => c.id === id)!;
    expect(brace.attach).toEqual({
      rule: 'brace',
      clipId: 'a',
      glyphs: [0, 2],
      direction: 180,
      buff: 0.2,
    });
    expect(project().formulas.find((f) => f.id === brace.formulaId)?.kind).toBe('brace');
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
  });

  it('attaches a shape to them, and names every glyph of the formula as all', () => {
    useGlyphPick.getState().set(pick('a', [2, 0, 1]));
    const id = shapeOnPickedGlyphs('circle');
    const shape = project().clips.find((c) => c.id === id)!;
    expect(shape.attach).toMatchObject({ rule: 'shape', clipId: 'a', glyphs: 'all' });
    const object = project().formulas.find((f) => f.id === shape.formulaId);
    expect(object).toMatchObject({ kind: 'shape', shape: 'circle' });
  });

  it('puts one brace over glyphs picked in several formulas, attached to them all', () => {
    secondClip();
    const id = braceOnPickedGlyphs('down');
    const brace = project().clips.find((c) => c.id === id)!;
    // The first clip of the pick is the one it hangs on; the others are its `also`.
    expect(brace.attach).toEqual({
      rule: 'brace',
      clipId: 'a',
      glyphs: [0, 2],
      direction: 0,
      buff: 0.2,
      also: [{ clipId: 'b', glyphs: [1] }],
    });
    expect(project().clips).toHaveLength(3);
    expect(undoSteps()).toBe(1);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(useGlyphPick.getState().pick).toBeNull();
  });

  it('puts one shape over them, naming every glyph of a formula as all', () => {
    secondClip();
    useGlyphPick
      .getState()
      .set({ parts: [...pick('b', [1]).parts, ...pick('a', [2, 0, 1]).parts] });
    const id = shapeOnPickedGlyphs('box');
    expect(project().clips.find((c) => c.id === id)!.attach).toEqual({
      rule: 'shape',
      clipId: 'b',
      glyphs: [1],
      buff: 0.1,
      also: [{ clipId: 'a', glyphs: 'all' }],
    });
    expect(project().clips).toHaveLength(3);
  });

  it('does nothing without a pick', () => {
    useGlyphPick.getState().clear();
    const before = undoSteps();
    expect(braceOnPickedGlyphs('down')).toBeNull();
    expect(shapeOnPickedGlyphs('box')).toBeNull();
    colourPickedGlyphs('#FC6255');
    hidePickedGlyphs(true);
    expect(undoSteps()).toBe(before);
    expect(project().clips).toHaveLength(1);
  });
});

describe('what the clip menu reads', () => {
  it('gives the picked glyphs and their target of the picked clip alone', () => {
    expect(pickedGlyphsOf('a')).toEqual([0, 2]);
    expect(pickedTargetOf('a')).toEqual([0, 2]);
    expect(pickedGlyphsOf('b')).toBeUndefined();
    expect(pickedTargetOf('b')).toBeUndefined();
    useGlyphPick.getState().set(pick('a', [0, 1, 2]));
    expect(pickedTargetOf('a')).toBe('all');
  });

  it('reads nothing of a pick over several clips: the clip’s menu is about the whole clip', () => {
    secondClip();
    expect(useGlyphPick.getState().pick?.parts).toHaveLength(2);
    expect(pickedGlyphsOf('a')).toBeUndefined();
    expect(pickedTargetOf('a')).toBeUndefined();
    expect(pickedGlyphsOf('b')).toBeUndefined();
  });
});

describe('a colour sequence from one pick onto another', () => {
  const formulaOf = (id: string) => project().formulas.find((f) => f.id === id)!;
  const symbols = (text: string) => text.split(' ');
  const notices = () => useNoticeStore.getState().notices;
  /** Select clip `clipId` and pick `glyphs` of it. */
  const pickOn = (clipId: string, glyphs: number[]) => {
    useUiStore.setState({ selection: { kind: 'clips', ids: [clipId] } });
    useGlyphPick.getState().set(pick(clipId, glyphs));
  };

  /** Two objects on screen: the formula «sum» in display order, and «text», whose glyphs 4… are
   * the same expression in inline order after «Sum:». */
  beforeEach(() => {
    const p = createEmptyProject();
    const labelled = (id: string, labels: string[]) => {
      const f = { ...createFormula({ name: id, source: id }), id };
      const boxes = labels.map((_, i) => box(i, i + 0.8));
      f.snapshot = boxSnapshot(boxes);
      f.snapshot.glyphs.forEach((glyph, i) => (glyph.label = labels[i]!));
      return f;
    };
    p.formulas = [
      labelled('sum', symbols('n ∑ i = 1 a i')),
      labelled('text', symbols('S u m : ∑ n i = 1 a i')),
    ];
    p.tracks = [createTrack('Track 2'), createTrack('Track 1')];
    p.clips = ['sum', 'text'].map((id, i) => {
      const clip = createClip(id, p.tracks[i]!.id, 0, 6, {
        intro: defaultIntro('write'),
        outro: defaultOutro('none'),
      });
      clip.id = `clip-${id}`;
      return clip;
    });
    loadProject(p);
    useUiStore.setState({ selection: { kind: 'none' }, time: 2 });
    useColourSequenceClipboard.getState().set(null);
    useNoticeStore.getState().clear();
  });

  it('copies the own colours of the pick, without touching the project', () => {
    pickOn('clip-sum', [0, 1, 2]);
    colourPickedGlyphs('#FC6255');
    pickOn('clip-sum', [1, 2, 3]);
    const before = undoSteps();
    expect(copyPickedColourSequence()).toBe(true);
    expect(useColourSequenceClipboard.getState().sequence).toEqual({
      entries: [
        { label: '∑', color: '#FC6255' },
        { label: 'i', color: '#FC6255' },
        { label: '=', color: null },
      ],
      from: 'sum',
      backend: 'mathjax',
    });
    expect(undoSteps()).toBe(before);
  });

  it('pastes it onto the same symbols of another object, each symbol its colour, in one step', () => {
    useProjectStore.getState().update((draft) => {
      // n, ∑ and the first i have a colour; the second i, in the text, had one that must go.
      draft.formulas[0]!.glyphColors = { '0': '#FC6255', '1': '#58C4DD', '2': '#83C167' };
      draft.formulas[1]!.glyphColors = { '0': '#FFFF00', '10': '#FFFF00' };
    });
    pickOn('clip-sum', [0, 1, 2, 3, 4, 5, 6]);
    expect(copyPickedColourSequence()).toBe(true);
    pickOn('clip-text', [4, 5, 6, 7, 8, 9, 10]);
    const before = undoSteps();
    expect(pastePickedColourSequence()).toBe(true);
    // The text writes the ∑ before the n: each took the colour of its own symbol. The glyph
    // outside the pick keeps its colour; the last i lost its own, as the copied one has none.
    expect(formulaOf('text').glyphColors).toEqual({
      '0': '#FFFF00',
      '4': '#58C4DD',
      '5': '#FC6255',
      '6': '#83C167',
    });
    expect(undoSteps()).toBe(before + 1);
    expect(formulaOf('sum').glyphColors).toEqual({
      '0': '#FC6255',
      '1': '#58C4DD',
      '2': '#83C167',
    });
    // Pasting what is already there changes nothing, and adds no step.
    expect(pastePickedColourSequence()).toBe(false);
    expect(undoSteps()).toBe(before + 1);
    expect(notices()).toEqual([]);
  });

  it('pastes onto another part of the same object', () => {
    pickOn('clip-sum', [2]);
    colourPickedGlyphs('#FC6255');
    expect(copyPickedColourSequence()).toBe(true);
    pickOn('clip-sum', [6]);
    expect(pastePickedColourSequence()).toBe(true);
    expect(formulaOf('sum').glyphColors).toEqual({ '2': '#FC6255', '6': '#FC6255' });
  });

  it('does not paste onto another number of glyphs or other symbols, and says why', () => {
    pickOn('clip-sum', [0, 1]);
    colourPickedGlyphs('#FC6255');
    copyPickedColourSequence();
    const before = undoSteps();
    pickOn('clip-text', [4, 5, 6]);
    expect(pastePickedColourSequence()).toBe(false);
    pickOn('clip-text', [0, 1]);
    expect(pastePickedColourSequence()).toBe(false);
    expect(notices().map(({ title, message }) => [title, message])).toEqual([
      ['Colour sequence not pasted', 'The copied sequence has 2 glyphs; this selection has 3.'],
      [
        'Colour sequence not pasted',
        'The symbols differ: the copied sequence has n ∑ where this selection has S u.',
      ],
    ]);
    expect(formulaOf('text').glyphColors).toEqual({});
    expect(undoSteps()).toBe(before);
    const sequence = useColourSequenceClipboard.getState().sequence!;
    expect(colourSequencePairing(formulaOf('text'), [5, 4], sequence)).toMatchObject({
      ok: true,
      reordered: false,
    });
    expect(colourSequencePairing(formulaOf('text'), [4, 5], sequence)).toMatchObject({
      ok: true,
      reordered: true,
    });
    expect(colourSequencePairing(formulaOf('text'), [40, 41], sequence)).toEqual({
      ok: false,
      reason: 'The selected glyphs are not rendered yet.',
    });
  });

  it('has nothing to copy or to paste without a pick, and nothing to paste before a copy', () => {
    expect(copyPickedColourSequence()).toBe(false);
    expect(useColourSequenceClipboard.getState().sequence).toBeNull();
    pickOn('clip-sum', [0]);
    expect(pastePickedColourSequence()).toBe(false);
    copyPickedColourSequence();
    useGlyphPick.getState().clear();
    expect(pastePickedColourSequence()).toBe(false);
    expect(notices()).toEqual([]);
  });

  it('keeps the copied sequence when its object changes, and when another project is opened', () => {
    pickOn('clip-sum', [5]);
    colourPickedGlyphs('#FC6255');
    copyPickedColourSequence();
    colourPickedGlyphs('#58C4DD');
    expect(useColourSequenceClipboard.getState().sequence?.entries).toEqual([
      { label: 'a', color: '#FC6255' },
    ]);
    loadProject(createEmptyProject());
    expect(useColourSequenceClipboard.getState().sequence?.from).toBe('sum');
  });
});
