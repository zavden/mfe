import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { packagesOf, createClip, createEmptyProject } from '../../../model';
import {
  history,
  loadProject,
  useProjectStore,
  useRenderStore,
  useSyncWarnings,
  useUiStore,
} from '../../../store';
import { useFormulaEditor } from '../formulaEditorStore';
import { useMultiEdit } from '../multiEditStore';
import { useDialogStore } from '../../project/dialogStore';
import { useDocumentStore } from '../../project/documentStore';
import { useNoticeStore } from '../../project/noticeStore';
import { usePreferences } from '../../preferences';

// An engine whose companion is never reachable (the tests must not depend on a local one).
vi.mock('../../../engine/instance', async () => {
  const { createEngine } = await import('../../../engine/engine');
  const engine = createEngine({
    companion: {
      fetch: (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      watchFocus: false,
    },
  });
  return { getEngine: () => engine };
});

const project = () => useProjectStore.getState().project;

// react-resizable-panels listens to pointer events on the document and, with jsdom's all-zero
// layout, treats every click as a press on a panel separator and steals the focus. Tests
// therefore set values with change events and focus elements explicitly instead of
// click-then-type.
const setValue = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  loadProject(createEmptyProject());
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
  useSyncWarnings.getState().clear();
  useDocumentStore.getState().markClean(project(), { fileName: null, handle: null });
  useNoticeStore.getState().clear();
  useFormulaEditor.getState().close();
  // The glyph views with their list of keys, which these tests read and pick glyphs by (it is
  // left out by default: GlyphColors.test.tsx).
  usePreferences.setState({ glyphList: true });
});

/** Create a formula through the UI and apply its LaTeX; leaves the editor open. */
async function createFormula(user: ReturnType<typeof userEvent.setup>, latex: string) {
  await user.click(screen.getByTestId('creator-new'));
  const editor = await screen.findByTestId('formula-editor');
  setValue(within(editor).getByTestId('raw-latex'), latex);
  await user.click(within(editor).getByTestId('editor-apply'));
  return editor;
}

describe('Creator list', () => {
  it('starts empty, creates a formula and opens the editor on it', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('creator-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('creator-new'));
    const editor = await screen.findByTestId('formula-editor');
    expect(within(editor).getByTestId('editor-name')).toHaveValue('f1');
    expect(project().formulas.map((f) => f.name)).toEqual(['f1']);
    expect(useUiStore.getState().selection).toEqual({
      kind: 'formula',
      id: project().formulas[0]!.id,
    });
    // MathLive cannot run under jsdom: the raw field still works and says so.
    expect(await within(editor).findByRole('alert')).toHaveTextContent(
      /visual editor could not be loaded/,
    );
  });

  it('the arrow of + New lists enabled kinds and retains Formula as the default', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('creator-new-menu'));
    const menu = await screen.findByTestId('creator-new-kinds');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Formula', 'Text (LaTeX)', 'Text (font)']);
    expect(within(menu).getByTestId('creator-new-math')).toBeEnabled();
    expect(within(menu).getByTestId('creator-new-tex')).toBeEnabled();
    expect(within(menu).getByTestId('creator-new-text')).toBeEnabled();
    await user.click(within(menu).getByTestId('creator-new-math'));
    expect(screen.queryByTestId('creator-new-kinds')).toBeNull();
    const editor = await screen.findByTestId('formula-editor');
    expect(within(editor).getByTestId('editor-name')).toHaveValue('f1');
    expect(project().formulas.map((f) => f.kind)).toEqual(['math']);
  });

  it('creates a LaTeX text from the menu in the composition workspace: nothing exists until Apply', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('creator-new-menu'));
    await user.click(await screen.findByTestId('creator-new-tex'));
    const editor = await screen.findByTestId('text-composition');
    expect(screen.queryByTestId('formula-editor')).toBeNull();
    expect(editor).toHaveTextContent('LaTeX text composition · t1');
    expect(within(editor).getByTestId('text-name')).toHaveValue('t1');
    expect(within(editor).queryByTestId('raw-latex')).toBeNull();
    expect(project().formulas).toHaveLength(0);
    setValue(within(editor).getByTestId('tex-source'), 'Hi $x$\\\\bye');
    // Its rows as glyphs, in the glyph view of the draft.
    await user.click(within(editor).getByTestId('text-view-glyphs'));
    const chips = await within(editor).findByTestId('glyph-chips');
    await vi.waitFor(() => {
      expect(
        within(chips)
          .getAllByRole('listitem')
          .map((li) => li.firstElementChild!.getAttribute('data-label')),
      ).toEqual(['H', 'i', 'x', 'b', 'y', 'e']);
    });
    // The layout is part of the draft: a width too narrow for a row re-renders it broken, with
    // the free-mode warning.
    const width = within(editor).getByTestId('tex-width');
    setValue(width, '0.5');
    fireEvent.blur(width);
    await vi.waitFor(() =>
      expect(within(editor).getByTestId('text-render-warnings')).toHaveTextContent(/approximate/),
    );
    expect(project().formulas).toHaveLength(0);
    await user.click(within(editor).getByTestId('text-apply'));
    expect(screen.queryByTestId('text-composition')).toBeNull();
    expect(project().formulas[0]).toMatchObject({
      kind: 'tex',
      name: 't1',
      source: 'Hi $x$\\\\bye',
      layout: { width: 0.5, align: 'center' },
    });
    const row = screen.getByTestId('formula-item');
    expect(within(row).getByTestId('formula-kind')).toHaveTextContent('T');
    expect(row).toHaveAccessibleName('Text (LaTeX) t1');
    // One undo step: the text was never in the project before Apply.
    history.undo();
    expect(project().formulas).toHaveLength(0);
  });

  it('applies LaTeX as one undo step, renders it and shows its glyphs', async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = await createFormula(user, 'a+b=c');
    expect(project().formulas[0]!.source).toBe('a+b=c');
    const chips = await within(editor).findByTestId('glyph-chips');
    await vi.waitFor(() => {
      expect(
        within(chips)
          .getAllByRole('listitem')
          .map((li) => li.firstElementChild!.getAttribute('data-label')),
      ).toEqual(['a', '+', 'b', '=', 'c']);
    });
    expect(project().formulas[0]!.snapshot?.glyphs).toHaveLength(5);
    expect(within(editor).getByTestId('editor-source-badge')).toHaveTextContent('MathJax');
    await vi.waitFor(() =>
      expect(within(editor).getByTestId('editor-status')).toHaveTextContent('5 glyphs · MathJax'),
    );

    // The list row shows the status badge and a rendering of the formula.
    const row = screen.getByTestId('formula-item');
    expect(within(row).getByTestId('formula-status')).toHaveTextContent('MathJax');
    expect(within(row).getByTestId('formula-thumb').querySelectorAll('path')).toHaveLength(5);

    // Only the apply (and the creation) are undoable; the snapshot is not.
    history.undo();
    expect(project().formulas[0]!.source).toBe('');
  });

  it('colours glyphs: click, Shift+click range, Ctrl+click toggle, palette, clear', async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = await createFormula(user, 'a+b=c');
    await within(editor).findByTestId('glyph-chip-4');
    const chip = (i: number) => within(editor).getByTestId(`glyph-chip-${i}`);

    await user.click(chip(1));
    await user.keyboard('{Shift>}');
    await user.click(chip(3));
    await user.keyboard('{/Shift}');
    expect(within(editor).getByTestId('glyph-selection')).toHaveTextContent('3 selected: 1, 2, 3');
    await user.click(within(editor).getByTestId('palette-RED'));
    expect(project().formulas[0]!.glyphColors).toEqual({
      '1': '#FC6255',
      '2': '#FC6255',
      '3': '#FC6255',
    });

    await user.keyboard('{Control>}');
    await user.click(chip(2)); // toggle 2 off
    await user.keyboard('{/Control}');
    expect(within(editor).getByTestId('glyph-selection')).toHaveTextContent('2 selected: 1, 3');
    await user.click(within(editor).getByTestId('palette-BLUE'));
    expect(project().formulas[0]!.glyphColors).toMatchObject({
      '1': '#58C4DD',
      '2': '#FC6255',
      '3': '#58C4DD',
    });

    await user.click(within(editor).getByTestId('glyph-clear-selected'));
    expect(project().formulas[0]!.glyphColors).toEqual({ '2': '#FC6255' });
    await user.click(within(editor).getByTestId('glyph-clear-all'));
    expect(project().formulas[0]!.glyphColors).toEqual({});
    history.undo();
    expect(project().formulas[0]!.glyphColors).toEqual({ '2': '#FC6255' });
  });

  it('shows render errors with the message and keeps the editor usable', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('creator-new'));
    const editor = await screen.findByTestId('formula-editor');
    setValue(within(editor).getByTestId('raw-latex'), '\\nosuchmacro{x}');
    const error = await within(editor).findByTestId('editor-error');
    expect(error).toHaveTextContent(/nosuchmacro/);
    await user.click(within(editor).getByTestId('editor-apply'));
    await vi.waitFor(() =>
      expect(
        within(screen.getByTestId('formula-item')).getByTestId('formula-status'),
      ).toHaveAttribute('data-status', 'error'),
    );
    expect(screen.getByTestId('formula-error')).toHaveTextContent(/nosuchmacro/);
  });

  it('warns about glyphs without MathJax support for a package', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('creator-new'));
    const editor = await screen.findByTestId('formula-editor');
    const search = within(editor).getByTestId('package-search');
    setValue(search, 'tikz');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(within(editor).getByTestId('package-chip-tikz')).toBeInTheDocument();
    expect(within(editor).getByTestId('package-notes')).toHaveTextContent(
      /MathJax cannot load "tikz"/,
    );
    await user.click(within(editor).getByTestId('package-quick-physics'));
    expect(within(editor).getByTestId('package-chip-physics')).toBeInTheDocument();
    expect(within(editor).getByTestId('package-quick-physics')).toBeDisabled();
    await user.click(within(editor).getByTestId('package-remove-tikz'));
    expect(within(editor).queryByTestId('package-notes')).not.toBeInTheDocument();
    // Packages are part of the draft: nothing is applied until Apply.
    expect(packagesOf(project().formulas[0]!)).toEqual([]);
    setValue(within(editor).getByTestId('raw-latex'), '\\abs{x}');
    await user.click(within(editor).getByTestId('editor-apply'));
    expect(packagesOf(project().formulas[0]!)).toEqual(['physics']);
  });

  it('asks before discarding an unapplied draft', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('creator-new'));
    const editor = await screen.findByTestId('formula-editor');
    setValue(within(editor).getByTestId('raw-latex'), 'x^2');
    await user.click(within(editor).getByTestId('editor-close'));
    const dialog = await screen.findByTestId('dialog');
    expect(dialog).toHaveTextContent(/Discard the unapplied changes/);
    await user.click(within(dialog).getByTestId('dialog-cancel'));
    expect(screen.getByTestId('formula-editor')).toBeInTheDocument();
    await user.click(within(editor).getByTestId('editor-close'));
    await user.click(await screen.findByTestId('dialog-confirm'));
    expect(screen.queryByTestId('formula-editor')).not.toBeInTheDocument();
    expect(project().formulas[0]!.source).toBe('');
  });
});

describe('Creator list integration', () => {
  async function withFormulas() {
    const user = userEvent.setup();
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(
        { ...createFormulaFixture('alpha', 'x^2'), id: 'f_a' },
        { ...createFormulaFixture('beta', '\\frac{a}{b}'), id: 'f_b' },
      );
    });
    render(<App />);
    return user;
  }

  it('puts nothing over the list for several selected formulas: their menu has the actions', async () => {
    const user = await withFormulas();
    const list = screen.getByTestId('formula-list');
    const above = () => list.previousElementSibling;
    const toolbar = above();
    expect(toolbar).toHaveClass('creator-toolbar');
    useUiStore.getState().select({ kind: 'formulas', ids: ['f_a', 'f_b'] });
    await vi.waitFor(() =>
      expect(screen.getAllByTestId('formula-item')[1]).toHaveAttribute('data-selected', 'true'),
    );
    // Nothing came between the toolbar and the list (the D62 bar pushed the list down).
    expect(above()).toBe(toolbar);
    expect(screen.queryByRole('toolbar', { name: 'Selected formulas' })).toBeNull();
    const openMenu = async () => {
      fireEvent.contextMenu(screen.getAllByTestId('formula-item')[0]!);
      return screen.findByTestId('formula-menu');
    };
    let menu = await openMenu();
    expect(within(menu).getByTestId('formula-menu-header')).toHaveTextContent('2 formulas');
    expect(within(menu).getByTestId('formula-menu-delete')).toHaveTextContent('Delete 2 formulas…');
    // Apply match colors › lists the project's lists, or offers to create one.
    expect(within(menu).getByTestId('formula-menu-match')).toBeInTheDocument();
    // Edit together… opens the multi editor on both.
    await user.click(within(menu).getByTestId('formula-menu-edit-together'));
    expect(await screen.findByTestId('multi-editor')).toBeInTheDocument();
    expect(useMultiEdit.getState().ids).toEqual(['f_a', 'f_b']);
    act(() => useMultiEdit.getState().close());
    // Add to the timeline: a clip of each, in the selection's order.
    menu = await openMenu();
    await user.click(within(menu).getByTestId('formula-menu-add-to-timeline'));
    expect(project().clips.map((c) => c.formulaId)).toEqual(['f_a', 'f_b']);
    expect(useUiStore.getState().selection.kind).toBe('clips');
  });

  it('duplicates with the snapshot and colours', async () => {
    const user = await withFormulas();
    await vi.waitFor(() => expect(project().formulas[0]!.snapshot).not.toBeNull());
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.glyphColors = { '0': '#FF0000' };
    });
    await user.click(
      within(screen.getAllByTestId('formula-item')[0]!).getByTestId('formula-duplicate'),
    );
    const [first, copy] = project().formulas;
    expect(copy!.name).toBe('alpha2');
    expect(copy!.glyphColors).toEqual(first!.glyphColors);
    expect(copy!.snapshot).toEqual(first!.snapshot);
    expect(screen.getAllByTestId('formula-item')).toHaveLength(3);
  });

  it('deletes after a confirmation that lists clips and relations', async () => {
    const user = await withFormulas();
    const clip = createClip('f_a', project().tracks[0]!.id, 0, 3);
    useProjectStore.getState().update((d) => {
      d.clips.push(clip);
    });
    await user.click(
      within(screen.getAllByTestId('formula-item')[0]!).getByTestId('formula-delete'),
    );
    const dialog = await screen.findByTestId('dialog');
    expect(within(dialog).getByTestId('dialog-details')).toHaveTextContent(
      /Clip alpha \(0 s–3 s\) on Track 2/,
    );
    // Its button acts after being held down (HoldButton has its own tests).
    const pending = useDialogStore.getState().queue[0]!;
    expect(pending.buttons.find((b) => b.id === 'confirm')!.holdMs).toBeGreaterThan(0);
    await act(async () => useDialogStore.getState().settle(pending.key, 'confirm'));
    expect(project().formulas.map((f) => f.name)).toEqual(['beta']);
    expect(project().clips).toEqual([]);
  });
});

function createFormulaFixture(name: string, latex: string) {
  return {
    id: name,
    name,
    kind: 'math' as const,
    source: latex,
    packages: [],
    tag: { color: '#58C4DD', icon: null },
    fontSize: 48,
    color: '#FFFFFF',
    glyphColors: {},
    hiddenGlyphs: [],
    intro: null,
    snapshot: null,
  };
}
