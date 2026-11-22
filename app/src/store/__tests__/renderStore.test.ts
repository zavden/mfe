// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { FormulaRender, ResolvedFormula } from '../../engine';
import { createFormula } from '../../model';
import { useRenderStore } from '../index';

const resolved = (id: string) =>
  ({
    formula: createFormula({ name: id }),
    canonToRender: [],
    confidence: 1,
  }) as unknown as ResolvedFormula;

beforeEach(() => useRenderStore.getState().retain([]));

describe('render store', () => {
  it('exposes successful renders in `resolved` and keeps them while loading', () => {
    const { setEntry } = useRenderStore.getState();
    const r = resolved('f1');
    setEntry('f1', { status: 'loading', resolved: null, error: null });
    expect(useRenderStore.getState().resolved.size).toBe(0);

    setEntry('f1', { status: 'ok', resolved: r, error: null });
    const map = useRenderStore.getState().resolved;
    expect(map.get('f1')).toBe(r);

    // Status-only changes keep the same map (subscribers compare by reference).
    setEntry('f1', { status: 'loading', resolved: r, error: null });
    expect(useRenderStore.getState().resolved).toBe(map);
  });

  it('forgets formulas outside the retained set', () => {
    const { setEntry, retain } = useRenderStore.getState();
    setEntry('f1', { status: 'ok', resolved: resolved('f1'), error: null });
    setEntry('f2', { status: 'ok', resolved: resolved('f2'), error: null });
    retain(['f2']);
    expect([...useRenderStore.getState().resolved.keys()]).toEqual(['f2']);
    expect(Object.keys(useRenderStore.getState().entries)).toEqual(['f2']);
  });
});

describe('seedCopies', () => {
  const snapshot = (key: string, labels: string[]) => ({
    backend: 'latex' as const,
    key,
    glyphs: labels.map((label, i) => ({
      label,
      center: [i, 0] as [number, number],
      size: [1, 1] as [number, number],
    })),
  });
  const render = (key: string) => ({ key, glyphs: [] }) as unknown as FormulaRender;

  it('gives a copy the render of its original, resolved for the copy, and nothing without one', () => {
    const original = {
      ...createFormula({ name: 'f1', snapshot: snapshot('k', ['a', 'b']) }),
      id: 'f1',
    };
    const copy = { ...structuredClone(original), id: 'f2', name: 'f2' };
    const lone = { ...createFormula({ name: 'g1' }), id: 'g1' };
    const r: ResolvedFormula = {
      formula: original,
      render: render('k'),
      canonToRender: [1, 0],
      confidence: 0.8,
    };
    useRenderStore.getState().setEntry('f1', { status: 'loading', resolved: r, error: null });
    const before = useRenderStore.getState();
    before.seedCopies(new Map([['g1', { ...lone, id: 'g2' }]]));
    // Nothing to give: the store is as it was.
    expect(useRenderStore.getState()).toBe(before);
    before.seedCopies(new Map([['f1', copy]]));
    expect(useRenderStore.getState().entries.f2).toEqual({
      status: 'loading',
      resolved: { ...r, formula: copy },
      error: null,
    });
    expect(useRenderStore.getState().resolved.get('f2')!.formula).toBe(copy);
    expect(useRenderStore.getState().entries.f1!.resolved).toBe(r);
  });

  it('carries the copy over a transition its original’s render has not caught up with', () => {
    // The original's render resolved the snapshot `k`; the snapshot is `k2` now, its glyphs
    // swapped by the transition the sync published.
    const old = { ...createFormula({ name: 'f1', snapshot: snapshot('k', ['a', 'b']) }), id: 'f1' };
    const copy = { ...old, id: 'f2', name: 'f2', snapshot: snapshot('k2', ['b', 'a']) };
    const r: ResolvedFormula = {
      formula: old,
      render: render('k'),
      canonToRender: [0, 1],
      confidence: 1,
    };
    const store = useRenderStore.getState();
    store.setEntry('f1', { status: 'ok', resolved: r, error: null });
    store.setTransition('f1', { from: 'k', to: 'k2', map: [1, 0] });
    useRenderStore.getState().seedCopies(new Map([['f1', copy]]));
    expect(useRenderStore.getState().entries.f2!.resolved).toMatchObject({
      formula: copy,
      canonToRender: [1, 0],
    });
  });
});

describe('snapshot transitions', () => {
  it('keeps the last transition of each formula and forgets it with the formula', () => {
    const store = useRenderStore.getState();
    store.setTransition('f1', { from: 'a', to: 'b', map: [1, 0] });
    store.setTransition('f1', { from: 'b', to: 'c', map: [0, 1, null] });
    store.setTransition('f2', { from: 'x', to: 'y', map: [0] });
    expect(useRenderStore.getState().transitions).toEqual({
      f1: { from: 'b', to: 'c', map: [0, 1, null] },
      f2: { from: 'x', to: 'y', map: [0] },
    });
    store.retain(['f2']);
    expect(useRenderStore.getState().transitions).toEqual({ f2: { from: 'x', to: 'y', map: [0] } });
    store.retain([]);
    expect(useRenderStore.getState().transitions).toEqual({});
  });
});
