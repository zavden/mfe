/* Regression coverage of the production editor, render-sync and pointer command routes. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFormula, toSnapshot, type FormulaEngine, type RenderResult } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
  createTrack,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  validateProject,
  type FormulaSnapshot,
  type GlyphPair,
  type MorphAction,
} from '../../../model';
import { arcSpline } from '../../../geom';
import {
  history,
  loadProject,
  useProjectStore,
  useRenderStore,
  startRenderSync,
} from '../../../store';
import { MorphEditor } from '../../../ui/morph/MorphEditor';
import { RelationEditor } from '../../../ui/relations/RelationEditor';
import { linkPair, type PairHolder } from '../../../ui/relations/relationOps';
import { usePairSession, type PairSessionOptions } from '../../../ui/relations/usePairSession';
import {
  findPair,
  startPathEditTracking,
  usePathEdit,
  type PairRef,
  type PathFrame,
} from '../../../ui/preview/pathEdit';
import { usePathGestures } from '../../../ui/preview/usePathGestures';
import { withServices } from '../../../test/services';

withServices(startPathEditTracking);

afterEach(() => {
  cleanup();
  usePathEdit.setState({ target: null, selected: null });
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  useRenderStore.setState({ transitions: {} });
  vi.restoreAllMocks();
});

async function formula(source: string) {
  const output = await createMockEngine().render({
    kind: 'math',
    latex: source,
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'auto',
  });
  if (!output.ok) throw new Error(output.error.message);
  const f = createFormula({ name: 'steps', source, snapshot: toSnapshot(output.render) });
  return { f, resolved: resolveFormula(f, output.render) };
}

describe('Edit path validation bypass', () => {
  it.each(['save', 'path'] as const)(
    'revalidates a Morph at the actual %s command before React updates its buttons',
    async (route) => {
      const p = createEmptyProject();
      const { f, resolved } = await formula('A=x_1=x_2');
      p.formulas = [f];
      const c = createClip(f.id, p.tracks[0]!.id, 0, 6, {
        intro: defaultIntro('write'),
        outro: defaultOutro('fade_out'),
      });
      const m = createMorph(2);
      c.actions = [m];
      p.clips = [c];
      loadProject(p);
      useRenderStore.getState().setEntry(f.id, { status: 'ok', resolved, error: null });
      const closed = vi.fn();
      const user = userEvent.setup();
      render(<MorphEditor request={{ clipId: c.id, actionId: m.id }} onClose={closed} />);
      await user.click(screen.getByTestId('morph-from-glyph-1'));
      await user.click(screen.getByTestId('morph-to-glyph-4'));
      await user.selectOptions(screen.getByTestId('morph-pair-0-style'), 'transform');
      if (route === 'path')
        await user.pointer({
          keys: '[MouseRight]',
          target: screen.getByTestId('morph-to-glyph-4'),
        });
      const command = screen.getByTestId(
        route === 'path' ? 'morph-style-menu-edit-path' : 'morph-save',
      );
      expect(command).toBeEnabled();
      let before = p;
      act(() => {
        useProjectStore.getState().update((draft) => {
          draft.clips[0]!.actions.push(
            createDisappear(3.2, 'fade_out', [1], { duration: 0.5 }),
            createAppear(4, 'fade_in', [1], { duration: 0.5 }),
          );
        });
        before = useProjectStore.getState().project;
        command.click();
      });
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
      expect(closed).not.toHaveBeenCalled();
      expect(usePathEdit.getState().target).toBeNull();
    },
  );

  it.each(['save', 'path'] as const)(
    'revalidates a relation at the actual %s command against another owner',
    async (route) => {
      const { p, earlier } = await relationConflictProject();
      const closed = vi.fn();
      const user = userEvent.setup();
      render(
        <RelationEditor request={{ kind: 'edit', relationId: earlier.id }} onClose={closed} />,
      );
      await user.click(screen.getByTestId('rel-from-glyph-2'));
      await user.click(screen.getByTestId('rel-to-glyph-2'));
      if (route === 'path')
        await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-2') });
      const command = screen.getByTestId(
        route === 'path' ? 'rel-style-menu-edit-path' : 'rel-save',
      );
      expect(command).toBeEnabled();
      let before = p;
      act(() => {
        useProjectStore.getState().update((draft) => {
          draft.relations[1]!.pairs.push({ from: [2], to: [2], style: null });
        });
        before = useProjectStore.getState().project;
        command.click();
      });
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
      expect(closed).not.toHaveBeenCalled();
      expect(usePathEdit.getState().target).toBeNull();
    },
  );

  it.each([0, 2])('rechecks track %s at a pending relation Save click', async (track) => {
    const { p, earlier } = await relationConflictProject();
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<RelationEditor request={{ kind: 'edit', relationId: earlier.id }} onClose={closed} />);
    await user.selectOptions(screen.getByTestId('rel-pair-0-style'), 'copy');
    const command = screen.getByTestId('rel-save');
    expect(command).toBeEnabled();
    let before = p;
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.tracks[track]!.locked = true;
      });
      before = useProjectStore.getState().project;
      command.click();
    });
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    expect(closed).not.toHaveBeenCalled();
  });

  it('refuses an invalid Morph through both Save and Edit path, then saves a repaired draft once', async () => {
    const p = createEmptyProject();
    const { f, resolved } = await formula('A=x_1=x_2');
    p.formulas = [f];
    const c = createClip(f.id, p.tracks[0]!.id, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    const m = createMorph(2);
    c.actions = [
      m,
      createDisappear(3.2, 'fade_out', [1], { duration: 0.5 }),
      createAppear(4, 'fade_in', [1], { duration: 0.5 }),
    ];
    p.clips = [c];
    loadProject(p);
    useRenderStore.getState().setEntry(f.id, { status: 'ok', resolved, error: null });
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<MorphEditor request={{ clipId: c.id, actionId: m.id }} onClose={closed} />);
    await user.click(screen.getByTestId('morph-from-glyph-1'));
    await user.click(screen.getByTestId('morph-to-glyph-4'));
    await user.selectOptions(screen.getByTestId('morph-pair-0-style'), 'transform');
    expect(screen.getByTestId('morph-save')).toBeDisabled();
    expect(screen.getByTestId('morph-problems')).toHaveTextContent('cannot bring back glyph 1');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('morph-to-glyph-4') });
    expect(screen.getByTestId('morph-style-menu-edit-path')).toBeDisabled();
    await user.click(screen.getByTestId('morph-style-menu-edit-path'));
    expect(closed).not.toHaveBeenCalled();
    expect(useProjectStore.getState().project).toBe(p);
    expect(usePathEdit.getState().target).toBeNull();
    await user.keyboard('{Escape}');
    await user.selectOptions(screen.getByTestId('morph-pair-0-style'), 'copy');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('morph-to-glyph-4') });
    await user.click(screen.getByTestId('morph-style-menu-edit-path'));
    expect(closed).toHaveBeenCalledOnce();
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    const saved = useProjectStore.getState().project;
    expect((saved.clips[0]!.actions[0] as MorphAction).pairs).toEqual([
      { from: [1], to: [4], style: 'copy' },
    ]);
    expect(validateProject(saved).filter((i) => i.severity === 'error')).toEqual([]);
    expect(usePathEdit.getState().target).toEqual({
      origin: { kind: 'morph', clipId: c.id, actionId: m.id },
      index: 0,
    });
  });

  it('refuses an invalid relation through Edit path and keeps the draft open', async () => {
    const { p, later } = await relationConflictProject();
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<RelationEditor request={{ kind: 'edit', relationId: later.id }} onClose={closed} />);
    await user.click(screen.getByTestId('rel-from-glyph-0'));
    await user.click(screen.getByTestId('rel-to-glyph-0'));
    expect(screen.getByTestId('rel-save')).toBeDisabled();
    expect(screen.getByTestId('rel-problems')).toHaveTextContent(
      'brought in by more than one pair',
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-0') });
    expect(screen.getByTestId('rel-style-menu-edit-path')).toBeDisabled();
    await user.click(screen.getByTestId('rel-style-menu-edit-path'));
    expect(closed).not.toHaveBeenCalled();
    expect(useProjectStore.getState().project).toBe(p);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    expect(usePathEdit.getState().target).toBeNull();
  });
});

async function relationConflictProject() {
  const p = createEmptyProject();
  const { f, resolved } = await formula('abc');
  p.formulas = [f];
  p.tracks.push(createTrack('third'));
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const a = createClip(f.id, p.tracks[0]!.id, 0, 6, none);
  const b = createClip(f.id, p.tracks[1]!.id, 0, 6, none);
  const c = createClip(f.id, p.tracks[2]!.id, 2, 8, none);
  p.clips = [a, b, c];
  const earlier = createRelation(a.id, c.id, { pairs: [{ from: [0], to: [0], style: null }] });
  const later = createRelation(b.id, c.id, { pairs: [{ from: [1], to: [1], style: null }] });
  p.relations = [earlier, later];
  loadProject(p);
  useRenderStore.getState().setEntry(f.id, { status: 'ok', resolved, error: null });
  return { p, earlier, later };
}

describe('Relation validation projection', () => {
  it('blocks new conflicts reported on a later relation through normal Save', async () => {
    const { p, earlier } = await relationConflictProject();
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<RelationEditor request={{ kind: 'edit', relationId: earlier.id }} onClose={closed} />);
    await user.click(screen.getByTestId('rel-from-glyph-1'));
    await user.click(screen.getByTestId('rel-to-glyph-1'));
    expect(screen.getByTestId('rel-problems')).toHaveTextContent(
      'brought in by more than one pair',
    );
    expect(screen.getByTestId('rel-save')).toBeDisabled();
    await user.click(screen.getByTestId('rel-save'));
    expect(closed).not.toHaveBeenCalled();
    expect(useProjectStore.getState().project).toBe(p);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });
});

/* An editor opened from the keyboard leaves a drag that was held running under it. */
describe('Save while a drag is still held', () => {
  it('saves over the project the drag leaves: nothing the drag showed is kept', async () => {
    const { p, earlier, later } = await relationConflictProject();
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<RelationEditor request={{ kind: 'edit', relationId: earlier.id }} onClose={closed} />);
    await user.selectOptions(screen.getByTestId('rel-pair-0-style'), 'copy');
    const command = screen.getByTestId('rel-save');
    expect(command).toBeEnabled();
    // The window of the other relation dragged shorter, and a clip of this one trimmed.
    const gesture = history.beginGesture();
    act(() => {
      gesture.update((draft) => {
        draft.relations[1]!.duration = later.duration / 2;
        draft.clips[0]!.end = 5.5;
      });
      command.click();
    });
    expect(gesture.active).toBe(false);
    expect(closed).toHaveBeenCalled();
    const saved = useProjectStore.getState().project;
    expect(saved.relations[0]!.pairs[0]!.style).toBe('copy');
    expect(saved.relations[1]).toEqual(later);
    expect(saved.clips).toEqual(p.clips);
    // One step, the save: taken back, the project is the very one from before the drag.
    history.undo();
    expect(useProjectStore.getState().project).toBe(p);
  });
});

describe('Pair session rebase atomicity', () => {
  const snapshot = (key: string): FormulaSnapshot => ({
    backend: 'mathjax',
    key,
    glyphs: [0, 1, 2].map((i) => ({ label: String(i), center: [i, 0], size: [1, 1] })),
  });
  it('rebases both endpoints atomically in one React batch', () => {
    const p = createEmptyProject();
    p.formulas = [
      { ...createFormula({ name: 'from', source: 'abc', snapshot: snapshot('a1') }), id: 'fa' },
      { ...createFormula({ name: 'to', source: 'abc', snapshot: snapshot('b1') }), id: 'fb' },
    ];
    const a = createClip('fa', p.tracks[0]!.id, 0, 5);
    const b = createClip('fb', p.tracks[1]!.id, 1, 6);
    p.clips = [a, b];
    const pairs: GlyphPair[] = [{ from: [0], to: [0], style: null }];
    p.relations = [createRelation(a.id, b.id, { pairs })];
    loadProject(p);
    useRenderStore.setState({ transitions: {} });
    const options: PairSessionOptions<PairHolder> = {
      start: pairs,
      formulaIds: { from: 'fa', to: 'fb' },
      holder: (pairs) => ({ pairs, style: 'transform' }),
      link: (holder, from, to, style) => linkPair(holder, from, to, style),
      describe: () => 'pair',
      wording: { owner: 'relation', saved: 'saved', rerendered: 'Formula' },
    };
    const { result } = renderHook(() => usePairSession(options));
    act(() => {
      // The exact transition-before-amend ordering of renderSync.rebaseSnapshot.
      useRenderStore.getState().setTransition('fa', { from: 'a1', to: 'a2', map: [1, 0, 2] });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, 'fa', [1, 0, 2]);
        d.formulas[0]!.snapshot = snapshot('a2');
      });
      useRenderStore.getState().setTransition('fb', { from: 'b1', to: 'b2', map: [2, 1, 0] });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, 'fb', [2, 1, 0]);
        d.formulas[1]!.snapshot = snapshot('b2');
      });
    });
    expect(useProjectStore.getState().project.relations[0]!.pairs).toEqual([
      { from: [1], to: [2], style: null },
    ]);
    expect(result.current.plain).toEqual([{ from: [1], to: [2], style: null }]);
    expect(result.current.current({ from: 'a2', to: 'b2' })).toBe(true);
    expect(result.current.stale).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('saves both production render-sync mappings after a real style edit', async () => {
    const p = createEmptyProject();
    const fa = await formula('abc');
    const fb = await formula('def');
    p.formulas = [fa.f, fb.f];
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const a = createClip(fa.f.id, p.tracks[0]!.id, 0, 6, none);
    const b = createClip(fb.f.id, p.tracks[1]!.id, 2, 8, none);
    p.clips = [a, b];
    const r = createRelation(a.id, b.id, { pairs: [{ from: [0], to: [0], style: null }] });
    p.relations = [r];
    loadProject(p);
    for (const item of [fa, fb])
      useRenderStore
        .getState()
        .setEntry(item.f.id, { status: 'ok', resolved: item.resolved, error: null });
    const user = userEvent.setup();
    render(<RelationEditor request={{ kind: 'edit', relationId: r.id }} onClose={() => {}} />);
    const waiting: ((value: RenderResult) => void)[] = [];
    const engine: FormulaEngine = {
      ...createMockEngine(),
      render: () => new Promise((resolve) => waiting.push(resolve)),
    };
    let stop!: () => void;
    act(() => {
      stop = startRenderSync(engine);
    });
    try {
      expect(waiting).toHaveLength(2);
      const swapped = (item: typeof fa, order: number[], key: string): RenderResult => ({
        ok: true,
        render: {
          ...item.resolved.render,
          key,
          glyphs: order.map((old, index) => ({ ...item.resolved.render.glyphs[old]!, index })),
        },
      });
      await act(async () => {
        waiting[0]!(swapped(fa, [1, 0, 2], 'a2'));
        waiting[1]!(swapped(fb, [2, 1, 0], 'b2'));
        await Promise.resolve();
      });
      expect(useProjectStore.getState().project.relations[0]!.pairs).toEqual([
        { from: [1], to: [2], style: null },
      ]);
      expect(screen.getByTestId('rel-pair-0')).toHaveAttribute('data-from', '1');
      expect(screen.getByTestId('rel-pair-0')).toHaveAttribute('data-to', '2');
      expect(screen.queryByTestId('rel-stale')).toBeNull();
      await user.selectOptions(screen.getByTestId('rel-pair-0-style'), 'fade');
      expect(screen.getByTestId('rel-save')).toBeEnabled();
      await user.click(screen.getByTestId('rel-save'));
      expect(useProjectStore.getState().project.relations[0]!.pairs).toEqual([
        { from: [1], to: [2], style: 'fade' },
      ]);
    } finally {
      stop();
    }
  });
});

describe('Path node selection after Undo', () => {
  it('drops the selected endpoint handle when Undo removes its inserted node', () => {
    const p = createEmptyProject();
    const f = createFormula({ source: 'x' });
    p.formulas = [f];
    const a = createClip(f.id, p.tracks[0]!.id, 0, 5);
    const b = createClip(f.id, p.tracks[1]!.id, 0, 5);
    p.clips = [a, b];
    const r = createRelation(a.id, b.id, {
      offset: 1,
      duration: 2,
      pathArc: 60,
      pairs: [{ from: [0], to: [0], style: null, path: arcSpline(60) }],
    });
    p.relations = [r];
    loadProject(p);
    const target: PairRef = { origin: { kind: 'relation', relationId: r.id }, index: 0 };
    usePathEdit.getState().open(target);
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = () => true;
    canvas.releasePointerCapture = vi.fn();
    const { result } = renderHook(() => {
      const project = useProjectStore((s) => s.project);
      const found = findPair(project, target)!;
      const frame = {
        spline: found.pair.path ?? arcSpline(found.holder.pathArc),
        matrix: [1, 0, 0, 1, 0, 0],
      } as unknown as PathFrame;
      return {
        gestures: usePathGestures({
          canvasRef: { current: canvas },
          camera: { frameWidth: 2, frameHeight: 2, center: [0, 0], zoom: 1 },
          surface: { width: 100, height: 100 },
          unit: 0.002,
          target,
          frame,
        }),
        spline: frame.spline,
      };
    });
    const event = (x: number, y: number) =>
      ({
        clientX: 50 + x * 50,
        clientY: 50 - y * 50,
        button: 0,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        pointerId: 1,
        currentTarget: canvas,
        preventDefault() {},
      }) as unknown as ReactPointerEvent<HTMLCanvasElement>;
    // A real press on the middle of the original arc adds one interior node as one gesture.
    const path = result.current.spline;
    const [first, last] = path.nodes;
    const midpoint: [number, number] = [
      (first!.at[0] + 3 * first!.out![0] + 3 * last!.in![0] + last!.at[0]) / 8,
      (first!.at[1] + 3 * first!.out![1] + 3 * last!.in![1] + last!.at[1]) / 8,
    ];
    act(() => {
      result.current.gestures.onPointerDown(event(...midpoint));
      result.current.gestures.onPointerUp(event(...midpoint));
    });
    expect(result.current.spline.nodes).toHaveLength(3);
    // Click (without moving) the final anchor's incoming handle, now node index 2.
    const endpointHandle = result.current.spline.nodes[2]!.in!;
    act(() => {
      result.current.gestures.onPointerDown(event(...endpointHandle));
      result.current.gestures.onPointerUp(event(...endpointHandle));
    });
    expect(usePathEdit.getState().selected).toEqual({ node: 2, part: 'in' });
    act(() => history.undo());
    expect(result.current.spline.nodes).toHaveLength(2);
    expect(usePathEdit.getState().selected).toBeNull();
    const afterUndo = useProjectStore.getState().project;
    const errors: Error[] = [];
    const collect = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', collect);
    try {
      act(() =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
        ),
      );
    } finally {
      window.removeEventListener('error', collect);
    }
    expect(errors).toEqual([]);
    expect(useProjectStore.getState().project).toBe(afterUndo);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      ),
    );
    expect(useProjectStore.getState().project).toBe(afterUndo);
    act(() => history.redo());
    expect(result.current.spline.nodes).toHaveLength(3);
    expect(usePathEdit.getState().selected).toBeNull();
  });
});
