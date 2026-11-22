import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTexFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
  type TexFormula,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { NARROW_LAYOUT } from '../../useMediaQuery';
import { useDialogStore } from '../../project/dialogStore';
import { useDocumentStore } from '../../project/documentStore';
import { useNoticeStore } from '../../project/noticeStore';
import { openFormulaEditor, useFormulaEditor } from '../formulaEditorStore';
import { useMultiEdit } from '../multiEditStore';
import { openRelationEditor, useRelationEditor } from '../../relations/relationEditorStore';

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

let narrow = false;
let listeners: Set<() => void>;
const project = () => useProjectStore.getState().project;
const resize = (value: boolean) =>
  act(() => {
    narrow = value;
    for (const listener of [...listeners]) listener();
  });
const change = (id: string, value: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value } });

beforeEach(() => {
  narrow = false;
  listeners = new Set();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === NARROW_LAYOUT && narrow;
    },
    media: query,
    addEventListener: (_event: string, listener: () => void) => {
      if (query === NARROW_LAYOUT) listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  const p = createEmptyProject();
  p.formulas.push({ ...createFormula({ name: 'letters', source: 'a+b' }), id: 'f1' });
  loadProject(p);
  useRenderStore.setState({ prefer: 'mathjax', entries: {}, resolved: new Map() });
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useFormulaEditor.getState().close();
  useMultiEdit.getState().close();
  useRelationEditor.getState().close();
  useDialogStore.setState({ queue: [] });
  useNoticeStore.getState().clear();
  useDocumentStore.getState().markClean(project(), { fileName: null, handle: null });
});

afterEach(() => vi.unstubAllGlobals());

describe('editor ownership across responsive layout changes', () => {
  it('keeps the actual LaTeX field, packages and nested discard confirmation, then applies once', async () => {
    render(<App />);
    act(() => openFormulaEditor('f1'));
    const field = screen.getByTestId('raw-latex');
    change('raw-latex', 'a+b+c');
    change('package-search', 'amsmath');
    fireEvent.click(screen.getByTestId('package-add'));
    resize(true);
    expect(screen.getByTestId('raw-latex')).toBe(field);
    expect(field).toHaveValue('a+b+c');
    expect(screen.getByTestId('package-chip-amsmath')).toBeInTheDocument();
    expect(screen.getByText('Unapplied changes')).toBeInTheDocument();
    expect(project().formulas[0]!.source).toBe('a+b');
    fireEvent.click(screen.getByTestId('editor-close'));
    expect(await screen.findByTestId('dialog')).toHaveTextContent('Discard the unapplied changes?');
    resize(false);
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    expect(screen.getByTestId('raw-latex')).toBe(field);
    fireEvent.click(screen.getByTestId('editor-apply'));
    expect(project().formulas[0]!).toMatchObject({ source: 'a+b+c', packages: ['amsmath'] });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(field).toHaveValue('a+b');
    act(() => history.redo());
    expect(field).toHaveValue('a+b+c');
    change('raw-latex', 'unapplied');
    resize(true);
    resize(false);
    fireEvent.click(screen.getByTestId('editor-revert'));
    expect(field).toHaveValue('a+b+c');
    expect(screen.queryByText('Unapplied changes')).toBeNull();
    fireEvent.click(screen.getByTestId('editor-close'));
    expect(screen.queryByTestId('formula-editor')).toBeNull();
  });

  it('keeps text and layout drafts when moving from narrow to wide and back', () => {
    const p = createEmptyProject();
    p.formulas.push({
      ...createTexFormula({ name: 'text', source: 'Before' }),
      id: 'f1',
    });
    loadProject(p);
    resize(true);
    render(<App />);
    act(() => openFormulaEditor('f1'));
    // A LaTeX text is edited in the composition workspace, whose draft is the session's.
    expect(screen.queryByTestId('formula-editor')).toBeNull();
    const field = screen.getByTestId('tex-source');
    change('tex-source', 'After');
    change('tex-width', '7');
    fireEvent.blur(screen.getByTestId('tex-width'));
    fireEvent.click(screen.getByTestId('tex-align-right'));
    change('tex-line-spacing', '1.5');
    fireEvent.blur(screen.getByTestId('tex-line-spacing'));
    resize(false);
    resize(true);
    expect(screen.getByTestId('tex-source')).toBe(field);
    expect(field).toHaveValue('After');
    expect(screen.getByTestId('tex-width')).toHaveValue('7');
    expect(screen.getByTestId('tex-line-spacing')).toHaveValue('1.5');
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(project().formulas[0] as TexFormula).toMatchObject({
      source: 'After',
      layout: { width: 7, align: 'right', lineSpacing: 1.5 },
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('closes draft and multi-editor requests when a replacement document reuses formula ids', () => {
    render(<App />);
    act(() => openFormulaEditor('f1'));
    change('raw-latex', 'unapplied');
    act(() => useMultiEdit.getState().open(['f1']));
    act(() => loadProject(structuredClone(project())));
    expect(useFormulaEditor.getState().editing).toBeNull();
    expect(useMultiEdit.getState().ids).toBeNull();
    expect(screen.queryByTestId('formula-editor')).toBeNull();
    act(() => openFormulaEditor('f1'));
    expect(screen.getByTestId('raw-latex')).toHaveValue('a+b');
    act(() =>
      useDocumentStore
        .getState()
        .beginDocument(project(), { fileName: 'replacement.mfe.json', handle: null }),
    );
    expect(useFormulaEditor.getState().editing).toBeNull();
  });

  it('keeps a relation pair draft through both layouts, then saves one step', async () => {
    const p = structuredClone(project());
    const phases = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const from = createClip('f1', p.tracks[0]!.id, 0, 8, phases);
    const to = createClip('f1', p.tracks[1]!.id, 2, 8, phases);
    p.clips = [from, to];
    const relation = createRelation(from.id, to.id, {
      offset: 2,
      duration: 2,
      pairs: [{ from: [0], to: [0], style: null }],
    });
    p.relations = [relation];
    loadProject(p);
    render(<App />);
    act(() => openRelationEditor({ kind: 'edit', relationId: relation.id }));
    const style = await screen.findByTestId('rel-pair-0-style');
    fireEvent.change(style, { target: { value: 'fade' } });
    resize(true);
    resize(false);
    expect(screen.getByTestId('rel-pair-0-style')).toBe(style);
    expect(style).toHaveValue('fade');
    expect(project().relations[0]!.pairs[0]!.style).toBeNull();
    fireEvent.click(screen.getByTestId('rel-save'));
    expect(project().relations[0]!.pairs[0]!.style).toBe('fade');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('a pending discard cannot close a fresh request, even with the same document ids', async () => {
    render(<App />);
    act(() => openFormulaEditor('f1'));
    change('raw-latex', 'old draft');
    fireEvent.click(screen.getByTestId('editor-close'));
    const pending = useDialogStore.getState().queue[0]!;
    act(() => {
      loadProject(structuredClone(project()));
      openFormulaEditor('f1');
    });
    expect(screen.getByTestId('raw-latex')).toHaveValue('a+b');
    change('raw-latex', 'new draft');
    await act(async () => useDialogStore.getState().settle(pending.key, 'confirm'));
    expect(screen.getByTestId('raw-latex')).toHaveValue('new draft');
    // Saving updates the baseline, not the editor's document identity.
    act(() => useDocumentStore.getState().markClean(project()));
    expect(screen.getByTestId('raw-latex')).toHaveValue('new draft');
  });
});
