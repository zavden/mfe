import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  type FormulaSnapshot,
  type GlyphPair,
  type Issue,
  type Project,
} from '../../../model';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { linkPair, type PairHolder } from '../relationOps';
import { usePairSession, type PairSessionOptions } from '../usePairSession';

/* The shared session on a minimal project: formulas `fa` and `fb` with snapshots `a1` / `b1`. */

const snapshot = (key: string): FormulaSnapshot => ({ backend: 'mathjax', key, glyphs: [] });

function setup(): Project {
  const p = createEmptyProject('t');
  p.formulas = [
    { ...createFormula({ name: 'f1', source: 'a', snapshot: snapshot('a1') }), id: 'fa' },
    { ...createFormula({ name: 'f2', source: 'b', snapshot: snapshot('b1') }), id: 'fb' },
  ];
  p.clips = [createClip('fa', p.tracks[0]!.id, 0, 4), createClip('fb', p.tracks[1]!.id, 2, 6)];
  loadProject(p);
  useRenderStore.setState({ transitions: {} });
  return p;
}

const options = (start: GlyphPair[] = []): PairSessionOptions<PairHolder> => ({
  start,
  formulaIds: { from: 'fa', to: 'fb' },
  holder: (pairs) => ({ pairs, style: 'transform' }),
  link: (holder, from, to, style, separate) =>
    linkPair(holder, from, to, style, undefined, { separate }),
  describe: (pair) => `${pair.from.join(',')} → ${pair.to.join(',')}`,
  wording: { owner: 'the relation', saved: 'the relation is saved', rerendered: 'A formula' },
});

const rect = (left: number, bottom: number) => ({ left, bottom, width: 10 }) as unknown as DOMRect;

beforeEach(() => {
  setup();
});

describe('usePairSession', () => {
  it('moves pairs, baseline, selection and suggestion through consecutive steps before React commits', () => {
    const { result } = renderHook(() =>
      usePairSession(options([{ from: [0], to: [0], style: null }])),
    );
    act(() => {
      result.current.setSelection({ from: new Set([0]), to: new Set([1]) });
      result.current.setSuggestion([{ from: [1], to: [2], style: 'copy' }]);
      useRenderStore.getState().setTransition('fa', { from: 'a1', to: 'a2', map: [1, 0, 2] });
      useProjectStore.getState().amend((draft) => {
        draft.formulas[0]!.snapshot = snapshot('a2');
      });
      useRenderStore.getState().setTransition('fa', { from: 'a2', to: 'a3', map: [2, 0, 1] });
      useProjectStore.getState().amend((draft) => {
        draft.formulas[0]!.snapshot = snapshot('a3');
      });
      expect(result.current.current({ from: 'a3', to: 'b1' })).toBe(true);
    });
    expect(result.current.plain).toEqual([{ from: [0], to: [0], style: null }]);
    expect(result.current.dirty).toBe(false);
    expect([...result.current.selection.from]).toEqual([0]);
    expect([...result.current.selection.to]).toEqual([1]);
    expect(result.current.suggestion).toEqual([{ from: [2], to: [2], style: 'copy' }]);
  });

  it('keeps synchronous draft commands when a rebase runs before their React render', () => {
    const { result } = renderHook(() => usePairSession(options()));
    act(() => {
      result.current.link([0], [0]);
      useRenderStore.getState().setTransition('fa', { from: 'a1', to: 'a2', map: [1, 0, 2] });
      useProjectStore.getState().amend((draft) => {
        draft.formulas[0]!.snapshot = snapshot('a2');
      });
    });
    expect(result.current.plain).toEqual([{ from: [1], to: [0], style: null }]);
    expect(result.current.dirty).toBe(true);
  });

  it('starts from the saved pairs, identified, and links through the holder', () => {
    const { result } = renderHook(() =>
      usePairSession(options([{ from: [0], to: [0], style: null }])),
    );
    expect(result.current.pairs.map((p) => p.id)).toEqual([1]);
    expect(result.current.plain).toEqual([{ from: [0], to: [0], style: null }]);
    expect(result.current.dirty).toBe(false);
    act(() => result.current.setSelection({ from: new Set([1]), to: new Set([2]) }));
    expect(result.current.canLink).toBe(true);
    act(() => result.current.link([1], [2]));
    expect(result.current.plain).toEqual([
      { from: [0], to: [0], style: null },
      { from: [1], to: [2], style: null },
    ]);
    expect(result.current.pairs.map((p) => p.id)).toEqual([1, 2]);
    expect(result.current.dirty).toBe(true);
    expect(result.current.selected).toBe(false); // a link clears the selection
    // A refused link says why and changes nothing.
    act(() => result.current.link([], [2]));
    expect(result.current.message).toBe('Select at least one glyph on each side.');
    expect(result.current.pairs).toHaveLength(2);
    // A pair deleted and made again is the same pair to the project: not dirty.
    act(() => result.current.list.onDelete(1));
    act(() => result.current.list.onDelete(0));
    act(() => result.current.setPairs([{ from: [0], to: [0], style: null }]));
    expect(result.current.dirty).toBe(false);
    expect(result.current.pairs[0]!.id).toBe(3); // but a new identity
  });

  it('keeps a pair’s identity through its style and the menu; emphasises the hovered row', () => {
    const { result } = renderHook(() =>
      usePairSession(
        options([
          { from: [0], to: [0], style: null },
          { from: [1], to: [1], style: null },
        ]),
      ),
    );
    act(() => result.current.canvas.onBadgeClick(1, rect(40, 20)));
    expect(result.current.pairMenu).toEqual({
      indices: [1],
      x: 45,
      y: 26,
      align: 'center',
      link: null,
    });
    act(() => result.current.menu.onStyle([1], 'fade'));
    expect(result.current.pairMenu).toBeNull();
    expect(result.current.pairs[1]).toMatchObject({ id: 2, style: 'fade' });
    act(() => result.current.list.onHover(0));
    expect([...result.current.list.focusPairs]).toEqual([0]);
    act(() => result.current.list.onHover(null));
    expect(result.current.list.focusPairs.size).toBe(0);
    // Edit: the pair comes apart into the selection.
    act(() => result.current.list.onEdit(0));
    expect(result.current.plain).toEqual([{ from: [1], to: [1], style: 'fade' }]);
    expect([...result.current.selection.from]).toEqual([0]);
    expect([...result.current.selection.to]).toEqual([0]);
  });

  it('offers what a right-click across the two sides can link as, and links with the style chosen', () => {
    const problems = (pairs: GlyphPair[]): Issue[] =>
      pairs.some((p) => p.style === 'fade')
        ? [{ severity: 'error', code: 'target-conflict', message: 'No fades here.', path: [] }]
        : [];
    const { result } = renderHook(() =>
      usePairSession({ ...options([{ from: [0], to: [0], style: null }]), problems }),
    );
    const at = { clientX: 30, clientY: 40 } as unknown as MouseEvent;
    // One side alone: the menu of its pairs, with nothing to link.
    act(() => result.current.canvas.onContextMenu({ side: 'from', index: 1 }, at));
    expect(result.current.pairMenu).toEqual({
      indices: [],
      x: 30,
      y: 40,
      align: 'start',
      link: null,
    });
    // A right-click on the other side: the glyph joins the selection, and the menu offers the link.
    act(() => result.current.canvas.onContextMenu({ side: 'to', index: 2 }, at));
    expect([...result.current.selection.from]).toEqual([1]);
    expect([...result.current.selection.to]).toEqual([2]);
    expect(result.current.pairMenu?.link).toMatchObject({
      label: '1 → 2',
      from: [1],
      to: [2],
      joins: null,
      refused: null,
    });
    expect(result.current.pairMenu!.link!.choices.map((c) => [c.style, c.blocked])).toEqual([
      ['transform', null],
      ['copy', null],
      ['fade', 'No fades here.'],
      ['fade_copy', null],
    ]);
    act(() => result.current.menu.onLinkAs('copy', false));
    expect(result.current.pairMenu).toBeNull();
    expect(result.current.plain).toEqual([
      { from: [0], to: [0], style: null },
      { from: [1], to: [2], style: 'copy' },
    ]);
    expect(result.current.selected).toBe(false);
    // On the selection itself, both sides held: the same offer; onto a linked target, a join.
    act(() => result.current.setSelection({ from: new Set([2]), to: new Set([0]) }));
    act(() => result.current.canvas.onContextMenu(null, at));
    expect(result.current.pairMenu).toMatchObject({ indices: [0], link: { joins: 0 } });
    // Onto a target that has a pair: join it, or bring it through a pair of its own.
    expect(result.current.pairMenu!.link!.choices.map((c) => c.label)).toEqual([
      'Join pair 1 (Transform)',
      'Separate pair as Transform',
      'Separate pair as Copy',
      'Separate pair as Fade transform',
      'Separate pair as Fade copy',
    ]);
    act(() => result.current.menu.onLinkAs(null, false));
    expect(result.current.plain[0]).toEqual({ from: [0, 2], to: [0], style: null });
    expect(result.current.message).toMatch(/joined pair 1/);
  });

  it('takes a pair apart and puts it back, and says what it did', () => {
    const { result } = renderHook(() =>
      usePairSession(
        options([
          { from: [9], to: [9], style: null },
          { from: [0, 1], to: [3], style: 'fade' },
        ]),
      ),
    );
    act(() => result.current.canvas.onBadgeClick(1, rect(40, 20)));
    act(() => result.current.menu.onSplit(1));
    expect(result.current.pairMenu).toBeNull();
    expect(result.current.plain).toEqual([
      { from: [9], to: [9], style: null },
      { from: [0], to: [3], style: 'fade' },
      { from: [1], to: [3], style: 'fade' },
    ]);
    expect(result.current.message).toBe(
      'Pair 2 is 2 pairs now, one per source: each can have its own style and path.',
    );
    expect(result.current.dirty).toBe(true);
    // Each part has its own style now.
    act(() => result.current.list.onStyle(2, 'copy'));
    act(() => result.current.menu.onJoin(2));
    expect(result.current.plain).toEqual([
      { from: [9], to: [9], style: null },
      { from: [0, 1], to: [3], style: 'fade', extras: 'copies', principal: 0 },
    ]);
    expect(result.current.message).toBe('Pairs 2, 3 are pair 2 now.');
    // Nothing to take apart, nothing to join: nothing happens.
    act(() => result.current.menu.onSplit(0));
    act(() => result.current.menu.onJoin(0));
    expect(result.current.plain).toHaveLength(2);
  });

  it('follows a re-render of a formula through its transition, and holds Save on an unknown one', () => {
    const { result } = renderHook(() =>
      usePairSession(
        options([
          { from: [0, 1], to: [0], style: null },
          { from: [2], to: [1], style: null },
        ]),
      ),
    );
    act(() => result.current.canvas.onBadgeClick(0, rect(0, 0)));
    expect(result.current.pairMenu).not.toBeNull();
    expect(result.current.current({ from: 'a1', to: 'b1' })).toBe(true);
    // f1 is re-rendered: glyphs 0 and 1 swap, 2 is gone.
    act(() => {
      useRenderStore.getState().setTransition('fa', { from: 'a1', to: 'a2', map: [1, 0, null] });
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.snapshot = snapshot('a2');
      });
    });
    // The glyphs keep the order they had (the pair's own), mapped.
    expect(result.current.plain).toEqual([{ from: [1, 0], to: [0], style: null }]);
    expect(result.current.pairs[0]!.id).toBe(1);
    expect(result.current.dirty).toBe(false); // the baseline followed
    expect(result.current.pairMenu).toBeNull(); // it named pairs by their old places
    expect(result.current.message).toBe('“f1” was re-rendered: 1 pair left the draft.');
    expect(result.current.current({ from: 'a2', to: 'b1' })).toBe(true);
    expect(result.current.current({ from: 'a1', to: 'b1' })).toBe(false);
    // f2 is re-rendered by a step the store does not know: stale, until it comes back.
    act(() => {
      useProjectStore.getState().update((d) => {
        d.formulas[1]!.snapshot = snapshot('b9');
      });
    });
    expect(result.current.stale).toBe(
      '“f2” was re-rendered while you edited: close the editor and open it again.',
    );
    expect(result.current.current({ from: 'a2', to: 'b9' })).toBe(false);
    act(() => {
      useProjectStore.getState().update((d) => {
        d.formulas[1]!.snapshot = snapshot('b1');
      });
    });
    expect(result.current.stale).toBeNull();
    expect(result.current.current({ from: 'a2', to: 'b1' })).toBe(true);
  });
});
