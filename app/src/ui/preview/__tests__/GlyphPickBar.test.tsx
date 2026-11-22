/* The bar and the right-click menu of the glyphs picked in the preview (GlyphPickBar.tsx,
 * GlyphPickMenu.tsx): what they name, and the colour, colour sequence, brace and shape actions
 * they run. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { colourPickedGlyphs, useColourSequenceClipboard } from '../glyphActions';
import { GlyphPickBar } from '../GlyphPickBar';
import { GlyphPickMenu } from '../GlyphPickMenu';
import { withServices } from '../../../test/services';
import { startGlyphPickTracking, useGlyphPick } from '../glyphPickStore';
import { boxSnapshot } from './resolvedBoxes';

withServices(startGlyphPickTracking);

const project = () => useProjectStore.getState().project;
const box = (minX: number, maxX: number): Box => ({ minX, minY: -0.5, maxX, maxY: 0.5 });
const pick = { parts: [{ clipId: 'a', selection: { selected: new Set([0, 2]), anchor: 0 } }] };

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
  useGlyphPick.getState().set(pick);
  useGlyphsDialog.getState().close();
  useColourSequenceClipboard.getState().set(null);
});

/** Pick these glyphs of clip `a`. */
const pickGlyphs = (glyphs: number[]) =>
  act(() =>
    useGlyphPick.getState().set({
      parts: [{ clipId: 'a', selection: { selected: new Set(glyphs), anchor: glyphs[0]! } }],
    }),
  );

/** Put a second clip of the formula on screen, `b`, and pick its glyph 1 with glyphs 0 and 2 of
 * `a`: a pick over two clips, which are the selection. */
const pickInTwoClips = () =>
  act(() => {
    useProjectStore.getState().update((draft) => {
      const b = createClip('f1', draft.tracks[2]!.id, 0, 6);
      b.id = 'b';
      draft.clips.push(b);
    });
    useUiStore.getState().select({ kind: 'clips', ids: ['a', 'b'] });
    useGlyphPick.getState().set({
      parts: [...pick.parts, { clipId: 'b', selection: { selected: new Set([1]), anchor: 1 } }],
    });
  });

describe('GlyphPickBar', () => {
  it('names a pick over several formulas, colours it and clears it; nothing of one formula', () => {
    pickInTwoClips();
    const view = render(<GlyphPickBar pick={useGlyphPick.getState().pick!} />);
    expect(screen.getByTestId('glyph-pick-count')).toHaveTextContent('3 glyphs of 2 formulas');
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    expect(screen.getByTestId('glyph-pick-color-menu-header')).toHaveTextContent(
      '3 glyphs of 2 formulas',
    );
    expect(screen.getByTestId('glyph-pick-color-menu-clear-color')).toBeDisabled();
    for (const item of ['hide', 'show', 'copy-sequence', 'paste-sequence'])
      expect(screen.queryByTestId(`glyph-pick-color-menu-${item}`)).toBeNull();
    fireEvent.click(screen.getByTestId('glyph-pick-color-menu-color-RED'));
    // The two clips show one formula: its three picked glyphs are red, in one undo step.
    const red = '#FC6255';
    expect(project().formulas[0]!.glyphColors).toEqual({ '0': red, '1': red, '2': red });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(2);
    view.rerender(<GlyphPickBar pick={useGlyphPick.getState().pick!} />);
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    fireEvent.click(screen.getByTestId('glyph-pick-color-menu-clear-color'));
    expect(project().formulas[0]!.glyphColors).toEqual({});
    fireEvent.click(screen.getByTestId('glyph-pick-clear'));
    expect(useGlyphPick.getState().pick).toBeNull();
  });

  it('adds one brace, or one shape, over a pick in several formulas; no dialog of one formula', () => {
    pickInTwoClips();
    const view = render(<GlyphPickBar pick={useGlyphPick.getState().pick!} />);
    fireEvent.click(screen.getByTestId('glyph-pick-brace'));
    expect(screen.queryByTestId('glyph-pick-brace-glyphs')).toBeNull();
    fireEvent.click(screen.getByTestId('glyph-pick-brace-left'));
    expect(project().clips.at(-1)!.attach).toEqual({
      rule: 'brace',
      clipId: 'a',
      glyphs: [0, 2],
      direction: -90,
      buff: 0.2,
      also: [{ clipId: 'b', glyphs: [1] }],
    });
    expect(useGlyphPick.getState().pick).toBeNull();
    // The brace is the selection now: pick the glyphs of the two clips again.
    act(() => {
      useUiStore.getState().select({ kind: 'clips', ids: ['a', 'b'] });
      useGlyphPick.getState().set({
        parts: [...pick.parts, { clipId: 'b', selection: { selected: new Set([1]), anchor: 1 } }],
      });
    });
    view.rerender(<GlyphPickBar pick={useGlyphPick.getState().pick!} />);
    fireEvent.click(screen.getByTestId('glyph-pick-shape'));
    expect(screen.queryByTestId('glyph-pick-shape-glyphs')).toBeNull();
    fireEvent.click(screen.getByTestId('glyph-pick-shape-circle'));
    expect(project().clips.at(-1)!.attach).toMatchObject({
      rule: 'shape',
      clipId: 'a',
      glyphs: [0, 2],
      also: [{ clipId: 'b', glyphs: [1] }],
    });
  });

  it('names the pick, colours it from the Colour menu, and clears it', () => {
    render(<GlyphPickBar pick={useGlyphPick.getState().pick!} />);
    expect(screen.getByTestId('glyph-pick-count')).toHaveTextContent('2 glyphs of f1: 0, 2');
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    const menu = screen.getByTestId('glyph-pick-color-menu');
    expect(menu).toHaveAttribute('aria-label', 'Selected glyphs');
    expect(screen.getByTestId('glyph-pick-color-menu-clear-color')).toBeDisabled();
    expect(screen.getByTestId('glyph-pick-color-menu-show')).toBeDisabled();
    fireEvent.click(screen.getByTestId('glyph-pick-color-menu-color-RED'));
    expect(project().formulas[0]!.glyphColors).toEqual({ '0': '#FC6255', '2': '#FC6255' });
    expect(screen.queryByTestId('glyph-pick-color-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    expect(screen.getByTestId('glyph-pick-color-menu-clear-color')).toBeEnabled();
    fireEvent.click(screen.getByTestId('glyph-pick-color-menu-clear-color'));
    expect(project().formulas[0]!.glyphColors).toEqual({});
    fireEvent.click(screen.getByTestId('glyph-pick-clear'));
    expect(useGlyphPick.getState().pick).toBeNull();
  });

  it('copies the colours of the pick as a sequence, and pastes it where it goes', () => {
    act(() => colourPickedGlyphs('#FC6255'));
    const bar = () => <GlyphPickBar pick={useGlyphPick.getState().pick!} />;
    const view = render(bar());
    const paste = () => screen.getByTestId('glyph-pick-color-menu-paste-sequence');
    const note = () => screen.getByTestId('glyph-pick-color-menu-paste-sequence-note');
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    expect(paste()).toBeDisabled();
    expect(note()).toHaveTextContent('Nothing copied yet.');
    expect(paste()).toHaveAttribute('aria-describedby', note().id);
    fireEvent.click(screen.getByTestId('glyph-pick-color-menu-copy-sequence'));
    expect(screen.queryByTestId('glyph-pick-color-menu')).toBeNull();
    expect(useColourSequenceClipboard.getState().sequence).toEqual({
      entries: [
        { label: 'x', color: '#FC6255' },
        { label: 'x', color: '#FC6255' },
      ],
      from: 'f1',
      backend: 'mathjax',
    });
    // One glyph: the sequence does not go, and the menu says why.
    pickGlyphs([1]);
    view.rerender(bar());
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    expect(paste()).toBeDisabled();
    expect(note()).toHaveTextContent('The copied sequence has 2 glyphs; this selection has 1.');
    fireEvent.keyDown(window, { key: 'Escape' });
    // Two glyphs: it goes.
    pickGlyphs([1, 2]);
    view.rerender(bar());
    fireEvent.click(screen.getByTestId('glyph-pick-color'));
    expect(paste()).toBeEnabled();
    expect(note()).toHaveTextContent('2 glyphs of f1, 2 coloured.');
    fireEvent.click(paste());
    expect(project().formulas[0]!.glyphColors).toEqual({
      '0': '#FC6255',
      '1': '#FC6255',
      '2': '#FC6255',
    });
    expect(screen.queryByTestId('glyph-pick-color-menu')).toBeNull();
  });

  it('puts a brace or a shape on the pick from its menus, or opens the dialog on it', () => {
    render(<GlyphPickBar pick={useGlyphPick.getState().pick!} />);
    fireEvent.click(screen.getByTestId('glyph-pick-brace'));
    expect(screen.getByTestId('glyph-pick-brace-menu')).toHaveAttribute('aria-label', 'Add brace');
    fireEvent.click(screen.getByTestId('glyph-pick-brace-glyphs'));
    expect(useGlyphsDialog.getState()).toMatchObject({
      clipId: 'a',
      what: 'brace',
      glyphs: [0, 2],
    });
    expect(screen.queryByTestId('glyph-pick-brace-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('glyph-pick-brace'));
    fireEvent.click(screen.getByTestId('glyph-pick-brace-left'));
    const brace = project().clips.at(-1)!;
    expect(brace.attach).toMatchObject({
      rule: 'brace',
      clipId: 'a',
      glyphs: [0, 2],
      direction: -90,
    });
    expect(useGlyphPick.getState().pick).toBeNull();
    // Adding the brace selected it; return to the source and pick its glyphs again.
    act(() => {
      useUiStore.getState().select({ kind: 'clips', ids: ['a'] });
      useGlyphPick.getState().set(pick);
    });
    fireEvent.click(screen.getByTestId('glyph-pick-shape'));
    fireEvent.click(screen.getByTestId('glyph-pick-shape-underline'));
    const shape = project().clips.at(-1)!;
    expect(shape.attach).toMatchObject({ rule: 'shape', clipId: 'a', glyphs: [0, 2] });
    expect(project().formulas.find((f) => f.id === shape.formulaId)).toMatchObject({
      kind: 'shape',
      shape: 'underline',
    });
  });
});

describe('GlyphPickMenu', () => {
  it('offers glyphs picked in several formulas a colour, a brace and a shape, and no more', () => {
    pickInTwoClips();
    const onClose = vi.fn();
    render(<GlyphPickMenu x={0} y={0} pick={useGlyphPick.getState().pick!} onClose={onClose} />);
    expect(screen.getByTestId('glyph-pick-menu-header')).toHaveTextContent(
      '3 glyphs of 2 formulas',
    );
    for (const item of ['hide', 'show', 'copy-sequence', 'paste-sequence'])
      expect(screen.queryByTestId(`glyph-pick-menu-${item}`)).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('glyph-pick-menu-color'));
    fireEvent.click(screen.getByTestId('glyph-pick-menu-color-BLUE'));
    const blue = '#58C4DD';
    expect(project().formulas[0]!.glyphColors).toEqual({ '0': blue, '1': blue, '2': blue });
    expect(onClose).toHaveBeenCalledTimes(1);
    // A side or a shape, over them all; the dialog of one object is not offered.
    fireEvent.mouseEnter(screen.getByTestId('glyph-pick-menu-shape'));
    expect(screen.getByTestId('glyph-pick-menu-shape-highlight')).toBeInTheDocument();
    expect(screen.queryByTestId('glyph-pick-menu-shape-glyphs')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('glyph-pick-menu-brace'));
    expect(screen.queryByTestId('glyph-pick-menu-brace-glyphs')).toBeNull();
    fireEvent.click(screen.getByTestId('glyph-pick-menu-brace-up'));
    expect(project().clips.at(-1)!.attach).toMatchObject({
      rule: 'brace',
      clipId: 'a',
      direction: 180,
      also: [{ clipId: 'b', glyphs: [1] }],
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers the colours, hiding, and the brace and shape submenus on the pick', () => {
    const onClose = vi.fn();
    render(<GlyphPickMenu x={0} y={0} pick={useGlyphPick.getState().pick!} onClose={onClose} />);
    expect(screen.getByTestId('glyph-pick-menu-header')).toHaveTextContent('2 glyphs of f1: 0, 2');
    // Colour ›, Add brace › and Add shape › are submenus; hiding stays at the top level.
    const submenu = (id: string) =>
      fireEvent.mouseEnter(screen.getByTestId(`glyph-pick-menu-${id}`));
    expect(screen.queryByTestId('glyph-pick-menu-clear-color')).toBeNull();
    submenu('color');
    expect(screen.getByTestId('glyph-pick-menu-clear-color')).toBeInTheDocument();
    submenu('brace');
    expect(screen.queryByTestId('glyph-pick-menu-clear-color')).toBeNull();
    expect(screen.getByTestId('glyph-pick-menu-brace-down')).toBeInTheDocument();
    submenu('shape');
    expect(screen.getByTestId('glyph-pick-menu-shape-highlight')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('glyph-pick-menu-hide'));
    expect(project().formulas[0]!.hiddenGlyphs).toEqual([0, 2]);
    expect(onClose).toHaveBeenCalledTimes(1);
    submenu('brace');
    fireEvent.click(screen.getByTestId('glyph-pick-menu-brace-down'));
    expect(project().clips.at(-1)!.attach).toMatchObject({
      rule: 'brace',
      glyphs: [0, 2],
      direction: 0,
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => {
      useUiStore.getState().select({ kind: 'clips', ids: ['a'] });
      useGlyphPick.getState().set(pick);
    });
    submenu('shape');
    fireEvent.click(screen.getByTestId('glyph-pick-menu-shape-glyphs'));
    expect(useGlyphsDialog.getState()).toMatchObject({
      clipId: 'a',
      what: 'shape',
      glyphs: [0, 2],
    });
  });

  it('copies and pastes a colour sequence at its top level, pairing the glyphs by symbol', () => {
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.formulas[0]!.snapshot!.glyphs.forEach((glyph, i) => (glyph.label = 'abc'[i]!));
        draft.formulas[0]!.glyphColors = { '0': '#FFFF00' };
      });
      useColourSequenceClipboard.getState().set({
        entries: [
          { label: 'c', color: '#58C4DD' },
          { label: 'a', color: null },
        ],
        from: 'other',
        backend: 'mathjax',
      });
    });
    const onClose = vi.fn();
    render(<GlyphPickMenu x={0} y={0} pick={useGlyphPick.getState().pick!} onClose={onClose} />);
    // No submenu is open: the two entries and the line under Paste are in the menu itself.
    expect(screen.getByTestId('glyph-pick-menu-copy-sequence')).toHaveTextContent(
      'Copy colour sequence',
    );
    expect(screen.getByTestId('glyph-pick-menu-paste-sequence')).toBeEnabled();
    expect(screen.getByTestId('glyph-pick-menu-paste-sequence-note')).toHaveTextContent(
      '2 glyphs of other, 1 coloured. Paired by symbol: the glyph orders differ.',
    );
    fireEvent.click(screen.getByTestId('glyph-pick-menu-paste-sequence'));
    // The pick is «a» and «c»: «c» takes its colour, «a» loses the one it had.
    expect(project().formulas[0]!.glyphColors).toEqual({ '2': '#58C4DD' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('glyph-pick-menu-copy-sequence'));
    expect(useColourSequenceClipboard.getState().sequence).toEqual({
      entries: [
        { label: 'a', color: null },
        { label: 'c', color: '#58C4DD' },
      ],
      from: 'f1',
      backend: 'mathjax',
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('says under Paste what the symbols do not tell: unnamed glyphs, another renderer', () => {
    act(() => {
      // The picked glyphs (0 and 2) have no known symbol; what was copied came from LaTeX.
      useColourSequenceClipboard.getState().set({
        entries: [
          { label: '?', color: '#58C4DD' },
          { label: '?', color: null },
        ],
        from: 'other',
        backend: 'latex',
      });
      useProjectStore.getState().update((draft) => {
        draft.formulas[0]!.snapshot!.glyphs.forEach((glyph) => (glyph.label = '?'));
      });
    });
    render(<GlyphPickMenu x={0} y={0} pick={useGlyphPick.getState().pick!} onClose={vi.fn()} />);
    expect(screen.getByTestId('glyph-pick-menu-paste-sequence')).toBeEnabled();
    expect(screen.getByTestId('glyph-pick-menu-paste-sequence-note')).toHaveTextContent(
      '2 glyphs of other, 1 coloured. ' +
        '2 glyphs have no known symbol: they are paired in glyph order. ' +
        'Copied from a LaTeX render, pasted on a MathJax one: ' +
        'equal symbols may be paired in another order.',
    );
    fireEvent.click(screen.getByTestId('glyph-pick-menu-paste-sequence'));
    expect(project().formulas[0]!.glyphColors).toEqual({ '0': '#58C4DD' });
  });
});
