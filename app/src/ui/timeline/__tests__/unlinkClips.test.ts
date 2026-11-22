// @vitest-environment node
/* Unlink formula (make a copy): what a selection of clips copies (`planUnlink`), how the clips go
 * to the copies (`moveToCopies`), what the menus say (`unlinkEntry`), and the command
 * (`unlinkClipsById`): Duplicate's copy, the clips moved to it in the same undo step, everything
 * of them still right. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FormulaRender, ResolvedFormula } from '../../../engine';
import {
  createAppear,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createEndsAttach,
  createEndsTween,
  createFitTween,
  createFormula,
  createFormulaGroup,
  createLineFormula,
  createMorph,
  createPartTransform,
  createRelation,
  createShapeAttach,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  createTipAttach,
  createTrack,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type Formula,
  type Project,
} from '../../../model';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { useAnnouncer } from '../../announcer';
import { useNoticeStore } from '../../project/noticeStore';
import { useGlyphPick } from '../../preview/glyphPickStore';
import { unlinkClipsById } from '../clipActions';
import { moveToCopies, planUnlink, unlinkEntry, unlinks } from '../unlinkClips';

const project = () => useProjectStore.getState().project;
const clip = (id: string) => project().clips.find((c) => c.id === id)!;
const formulaOf = (clipId: string) =>
  project().formulas.find((f) => f.id === clip(clipId).formulaId)!;
const steps = () => useProjectStore.temporal.getState().pastStates.length;
const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** f1 on clips a, b (track 1) and c (track 2); f2 on clip d alone (track 2); a brace on e
 * (track 3). */
function scene(): Project {
  const p = createEmptyProject('t');
  p.tracks = ['Track 3', 'Track 2', 'Track 1'].map((name) => createTrack(name));
  const [t3, t2, t1] = p.tracks.map((t) => t.id);
  const snapshot = boxSnapshot(['a', '+', 'b']);
  p.formulas.push(
    { ...createFormula({ name: 'f1', source: 'a+b', snapshot }), id: 'f1' },
    { ...createFormula({ name: 'f2', source: 'x', snapshot: boxSnapshot(['x']) }), id: 'f2' },
    { ...createBraceFormula({ name: 'b1' }), id: 'b1' },
  );
  p.clips.push(
    { ...createClip('f1', t1!, 0, 4, none), id: 'a' },
    { ...createClip('f1', t1!, 5, 9, none), id: 'b' },
    { ...createClip('f1', t2!, 0, 4, none), id: 'c' },
    { ...createClip('f2', t2!, 5, 9, none), id: 'd' },
    { ...createClip('b1', t3!, 1, 4, { ...none, attach: createBraceAttach('a', [0]) }), id: 'e' },
  );
  return p;
}

beforeEach(() => {
  loadProject(scene());
  useUiStore.setState({ selection: { kind: 'clips', ids: ['b'] } });
  useNoticeStore.setState({ notices: [] });
  useGlyphPick.getState().clear();
  useRenderStore.getState().retain([]);
});

describe('planUnlink', () => {
  it('gives a clip of a formula with other clips a copy; a formula’s only clip has none', () => {
    expect(planUnlink(project(), ['b'])).toEqual({
      candidates: ['b'],
      moves: [{ formulaId: 'f1', clipIds: ['b'] }],
      locked: [],
    });
    expect(planUnlink(project(), ['d'])).toEqual({ candidates: ['d'], moves: [], locked: [] });
  });

  it('gives the selected clips of a formula one copy, and none when they are all its clips', () => {
    expect(planUnlink(project(), ['c', 'b']).moves).toEqual([
      { formulaId: 'f1', clipIds: ['b', 'c'] },
    ]);
    expect(planUnlink(project(), ['a', 'b', 'c']).moves).toEqual([]);
  });

  it('gives each formula that keeps other clips one copy, in the order of the formulas', () => {
    useProjectStore.getState().update((draft) => {
      draft.clips.push({ ...createClip('f2', draft.tracks[0]!.id, 5, 9, none), id: 'g' });
    });
    expect(planUnlink(project(), ['g', 'd', 'c', 'b', 'a']).moves).toEqual([]);
    expect(planUnlink(project(), ['g', 'b']).moves).toEqual([
      { formulaId: 'f1', clipIds: ['b'] },
      { formulaId: 'f2', clipIds: ['g'] },
    ]);
  });

  it('leaves a clip on a locked track with its formula, which then keeps that clip', () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[1]!.locked = true; // c and d
    });
    // All the clips of f1, c locked: a and b go to a copy, away from c.
    expect(planUnlink(project(), ['a', 'b', 'c'])).toEqual({
      candidates: ['a', 'b', 'c'],
      moves: [{ formulaId: 'f1', clipIds: ['a', 'b'] }],
      locked: ['c'],
    });
    expect(planUnlink(project(), ['c'])).toEqual({ candidates: ['c'], moves: [], locked: ['c'] });
  });

  it('has no candidate in a brace, a shape, a line, a sound or a clip that is gone', () => {
    useProjectStore.getState().update((draft) => {
      draft.clips.push({ ...createClip('b1', draft.tracks[0]!.id, 5, 9, none), id: 'e2' });
    });
    expect(planUnlink(project(), ['e', 'e2', 'gone'])).toEqual({
      candidates: [],
      moves: [],
      locked: [],
    });
    const kinds = [
      createFormula(),
      createTexFormula(),
      createTextFormula(),
      createBraceFormula(),
      createShapeFormula(),
      createLineFormula(),
    ].map((formula) => [formula.kind, unlinks(formula)]);
    expect(kinds).toEqual([
      ['math', true],
      ['tex', true],
      ['text', true],
      ['brace', false],
      ['shape', false],
      ['line', false],
    ]);
  });
});

describe('moveToCopies', () => {
  it('points the clips of each move at the copy of their formula, and nothing else', () => {
    const before = project();
    const after = structuredClone(before) as Project;
    moveToCopies(after, planUnlink(before, ['b', 'c']).moves, new Map([['f1', { id: 'f9' }]]));
    expect(after.clips.map((c) => c.formulaId)).toEqual(['f1', 'f9', 'f9', 'f2', 'b1']);
    const rest = (clips: readonly Clip[]) => clips.map((c) => ({ ...c, formulaId: '' }));
    expect(rest(after.clips)).toEqual(rest(before.clips));
    // A move without its copy stays.
    moveToCopies(after, [{ formulaId: 'f2', clipIds: ['d'] }], new Map());
    expect(after.clips[3]!.formulaId).toBe('f2');
  });
});

describe('unlinkEntry', () => {
  const entry = (ids: string[], scope: 'clip' | 'selection') =>
    unlinkEntry(project(), planUnlink(project(), ids), scope);

  it('says what the clip gets, or why it has nothing to be unlinked from', () => {
    expect(entry(['b'], 'clip')).toEqual({
      label: 'Unlink formula (make a copy)',
      title:
        'This clip gets a copy of “f1” of its own, a new formula in the Creator. Editing a formula or its copy no longer changes the clips of the other.',
      disabled: false,
    });
    expect(entry(['d'], 'clip')).toEqual({
      label: 'Unlink formula (make a copy)',
      title: '“f2” has no other clip: there is nothing to unlink this clip from.',
      disabled: true,
    });
    // A brace has no such entry.
    expect(entry(['e'], 'clip')).toBeNull();
  });

  it('counts the copies of a selection, and says why it has none', () => {
    expect(entry(['b', 'c', 'e'], 'selection')).toMatchObject({
      label: 'Unlink formula (make a copy)',
      title: expect.stringMatching(
        /^The 2 selected clips of “f1” share one copy of it, a new formula in the Creator\. Editing/,
      ),
      disabled: false,
    });
    expect(entry(['b', 'e'], 'selection')!.title).toMatch(
      /^The selected clip of “f1” gets a copy of it of its own, a new formula in the Creator\./,
    );
    useProjectStore.getState().update((draft) => {
      draft.clips.push({ ...createClip('f2', draft.tracks[0]!.id, 5, 9, none), id: 'g' });
    });
    expect(entry(['b', 'g'], 'selection')).toMatchObject({
      label: 'Unlink formulas (make 2 copies)',
      title: expect.stringMatching(
        /^“f1” and “f2” get a copy each, which their selected clips share: new formulas in the Creator\./,
      ),
    });
    expect(entry(['a', 'b', 'c'], 'selection')).toMatchObject({
      title: 'These are all the clips of “f1”: there is nothing to unlink them from.',
      disabled: true,
    });
    expect(entry(['a', 'b', 'c', 'd', 'g'], 'selection')!.title).toBe(
      'These are all the clips of their formulas: there is nothing to unlink them from.',
    );
    expect(entry(['e'], 'selection')).toBeNull();
  });

  it('says what a lock keeps', () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[1]!.locked = true; // c and d
    });
    expect(entry(['c'], 'clip')!).toEqual({
      label: 'Unlink formula (make a copy)',
      title: 'The clip is on a locked track.',
      disabled: true,
    });
    expect(entry(['c', 'd'], 'selection')!.title).toBe('The selected clips are on locked tracks.');
    expect(entry(['b', 'c'], 'selection')!.title).toMatch(
      /A selected clip on a locked track keeps its formula\.$/,
    );
    // d is f2's only clip, and c is locked.
    expect(entry(['c', 'd', 'e'], 'selection')!.title).toBe(
      'The selected clips are on locked tracks.',
    );
    useProjectStore.getState().update((draft) => {
      draft.tracks[1]!.locked = false;
      draft.tracks[2]!.locked = true; // a and b
    });
    expect(entry(['a', 'd'], 'selection')).toMatchObject({
      title:
        '“f2” has no other clip: there is nothing to unlink it from. The others are on locked tracks.',
      disabled: true,
    });
  });
});

describe('unlinkClipsById', () => {
  it('copies the formula as Duplicate does and moves the clips to it, as one undo step', () => {
    useProjectStore.getState().update((draft) => {
      draft.formulaGroups = [{ ...createFormulaGroup('grp1', ['f1', 'f2']), id: 'g1' }];
    });
    history.clear();
    const before = project();
    const made = unlinkClipsById(['b', 'c']);
    expect(steps()).toBe(1);
    const copyId = made.get('f1')!;
    expect([...made.keys()]).toEqual(['f1']);
    // Right after the original, in the list and in its group; named as Duplicate names it.
    expect(project().formulas.map((f) => f.name)).toEqual(['f1', 'f3', 'f2', 'b1']);
    const [original, copy] = project().formulas;
    expect(copy).toEqual({ ...original, id: copyId, name: 'f3' });
    expect(project().formulaGroups![0]!.formulaIds).toEqual(['f1', copyId, 'f2']);
    // The two clips share the copy; the third keeps the original, and so does the rest.
    expect(project().clips.map((c) => c.formulaId)).toEqual(['f1', copyId, copyId, 'f2', 'b1']);
    // The selection stays; the copy is announced.
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: ['b'] });
    expect(useAnnouncer.getState().text).toBe('2 clips unlinked: f3, a copy of f1');
    expect(validateProject(project())).toEqual(validateProject(before));

    history.undo();
    expect(project()).toEqual(before);
    history.redo();
    expect(project().clips.map((c) => c.formulaId)).toEqual(['f1', copyId, copyId, 'f2', 'b1']);
    expect(project().formulas[1]!.id).toBe(copyId);
  });

  it('does nothing, and makes no step, for a formula’s only clip or all of its clips', () => {
    history.clear();
    expect(unlinkClipsById(['d']).size).toBe(0);
    expect(unlinkClipsById(['a', 'b', 'c', 'e']).size).toBe(0);
    expect(steps()).toBe(0);
    expect(project().formulas).toHaveLength(3);
  });

  it('copies several formulas in one step, and leaves a clip on a locked track, saying so', () => {
    useProjectStore.getState().update((draft) => {
      draft.clips.push({ ...createClip('f2', draft.tracks[0]!.id, 5, 9, none), id: 'g' });
      draft.tracks[1]!.locked = true; // c and d
    });
    history.clear();
    const made = unlinkClipsById(['a', 'b', 'c', 'g', 'e']);
    expect(steps()).toBe(1);
    const [f1Copy, f2Copy] = [made.get('f1')!, made.get('f2')!];
    expect(project().formulas.map((f) => f.id)).toEqual(['f1', f1Copy, 'f2', f2Copy, 'b1']);
    expect(project().formulas.map((f) => f.name)).toEqual(['f1', 'f3', 'f2', 'f4', 'b1']);
    expect(project().clips.map((c) => [c.id, c.formulaId])).toEqual([
      ['a', f1Copy],
      ['b', f1Copy],
      ['c', 'f1'],
      ['d', 'f2'],
      ['e', 'b1'],
      ['g', f2Copy],
    ]);
    expect(useNoticeStore.getState().notices).toMatchObject([
      { title: '1 clip stayed', message: 'A clip on a locked track keeps its formula.' },
    ]);
    expect(useAnnouncer.getState().text).toBe(
      '3 clips unlinked: f3, a copy of f1; f4, a copy of f2',
    );
  });

  it('gives a font text’s copy its geometry, and a LaTeX text’s its layout', () => {
    const geometry = { contentHash: 'h'.repeat(64), byteLength: 10, key: 'k', basisKey: 'b' };
    useProjectStore.getState().update((draft) => {
      const p = { ...createTextFormula({ name: 'p1', source: 'Hi', geometry }), id: 'p1' };
      const layout = { width: 4, align: 'left' as const, lineSpacing: 1.2 };
      const t = { ...createTexFormula({ name: 't1', source: 'T', layout }), id: 't1' };
      draft.formulas.push(p, t);
      const top = draft.tracks[0]!.id;
      draft.clips.push(
        { ...createClip('p1', top, 10, 12, none), id: 'p' },
        { ...createClip('p1', top, 13, 15, none), id: 'q' },
        { ...createClip('t1', top, 16, 18, none), id: 't' },
        { ...createClip('t1', top, 19, 21, none), id: 'u' },
      );
    });
    const made = unlinkClipsById(['q', 'u']);
    expect(formulaOf('q')).toEqual({ ...formulaOf('p'), id: made.get('p1'), name: 'p2' });
    expect(formulaOf('u')).toEqual({ ...formulaOf('t'), id: made.get('t1'), name: 't2' });
  });

  it('gives the copy the render of its original at once, resolved for the copy', () => {
    const original = project().formulas[0]!;
    const render = {
      key: original.snapshot!.key,
      backend: 'latex',
      glyphs: [],
    } as unknown as FormulaRender;
    const resolved: ResolvedFormula = {
      formula: original,
      render,
      canonToRender: [2, 1, 0],
      confidence: 0.9,
    };
    useRenderStore.getState().setEntry('f1', { status: 'ok', resolved, error: null });
    const copyId = unlinkClipsById(['b']).get('f1')!;
    const seeded = useRenderStore.getState().entries[copyId];
    expect(seeded).toEqual({
      status: 'ok',
      resolved: { ...resolved, formula: formulaOf('b') },
      error: null,
    });
    expect(seeded!.resolved!.formula).toBe(formulaOf('b'));
    expect(useRenderStore.getState().resolved.get(copyId)).toBe(seeded!.resolved);
  });

  it('keeps the glyphs picked on the clip picked, now of the copy', () => {
    useUiStore.setState({ selection: { kind: 'clips', ids: ['b'] } });
    useGlyphPick.getState().set({
      parts: [{ clipId: 'b', selection: { selected: new Set([0, 2]), anchor: 2 } }],
    });
    expect(useGlyphPick.getState().current()?.parts[0]?.revision?.formulaId).toBe('f1');
    const copyId = unlinkClipsById(['b']).get('f1')!;
    const part = useGlyphPick.getState().current()?.parts[0];
    expect(part?.clipId).toBe('b');
    expect([...part!.selection.selected]).toEqual([0, 2]);
    expect(part?.revision?.formulaId).toBe(copyId);
  });
});

/** Every reference a clip can have, on clip `c2` of `f1` (which `c1` shows too), in a project that
 * validates: relations as target and as source, glyph blocks, a Morph block, glyph colours of its
 * own, a group of blocks; a brace on its glyphs with a label at the tip, a shape over its glyphs
 * and over glyphs of another clip, a line with an end on its glyphs, and Transforms of other clips
 * that carry a shape and a line's end to its glyphs. */
function everything(): Project {
  const p = createEmptyProject('everything');
  p.tracks = Array.from({ length: 9 }, (_, i) => createTrack(`Track ${9 - i}`));
  const track = (n: number) => p.tracks[9 - n]!.id;
  const f1: Formula = {
    ...createFormula({
      name: 'f1',
      source: 'a+b=c',
      snapshot: boxSnapshot(['a', '+', 'b', '=', 'c']),
      glyphColors: { '4': '#FF0000' },
      hiddenGlyphs: [3],
      startPosition: [1, 2],
    }),
    id: 'f1',
  };
  const f2: Formula = {
    ...createFormula({ name: 'f2', source: 'x=y', snapshot: boxSnapshot(['x', '=', 'y']) }),
    id: 'f2',
  };
  p.formulas.push(
    f1,
    f2,
    { ...createBraceFormula({ name: 'b1', width: 1 }), id: 'b1' },
    { ...createTexFormula({ name: 't1', source: 'T', snapshot: boxSnapshot(['T']) }), id: 't1' },
    { ...createShapeFormula({ name: 's1', width: 1, height: 1 }), id: 's1' },
    { ...createLineFormula({ name: 'l1' }), id: 'l1' },
    { ...createShapeFormula({ name: 's2', width: 1, height: 1 }), id: 's2' },
    { ...createLineFormula({ name: 'l2' }), id: 'l2' },
  );
  p.formulaGroups = [{ ...createFormulaGroup('grp1', ['f2', 'f1']), id: 'g1' }];
  const c2: Clip = {
    ...createClip('f1', track(2), 0, 10, none),
    id: 'c2',
    actions: [
      { ...createAppear(2.5, 'fade_in', [3]), id: 'appear' },
      { ...createPartTransform(3, [1], { duration: 1, shift: [0, 1] }), id: 'part', group: 'g' },
      { ...createEmphasis(3, 'indicate', [2], { duration: 1 }), id: 'indicate', group: 'g' },
      {
        ...createMorph(5, { duration: 1, pairs: [{ from: [1], to: [4], style: null }] }),
        id: 'morph',
      },
      { ...createDisappear(8, 'fade_out', [2]), id: 'disappear' },
    ],
  };
  c2.initial.glyphColors = { '0': '#00FF00' };
  const on = (glyphs: number[]) => ({ clipId: 'c2', glyphs });
  p.clips.push(
    { ...createClip('f1', track(1), 0, 10, none), id: 'c1' },
    c2,
    { ...createClip('f2', track(3), 0, 10, none), id: 'c3' },
    {
      ...createClip('b1', track(4), 4.5, 10, { ...none, attach: createBraceAttach('c2', [0]) }),
      id: 'brace',
    },
    {
      ...createClip('t1', track(5), 4.5, 10, { ...none, attach: createTipAttach('brace') }),
      id: 'label',
    },
    {
      ...createClip('s1', track(6), 4.5, 10, {
        ...none,
        attach: createShapeAttach('c2', [0], 0.1, [{ clipId: 'c3', glyphs: [1] }]),
      }),
      id: 'shape',
    },
    {
      ...createClip('l1', track(7), 4.5, 10, {
        ...none,
        attach: createEndsAttach(on([0]), { point: [3, -2] }, 0),
      }),
      id: 'line',
    },
    {
      ...createClip('s2', track(8), 0, 10, {
        ...none,
        actions: [{ ...createFitTween(4.5, 1, on([0])), id: 'fit' }],
      }),
      id: 'shape2',
    },
    {
      ...createClip('l2', track(9), 0, 10, {
        ...none,
        actions: [
          {
            ...createEndsTween(4.5, 1, {
              start: { ...on([0]), anchor: 'auto' },
              end: { point: [2, 2] },
            }),
            id: 'ends',
          },
        ],
      }),
      id: 'line2',
    },
  );
  p.relations.push(
    {
      ...createRelation('c1', 'c2', {
        offset: 1,
        duration: 1,
        pairs: [{ from: [0], to: [0], style: null }],
      }),
      id: 'r1',
    },
    {
      ...createRelation('c2', 'c3', {
        offset: 7,
        duration: 1,
        pairs: [{ from: [4], to: [0], style: null }],
      }),
      id: 'r2',
    },
  );
  return p;
}

describe('a clip with everything on it', () => {
  it('validates as it did, and every reference of it stays as it was', () => {
    loadProject(everything());
    const before = project();
    expect(validateProject(before)).toEqual([]);
    const copyId = unlinkClipsById(['c2']).get('f1')!;
    const after = project();
    expect(validateProject(after)).toEqual([]);
    // The clip shows the copy, and nothing else of it, or of any other clip, changed.
    expect(after.clips).toEqual(
      before.clips.map((c) => (c.id === 'c2' ? { ...c, formulaId: copyId } : c)),
    );
    expect(after.relations).toEqual(before.relations);
    // The copy has the original's glyphs: what the clip's references count by.
    const copy = after.formulas.find((f) => f.id === copyId)!;
    expect(copy).toEqual({ ...before.formulas[0], id: copyId, name: 'f3' });
    expect(after.formulas.map((f) => f.id)).toEqual([
      'f1',
      copyId,
      ...before.formulas.slice(1).map((f) => f.id),
    ]);
    expect(after.formulaGroups).toEqual([
      { id: 'g1', name: 'grp1', formulaIds: ['f2', 'f1', copyId] },
    ]);
  });
});
