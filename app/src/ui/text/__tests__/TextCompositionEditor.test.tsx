import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createEmptyProject, createTextFormula } from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { rectContour } from '../../../geom';
import { textGeometry } from '../../../test/textGeometry';
import { textArtifactRender, textBoxesKey } from '../../../engine/pango';
import { producerOf } from '../../../engine/producers';
import type { TextRenderRequest } from '../../../engine';
import { useTransformEdit } from '../../animations/transformEdit';
import { useDocumentStore } from '../../project/documentStore';
import { useExportDialog } from '../../export/exportStore';
import { CreatorEditorHost } from '../../creator/CreatorEditorHost';
import { openFormulaEditor, useFormulaEditor } from '../../creator/formulaEditorStore';
import { useMultiEdit } from '../../creator/multiEditStore';
import { useTextComposition } from '../textCompositionStore';

const mock = vi.hoisted(() => {
  const held: { state: unknown; listeners: Set<(state: unknown) => void> } = {
    state: { status: 'offline' },
    listeners: new Set(),
  };
  return {
    render: vi.fn(),
    clearCache: vi.fn(),
    invalidateText: vi.fn(),
    companion: () => held.state,
    onCompanionChange: (listener: (state: unknown) => void) => {
      held.listeners.add(listener);
      return () => held.listeners.delete(listener);
    },
    /** The companion as the editor sees it from now on. */
    setCompanion(state: unknown) {
      held.state = state;
      for (const listener of held.listeners) listener(state);
    },
    client: {} as { fonts?: unknown },
  };
});
vi.mock('../../../engine/instance', () => ({ getEngine: () => mock }));
vi.mock('../../transport/mainPlayback', () => ({ mainPlayback: { pause: vi.fn() } }));

const project = () => useProjectStore.getState().project;
const change = (id: string, value: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value } });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  const box = { minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 };
  mock.render.mockImplementation(async (request) => ({
    ok: true,
    render: {
      key: request.source,
      backend: 'pango',
      exact: true,
      target: request.target,
      fontSize: request.fontSize,
      glyphs: [
        { index: 0, label: 'fixture', kind: 'char', contours: [rectContour(box)], bbox: box },
      ],
      bbox: box,
      warnings: [],
    },
  }));
  mock.render.mockClear();
  mock.invalidateText.mockClear();
  mock.clearCache.mockClear();
  const p = createEmptyProject();
  const formula = createTextFormula({ name: 'title', source: 'Before' });
  const clip = createClip(formula.id, p.tracks[0]!.id, 0, 8);
  p.formulas = [formula];
  p.clips = [clip];
  loadProject(p);
  useDocumentStore.getState().beginDocument(p, { fileName: null, handle: null });
  useRenderStore.setState({ entries: {}, resolved: new Map() });
  useUiStore.setState({ time: 0, playing: false, selection: { kind: 'none' } });
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useFormulaEditor.getState().close();
  useMultiEdit.getState().close();
});

afterEach(() => {
  act(() => useTextComposition.getState().cancel());
  cleanup();
  vi.restoreAllMocks();
  mock.setCompanion({ status: 'offline' });
  delete mock.client.fonts;
});

/** A companion whose text worker for ManimCE stands as `pango` says. */
const companionWith = (pango: object | null) => ({
  status: 'online',
  health: {
    name: 'mfe-companion',
    version: 'test',
    protocol: 1,
    capabilities: {
      latex: false,
      dvisvgm: false,
      ffmpeg: false,
      manimCE: null,
      manimGL: null,
      pango: { ce: pango },
    },
  },
});

function open(clip = true) {
  const p = project();
  const host = render(<CreatorEditorHost />);
  act(() => openFormulaEditor(p.formulas[0]!.id, false, clip ? p.clips[0]!.id : undefined));
  return host;
}

describe('a text nothing can shape, in the composition workspace', () => {
  /** What the engine answers without a companion. */
  const boxes = async (request: TextRenderRequest) =>
    producerOf('text').free(request, textBoxesKey(request));

  it('is drawn as boxes with the badge, says how to start the companion, and applies', async () => {
    mock.render.mockImplementation(boxes);
    open();
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Placeholder boxes'),
    );
    expect(screen.getByTestId('text-needs-companion')).toHaveTextContent('needs the companion');
    const hint = screen.getByTestId('text-needs-companion-hint');
    expect(hint).toHaveTextContent('Placeholder boxes, one per character');
    expect(hint).toHaveTextContent('Start it: python3 companion/mfe_companion.py serve');
    // One box per letter of "Before", and the stage is the current one: it can be placed.
    const canvas = screen.getByTestId('text-stage-canvas');
    expect(canvas).toHaveAttribute('data-glyph-count', '6');
    expect(canvas).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('text-center-x')).toBeEnabled();

    change('text-source', 'After all');
    await waitFor(() => expect(canvas).toHaveAttribute('data-glyph-count', '8'));
    expect(screen.getByTestId('text-apply')).toBeEnabled();
    fireEvent.click(screen.getByTestId('text-apply'));
    await waitFor(() => expect(screen.queryByTestId('text-composition')).toBeNull());
    expect(project().formulas[0]!.source).toBe('After all');
  });

  it('asks for the fonts once to start the worker, waits while it starts, and asks when it is ready', async () => {
    mock.render.mockImplementation(boxes);
    const catalog = {
      ok: true,
      target: 'ce',
      adapterVersion: 'a',
      environmentKey: 'e',
      fonts: [{ family: 'Noto Sans', faces: [] }],
    };
    const fonts = vi.fn(async () => catalog);
    mock.client.fonts = fonts;
    Object.assign(mock.client, { check: vi.fn() });
    mock.setCompanion(companionWith({ state: 'unused' }));
    open();
    // The font list is the request that starts the worker.
    await waitFor(() => expect(fonts).toHaveBeenCalledTimes(1));
    act(() => mock.setCompanion(companionWith({ state: 'preparing' })));
    await waitFor(() =>
      expect(screen.getByTestId('text-needs-companion-hint')).toHaveTextContent(
        'The companion is starting its text worker',
      ),
    );
    // Nothing more is asked while it starts.
    expect(fonts).toHaveBeenCalledTimes(1);
    act(() =>
      mock.setCompanion(
        companionWith({ state: 'ready', adapterVersion: 'a', environmentKey: 'e' }),
      ),
    );
    await waitFor(() => expect(fonts).toHaveBeenCalledTimes(2));
  });

  it('says why the companion that is running shapes no text', async () => {
    mock.render.mockImplementation(boxes);
    mock.client.fonts = vi.fn();
    mock.setCompanion(companionWith(null));
    open();
    await waitFor(() =>
      expect(screen.getByTestId('text-needs-companion-hint')).toHaveTextContent(
        'it has no ManimCE interpreter (start it with --ce-python)',
      ),
    );
    // Online: no need to say how to start a companion; and there is no worker to ask.
    expect(screen.getByTestId('text-needs-companion-hint')).not.toHaveTextContent('Start it:');
    expect(mock.client.fonts).not.toHaveBeenCalled();
    act(() => mock.setCompanion(companionWith({ state: 'failed', message: 'No Pango here.' })));
    await waitFor(() =>
      expect(screen.getByTestId('text-needs-companion-hint')).toHaveTextContent(
        'could not start its text worker for ManimCE (No Pango here.)',
      ),
    );
    // A worker that failed is not started over and over: only on the author's word, which
    // need not be a refresh of the appearance.
    expect(mock.client.fonts).not.toHaveBeenCalled();
    Object.assign(mock.client, { fonts: vi.fn(async () => Promise.reject(new Error('still no'))) });
    fireEvent.click(screen.getByTestId('text-worker-retry'));
    await waitFor(() => expect(mock.client.fonts).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('text-refresh-pending')).toBeNull();
    fireEvent.click(screen.getByTestId('text-refresh'));
    await waitFor(() => expect(mock.client.fonts).toHaveBeenCalledTimes(2));
  });

  it('cannot refresh its appearance: boxes are no appearance to save', async () => {
    mock.render.mockImplementation(boxes);
    open();
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Placeholder boxes'),
    );
    fireEvent.click(screen.getByTestId('text-refresh'));
    await waitFor(() => expect(screen.getByTestId('text-refresh-pending')).toBeInTheDocument());
    expect(screen.getByTestId('text-apply')).toBeDisabled();
    fireEvent.click(screen.getByTestId('text-refresh-cancel'));
    expect(screen.getByTestId('text-apply')).toBeEnabled();
  });

  it('keeps on screen the shape the other library gave it, as the preview does', async () => {
    mock.render.mockImplementation(boxes);
    // Shaped by ManimCE; the project is ManimGL's now and nothing shapes text for it.
    const render = textArtifactRender(textGeometry('Before'));
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.meta.target = 'gl';
      });
      useRenderStore.setState({
        resolved: new Map([
          [
            project().formulas[0]!.id,
            {
              formula: project().formulas[0]!,
              render,
              canonToRender: render.glyphs.map((glyph) => glyph.index),
              confidence: 1,
            },
          ],
        ]),
      });
    });
    open();
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent(
        'Shape from the other library',
      ),
    );
    expect(screen.getByTestId('text-needs-companion')).toBeInTheDocument();
    expect(screen.getByTestId('text-needs-companion-hint')).toHaveTextContent(
      'Drawn with the shape ManimCE gave it',
    );
    expect(mock.render).not.toHaveBeenCalled();
    // Edited, it is another text: its boxes.
    change('text-source', 'Before!');
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Placeholder boxes'),
    );
  });
});

describe('separate text composition workspace', () => {
  it('leaves AltGr and native composition chords with the source input', () => {
    open();
    const field = screen.getByTestId('text-source');
    for (const key of ['s', 'o', 'n', 'Enter']) {
      for (const modifier of ['ctrl-alt', 'alt-graph', 'composing']) {
        const event = new KeyboardEvent('keydown', {
          key,
          ctrlKey: true,
          altKey: modifier === 'ctrl-alt',
          isComposing: modifier === 'composing',
          bubbles: true,
          cancelable: true,
        });
        if (modifier === 'alt-graph')
          Object.defineProperty(event, 'getModifierState', {
            value: (name: string) => name === 'AltGraph',
          });
        fireEvent(field, event);
        expect(event.defaultPrevented).toBe(false);
      }
    }
    expect(screen.getByTestId('text-composition')).toBeInTheDocument();
    expect(history.canUndo()).toBe(false);
  });
  it('adopts saved geometry that finishes loading after opening, without replacing the source node', async () => {
    mock.render.mockResolvedValue({ ok: false, error: { backend: 'pango', message: 'Offline' } });
    open(false);
    const field = screen.getByTestId('text-source');
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Offline'),
    );
    const render = textArtifactRender(textGeometry('Before'));
    act(() =>
      useRenderStore.setState({
        resolved: new Map([
          [
            project().formulas[0]!.id,
            {
              formula: project().formulas[0]!,
              render,
              canonToRender: render.glyphs.map((glyph) => glyph.index),
              confidence: 1,
            },
          ],
        ]),
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Current Pango geometry'),
    );
    expect(screen.getByTestId('text-source')).toBe(field);
    expect(screen.getByTestId('text-stage-canvas')).toHaveAttribute('data-glyph-count', '6');
  });
  it('retains the saved appearance during a failed refresh and allows explicit cancellation', async () => {
    open(false);
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Current Pango geometry'),
    );
    fireEvent.click(screen.getByTestId('text-refresh'));
    expect(mock.invalidateText).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'text', source: 'Before' }),
    );
    expect(mock.clearCache).not.toHaveBeenCalled();
    expect(screen.getByTestId('text-apply')).toBeDisabled();
    expect(screen.getByTestId('text-refresh-pending')).toHaveTextContent(
      'saved appearance is retained',
    );
    change('text-source', 'Source is still editable');
    fireEvent.click(screen.getByTestId('text-refresh-cancel'));
    expect(screen.getByTestId('text-apply')).toBeEnabled();
    fireEvent.click(screen.getByTestId('text-cancel'));
    expect(project().formulas[0]!.source).toBe('Before');
    expect(history.canUndo()).toBe(false);
  });
  it('routes Text to its own persistent source field and publishes text/style/placement together', () => {
    const before = project();
    const host = open();
    expect(screen.queryByTestId('formula-editor')).toBeNull();
    const field = screen.getByTestId('text-source');
    change('text-source', 'Título\n\n  café e\u0301  ');
    change('text-position-x', '2');
    change('text-position-y', '-1');
    fireEvent.click(screen.getByTestId('text-bold'));
    host.rerender(<CreatorEditorHost />);
    expect(screen.getByTestId('text-source')).toBe(field);
    expect(project()).toBe(before);
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(screen.queryByTestId('text-composition')).toBeNull();
    expect(project().formulas[0]).toMatchObject({
      source: 'Título\n\n  café e\u0301  ',
      font: { weight: 'bold' },
    });
    expect(project().clips[0]!.initial.position).toEqual([2, -1]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(project()).toBe(before);
  });

  it('keeps where a font text opened from the library is put, for its new clips; unticked, it does not', () => {
    open(false);
    const box = screen.getByTestId('text-keep-position');
    expect(box).toBeChecked();
    expect(screen.getByTestId('text-placement-hint')).toHaveTextContent(
      'new clips start at this position',
    );
    change('text-position-x', '2.5');
    change('text-position-y', '-1.25');
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(screen.queryByTestId('text-composition')).toBeNull();
    expect(project().formulas[0]!.startPosition).toEqual([2.5, -1.25]);
    expect(project().clips[0]!.initial.position).toEqual([0, 0]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    // Unticked: the text moves on the stage, and Apply writes nothing.
    const kept = project();
    act(() => openFormulaEditor(kept.formulas[0]!.id, false));
    expect(screen.getByTestId('text-position-x')).toHaveValue('2.5');
    change('text-position-x', '0');
    fireEvent.click(screen.getByTestId('text-keep-position'));
    expect(screen.getByTestId('text-placement-hint')).toHaveTextContent('is not saved');
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(project()).toBe(kept);
  });

  it('has no such box for the text of a clip: its stage places that clip', () => {
    open();
    expect(screen.queryByTestId('text-keep-position')).toBeNull();
    expect(screen.getByTestId('text-placement-hint')).toHaveTextContent('clip initial state');
  });

  it('applies with Ctrl/⌘+Enter from the source field, as one undo step', () => {
    open();
    change('text-source', 'Applied from the keyboard');
    fireEvent.keyDown(screen.getByTestId('text-source'), { key: 'Enter', ctrlKey: true });
    expect(screen.queryByTestId('text-composition')).toBeNull();
    expect(project().formulas[0]!.source).toBe('Applied from the keyboard');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('leaves Enter/Escape with the IME and does not export an unapplied draft', () => {
    open();
    const field = screen.getByTestId('text-source');
    fireEvent.compositionStart(field);
    change('text-source', 'に');
    expect(screen.getByTestId('text-apply')).toBeDisabled();
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true, isComposing: true });
    fireEvent.keyDown(field, { key: 'Escape', isComposing: true });
    expect(screen.getByTestId('text-composition')).toBeInTheDocument();
    act(() => useExportDialog.getState().open({ kind: 'video' }));
    expect(useExportDialog.getState().request).toBeNull();
    change('text-source', '日本');
    fireEvent.compositionEnd(field, { data: '日本' });
    fireEvent.click(screen.getByTestId('text-cancel'));
    expect(project().formulas[0]!.source).toBe('Before');
    expect(history.canUndo()).toBe(false);
  });

  it('uses current rendered geometry for center controls and keeps movement independent of shaping', async () => {
    open();
    expect(screen.getByTestId('text-center-x')).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent('Current Pango geometry'),
    );
    expect(screen.getByTestId('text-stage-canvas')).toHaveAttribute('data-glyph-count', '1');
    const calls = mock.render.mock.calls.length;
    change('text-position-x', '3');
    change('text-position-y', '2');
    fireEvent.click(screen.getByTestId('text-center-x'));
    expect(screen.getByTestId('text-position-x')).toHaveValue('0');
    expect(screen.getByTestId('text-position-y')).toHaveValue('2');
    expect(mock.render).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByTestId('text-zoom-in'));
    expect(screen.getByTestId('text-zoom')).toHaveTextContent('125%');
    fireEvent.click(screen.getByTestId('text-fit'));
    expect(screen.getByTestId('text-zoom')).toHaveTextContent('100%');
    expect(project().clips[0]!.initial.position).toEqual([0, 0]);
  });

  it('retains source after backend failure and disables geometric placement claims', async () => {
    mock.render.mockResolvedValue({
      ok: false,
      error: { message: 'Requested font is missing', backend: 'pango' },
    });
    open(false);
    change('text-source', 'Preserve this text');
    await waitFor(() =>
      expect(screen.getByTestId('text-render-status')).toHaveTextContent(
        'Requested font is missing',
      ),
    );
    expect(screen.getByTestId('text-center-y')).toBeDisabled();
    expect(screen.getByTestId('text-apply')).toBeEnabled();
    fireEvent.click(screen.getByTestId('text-apply'));
    expect(project().formulas[0]!.source).toBe('Preserve this text');
  });
});
