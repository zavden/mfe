import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createEmptyProject, createFormulaOfKind } from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { rectContour } from '../../../geom';
import { TEXT_FONTENC_HINT } from '../../../engine/producers';
import {
  BACKEND_VERSIONS,
  renderKey,
  renderRequestFor,
  toSnapshot,
  type FormulaRender,
  type RenderRequest,
  type RenderResult,
} from '../../../engine';
import { useTransformEdit } from '../../animations/transformEdit';
import { usePreferences } from '../../preferences';
import { useDocumentStore } from '../../project/documentStore';
import { TextCompositionEditorHost } from '../TextCompositionEditor';
import { useTextComposition } from '../textCompositionStore';

const mock = vi.hoisted(() => {
  const offline = { status: 'offline' };
  return {
    render: vi.fn(),
    clearCache: vi.fn(),
    invalidateText: vi.fn(),
    companion: () => offline,
    onCompanionChange: () => () => {},
    client: {},
  };
});
vi.mock('../../../engine/instance', () => ({ getEngine: () => mock }));
vi.mock('../../transport/mainPlayback', () => ({ mainPlayback: { pause: vi.fn() } }));

const project = () => useProjectStore.getState().project;
const session = () => useTextComposition.getState().session;
/** What the line over the stage says, and what its dot tells (idle, busy, ok, error). */
const status = () =>
  screen.getByTestId('text-render-status').querySelector('.text-render-text')!.textContent;
const state = () => screen.getByTestId('text-render-status').getAttribute('data-state');
const canvas = () => screen.getByTestId('text-stage-canvas');

/** One glyph per letter of the source, in a row: what a renderer would answer. */
function rendered(
  request: RenderRequest & { kind: 'tex' },
  warnings: string[] = [],
): FormulaRender {
  const letters = [...request.source.replace(/\s/g, '')];
  const glyphs = letters.map((label, index) => {
    const bbox = { minX: index, minY: 0, maxX: index + 0.8, maxY: 1 };
    return { index, label, kind: 'char' as const, contours: [rectContour(bbox)], bbox };
  });
  return {
    key: renderKey(request, 'latex', BACKEND_VERSIONS.latex),
    backend: 'latex',
    exact: true,
    target: request.target,
    fontSize: request.fontSize,
    glyphs,
    bbox: { minX: 0, minY: 0, maxX: Math.max(1, letters.length), maxY: 1 },
    warnings,
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  mock.render.mockImplementation(
    async (request: RenderRequest & { kind: 'tex' }): Promise<RenderResult> => ({
      ok: true,
      render: rendered(request),
    }),
  );
  mock.render.mockClear();
  const p = createEmptyProject();
  const formula = createFormulaOfKind('tex', { name: 'caption', source: 'Before' });
  p.formulas = [formula];
  p.clips = [createClip(formula.id, p.tracks[0]!.id, 0, 8)];
  loadProject(p);
  useDocumentStore.getState().beginDocument(p, { fileName: null, handle: null });
  useRenderStore.setState({ entries: {}, resolved: new Map() });
  useUiStore.setState({ time: 0, playing: false, selection: { kind: 'none' } });
  useTransformEdit.setState({ editing: null, unlocked: [] });
  // The glyph view with its list of keys, which these tests read and pick glyphs by; it is left
  // out by default ("lists the glyphs only when its key asks for it").
  usePreferences.setState({ glyphList: true });
});

afterEach(() => {
  act(() => useTextComposition.getState().cancel());
  cleanup();
  vi.restoreAllMocks();
});

function open(clip = true) {
  const p = project();
  const host = render(<TextCompositionEditorHost />);
  act(() =>
    useTextComposition.getState().open(p.formulas[0]!.id, clip ? p.clips[0]!.id : undefined),
  );
  return host;
}

const type = (id: string, value: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value } });
const commit = (id: string, value: string) => {
  type(id, value);
  fireEvent.keyDown(screen.getByTestId(id), { key: 'Enter' });
};

describe('the composition workspace of a LaTeX text', () => {
  it('shows its source, size, colour and layout, and renders the draft as it is typed', async () => {
    open();
    expect(screen.getByTestId('text-composition').textContent).toContain(
      'LaTeX text composition · caption',
    );
    expect(screen.getByTestId('tex-source')).toHaveValue('Before');
    expect(screen.getByTestId('text-scale')).toHaveValue('1');
    expect(screen.getByTestId('text-font-size')).toHaveValue('48');
    expect(screen.getByTestId('tex-width')).toHaveValue('');
    expect(screen.getByTestId('tex-align-center')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('tex-line-spacing')).toHaveValue('1');
    // Nothing of a font text: no family, no saved appearance to refresh.
    expect(screen.queryByTestId('text-font-family')).toBeNull();
    expect(screen.queryByTestId('text-refresh')).toBeNull();
    await waitFor(() => expect(status()).toBe('6 glyphs · exact (LaTeX)'));
    expect(canvas()).toHaveAttribute('data-glyph-count', '6');
    expect(canvas()).toHaveAttribute('data-current', 'true');

    // The dot turns after the words: the colours of the draft follow its render.
    await waitFor(() => expect(state()).toBe('ok'));
    type('tex-source', 'Hello world');
    // While the draft is rendered again the words stay, as the stage does: only the dot tells.
    expect(state()).toBe('busy');
    expect(status()).toBe('6 glyphs · exact (LaTeX)');
    expect(screen.getByTestId('text-render-status')).toHaveAttribute('title', 'Rendering…');
    expect(canvas()).toHaveAttribute('data-current', 'false');
    await waitFor(() => expect(status()).toBe('10 glyphs · exact (LaTeX)'));
    await waitFor(() => expect(state()).toBe('ok'));
    expect(canvas()).toHaveAttribute('data-glyph-count', '10');
    // The project is untouched until Apply.
    expect(project().formulas[0]!.source).toBe('Before');
  });

  it.each([
    [1920, 1080, '14.2'],
    [1080, 1920, '4.5'],
    [1080, 1080, '8'],
  ])(
    'tells how wide the frame of a %i × %i project is, beside the width of the text',
    (width, height, units) => {
      act(() =>
        useProjectStore.getState().update((draft) => {
          Object.assign(draft.meta, { width, height });
        }),
      );
      open();
      const hint = screen.getByTestId('tex-width-hint');
      expect(hint).toHaveTextContent(`units (frame: ${units})`);
      expect(hint).toHaveAttribute(
        'title',
        `The frame is ${units} units wide. Empty: as wide as the text comes.`,
      );
    },
  );

  it('asks for the render the sync asks for: the layout and the size are part of it', async () => {
    open();
    await waitFor(() => expect(status()).toMatch(/exact/));
    mock.render.mockClear();
    commit('tex-width', '5');
    fireEvent.click(screen.getByTestId('tex-align-left'));
    commit('tex-line-spacing', '1.5');
    commit('text-scale', '3/2');
    expect(screen.getByTestId('text-font-size')).toHaveValue('72');
    await waitFor(() =>
      expect(mock.render.mock.calls.at(-1)?.[0]).toMatchObject({
        kind: 'tex',
        source: 'Before',
        layout: { width: 5, align: 'left', lineSpacing: 1.5 },
        fontSize: 72,
      }),
    );
    expect(session()!.draft).toMatchObject({
      layout: { width: 5, align: 'left', lineSpacing: 1.5 },
      fontSize: 72,
    });
    // What a field refuses never reaches the draft.
    commit('tex-line-spacing', '9');
    commit('tex-width', '-2');
    expect(session()!.draft).toMatchObject({ layout: { width: 5, lineSpacing: 1.5 } });
  });

  it('applies everything in one undo step, with the field being typed in', () => {
    open();
    const before = project();
    type('tex-source', 'After');
    fireEvent.change(screen.getByTestId('text-color'), { target: { value: '#ff8800' } });
    fireEvent.keyDown(screen.getByTestId('text-color'), { key: 'Enter' });
    act(() => useTextComposition.getState().setPosition([1, -2]));
    // Typed, not committed: Ctrl/⌘+Enter takes it with the rest.
    const width = screen.getByTestId('tex-width');
    width.focus();
    type('tex-width', '4');
    fireEvent.keyDown(width, { key: 'Enter', ctrlKey: true });
    expect(session()).toBeNull();
    expect(project().formulas[0]).toMatchObject({
      source: 'After',
      color: '#FF8800',
      layout: { width: 4, align: 'center', lineSpacing: 1 },
    });
    expect(project().clips[0]!.initial.position).toEqual([1, -2]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(project()).toBe(before);
  });

  it('keeps where a text opened from the library is put, for its new clips, while the box is ticked', () => {
    // From its clip the stage places that clip: no box.
    open();
    expect(screen.queryByTestId('text-keep-position')).toBeNull();
    expect(screen.getByTestId('text-placement-hint')).toHaveTextContent('clip initial state');
    act(() => useTextComposition.getState().cancel());
    // From the library it places where the new clips start, and says so.
    const id = project().formulas[0]!.id;
    act(() => useTextComposition.getState().open(id));
    const box = () => screen.getByTestId('text-keep-position');
    const hint = () => screen.getByTestId('text-placement-hint');
    expect(box()).toBeChecked();
    expect(hint()).toHaveTextContent(
      'Library object: new clips start at this position. Clips already on the timeline keep theirs.',
    );
    type('text-position-x', '-5');
    type('text-position-y', '3');
    fireEvent.click(box());
    expect(box()).not.toBeChecked();
    expect(session()!.keepPosition).toBe(false);
    expect(hint()).toHaveTextContent(
      'Library object: stage placement is provisional and is not saved.',
    );
    fireEvent.click(box());
    expect(box()).toBeChecked();
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(session()).toBeNull();
    expect(project().formulas[0]!.startPosition).toEqual([-5, 3]);
    // The clip it has stays where it was.
    expect(project().clips[0]!.initial.position).toEqual([0, 0]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    // Opened again, the stage shows it there, the box ticked again.
    act(() => useTextComposition.getState().open(id));
    expect(screen.getByTestId('text-position-x')).toHaveValue('-5');
    expect(screen.getByTestId('text-position-y')).toHaveValue('3');
    expect(box()).toBeChecked();
    // Unticked, Apply leaves the position the text had.
    type('text-position-x', '1');
    fireEvent.click(box());
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(project().formulas[0]!.startPosition).toEqual([-5, 3]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('says what LaTeX refused, with its log, and keeps the last valid appearance', async () => {
    open();
    await waitFor(() => expect(status()).toMatch(/6 glyphs/));
    mock.render.mockResolvedValue({
      ok: false,
      error: {
        backend: 'latex',
        message: 'Undefined control sequence \\foo',
        log: '! Undefined control sequence.\nl.7 \\foo',
      },
    });
    type('tex-source', 'Before \\foo');
    await waitFor(() => expect(status()).toBe('Cannot render'));
    const error = screen.getByTestId('text-render-error');
    expect(error.textContent).toContain('Undefined control sequence \\foo');
    expect(error.querySelector('pre')!.textContent).toContain('l.7 \\foo');
    expect(state()).toBe('error');
    expect(error.textContent).toContain('keeps the last appearance');
    // What it says is in the strip under the stage, which never moves it.
    expect(screen.getByTestId('text-messages')).toContainElement(error);
    expect(canvas()).toHaveAttribute('data-glyph-count', '6');
    expect(canvas()).toHaveAttribute('data-current', 'false');
    // A source that does not compile can still be applied, as in the Creator's list.
    expect(screen.getByTestId('text-apply')).toBeEnabled();
  });

  it('draws nothing for an empty source, and asks for nothing', async () => {
    open();
    await waitFor(() => expect(status()).toMatch(/6 glyphs/));
    mock.render.mockClear();
    type('tex-source', '   ');
    expect(status()).toBe('Empty: nothing is drawn.');
    expect(state()).toBe('idle');
    expect(canvas()).toHaveAttribute('data-glyph-count', '0');
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(mock.render).not.toHaveBeenCalled();
  });

  it('shows what the render warns of: the fontenc hint of accented letters', async () => {
    mock.render.mockImplementation(async (request: RenderRequest & { kind: 'tex' }) => ({
      ok: true,
      render: rendered(request, /[^ -~]/.test(request.source) ? [TEXT_FONTENC_HINT] : []),
    }));
    open();
    await waitFor(() => expect(status()).toMatch(/6 glyphs/));
    expect(screen.queryByTestId('text-render-warnings')).toBeNull();
    type('tex-source', 'café');
    await waitFor(() =>
      expect(screen.getByTestId('text-render-warnings').textContent).toContain('fontenc'),
    );
  });

  it('edits its name, tag and intro as part of the draft, applied with the rest', () => {
    open();
    const before = project();
    expect(screen.getByTestId('text-name')).toHaveValue('caption');
    commit('text-name', 'not a name');
    expect(session()!.draft).toMatchObject({ name: 'caption' });
    type('text-name', 'class');
    expect(screen.getByTestId('text-name-error').textContent).toMatch(/Python keyword/);
    commit('text-name', 'heading');
    fireEvent.click(screen.getByTestId('tag-color-FC6255'));
    commit('text-tag-icon', '★');
    expect(screen.queryByTestId('text-intro-duration')).toBeNull();
    fireEvent.change(screen.getByTestId('text-intro'), { target: { value: 'write' } });
    commit('text-intro-duration', '2');
    expect(session()!.draft).toMatchObject({
      name: 'heading',
      tag: { color: '#FC6255', icon: '★' },
      intro: { kind: 'write', duration: 2 },
    });
    // Still a draft: the project has none of it.
    expect(project()).toBe(before);
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(project().formulas[0]).toMatchObject({
      name: 'heading',
      tag: { color: '#FC6255', icon: '★' },
      intro: { kind: 'write', duration: 2 },
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    // "Default" gives the intro back to the editor's preference.
    act(() => useTextComposition.getState().open(project().formulas[0]!.id));
    fireEvent.change(screen.getByTestId('text-intro'), { target: { value: '' } });
    expect(session()!.draft).toMatchObject({ intro: null });
  });
});

/** The project's text as the render sync leaves it: rendered, with its snapshot, coloured. */
function applied(glyphColors: Record<string, string> = {}, hiddenGlyphs: number[] = []) {
  const meta = project().meta;
  const picture = rendered(
    renderRequestFor(project().formulas[0]!, meta, 'auto') as RenderRequest & { kind: 'tex' },
  );
  useProjectStore.getState().amend((draft) => {
    Object.assign(draft.formulas[0]!, {
      glyphColors,
      hiddenGlyphs,
      snapshot: toSnapshot(picture),
    });
  });
  const formula = project().formulas[0]!;
  useRenderStore.setState({
    resolved: new Map([
      [
        formula.id,
        {
          formula,
          render: picture,
          canonToRender: picture.glyphs.map((glyph) => glyph.index),
          confidence: 1,
        },
      ],
    ]),
  });
  return picture;
}

const paint = () => session()!.paint;
const chip = (index: number) => screen.getByTestId(`glyph-chip-${index}`);
const showGlyphs = () => fireEvent.click(screen.getByTestId('text-view-glyphs'));
/** The draft's render is the one the paint counts by. */
const settled = (source: string) =>
  waitFor(() => {
    expect(state()).toBe('ok');
    expect((paint()!.basis.request as { source: string }).source).toBe(source);
  });

describe('the glyph colours of a LaTeX text being composed', () => {
  it('starts with the applied colours, on the stage and in the glyph view', async () => {
    applied({ '1': '#ff0000' }, [5]);
    open();
    await settled('Before');
    expect(paint()).toMatchObject({
      paint: { colors: { '1': '#ff0000' }, hidden: [5] },
      origin: [0, 1, 2, 3, 4, 5],
      edited: false,
    });
    // The stage is what shows first; the glyph view is the other side of the switch.
    expect(screen.queryByTestId('text-glyphs')).toBeNull();
    showGlyphs();
    expect(screen.getAllByTestId(/^glyph-chip-\d+$/)).toHaveLength(6);
    const swatch = chip(1).querySelector<HTMLElement>('.glyph-swatch')!;
    expect(swatch).toHaveAttribute('data-own', 'true');
    expect(swatch.style.background).toBe('rgb(255, 0, 0)');
    expect(chip(5)).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('text-stage-canvas').closest('[hidden]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('text-view-placement'));
    expect(screen.getByTestId('text-stage-canvas').closest('[hidden]')).toBeNull();
  });

  it('follows the glyphs as the text is typed, with where the canonical ones went', async () => {
    applied({ '1': '#ff0000' }, [5]);
    open();
    await settled('Before');
    type('tex-source', 'XBefore');
    await settled('XBefore');
    expect(paint()).toMatchObject({
      paint: { colors: { '2': '#ff0000' }, hidden: [6] },
      origin: [1, 2, 3, 4, 5, 6],
      edited: false,
    });
    type('tex-source', 'XBe');
    await settled('XBe');
    expect(paint()).toMatchObject({
      paint: { colors: { '2': '#ff0000' }, hidden: [] },
      origin: [1, 2, null, null, null, null],
    });
  });

  it('lets the selection go when the draft is rendered anew: its indices are other glyphs then', async () => {
    applied();
    open();
    await settled('Before');
    showGlyphs();
    fireEvent.click(chip(0));
    fireEvent.click(chip(1), { ctrlKey: true });
    expect(screen.getByTestId('glyph-selection').textContent).toBe('2 selected: 0, 1');
    // The colour of the text is no new render: the selection stays.
    fireEvent.change(screen.getByTestId('text-color'), { target: { value: '#ff8800' } });
    expect(chip(0)).toHaveAttribute('aria-pressed', 'true');
    type('tex-source', 'XBefore');
    await settled('XBefore');
    expect(chip(0)).toHaveAttribute('aria-pressed', 'false');
    expect(chip(1)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('glyph-selection').textContent).toMatch(/^Click glyphs/);
  });

  it('writes colours set on an unchanged text by its canonical glyphs: the snapshot stays', async () => {
    applied({ '1': '#ff0000' });
    const before = project();
    open();
    await settled('Before');
    showGlyphs();
    fireEvent.click(chip(0));
    fireEvent.click(chip(2), { ctrlKey: true });
    fireEvent.click(screen.getByTestId('palette-RED'));
    fireEvent.click(chip(1));
    fireEvent.click(screen.getByTestId('glyph-clear-selected'));
    fireEvent.click(chip(4));
    fireEvent.click(screen.getByTestId('glyph-hide'));
    expect(chip(4)).toHaveAttribute('data-hidden', 'true');
    // A draft still: the project has none of it.
    expect(project()).toBe(before);
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(session()).toBeNull();
    const after = project().formulas[0]!;
    expect(after.glyphColors).toEqual({ '0': '#FC6255', '2': '#FC6255' });
    expect(after.hiddenGlyphs).toEqual([4]);
    expect(after.snapshot).toBe(before.formulas[0]!.snapshot);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(project()).toBe(before);
  });

  it('writes colours set on an edited text with the render of the draft as its snapshot', async () => {
    applied({ '1': '#ff0000' }, [5]);
    const before = project();
    open();
    await settled('Before');
    type('tex-source', 'XBefore');
    await settled('XBefore');
    showGlyphs();
    fireEvent.click(chip(0));
    fireEvent.click(screen.getByTestId('palette-BLUE'));
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(session()).toBeNull();
    const after = project().formulas[0]!;
    expect(after.source).toBe('XBefore');
    expect(after.snapshot).toEqual(toSnapshot(paintRender('XBefore')));
    expect(after.glyphColors).toEqual({ '0': '#58C4DD', '2': '#ff0000' });
    expect(after.hiddenGlyphs).toEqual([6]);
    // The step the references of the project followed, for whoever holds the old indices.
    expect(useRenderStore.getState().transitions[after.id]).toEqual({
      from: before.formulas[0]!.snapshot!.key,
      to: after.snapshot!.key,
      map: [1, 2, 3, 4, 5, 6],
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(project()).toBe(before);
  });

  it('leaves the colours to the render sync when none was touched: Apply writes the text only', async () => {
    applied({ '1': '#ff0000' });
    const before = project();
    open();
    await settled('Before');
    type('tex-source', 'XBefore');
    await settled('XBefore');
    fireEvent.click(screen.getByTestId('text-apply'));
    const after = project().formulas[0]!;
    expect(after.source).toBe('XBefore');
    expect(after.snapshot).toBe(before.formulas[0]!.snapshot);
    expect(after.glyphColors).toEqual({ '1': '#ff0000' });
  });

  it("lists the glyphs only when its key asks for it; the key is the glyph view's", async () => {
    usePreferences.setState({ glyphList: false });
    open();
    await settled('Before');
    // The stage has no glyphs to list: no key.
    expect(screen.queryByTestId('glyph-list-toggle')).toBeNull();
    showGlyphs();
    const key = screen.getByTestId('glyph-list-toggle');
    expect(key).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('glyph-0')).toBeInTheDocument();
    expect(screen.queryByTestId('glyph-chips')).toBeNull();
    fireEvent.click(key);
    expect(key).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId(/^glyph-chip-\d+$/)).toHaveLength(6);
    fireEvent.click(screen.getByTestId('text-view-placement'));
    expect(screen.queryByTestId('glyph-list-toggle')).toBeNull();
  });

  it('has nothing to list while the text is empty: the key waits', () => {
    usePreferences.setState({ glyphList: false });
    const host = render(<TextCompositionEditorHost />);
    act(() => useTextComposition.getState().open(undefined, undefined, 'tex'));
    showGlyphs();
    expect(screen.getByTestId('glyph-view-empty')).toBeInTheDocument();
    expect(screen.getByTestId('glyph-list-toggle')).toBeDisabled();
    host.unmount();
  });

  it('colours a new text before it exists: Apply creates it painted', async () => {
    const host = render(<TextCompositionEditorHost />);
    act(() => useTextComposition.getState().open(undefined, undefined, 'tex'));
    showGlyphs();
    expect(screen.getByTestId('glyph-view-empty').textContent).toMatch(/Type some text/);
    type('tex-source', 'ab');
    await settled('ab');
    fireEvent.click(chip(1));
    fireEvent.click(screen.getByTestId('palette-RED'));
    fireEvent.click(chip(0));
    fireEvent.click(screen.getByTestId('glyph-hide'));
    fireEvent.click(screen.getByTestId('text-apply'));
    const added = project().formulas.at(-1)!;
    expect(added).toMatchObject({
      kind: 'tex',
      source: 'ab',
      glyphColors: { '1': '#FC6255' },
      hiddenGlyphs: [0],
    });
    expect(added.snapshot).toEqual(toSnapshot(paintRender('ab', added)));
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    host.unmount();
  });

  it('waits for the render the colours count by: no Apply while the text does not render', async () => {
    applied();
    open();
    await settled('Before');
    showGlyphs();
    fireEvent.click(chip(0));
    fireEvent.click(screen.getByTestId('palette-RED'));
    expect(screen.getByTestId('text-apply')).toBeEnabled();
    mock.render.mockResolvedValueOnce({
      ok: false,
      error: { backend: 'latex', message: 'Undefined control sequence \\foo' },
    });
    type('tex-source', 'Before \\foo');
    expect(screen.getByTestId('text-apply')).toBeDisabled();
    await waitFor(() => expect(status()).toBe('Cannot render'));
    expect(screen.getByTestId('text-paint-waits')).toBeInTheDocument();
    expect(screen.getByTestId('text-apply')).toBeDisabled();
    // Ctrl/⌘+Enter is refused the same way, with the reason.
    expect(useTextComposition.getState().apply()).toBe(false);
    expect(session()!.error).toMatch(/earlier render/);
    type('tex-source', 'Before!');
    await settled('Before!');
    expect(screen.queryByTestId('text-paint-waits')).toBeNull();
    expect(screen.getByTestId('text-apply')).toBeEnabled();
    // An empty text has nothing to paint: it applies.
    type('tex-source', '');
    expect(screen.getByTestId('text-apply')).toBeEnabled();
  });
});

/** The render of the project's text (or of `formula`) written as `source`. */
function paintRender(source: string, formula = project().formulas[0]!) {
  return rendered(
    renderRequestFor(
      { ...formula, source } as typeof formula,
      project().meta,
      'auto',
    ) as RenderRequest & {
      kind: 'tex';
    },
  );
}
