/* Colours in order (colourOrder.ts, D129): the list a copy makes click by click, the paste that
 * gives it out in order, what Backspace takes back, and the one undo step it all is. */
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  createTextFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Formula,
} from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { withServices } from '../../../test/services';
import { usePanels } from '../../panelsStore';
import { useNoticeStore } from '../../project/noticeStore';
import {
  clickColourGlyph,
  colourOrderHint,
  leaveColourOrder,
  orderChips,
  orderGlyphs,
  pastedIntact,
  seenColour,
  startColourCopy,
  startColourOrderTracking,
  startColourPaste,
  stepBackColourOrder,
  useColourOrder,
  type ColourOrderPhase,
  type OrderGlyph,
} from '../colourOrder';
import { useGlyphPick } from '../glyphPickStore';
import { useShapeRetarget } from '../shapeRetarget';
import { useSymbolAlign } from '../symbolAlign';

withServices(startColourOrderTracking);

const TEAL = '#58C4DD';
const YELLOW = '#FFFF00';
const RED = '#FC6255';
const WHITE = '#FFFFFF';

const snapshot = (labels: string) => ({
  backend: 'mathjax' as const,
  key: `k-${labels}`,
  glyphs: [...labels].map((label, i) => ({
    label,
    center: [i, 0] as [number, number],
    size: [1, 1] as [number, number],
  })),
});
const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

let ca: Clip;
let cb: Clip;
let cs: Clip;
let ct: Clip;
const project = () => useProjectStore.getState().project;
const formula = (name: string): Formula => project().formulas.find((f) => f.name === name)!;
const phase = () => useColourOrder.getState().phase;
const notices = () => useNoticeStore.getState().notices;
const steps = () => useProjectStore.temporal.getState().pastStates.length;
const glyph = (clip: Clip, index: number): OrderGlyph => {
  const of = project().formulas.find((f) => f.id === clip.formulaId)!;
  return { clipId: clip.id, glyph: index, label: of.snapshot?.glyphs[index]?.label ?? '?' };
};

/** f1 «b2a» with b teal, 2 yellow and a red; f2 «b4a», all white; a box s1; a font text p1 on a
 * track of its own. */
beforeEach(() => {
  const p = createEmptyProject();
  p.tracks = ['Track 4', 'Track 3', 'Track 2', 'Track 1'].map((name) => createTrack(name));
  const f1 = createFormula({
    name: 'f1',
    source: 'b2a',
    snapshot: snapshot('b2a'),
    glyphColors: { '0': TEAL, '1': YELLOW, '2': RED },
  });
  const f2 = createFormula({ name: 'f2', source: 'b4a', snapshot: snapshot('b4a') });
  const s1 = createShapeFormula({ name: 's1', width: 2, height: 1, snapshot: snapshot('□') });
  const p1 = createTextFormula({ name: 'p1', source: 'ab', snapshot: snapshot('ab') });
  p.formulas.push(f1, f2, s1, p1);
  ca = createClip(f1.id, p.tracks[3]!.id, 0, 8, none);
  cb = createClip(f2.id, p.tracks[2]!.id, 0, 8, none);
  cs = createClip(s1.id, p.tracks[1]!.id, 0, 8, none);
  ct = createClip(p1.id, p.tracks[0]!.id, 0, 8, none);
  p.clips.push(ca, cb, cs, ct);
  loadProject(p);
  useColourOrder.setState({ phase: null, kept: null });
  useNoticeStore.setState({ notices: [] });
  useSymbolAlign.setState({ phase: null });
  useShapeRetarget.setState({ request: null });
  usePanels.setState({
    collapsed: { creator: false, animations: false, timeline: false },
    handles: {},
  });
});

/** Copy b, 2 and a of f1, in that order, and go on to paste. */
function copyThree(): void {
  startColourCopy();
  for (const index of [0, 1, 2]) clickColourGlyph(glyph(ca, index));
  startColourPaste();
}

describe('seenColour', () => {
  it('is the glyph’s own colour, else its object’s', () => {
    const of = { color: WHITE, glyphColors: { '1': RED } };
    expect(seenColour(of, 1)).toBe(RED);
    expect(seenColour(of, 0)).toBe(WHITE);
  });
});

describe('what the strip and the preview show', () => {
  const copy: ColourOrderPhase = {
    step: 'copy',
    copied: [
      { clipId: 'c1', glyph: 0, label: 'b', color: TEAL },
      { clipId: 'c1', glyph: 3, label: '2', color: YELLOW },
    ],
  };
  const paste: ColourOrderPhase = {
    step: 'paste',
    list: [
      { label: 'b', color: TEAL },
      { label: '2', color: YELLOW },
      { label: 'a', color: RED },
    ],
    pasted: [{ clipId: 'c2', formulaId: 'f2', glyph: 5, color: TEAL, previous: null }],
  };

  it('are every colour copied so far, numbered from the left', () => {
    expect(orderChips(copy)).toEqual([
      { label: 'b', color: TEAL, number: 1, next: false },
      { label: '2', color: YELLOW, number: 2, next: false },
    ]);
    expect(orderGlyphs(copy)).toEqual([
      { clipId: 'c1', glyph: 0 },
      { clipId: 'c1', glyph: 3 },
    ]);
  });

  it('are the colours still to paste, with their numbers, the first of them the next', () => {
    expect(orderChips(paste)).toEqual([
      { label: '2', color: YELLOW, number: 2, next: true },
      { label: 'a', color: RED, number: 3, next: false },
    ]);
    expect(orderGlyphs(paste)).toEqual([{ clipId: 'c2', glyph: 5 }]);
  });

  it('are nothing while the mode is off', () => {
    expect(orderChips(null)).toEqual([]);
    expect(orderGlyphs(null)).toEqual([]);
    expect(colourOrderHint(null)).toBeNull();
  });

  it('say in the hint what a click does, and the keys of the step', () => {
    expect(colourOrderHint({ step: 'copy', copied: [] })).toBe(
      'Colours in order: click the glyphs to copy, one by one, in order · Enter then pastes them · Esc cancels',
    );
    expect(colourOrderHint(copy)).toBe(
      'Colours in order: 2 colours copied — click the next glyph · Enter to paste them · Backspace takes the last off · Esc cancels',
    );
    expect(colourOrderHint({ ...paste, pasted: [] })).toBe(
      'Colours in order: click the glyph that takes colour 1 of 3, the one of “b” · Esc ends',
    );
    expect(colourOrderHint(paste)).toBe(
      'Colours in order: click the glyph that takes colour 2 of 3, the one of “2” · Backspace takes the last back · Esc ends',
    );
  });
});

describe('pastedIntact', () => {
  const entry = { clipId: 'c', formulaId: 'f', glyph: 1, previous: null };
  const of = (glyphColors: Record<string, string>) => ({
    formulas: [{ ...createFormula({ name: 'f' }), id: 'f', glyphColors }],
  });

  it('holds while each glyph has the last colour it was given', () => {
    const pasted = [
      { ...entry, color: RED },
      { ...entry, color: TEAL, previous: RED },
    ];
    expect(pastedIntact(of({ '1': TEAL }), pasted)).toBe(true);
    expect(pastedIntact(of({ '1': RED }), pasted)).toBe(false);
    expect(pastedIntact(of({}), pasted)).toBe(false);
    expect(pastedIntact({ formulas: [] }, pasted)).toBe(false);
    expect(pastedIntact({ formulas: [] }, [])).toBe(true);
  });
});

describe('copying colours in order', () => {
  it('starts with an empty list, and Shift+C again leaves it', () => {
    startColourCopy();
    expect(phase()).toEqual({ step: 'copy', copied: [] });
    startColourCopy();
    expect(phase()).toBeNull();
  });

  it('adds the colour each clicked glyph is seen in: its own, else its object’s', () => {
    startColourCopy();
    clickColourGlyph(glyph(ca, 0));
    clickColourGlyph(glyph(cb, 1));
    expect(phase()).toEqual({
      step: 'copy',
      copied: [
        { clipId: ca.id, glyph: 0, label: 'b', color: TEAL },
        { clipId: cb.id, glyph: 1, label: '4', color: WHITE },
      ],
    });
    expect(steps()).toBe(0);
  });

  it('adds a glyph again when it is clicked again, and Backspace takes the last off', () => {
    startColourCopy();
    clickColourGlyph(glyph(ca, 2));
    clickColourGlyph(glyph(ca, 2));
    expect(orderChips(phase()).map((chip) => chip.color)).toEqual([RED, RED]);
    stepBackColourOrder();
    expect(orderChips(phase())).toHaveLength(1);
    stepBackColourOrder();
    stepBackColourOrder();
    expect(phase()).toEqual({ step: 'copy', copied: [] });
  });

  it('takes nothing from an object whose glyphs have no colours of their own', () => {
    startColourCopy();
    clickColourGlyph(glyph(cs, 0));
    expect(phase()).toEqual({ step: 'copy', copied: [] });
  });

  it('does not go on to paste with nothing copied: a notice says what to do', () => {
    startColourCopy();
    startColourPaste();
    expect(phase()).toEqual({ step: 'copy', copied: [] });
    expect(notices().at(-1)?.title).toBe('Nothing copied yet');
    expect(useColourOrder.getState().kept).toBeNull();
  });

  it('ends the other modes of the preview, and lets the Alt pick go', () => {
    useSymbolAlign.getState().toggle();
    useShapeRetarget.getState().start({ clipId: cs.id });
    const clear = vi.spyOn(useGlyphPick.getState(), 'clear');
    startColourCopy();
    expect(useSymbolAlign.getState().phase).toBeNull();
    expect(useShapeRetarget.getState().request).toBeNull();
    expect(clear).toHaveBeenCalled();
    expect(phase()?.step).toBe('copy');
    clear.mockRestore();
  });

  it('opens the Animations panel when it is folded', () => {
    const expand = vi.fn();
    usePanels.setState({
      collapsed: { creator: false, animations: true, timeline: false },
      handles: {
        animations: { isCollapsed: () => true, expand } as unknown as PanelImperativeHandle,
      },
    });
    startColourCopy();
    expect(expand).toHaveBeenCalledTimes(1);
    usePanels.setState({ collapsed: { creator: false, animations: false, timeline: false } });
    leaveColourOrder();
    startColourCopy();
    expect(expand).toHaveBeenCalledTimes(1);
  });
});

describe('pasting colours in order', () => {
  it('gives each clicked glyph the next colour, and ends with the last one', () => {
    copyThree();
    expect(phase()).toMatchObject({ step: 'paste', pasted: [] });
    clickColourGlyph(glyph(cb, 0));
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL });
    expect(orderChips(phase()).map((chip) => [chip.number, chip.next])).toEqual([
      [2, true],
      [3, false],
    ]);
    clickColourGlyph(glyph(cb, 1));
    clickColourGlyph(glyph(cb, 2));
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL, '1': YELLOW, '2': RED });
    expect(phase()).toBeNull();
  });

  it('is one undo step, however many clicks it took', () => {
    const before = project();
    copyThree();
    for (const index of [0, 1, 2]) clickColourGlyph(glyph(cb, index));
    expect(steps()).toBe(1);
    history.undo();
    expect(project()).toBe(before);
    history.redo();
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL, '1': YELLOW, '2': RED });
  });

  it('gives the object’s colour as a colour of the glyph’s own', () => {
    startColourCopy();
    clickColourGlyph(glyph(cb, 1));
    startColourPaste();
    clickColourGlyph(glyph(ca, 0));
    expect(formula('f1').glyphColors['0']).toBe(WHITE);
  });

  it('takes the last pasted glyph back with Backspace: its colour is the next again', () => {
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    clickColourGlyph(glyph(ca, 2)); // the a of f1, red, turns yellow
    expect(formula('f1').glyphColors['2']).toBe(YELLOW);
    stepBackColourOrder();
    expect(formula('f1').glyphColors['2']).toBe(RED);
    expect(orderChips(phase()).map((chip) => chip.number)).toEqual([2, 3]);
    clickColourGlyph(glyph(cb, 1));
    clickColourGlyph(glyph(cb, 2));
    expect(steps()).toBe(1);
    history.undo();
    expect(formula('f2').glyphColors).toEqual({});
    expect(formula('f1').glyphColors['2']).toBe(RED);
  });

  it('leaves no step at all when the only pasted colour is taken back', () => {
    const before = project();
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    stepBackColourOrder();
    expect(project()).toBe(before);
    expect(steps()).toBe(0);
    expect(history.canRedo()).toBe(false);
    expect(phase()).toMatchObject({ step: 'paste', pasted: [] });
    // …and the paste goes on as a step of its own.
    clickColourGlyph(glyph(cb, 1));
    expect(formula('f2').glyphColors).toEqual({ '1': TEAL });
    expect(steps()).toBe(1);
    stepBackColourOrder();
    stepBackColourOrder();
    expect(project()).toBe(before);
  });

  it('spends a colour on a glyph that already has it, without a step', () => {
    copyThree();
    clickColourGlyph(glyph(ca, 0)); // the b of f1 is teal already
    expect(steps()).toBe(0);
    expect(orderChips(phase()).map((chip) => chip.number)).toEqual([2, 3]);
    stepBackColourOrder();
    expect(steps()).toBe(0);
    expect(orderChips(phase()).map((chip) => chip.number)).toEqual([1, 2, 3]);
  });

  it('loses nothing to an edit made between two clicks: that is a step in between', () => {
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.name = 'Renamed';
    });
    expect(phase()?.step).toBe('paste');
    clickColourGlyph(glyph(cb, 1));
    clickColourGlyph(glyph(cb, 2));
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL, '1': YELLOW, '2': RED });
    expect(steps()).toBe(3);
    history.undo();
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL });
    expect(project().tracks[0]!.name).toBe('Renamed');
  });

  it('keeps what it pasted when it is left, and pastes the kept list again from its first', () => {
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    leaveColourOrder();
    expect(phase()).toBeNull();
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL });
    startColourPaste();
    expect(orderChips(phase()).map((chip) => chip.number)).toEqual([1, 2, 3]);
    clickColourGlyph(glyph(cb, 2));
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL, '2': TEAL });
    // Another paste: another step.
    expect(steps()).toBe(2);
  });

  it('starts over from the first colour with Shift+V while pasting', () => {
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    startColourPaste();
    expect(phase()).toMatchObject({ step: 'paste', pasted: [] });
    expect(formula('f2').glyphColors).toEqual({ '0': TEAL });
  });

  it('says how a list is copied when there is none to paste', () => {
    startColourPaste();
    expect(phase()).toBeNull();
    expect(notices().at(-1)?.title).toBe('No colours copied in order yet');
  });

  it('keeps the list after another project is opened', () => {
    copyThree();
    loadProject(createEmptyProject());
    expect(phase()).toBeNull();
    expect(useColourOrder.getState().kept).toHaveLength(3);
  });

  it('leaves the colour in the list when the glyph cannot be written: a text on a locked track', () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    copyThree();
    const before = steps();
    clickColourGlyph(glyph(ct, 0));
    expect(formula('p1').glyphColors).toEqual({});
    expect(steps()).toBe(before);
    expect(orderChips(phase()).map((chip) => chip.number)).toEqual([1, 2, 3]);
    expect(notices().at(-1)?.title).toBe('Text is used on a locked track');
  });
});

describe('what ends the mode', () => {
  it('is the undo of what it pasted', () => {
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    history.undo();
    expect(formula('f2').glyphColors).toEqual({});
    expect(phase()).toBeNull();
    expect(useColourOrder.getState().kept).toHaveLength(3);
  });

  it('is the formula it pasted on going', () => {
    copyThree();
    clickColourGlyph(glyph(cb, 0));
    useProjectStore.getState().update((draft) => {
      draft.clips = draft.clips.filter((c) => c.id !== cb.id);
      draft.formulas = draft.formulas.filter((f) => f.name !== 'f2');
    });
    expect(phase()).toBeNull();
  });

  it('is not an undo of something else, while nothing was pasted', () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.name = 'Renamed';
    });
    copyThree();
    history.undo();
    expect(phase()).toMatchObject({ step: 'paste', pasted: [] });
  });

  it('is another mode of the preview starting', () => {
    startColourCopy();
    useSymbolAlign.getState().toggle();
    expect(phase()).toBeNull();
    useSymbolAlign.getState().cancel();
    copyThree();
    useShapeRetarget.getState().start({ clipId: cs.id });
    expect(phase()).toBeNull();
  });
});
