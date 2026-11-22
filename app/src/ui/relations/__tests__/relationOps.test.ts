// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createLineFormula,
  createShapeFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type FormulaSnapshot,
  type Project,
} from '../../../model';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import {
  buildChainDiagram,
  buildDiagram,
  buildRelationDiagram,
  relatedClips,
} from '../diagramLayout';
import {
  addedWindow,
  clearPairsPath,
  defaultWindow,
  fitRelationWindows,
  fitWindow,
  keepWindowsInPlace,
  linkPair,
  marqueeSides,
  newRelation,
  onePieceRelation,
  pathOfPair,
  readingOrder,
  relatable,
  relateBlocker,
  relationAlive,
  relationBlocker,
  relationLock,
  relationNumber,
  relationPathAction,
  relationsBetween,
  relationSummary,
  relationTitle,
  removePair,
  removePairs,
  restoreWindows,
  setPairExtras,
  setPairsStyle,
  setPairStyle,
  suggestPairs,
  windowAndPairs,
  windowAt,
  windowIn,
  windowRange,
} from '../relationOps';

const labelled = (labels: string[], xs?: number[]): FormulaSnapshot => ({
  backend: 'latex',
  key: 'k',
  glyphs: labels.map((label, i) => ({ label, center: [xs?.[i] ?? i, 0], size: [0.2, 0.3] })),
});

/** A on track 1 [0, 6] with a 1 s intro, B on track 2 [2, 8] with a 1 s outro. */
function scene(): { project: Project; a: Clip; b: Clip } {
  const project = createEmptyProject();
  const fa = createFormula({ name: 'f1', snapshot: boxSnapshot(['a', '+', 'b', '=', 'c']) });
  const fb = createFormula({ name: 'f2', snapshot: boxSnapshot(['a', '=', '3']) });
  project.formulas.push(fa, fb);
  const a = createClip(fa.id, project.tracks[0]!.id, 0, 6, {
    intro: defaultIntro('write'),
    outro: defaultOutro('none'),
  });
  const b = createClip(fb.id, project.tracks[1]!.id, 2, 8, {
    intro: defaultIntro('none'),
    outro: defaultOutro('fade_out'),
  });
  project.clips.push(a, b);
  return { project, a, b };
}

describe('relation windows', () => {
  it('lies between the source intro and end, and the target start and outro', () => {
    const { a, b } = scene();
    expect(windowRange(a, b)).toEqual({ start: 2, end: 6 });
    expect(defaultWindow(a, b)).toEqual({ offset: 0, duration: 1 });
    expect(defaultWindow(a, b, 10)).toEqual({ offset: 0, duration: 4 });
    // The source intro pushes the window start when the target starts earlier.
    expect(windowRange({ ...a, start: 3, end: 9 }, { ...b, start: 2 })).toEqual({
      start: 4,
      end: 7, // the target's outro starts at 7
    });
  });

  it('is empty when the clips do not overlap enough', () => {
    const { project, a, b } = scene();
    expect(windowRange(a, { ...b, start: 6, end: 9 })).toBeNull();
    expect(relationBlocker(project, a, { ...b, start: 6, end: 9 })).toMatch(/overlap/);
    expect(relationBlocker(project, a, { ...b, trackId: a.trackId })).toMatch(/same track/);
    expect(relationBlocker(project, a, a)).toMatch(/different clips/);
    expect(relationBlocker(project, a, b)).toBeNull();
  });

  it('is between formulas and texts: a brace, a shape or a line is one piece', () => {
    const { project, a, b } = scene();
    const objects = [
      ['brace', createBraceFormula({ name: 'b1' })],
      ['shape', createShapeFormula({ name: 's1' })],
      ['line', createLineFormula({ name: 'l1' })],
    ] as const;
    expect(relatable(project, a)).toBe(true);
    for (const [kind, formula] of objects) {
      project.formulas.push(formula);
      const piece = { ...b, id: `c-${kind}`, formulaId: formula.id };
      project.clips.push(piece);
      expect(relatable(project, piece)).toBe(false);
      const reason = `A ${kind} is one piece: a relation is between formulas and texts.`;
      expect(relationBlocker(project, a, piece)).toBe(reason);
      expect(relationBlocker(project, piece, a)).toBe(reason);
      expect(newRelation(project, a.id, piece.id)).toEqual({ ok: false, message: reason });
    }
  });

  it('fits a window by shifting it, then shortening it', () => {
    const { a, b } = scene();
    expect(fitWindow({ offset: 3, duration: 1 }, a, b)).toEqual({ offset: 3, duration: 1 });
    expect(fitWindow({ offset: 5, duration: 1 }, a, b)).toEqual({ offset: 3, duration: 1 });
    expect(fitWindow({ offset: -2, duration: 1 }, a, b)).toEqual({ offset: 0, duration: 1 });
    expect(fitWindow({ offset: 0, duration: 9 }, a, b)).toEqual({ offset: 0, duration: 4 });
    expect(fitWindow({ offset: 0, duration: 1 }, a, { ...b, start: 6, end: 9 })).toBeNull();
  });

  it('keeps relation windows valid when clips are edited, and puts them back', () => {
    const { project, a, b } = scene();
    project.relations.push(createRelation(a.id, b.id, { offset: 2, duration: 2 })); // [4, 6]
    expect(validateProject(project).filter((i) => i.code === 'relation-window')).toEqual([]);
    const draft = structuredClone(project);
    draft.clips[0]!.end = 5; // trim the source
    expect(validateProject(draft).filter((i) => i.code === 'relation-window')).toHaveLength(1);
    fitRelationWindows(draft, [a.id]);
    expect(draft.relations[0]).toMatchObject({ offset: 1, duration: 2 }); // [4, 6] → [3, 5]
    expect(validateProject(draft).filter((i) => i.code === 'relation-window')).toEqual([]);
    restoreWindows(draft, project);
    expect(draft.relations[0]).toMatchObject({ offset: 2, duration: 2 });
  });

  it('compensates the offset when the start of a target is trimmed', () => {
    const { project, a, b } = scene();
    project.relations.push(createRelation(a.id, b.id, { offset: 1, duration: 1 })); // [3, 4]
    const draft = structuredClone(project);
    const clip = draft.clips[1]!;
    clip.start = 2.5; // trimmed by half a second
    keepWindowsInPlace(draft, b.id, 2);
    expect(draft.relations[0]!.offset).toBeCloseTo(0.5, 9); // still starts at 3 s
  });

  it('a window never starts before its target does: trimmed past it, it starts with it', () => {
    const { project, a, b } = scene();
    project.relations.push(createRelation(a.id, b.id, { offset: 0.25, duration: 1 })); // [2.25, 3.25]
    const draft = structuredClone(project);
    const relation = draft.relations[0]!;
    const clip = draft.clips[1]!;
    clip.start = 2.5; // trimmed past the window's start
    keepWindowsInPlace(draft, b.id, 2);
    expect(relation.offset).toBe(0);
    // Dragged to 0 s then, the window goes with its target and starts there, not before the scene.
    clip.end -= clip.start;
    clip.start = 0;
    expect(clip.start + relation.offset).toBe(0);
  });

  it('creates a relation with a valid window, or says why not', () => {
    const { project, a, b } = scene();
    const made = newRelation(project, a.id, b.id);
    expect(made.ok).toBe(true);
    if (made.ok)
      expect(made.relation).toMatchObject({ fromClipId: a.id, toClipId: b.id, offset: 0 });
    expect(newRelation(project, a.id, a.id).ok).toBe(false);
    expect(newRelation(project, a.id, 'nope').ok).toBe(false);
  });

  it('starts the window of a new relation at the playhead, when one fits there', () => {
    const { project, a, b } = scene(); // the windows may lie in [2, 6]; b starts at 2
    expect(windowAt(a, b, 3.5)).toEqual({ offset: 1.5, duration: 1 });
    expect(windowAt(a, b, 2)).toEqual({ offset: 0, duration: 1 });
    // As long as the clips leave, down to a quarter of a second…
    expect(windowAt(a, b, 5.4)).toEqual({ offset: 3.4, duration: 0.6 });
    expect(windowAt(a, b, 5.75)).toEqual({ offset: 3.75, duration: 0.25 });
    // … and none where less is left, nor before or after the time the clips allow.
    expect(windowAt(a, b, 5.8)).toBeNull();
    expect(windowAt(a, b, 1.9)).toBeNull();
    expect(windowAt(a, b, 7)).toBeNull();
    expect(windowAt(a, { ...b, start: 6, end: 9 }, 6.5)).toBeNull();

    const there = newRelation(project, a.id, b.id, 3.5);
    expect(there.ok && [there.relation.offset, there.relation.duration, there.note]).toEqual([
      1.5,
      1,
      null,
    ]);
    // No window fits at the playhead: the window of always, and a word about it.
    const before = newRelation(project, a.id, b.id, 0);
    expect(before.ok && [before.relation.offset, before.note]).toEqual([
      0,
      'No window fits at the playhead (0.00 s): the two clips allow one within 2.00–6.00 s. It starts at 2.00 s instead.',
    ]);
    // Between two related clips that is after the last of their windows.
    project.relations.push(createRelation(a.id, b.id, { offset: 0, duration: 1 })); // [2, 3)
    const late = newRelation(project, a.id, b.id, 5.9);
    expect(late.ok && [late.relation.offset, late.note]).toEqual([
      1,
      'No window fits at the playhead (5.90 s): the two clips allow one within 2.00–6.00 s. It starts at 3.00 s instead.',
    ]);
    // The playhead wins over "after the last one" when a window fits at it, even over another.
    const over = newRelation(project, a.id, b.id, 2.5);
    expect(over.ok && [over.relation.offset, over.note]).toEqual([0.5, null]);
    // Without a playhead there is nothing to say.
    const plain = newRelation(project, a.id, b.id);
    expect(plain.ok && [plain.relation.offset, plain.note]).toEqual([1, null]);
  });

  it('gives a new relation the region marked on the timeline as its window (D180)', () => {
    const { project, a, b } = scene(); // the windows may lie in [2, 6]; b starts at 2
    expect(windowIn(a, b, { start: 3, end: 5.5 })).toEqual({ offset: 1, duration: 2.5 });
    expect(windowIn(a, b, { start: 2, end: 6 })).toEqual({ offset: 0, duration: 4 });
    // The region wins over the playhead, and over "after the last window" of related clips.
    project.relations.push(createRelation(a.id, b.id, { offset: 0, duration: 1 })); // [2, 3)
    const made = newRelation(project, a.id, b.id, 5, { start: 2.5, end: 4 });
    expect(made.ok && [made.relation.offset, made.relation.duration, made.note]).toEqual([
      0.5,
      1.5,
      null,
    ]);
    // No region: as before.
    const plain = newRelation(project, a.id, b.id, 4, null);
    expect(plain.ok && [plain.relation.offset, plain.relation.duration]).toEqual([2, 1]);
  });

  it('makes no relation when its window does not fit in the region, and says why', () => {
    const { project, a, b } = scene(); // the windows may lie in [2, 6]
    const outside =
      'the two clips allow one within 2.00–6.00 s. Nothing was created: move the region, or remove it (Esc) to start the relation at the playhead.';
    expect(windowIn(a, b, { start: 1, end: 3 })).toBe(
      `No window fits in the region (1.00–3.00 s): ${outside}`,
    );
    expect(windowIn(a, b, { start: 5, end: 7 })).toBe(
      `No window fits in the region (5.00–7.00 s): ${outside}`,
    );
    expect(newRelation(project, a.id, b.id, 3, { start: 7, end: 8 })).toEqual({
      ok: false,
      message: `No window fits in the region (7.00–8.00 s): ${outside}`,
    });
    // Shorter than a window may be.
    expect(windowIn(a, b, { start: 3, end: 3.033333 })).toBe(
      'The region (3.00–3.03 s) is too short for a relation’s window. Nothing was created.',
    );
    // What stops any relation between the two is said first, as without a region.
    expect(newRelation(project, a.id, a.id, 3, { start: 3, end: 4 })).toEqual({
      ok: false,
      message: 'A relation needs two different clips.',
    });
  });

  it('gives a relation added between two related clips a window after the ones they have', () => {
    const { project, a, b } = scene(); // the windows may lie in [2, 6]
    expect(addedWindow(project, a, b)).toEqual({ offset: 0, duration: 1 });
    project.relations.push(createRelation(a.id, b.id, { offset: 0, duration: 1 })); // [2, 3)
    expect(addedWindow(project, a, b)).toEqual({ offset: 1, duration: 1 });
    const second = newRelation(project, a.id, b.id);
    expect(second.ok && second.relation).toMatchObject({ offset: 1, duration: 1 });
    // The other direction has none: its first relation takes the default window.
    const back = newRelation(project, b.id, a.id);
    expect(back.ok && back.relation.fromClipId).toBe(b.id);
    // As long as the clips leave when they leave less than a second…
    project.relations.push(createRelation(a.id, b.id, { offset: 2.5, duration: 1 })); // [4.5, 5.5)
    expect(addedWindow(project, a, b)).toEqual({ offset: 3.5, duration: 0.5 });
    // … and the default window when nothing worth a window is left after them.
    project.relations.push(createRelation(a.id, b.id, { offset: 3.5, duration: 0.4 })); // … 5.9
    expect(addedWindow(project, a, b)).toEqual({ offset: 0, duration: 1 });
    expect(addedWindow(project, a, { ...b, start: 6, end: 9 })).toBeNull();
  });

  it('is blocked by a locked track on either side: a relation writes to both clips', () => {
    const { project, a, b } = scene();
    const relation = createRelation(a.id, b.id);
    expect(relationLock(project, relation)).toBeNull();
    for (const index of [0, 1]) {
      const tracks = project.tracks.map((t, i) => (i === index ? { ...t, locked: true } : t));
      const locked = { ...project, tracks };
      expect(relationLock(locked, relation)).toMatch(/is locked/);
      expect(relationBlocker(locked, a, b)).toMatch(/is locked/);
      expect(newRelation(locked, a.id, b.id)).toMatchObject({ ok: false });
    }
  });
});

describe('relationAlive', () => {
  it('needs both clips and both formulas', () => {
    const { project, a, b } = scene();
    const relation = createRelation(a.id, b.id);
    expect(relationAlive(project, relation)).toBe(true);
    expect(relationAlive(project, { fromClipId: a.id, toClipId: 'gone' })).toBe(false);
    // A file can refer to a formula that is not in it (dangling-ref): it opens to be repaired.
    const dangling = { ...project, formulas: project.formulas.slice(1) };
    expect(relationAlive(dangling, relation)).toBe(false);
  });
});

describe('onePieceRelation (audit A1-02)', () => {
  it('says why a relation with a brace, a shape or a line on a side is deleted only', () => {
    const { project, a, b } = scene();
    const relation = createRelation(a.id, b.id, { pairs: [{ from: [0], to: [0], style: null }] });
    project.relations.push(relation);
    expect(onePieceRelation(project, relation)).toBeNull();
    expect(relationPathAction(project, relation)).toEqual({ kind: 'pair', index: 0 });
    const objects = [
      ['brace', createBraceFormula({ name: 'b1' })],
      ['shape', createShapeFormula({ name: 's1' })],
      ['line', createLineFormula({ name: 'l1' })],
    ] as const;
    for (const [kind, formula] of objects) {
      project.formulas.push(formula);
      const reason = `"${formula.name}" is a ${kind}, one piece: a relation is between formulas and texts, so this one cannot be edited, only deleted.`;
      // On either side, as a saved project may hold it (`relation-kind`).
      for (const side of ['from', 'to'] as const) {
        const clip = side === 'from' ? a : b;
        const piece = {
          ...project,
          clips: project.clips.map((c) => (c.id === clip.id ? { ...c, formulaId: formula.id } : c)),
        };
        expect(onePieceRelation(piece, relation)).toBe(reason);
        expect(relationPathAction(piece, relation)).toEqual({ kind: 'blocked', reason });
      }
    }
    // A missing formula is `relationAlive`'s to say.
    const dangling = { ...project, formulas: project.formulas.slice(1) };
    expect(onePieceRelation(dangling, relation)).toBeNull();
  });
});

describe('pairs', () => {
  const relation = createRelation('a', 'b');
  const link = (
    r: ReturnType<typeof createRelation>,
    from: number[],
    to: number[],
    style = null as null | 'copy' | 'fade' | 'transform',
  ) => {
    const result = linkPair(r, from, to, style);
    if (!result.ok) throw new Error(result.message);
    return result.relation;
  };

  it('stores glyphs ascending and without duplicates', () => {
    const r = link(relation, [4, 2, 2], [1, 0]);
    expect(r.pairs).toEqual([{ from: [2, 4], to: [0, 1], style: null }]);
  });

  it('joins the pair of a target that is linked already (two glyphs that become one)', () => {
    const r = link(relation, [0], [0]);
    const joined = linkPair(r, [1], [0], null, { from: (g) => `s${g}`, to: (g) => `t${g}` });
    expect(joined).toEqual({
      ok: true,
      joined: 0,
      message: 'Glyph s1 (1) joined pair 1: s0 (0), s1 (1) → t0 (0).',
      relation: { ...r, pairs: [{ from: [0, 1], to: [0], style: null }] },
    });
    // The pair keeps its style, whatever the link asked for; several sources join at once.
    const styled = link(relation, [0], [0, 1], 'copy');
    const more = linkPair(styled, [3, 2], [0, 1], 'fade');
    expect(more.ok && more.relation.pairs).toEqual([
      { from: [0, 2, 3], to: [0, 1], style: 'copy' },
    ]);
    // A source the pair has already, targets of two pairs, or a linked target among free ones.
    expect(linkPair(r, [0], [0])).toMatchObject({ ok: false, message: /in pair 1 already/ });
    const two = link(r, [1], [1]);
    expect(linkPair(two, [2], [0, 1])).toMatchObject({ ok: false, message: /different pairs/ });
    expect(linkPair(two, [2], [1, 2])).toMatchObject({ ok: false, message: /not linked/ });
    // A consuming pair cannot take a source another pair consumes; a copying pair can.
    const consumed = link(two, [2], [2]);
    expect(linkPair(consumed, [2], [0])).toMatchObject({ ok: false, message: /consumed/ });
    const copying = link(createRelation('a', 'b', { style: 'copy' }), [0], [0]);
    expect(linkPair(link(copying, [2], [2]), [2], [0]).ok).toBe(true);
  });

  it('with `copies`, only the first source of the grown pair must be free; setPairExtras', () => {
    // Pair 1 consumes 0. Linking 2 onto pair 2's target grows a `copies` pair whose extra, 2, is
    // only copied: fine. Linking 0 onto it is not: 0 would be its first source, consumed twice.
    const base = link(relation, [0], [0]);
    const copies = setPairExtras(link(base, [1], [1]), 1, 'copies');
    expect(copies.pairs[1]).toEqual({
      from: [1],
      to: [1],
      style: null,
      extras: 'copies',
      principal: 1,
    });
    const joined = linkPair(copies, [2], [1]);
    expect(joined.ok && joined.relation.pairs[1]).toEqual({
      from: [1, 2],
      to: [1],
      style: null,
      extras: 'copies',
      principal: 1,
    });
    const consumedTwice = linkPair(copies, [0], [1]);
    expect(consumedTwice).toMatchObject({ ok: false, message: /consumed/ });
  });

  it('keeps a stored principal or its loss through extras changes until sources are explicitly edited', () => {
    const r = createRelation('a', 'b', {
      pairs: [
        { from: [0, 2], to: [0], style: null, extras: 'copies', principal: 2 },
        { from: [1], to: [1], style: null, extras: 'copies', principal: null },
      ],
    });
    expect(setPairExtras(setPairExtras(r, 0, 'separate'), 0, 'copies').pairs[0]!.principal).toBe(2);
    expect(setPairExtras(setPairExtras(r, 1, 'merge'), 1, 'copies').pairs[1]!.principal).toBeNull();
    const repaired = linkPair(r, [3], [1]);
    expect(repaired.ok && repaired.relation.pairs[1]).toMatchObject({ from: [1, 3], principal: 1 });
  });

  it('revalidates an existing copied source when an explicit join makes it principal', () => {
    const r = createRelation('a', 'b', {
      pairs: [
        { from: [0, 2], to: [0], style: null, extras: 'copies', principal: 2 },
        { from: [0], to: [1], style: null },
      ],
    });
    // The rebase-preserved principal is 2; source 0 validly sends a copy while the other pair
    // consumes it. Explicitly editing sources selects minimum 0 again, which is not free.
    expect(linkPair(r, [3], [0])).toMatchObject({ ok: false, message: /consumed/ });
  });

  it('rejects a source that is consumed twice', () => {
    const r = link(relation, [0], [0]);
    const source = linkPair(r, [0], [1]);
    expect(source).toMatchObject({ ok: false });
    expect(source.ok ? '' : source.message).toMatch(/consumed/);
    // A copy may start from a glyph that another pair consumes, and copies may share a source.
    expect(linkPair(r, [0], [1], 'copy').ok).toBe(true);
    const copies = link(createRelation('a', 'b', { style: 'copy' }), [0], [0]);
    expect(linkPair(copies, [0], [1]).ok).toBe(true);
    expect(linkPair(relation, [], [1]).ok).toBe(false);
  });

  it('removes a pair and changes its style', () => {
    const r = link(link(relation, [0], [0]), [1], [1]);
    expect(removePair(r, 0).pairs).toEqual([{ from: [1], to: [1], style: null }]);
    expect(setPairStyle(r, 1, 'fade').pairs[1]!.style).toBe('fade');
    expect(setPairStyle(setPairStyle(r, 1, 'fade'), 1, null).pairs[1]!.style).toBeNull();
    // Several at once (the right-click menu of the selected glyphs).
    expect(setPairsStyle(r, [0, 1], 'copy').pairs.map((p) => p.style)).toEqual(['copy', 'copy']);
    expect(removePairs(r, [1, 0]).pairs).toEqual([]);
  });

  it('suggests one-to-one links between equal labels in reading order', () => {
    const from = labelled(['m', 'x', '+', 'y', '=', '0']);
    const to = labelled(['m', 'x', '=', '−', 'y']);
    expect(suggestPairs(from, to, []).map((p) => [p.from, p.to])).toEqual([
      [[0], [0]],
      [[1], [1]],
      [[4], [2]],
      [[3], [4]],
    ]);
    // Repeated labels pair in order; used glyphs are skipped.
    const rep = suggestPairs(labelled(['x', 'x', 'x']), labelled(['x', 'x']), []);
    expect(rep.map((p) => [p.from[0], p.to[0]])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    const skip = suggestPairs(labelled(['x', 'x', 'x']), labelled(['x', 'x']), [
      { from: [0], to: [0], style: null },
    ]);
    expect(skip.map((p) => [p.from[0], p.to[0]])).toEqual([[1, 1]]);
    // So are the glyphs another relation keeps from this one, on either side.
    const taken = suggestPairs(labelled(['x', 'x', 'x']), labelled(['x', 'x']), [], {
      from: [0],
      to: new Set([1]),
    });
    expect(taken.map((p) => [p.from[0], p.to[0]])).toEqual([[1, 0]]);
  });

  it('reads glyphs left to right', () => {
    expect(readingOrder(labelled(['a', 'b', 'c'], [3, 1, 2]))).toEqual([1, 2, 0]);
  });
});

describe('rectangle selection in the relation editor', () => {
  const list = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b);
  const base = { from: new Set([1]), to: new Set([5]) };

  it('replaces the side it touches and keeps the other', () => {
    const next = marqueeSides(base, { from: [3, 2], to: [] }, false);
    expect(list(next.from)).toEqual([2, 3]);
    expect(next.to).toBe(base.to);
    const both = marqueeSides(base, { from: [0], to: [6, 7] }, false);
    expect([list(both.from), list(both.to)]).toEqual([[0], [6, 7]]);
  });

  it('adds with Ctrl/⌘ or Shift; touching nothing clears, unless adding', () => {
    const added = marqueeSides(base, { from: [2], to: [5, 6] }, true);
    expect([list(added.from), list(added.to)]).toEqual([
      [1, 2],
      [5, 6],
    ]);
    const cleared = marqueeSides(base, { from: [], to: [] }, false);
    expect([list(cleared.from), list(cleared.to)]).toEqual([[], []]);
    expect(marqueeSides(base, { from: [], to: [] }, true)).toEqual(base);
  });
});

describe('relation diagram layout', () => {
  it('puts the clip in the middle, sources on the left and targets on the right', () => {
    const { project, a, b } = scene();
    project.relations.push(
      createRelation(a.id, b.id, {
        pairs: [
          { from: [0], to: [0], style: null },
          { from: [2, 4], to: [2], style: null },
        ],
      }),
    );
    const diagram = buildDiagram(project, a.id);
    expect(diagram.blocks.map((blk) => [blk.clipId, blk.current])).toEqual([
      [a.id, true],
      [b.id, false],
    ]);
    const [left, right] = diagram.blocks;
    expect(left!.x).toBeLessThan(right!.x);
    // Only the glyphs that take part get a chip, in ascending order.
    expect(left!.chips.map((c) => c.glyph)).toEqual([0, 2, 4]);
    expect(right!.chips.map((c) => c.glyph)).toEqual([0, 2]);
    expect(diagram.edges).toHaveLength(2);
    expect(diagram.edges[0]).toMatchObject({ pairIndex: 0, node: null });
    expect(diagram.edges[0]!.heads).toHaveLength(1);
    // A pair of several glyphs joins them at a node.
    expect(diagram.edges[1]!.node).not.toBeNull();
    expect(diagram.edges[1]!.paths).toHaveLength(3); // two sources in, one target out
    // From the target's point of view the same clips are mirrored.
    const mirrored = buildDiagram(project, b.id);
    expect(mirrored.blocks.map((blk) => blk.clipId)).toEqual([a.id, b.id]);
    expect(mirrored.blocks[1]!.current).toBe(true);
  });

  it('is empty for a clip without relations', () => {
    const { project, a } = scene();
    expect(buildDiagram(project, a.id).blocks).toEqual([]);
  });

  /** a → b → c, plus d → b on another track and an unrelated clip e. */
  function chain() {
    const { project, a, b } = scene();
    const fc = createFormula({ name: 'f3', snapshot: boxSnapshot(['a', '=']) });
    project.formulas.push(fc);
    const c = createClip(fc.id, project.tracks[0]!.id, 7, 9);
    const d = createClip(fc.id, project.tracks[0]!.id, -2, -1);
    const e = createClip(fc.id, project.tracks[0]!.id, 10, 12);
    project.clips.push(c, d, e);
    const ab = createRelation(a.id, b.id, { pairs: [{ from: [0], to: [0], style: null }] });
    const bc = createRelation(b.id, c.id, { pairs: [{ from: [1], to: [1], style: 'copy' }] });
    const db = createRelation(d.id, b.id, { pairs: [{ from: [0], to: [2], style: null }] });
    project.relations.push(ab, bc, db);
    return { project, a, b, c, d, e, ab, bc, db };
  }

  it('shows one relation as its two clips only', () => {
    const { project, a, b, bc } = chain();
    const diagram = buildRelationDiagram(project, bc.id);
    expect(diagram.blocks.map((blk) => [blk.clipId, blk.column, blk.current])).toEqual([
      [b.id, 0, true],
      [project.relations[1]!.toClipId, 1, true],
    ]);
    expect(diagram.blocks[0]!.chips.map((c) => c.glyph)).toEqual([1]); // not a's or d's glyphs
    expect(diagram.edges.map((e) => e.relationId)).toEqual([bc.id]);
    // The clip view of b still has every relation of b.
    expect(new Set(buildDiagram(project, b.id).edges.map((e) => e.relationId)).size).toBe(3);
    expect(buildRelationDiagram(project, 'missing').blocks).toEqual([]);
    void a;
  });

  it('lays out every connected relation as a chain, in the order the clips start', () => {
    const { project, a, b, c, d, e } = chain();
    expect(new Set(relatedClips(project, c.id))).toEqual(new Set([a.id, b.id, c.id, d.id]));
    expect(relatedClips(project, e.id)).toEqual([e.id]);
    const diagram = buildChainDiagram(project, c.id, new Set([b.id]));
    // Columns: the sources d and a (same track: by start), then b, then c; e is not related.
    expect(diagram.blocks.map((blk) => [blk.clipId, blk.column])).toEqual([
      [d.id, 0],
      [a.id, 0],
      [b.id, 1],
      [c.id, 2],
    ]);
    expect(diagram.blocks.filter((blk) => blk.current).map((blk) => blk.clipId)).toEqual([b.id]);
    expect(diagram.edges).toHaveLength(3);
    // b's chips gather the glyphs of all three relations.
    expect(diagram.blocks[2]!.chips.map((ch) => ch.glyph)).toEqual([0, 1, 2]);
    expect(buildChainDiagram(project, e.id).blocks).toEqual([]);
    // Wider than the panel diagram: it grows with the columns.
    project.formulas.push(createFormula({ name: 'f4', snapshot: boxSnapshot(['x']) }));
    let prev = c;
    for (let i = 0; i < 4; i++) {
      const next = createClip(project.formulas[3]!.id, project.tracks[1]!.id, 9 + i, 10 + i);
      project.clips.push(next);
      project.relations.push(
        createRelation(prev.id, next.id, { pairs: [{ from: [0], to: [0], style: null }] }),
      );
      prev = next;
    }
    expect(buildChainDiagram(project, c.id).width).toBeGreaterThan(
      buildDiagram(project, b.id).width,
    );
  });

  it('collapses the sides that have no relations and stacks several targets', () => {
    const { project, a, b } = scene();
    const fc = createFormula({ name: 'f3', snapshot: boxSnapshot(['a', '=']) });
    project.formulas.push(fc);
    const c = createClip(fc.id, project.tracks[1]!.id, 7, 9);
    project.clips.push(c);
    project.relations.push(
      createRelation(a.id, b.id, { pairs: [{ from: [0], to: [0], style: 'copy' }] }),
    );
    const diagram = buildDiagram(project, b.id);
    expect(diagram.blocks.map((blk) => blk.column)).toEqual([0, 1]);
    expect(diagram.edges[0]!.style).toBe('copy');
    void c;
  });
});

describe('several relations between two clips', () => {
  /** a → b twice (glyph 0 over [3, 4), glyphs 2 and 4 over [5, 5.5)) and b → a once. */
  function related() {
    const { project, a, b } = scene();
    const first = createRelation(a.id, b.id, {
      offset: 1,
      pairs: [{ from: [0], to: [0], style: null }],
    });
    const back = createRelation(b.id, a.id, { offset: 2 });
    const second = createRelation(a.id, b.id, {
      offset: 3,
      duration: 0.5,
      pairs: [
        { from: [2], to: [1], style: null },
        { from: [4], to: [2], style: null },
      ],
    });
    project.relations.push(first, back, second);
    return { project, a, b, first, back, second };
  }

  it('lists those of a direction in the order of their windows', () => {
    const { project, a, b, first, back, second } = related();
    expect(relationsBetween(project, a.id, b.id)).toEqual([first, second]);
    expect(relationsBetween(project, b.id, a.id)).toEqual([back]);
    expect(relationsBetween(project, a.id, a.id)).toEqual([]);
    // The one made last plays first: it is listed first. Two that start together keep the
    // order they were made in.
    const early = createRelation(a.id, b.id, { offset: 0.5 });
    const twin = createRelation(a.id, b.id, { offset: 1 });
    project.relations.push(early, twin);
    expect(relationsBetween(project, a.id, b.id)).toEqual([early, first, twin, second]);
  });

  it('numbers a relation among them by when it plays, a draft by its window as it is', () => {
    const { project, a, b, first, back, second } = related(); // a → b at offsets 1 and 3
    expect(relationNumber(project, first)).toEqual({ n: 1, of: 2 });
    expect(relationNumber(project, second)).toEqual({ n: 2, of: 2 });
    expect(relationNumber(project, back)).toEqual({ n: 1, of: 1 });
    // A draft the project does not hold: where its window puts it; last among those that start
    // with it.
    expect(relationNumber(project, createRelation(a.id, b.id, { offset: 4 }))).toEqual({
      n: 3,
      of: 3,
    });
    expect(relationNumber(project, createRelation(a.id, b.id, { offset: 2 }))).toEqual({
      n: 2,
      of: 3,
    });
    expect(relationNumber(project, createRelation(a.id, b.id, { offset: 1 }))).toEqual({
      n: 2,
      of: 3,
    });
    expect(relationNumber(project, createRelation(a.id, b.id, { offset: 0 }))).toEqual({
      n: 1,
      of: 3,
    });
    expect(relationNumber(project, createRelation(b.id, a.id))).toEqual({ n: 1, of: 2 });
    // A relation of the project whose window is being moved in the editor: numbered where the
    // draft is now, not where the project still has it.
    expect(relationNumber(project, { ...first, offset: 3.5 })).toEqual({ n: 2, of: 2 });
    expect(relationNumber(project, { ...second, offset: 1 })).toEqual({ n: 2, of: 2 });
    expect(relationNumber(project, { ...second, offset: 0.5 })).toEqual({ n: 1, of: 2 });
  });

  it('titles the only one "Relation", and one of several by its number', () => {
    const { project, a, b, second, back } = related();
    expect(relationTitle(project, back)).toBe('Relation');
    expect(relationTitle(project, second)).toBe('Relation 2 of 2');
    expect(relationTitle(project, createRelation(a.id, b.id, { offset: 5 }))).toBe(
      'Relation 3 of 3',
    );
    // The first relation of two clips is being made: it is the only one.
    const { project: bare, a: x, b: y } = scene();
    expect(relationTitle(bare, createRelation(x.id, y.id))).toBe('Relation');
    void b;
  });

  it('lets two related clips be asked about whenever their relations can be edited', () => {
    const { project, a, b } = related();
    expect(relateBlocker(project, a, b)).toBeNull();
    // No room for another window: a first relation could not be made, but theirs can be edited
    // (the menu says why another cannot be added).
    const apart = { ...b, start: 6.5, end: 9 };
    const moved = { ...project, clips: project.clips.map((c) => (c.id === b.id ? apart : c)) };
    expect(relationBlocker(moved, a, apart)).toContain('must overlap in time');
    expect(relateBlocker(moved, a, apart)).toBeNull();
    // A locked track keeps both from being done.
    const locked = {
      ...project,
      tracks: project.tracks.map((t) => (t.id === b.trackId ? { ...t, locked: true } : t)),
    };
    expect(relateBlocker(locked, a, b)).toContain('is locked');
    // Two clips that are not related need what a first relation needs.
    const { project: bare, a: x, b: y } = scene();
    expect(relateBlocker(bare, x, x)).toBe(relationBlocker(bare, x, x));
    expect(relateBlocker(bare, x, y)).toBeNull();
  });

  it('says a relation in a few words: its window in scene seconds, and its pairs', () => {
    const { project, first, second } = related();
    expect(windowAndPairs(project, first)).toBe('3.00–4.00 s · 1 pair');
    expect(windowAndPairs(project, second)).toBe('5.00–5.50 s · 2 pairs');
  });
});

describe('relationSummary', () => {
  it('counts the pairs, the glyphs that leave and those that arrive, in plain English', () => {
    expect(relationSummary(4, 1, 0)).toBe('4 linked pairs · 1 glyph leaves · 0 glyphs arrive');
    expect(relationSummary(1, 2, 1)).toBe('1 linked pair · 2 glyphs leave · 1 glyph arrives');
  });

  it('says that the unpaired glyphs of a target that starts empty stay out', () => {
    expect(relationSummary(2, 0, 3, true)).toBe(
      '2 linked pairs · 0 glyphs leave · 3 glyphs stay out',
    );
    expect(relationSummary(2, 0, 1, true)).toBe(
      '2 linked pairs · 0 glyphs leave · 1 glyph stays out',
    );
  });
});

describe('pair paths', () => {
  const chord = {
    nodes: [
      { at: [0, 0] as [number, number], in: null, out: null, smooth: false },
      { at: [1, 0] as [number, number], in: null, out: null, smooth: false },
    ],
  };
  const bump = {
    nodes: [
      {
        at: [0, 0] as [number, number],
        in: null,
        out: [0.3, 0.4] as [number, number],
        smooth: false,
      },
      {
        at: [1, 0] as [number, number],
        in: [0.7, 0.4] as [number, number],
        out: null,
        smooth: false,
      },
    ],
  };

  it('names what a pair follows: the arc, straight, or its own path', () => {
    expect(pathOfPair({ from: [0], to: [0], style: null }, { pathArc: 0 })).toBe('straight');
    expect(pathOfPair({ from: [0], to: [0], style: null }, { pathArc: 30 })).toBe('arc 30°');
    expect(pathOfPair({ from: [0], to: [0], style: null, path: chord }, { pathArc: 30 })).toBe(
      'straight',
    );
    expect(pathOfPair({ from: [0], to: [0], style: null, path: bump }, { pathArc: 30 })).toBe(
      'custom path',
    );
  });

  it('clears the paths of the pairs named, leaving the others', () => {
    const holder = {
      style: 'transform' as const,
      pairs: [
        { from: [0], to: [0], style: null, path: bump },
        { from: [1], to: [1], style: null, path: bump },
        { from: [2], to: [2], style: null },
      ],
    };
    const cleared = clearPairsPath(holder, [0, 2]);
    expect(cleared.pairs[0]).toEqual({ from: [0], to: [0], style: null });
    expect(cleared.pairs[1]).toBe(holder.pairs[1]);
    expect(cleared.pairs[2]).toBe(holder.pairs[2]);
  });
});
