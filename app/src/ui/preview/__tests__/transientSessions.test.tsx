import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFormula, toSnapshot } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import { applyToPoint, arcSpline, type Vec2 } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createLineFormula,
  createRelation,
  createTrack,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
} from '../../../model';
import { createEvaluator } from '../../../scene';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { useDocumentStore } from '../../project/documentStore';
import { useNoticeStore } from '../../project/noticeStore';
import { useGlyphsDialog } from '../../animations/glyphsDialogStore';
import { RelationMenu } from '../../timeline/RelationMenu';
import {
  braceOnPickedGlyphs,
  colourPickedGlyphs,
  hidePickedGlyphs,
  openPickedGlyphsDialog,
  shapeOnPickedGlyphs,
} from '../glyphActions';
import { withServices } from '../../../test/services';
import { startColourCopy, startColourPaste, useColourOrder } from '../colourOrder';
import { pickKey } from '../glyphPick';
import { pickRevision, startGlyphPickTracking, useGlyphPick } from '../glyphPickStore';
import {
  findPair,
  pathEditFrame,
  startPathEditTracking,
  usePathEdit,
  type PairRef,
} from '../pathEdit';
import { useLineCurveEdit } from '../lineCurve';
import { useLineDraw } from '../lineDraw';
import { useShapeRetarget } from '../shapeRetarget';
import { startSymbolAlignTracking, useSymbolAlign } from '../symbolAlign';
import { usePathGestures } from '../usePathGestures';

withServices(startGlyphPickTracking, startPathEditTracking, startSymbolAlignTracking);

async function setup() {
  const project = createEmptyProject();
  const result = await createMockEngine().render({
    kind: 'math',
    latex: 'abc',
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'auto',
  });
  if (!result.ok) throw new Error(result.error.message);
  const formula = createFormula({
    name: 'letters',
    source: 'abc',
    snapshot: toSnapshot(result.render),
  });
  project.formulas = [formula];
  const phases = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const from = createClip(formula.id, project.tracks[0]!.id, 0, 8, phases);
  const to = createClip(formula.id, project.tracks[1]!.id, 0, 8, phases);
  from.initial.position = [-2, 0];
  to.initial.position = [2, 0];
  project.clips = [from, to];
  const relation = createRelation(from.id, to.id, {
    offset: 2,
    duration: 2,
    style: 'copy',
    pathArc: 60,
    pairs: [
      { from: [0], to: [0], style: null },
      { from: [1], to: [1], style: null },
    ],
  });
  project.relations = [relation];
  loadProject(project);
  useRenderStore.setState({ transitions: {} });
  useRenderStore.getState().setEntry(formula.id, {
    status: 'ok',
    resolved: resolveFormula(formula, result.render),
    error: null,
  });
  useUiStore.getState().select({ kind: 'clips', ids: [from.id] });
  return { project, formula, from, to, relation };
}

/** A pick of `glyphs` in clip `clipId`, the range starting from the first of them. */
const pickOf = (clipId: string, glyphs: number[]) => ({
  parts: [{ clipId, selection: { selected: new Set(glyphs), anchor: glyphs[0] ?? null } }],
});
/** The glyphs picked now (the pick is in one clip here). */
const picked = () => useGlyphPick.getState().pick?.parts[0]?.selection;

afterEach(() => {
  cleanup();
  usePathEdit.setState({ target: null, selected: null });
  useSymbolAlign.setState({ phase: null, source: 'unlocked' });
  useShapeRetarget.setState({ request: null });
  useColourOrder.setState({ phase: null, kept: null });
  useLineDraw.getState().cancel();
  useLineCurveEdit.setState({ clipId: null, original: null, selected: null });
  useGlyphPick.getState().clear();
  useGlyphsDialog.getState().close();
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
});

describe('preview glyph ownership at command execution', () => {
  it('drops missing selected glyphs and the range anchor, then clears an unverified Undo revision', async () => {
    const { formula, from } = await setup();
    useGlyphPick.getState().set(pickOf(from.id, [0, 2]));
    useRenderStore.getState().setTransition(formula.id, {
      from: formula.snapshot!.key,
      to: 'dropped',
      map: [null, 0, 1],
    });
    useProjectStore.getState().update((draft) => {
      remapGlyphRefs(draft, formula.id, [null, 0, 1]);
      const snapshot = draft.formulas[0]!.snapshot!;
      draft.formulas[0]!.snapshot = {
        ...snapshot,
        key: 'dropped',
        glyphs: snapshot.glyphs.slice(1),
      };
    });
    expect([...picked()!.selected]).toEqual([1]);
    expect(picked()!.anchor).toBeNull();
    history.undo();
    expect(useGlyphPick.getState().pick).toBeNull();
    history.redo();
    expect(useGlyphPick.getState().pick).toBeNull();
    const before = useProjectStore.getState().project;
    colourPickedGlyphs('#FF0000');
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('rebases every part of a pick over several clips, and lets it all go with one of them', async () => {
    const { formula, from, to } = await setup();
    useUiStore.getState().select({ kind: 'clips', ids: [from.id, to.id] });
    useGlyphPick
      .getState()
      .set({ parts: [...pickOf(from.id, [0]).parts, ...pickOf(to.id, [2, 1]).parts] });
    expect(pickKey(useGlyphPick.getState().pick)).toBe(`${from.id}:0;${to.id}:1,2`);
    const map = [1, 0, 2];
    useRenderStore.getState().setTransition(formula.id, {
      from: formula.snapshot!.key,
      to: 'reordered',
      map,
    });
    useProjectStore.getState().amend((draft) => {
      remapGlyphRefs(draft, formula.id, map);
      const current = draft.formulas[0]!.snapshot!;
      draft.formulas[0]!.snapshot = {
        ...current,
        key: 'reordered',
        glyphs: map.map((i) => current.glyphs[i]!),
      };
    });
    expect(pickKey(useGlyphPick.getState().pick)).toBe(`${from.id}:1;${to.id}:0,2`);
    // One of its clips goes: the pick was of the two, and the two were the selection.
    useProjectStore.getState().update((draft) => {
      draft.relations = [];
      draft.clips = draft.clips.filter((clip) => clip.id !== to.id);
    });
    expect(useGlyphPick.getState().pick).toBeNull();
  });

  it.each(['colour', 'hide', 'brace', 'shape'] as const)(
    'rebases selected glyphs and anchor before %s',
    async (command) => {
      const { formula, from } = await setup();
      useGlyphPick.getState().set(pickOf(from.id, [0, 2]));
      const expected = useGlyphPick.getState().pick!;
      // Publish and execute immediately, without a PreviewPanel render/effect in between.
      const map = [1, 0, 2];
      useRenderStore.getState().setTransition(formula.id, {
        from: formula.snapshot!.key,
        to: 'reordered',
        map,
      });
      useProjectStore.getState().amend((draft) => {
        remapGlyphRefs(draft, formula.id, map);
        const current = draft.formulas[0]!.snapshot!;
        draft.formulas[0]!.snapshot = {
          ...current,
          key: 'reordered',
          glyphs: map.map((i) => current.glyphs[i]!),
        };
      });
      if (command === 'colour') colourPickedGlyphs('#FF0000', expected);
      if (command === 'hide') hidePickedGlyphs(true, expected);
      const id =
        command === 'brace'
          ? braceOnPickedGlyphs('down', expected)
          : command === 'shape'
            ? shapeOnPickedGlyphs('box', expected)
            : null;
      const saved = useProjectStore.getState().project;
      if (command === 'colour')
        expect(saved.formulas[0]!.glyphColors).toEqual({ '1': '#FF0000', '2': '#FF0000' });
      if (command === 'hide') expect(saved.formulas[0]!.hiddenGlyphs).toEqual([1, 2]);
      if (id)
        expect(saved.clips.find((clip) => clip.id === id)?.attach).toMatchObject({
          glyphs: [1, 2],
        });
      if (!id) {
        expect(picked()?.anchor).toBe(1);
        expect(saved.formulas[0]!.snapshot!.glyphs[1]!.label).toBe('a');
      }
    },
  );

  it.each(['another clip', 'another selection', 'reopened document'] as const)(
    'rejects a held menu when it would act on %s',
    async (change) => {
      const { project, from, to } = await setup();
      useGlyphPick.getState().set(pickOf(from.id, [0]));
      const expected = useGlyphPick.getState().pick!;
      if (change === 'reopened document') loadProject(structuredClone(project));
      const clipId = change === 'another clip' ? to.id : from.id;
      const glyph = change === 'another selection' ? 1 : 0;
      useUiStore.getState().select({ kind: 'clips', ids: [clipId] });
      useGlyphPick.getState().set(pickOf(clipId, [glyph]));
      const before = useProjectStore.getState().project;
      colourPickedGlyphs('#FF0000', expected);
      hidePickedGlyphs(true, expected);
      expect(braceOnPickedGlyphs('down', expected)).toBeNull();
      expect(shapeOnPickedGlyphs('box', expected)).toBeNull();
      openPickedGlyphsDialog('brace', expected);
      expect(useGlyphsDialog.getState().clipId).toBeNull();
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    },
  );

  it('opens attachment dialogs on the expected pick after a verified rebase', async () => {
    const { formula, from } = await setup();
    useGlyphPick.getState().set(pickOf(from.id, [0]));
    const expected = useGlyphPick.getState().pick!;
    useRenderStore
      .getState()
      .setTransition(formula.id, { from: formula.snapshot!.key, to: 'new', map: [1, 0, 2] });
    useProjectStore.getState().amend((draft) => {
      const snapshot = draft.formulas[0]!.snapshot!;
      draft.formulas[0]!.snapshot = {
        ...snapshot,
        key: 'new',
        glyphs: [snapshot.glyphs[1]!, snapshot.glyphs[0]!, snapshot.glyphs[2]!],
      };
    });
    openPickedGlyphsDialog('shape', expected);
    expect(useGlyphsDialog.getState()).toMatchObject({
      clipId: from.id,
      what: 'shape',
      glyphs: [1],
    });
  });

  it.each(['unknown revision', 'project load', 'document replacement'] as const)(
    'refuses stale picks after %s',
    async (change) => {
      const { project, from } = await setup();
      useGlyphPick.getState().set(pickOf(from.id, [0]));
      if (change === 'unknown revision') {
        useProjectStore.getState().amend((draft) => {
          draft.formulas[0]!.snapshot!.key = 'unknown';
        });
      } else if (change === 'project load') {
        loadProject(structuredClone(project));
      } else {
        useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
      }
      const before = useProjectStore.getState().project;
      const steps = useProjectStore.temporal.getState().pastStates.length;
      colourPickedGlyphs('#FF0000');
      hidePickedGlyphs(true);
      expect(braceOnPickedGlyphs('down')).toBeNull();
      expect(shapeOnPickedGlyphs('box')).toBeNull();
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(steps);
      expect(useGlyphPick.getState().pick).toBeNull();
    },
  );
});

describe('the symbols of align by symbol', () => {
  /** A glyph as the preview reports a click on it. */
  const symbol = (clipId: string, glyph: number, label: string) => ({
    clipId,
    glyph,
    key: `${clipId}:${glyph}`,
    label,
  });
  const AT = { x: 10, y: 20 };
  const phase = () => useSymbolAlign.getState().phase;
  const notices = () => useNoticeStore.getState().notices;
  /** The one formula rendered again, its glyphs renumbered by `map` (`map[before]` is the index
   * now, null for a glyph that is gone): the transition is published, then the snapshot, as the
   * render sync does. */
  function renumber(map: (number | null)[], key: string, write: 'amend' | 'update' = 'amend') {
    const formula = useProjectStore.getState().project.formulas[0]!;
    useRenderStore.getState().setTransition(formula.id, {
      from: formula.snapshot!.key,
      to: key,
      map,
    });
    useProjectStore.getState()[write]((draft) => {
      remapGlyphRefs(draft, formula.id, map);
      const current = draft.formulas[0]!.snapshot!;
      const glyphs: (typeof current.glyphs)[number][] = [];
      map.forEach((now, before) => {
        if (now !== null) glyphs[now] = current.glyphs[before]!;
      });
      draft.formulas[0]!.snapshot = { ...current, key, glyphs };
    });
  }

  it('follow their glyphs when a transition renumbers them: the one to align and the reference', async () => {
    const { from, to } = await setup();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 0, 'a'), AT);
    renumber([1, 0, 2], 'reordered');
    expect(phase()).toMatchObject({
      step: 'reference',
      target: { clipId: from.id, glyph: 1, key: `${from.id}:1`, label: 'a' },
    });
    useSymbolAlign.getState().pick(symbol(to.id, 2, 'c'), AT);
    expect(phase()).toMatchObject({ step: 'direction', reference: { glyph: 2 } });
    renumber([2, 1, 0], 'again');
    expect(phase()).toMatchObject({
      step: 'direction',
      target: { clipId: from.id, glyph: 1, key: `${from.id}:1`, label: 'a' },
      reference: { clipId: to.id, glyph: 0, key: `${to.id}:0`, label: 'c' },
    });
    expect(notices()).toEqual([]);
  });

  it('keep the outline on the piece of a Morph they took: its key follows the glyph too', async () => {
    const { from, to } = await setup();
    useSymbolAlign.getState().toggle();
    // A piece of a Morph is drawn under its glyph's key with a mark after it.
    useSymbolAlign.getState().pick({ ...symbol(from.id, 1, 'b'), key: `${from.id}:1~` }, AT);
    // A key that only starts like the glyph's — glyph 1 against a key of glyph 12 — is left.
    useSymbolAlign.getState().pick({ ...symbol(to.id, 1, 'b'), key: `${to.id}:12` }, AT);
    renumber([2, 0, 1], 'shifted');
    expect(phase()).toMatchObject({
      target: { glyph: 0, key: `${from.id}:0~` },
      reference: { glyph: 0, key: `${to.id}:12` },
    });
  });

  it('end the mode, and say so, when the symbol to align is gone from its formula', async () => {
    const { from } = await setup();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 0, 'a'), AT);
    renumber([null, 0, 1], 'dropped');
    expect(phase()).toBeNull();
    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'warning',
        title: 'Align by symbol ended',
        message: '“a” is no longer in its formula. Start again and pick its symbol.',
      }),
    ]);
  });

  it('end the mode, and say so, when the formula was rendered again with no transition to it', async () => {
    const { from } = await setup();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 1, 'b'), AT);
    useProjectStore.getState().amend((draft) => {
      draft.formulas[0]!.snapshot = { ...draft.formulas[0]!.snapshot!, key: 'unknown' };
    });
    expect(phase()).toBeNull();
    expect(notices()).toEqual([
      expect.objectContaining({
        kind: 'warning',
        title: 'Align by symbol ended',
        message:
          'The formula changed without a matching glyph transition. Start again and pick its symbol.',
      }),
    ]);
  });

  it('end, and say so, when the edit of their formula is undone: no transition leads back', async () => {
    const { from } = await setup();
    history.clear();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 0, 'a'), AT);
    renumber([1, 0, 2], 'reordered', 'update');
    expect(phase()).toMatchObject({ step: 'reference', target: { glyph: 1 } });
    history.undo();
    // As the glyphs picked with Alt: the step back is not one the transitions tell of.
    expect(phase()).toBeNull();
    expect(notices()).toEqual([
      expect.objectContaining({
        title: 'Align by symbol ended',
        message:
          'The formula changed without a matching glyph transition. Start again and pick its symbol.',
      }),
    ]);
  });

  it('end without a word with a document that has their ids and other renders, as a pick does', async () => {
    const { project, from } = await setup();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 0, 'a'), AT);
    useGlyphPick.getState().set(pickOf(from.id, [0, 2]));
    // An earlier copy of the file: the same formula and clips, another source, another render.
    const copy = structuredClone(project);
    copy.formulas[0]!.snapshot = { ...copy.formulas[0]!.snapshot!, key: 'an earlier render' };
    loadProject(copy);
    expect(phase()).toBeNull();
    expect(useGlyphPick.getState().pick).toBeNull();
    expect(notices()).toEqual([]);
  });

  it('end without a word when the clip of the reference goes while the side is asked', async () => {
    const { from, to } = await setup();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 0, 'a'), AT);
    useSymbolAlign.getState().pick(symbol(to.id, 2, 'c'), AT);
    expect(phase()).toMatchObject({ step: 'direction' });
    useProjectStore.getState().update((draft) => {
      draft.relations = [];
      draft.clips = draft.clips.filter((clip) => clip.id !== to.id);
    });
    expect(phase()).toBeNull();
    expect(notices()).toEqual([]);
  });

  it('end with their clip and with their document, which may have the same ids, without a word', async () => {
    const { project, from, to } = await setup();
    useNoticeStore.getState().clear();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(from.id, 0, 'a'), AT);
    loadProject(structuredClone(project));
    expect(useProjectStore.getState().project.clips.some((c) => c.id === from.id)).toBe(true);
    expect(phase()).toBeNull();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().pick(symbol(to.id, 0, 'a'), AT);
    useProjectStore.getState().update((draft) => {
      draft.relations = [];
      draft.clips = draft.clips.filter((clip) => clip.id !== to.id);
    });
    expect(phase()).toBeNull();
    expect(notices()).toEqual([]);
  });

  it('are not taken from a render the formula no longer has', async () => {
    const { from } = await setup();
    useSymbolAlign.getState().toggle();
    const stale = { ...pickRevision(from.id)!, key: 'the render before' };
    useSymbolAlign.getState().pick({ ...symbol(from.id, 0, 'a'), revision: stale }, AT);
    expect(phase()).toEqual({ step: 'target' });
  });
});

describe('the modes of the preview, one at a time', () => {
  /** The scene of `setup`, with a line bent into a spline on a track of its own: what «Edit
   * curve» shapes. */
  async function lineScene() {
    const scene = await setup();
    const track = createTrack('Track 3');
    const line = createLineFormula({
      name: 'l1',
      vector: [2, 0],
      curve: {
        shape: 'spline',
        nodes: [
          { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
          { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
        ],
      },
    });
    const phases = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const lineClip = createClip(line.id, track.id, 0, 8, phases);
    useProjectStore.getState().update((draft) => {
      draft.tracks.push(track);
      draft.formulas.push(line);
      draft.clips.push(lineClip);
    });
    return { ...scene, lineClip };
  }
  type Scene = Awaited<ReturnType<typeof lineScene>>;
  /** Each mode: whether it is on, and what turns it on — its own entry, no service running for
   * the others to hear of it. */
  const MODES: Record<string, { on(): boolean; start(scene: Scene): void }> = {
    path: {
      on: () => usePathEdit.getState().target !== null,
      start: ({ relation }) =>
        usePathEdit
          .getState()
          .open({ origin: { kind: 'relation', relationId: relation.id }, index: 0 }),
    },
    retarget: {
      on: () => useShapeRetarget.getState().request !== null,
      start: ({ from }) => useShapeRetarget.getState().start({ clipId: from.id }),
    },
    colours: {
      on: () => useColourOrder.getState().phase !== null,
      start: () => startColourCopy(),
    },
    symbol: {
      on: () => useSymbolAlign.getState().phase !== null,
      start: () => useSymbolAlign.getState().toggle(),
    },
    line: {
      on: () => useLineDraw.getState().request !== null,
      start: () => useLineDraw.getState().start('arrow'),
    },
    curve: {
      on: () => useLineCurveEdit.getState().clipId !== null,
      start: ({ lineClip }) => void useLineCurveEdit.getState().open(lineClip.id),
    },
  };
  const names = Object.keys(MODES);
  const on = () => names.filter((name) => MODES[name]!.on());
  const pairs = names.flatMap((first) =>
    names.filter((second) => second !== first).map((second) => [first, second] as const),
  );

  it.each(pairs)('%s, then %s: only the second is on', async (first, second) => {
    const scene = await lineScene();
    MODES[first]!.start(scene);
    expect(on()).toEqual([first]);
    MODES[second]!.start(scene);
    expect(on()).toEqual([second]);
  });

  it('a mode that goes on in another form stays on: the paste after the copy, the locked symbols', async () => {
    const { from } = await setup();
    useSymbolAlign.getState().toggle();
    useSymbolAlign.getState().toggle('locked');
    expect(useSymbolAlign.getState()).toMatchObject({
      phase: { step: 'target' },
      source: 'locked',
    });
    startColourCopy();
    useColourOrder.setState({
      phase: {
        step: 'copy',
        copied: [{ clipId: from.id, glyph: 0, label: 'a', color: '#FFFF00' }],
      },
    });
    startColourPaste();
    expect(useColourOrder.getState().phase).toMatchObject({ step: 'paste' });
    expect(on()).toEqual(['colours']);
  });
});

describe('path pair identity', () => {
  it('does not adopt a newly authored pair merely because its numeric endpoints match', async () => {
    const { relation } = await setup();
    const target: PairRef = { origin: { kind: 'relation', relationId: relation.id }, index: 0 };
    usePathEdit.getState().open(target);
    useProjectStore.getState().update((draft) => {
      draft.relations[0]!.pairs[0] = { from: [0], to: [0], style: 'fade' };
    });
    expect(usePathEdit.getState().target).toBeNull();
  });

  it('rejects a stale menu pair before React replaces the menu rows', async () => {
    const { relation } = await setup();
    render(<RelationMenu x={10} y={10} relationId={relation.id} onClose={() => {}} />);
    const command = screen.getByTestId('relation-menu-path-0');
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.relations[0]!.pairs.shift();
      });
      command.click();
    });
    expect(usePathEdit.getState().target).toBeNull();
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('cancels when the edited pair disappears instead of adopting the next pair', async () => {
    const { formula, relation } = await setup();
    const target: PairRef = { origin: { kind: 'relation', relationId: relation.id }, index: 0 };
    usePathEdit.getState().open(target);
    useRenderStore.getState().setTransition(formula.id, {
      from: formula.snapshot!.key,
      to: 'drop-a',
      map: [null, 0, 1],
    });
    useProjectStore.getState().amend((draft) => {
      remapGlyphRefs(draft, formula.id, [null, 0, 1]);
      const snapshot = draft.formulas[0]!.snapshot!;
      draft.formulas[0]!.snapshot = {
        ...snapshot,
        key: 'drop-a',
        glyphs: snapshot.glyphs.slice(1),
      };
    });
    expect(usePathEdit.getState().target).toBeNull();
    const before = useProjectStore.getState().project;
    usePathEdit.getState().close();
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('keeps the selected pair when an earlier pair is removed by a known rebase', async () => {
    const { formula, relation } = await setup();
    usePathEdit
      .getState()
      .open({ origin: { kind: 'relation', relationId: relation.id }, index: 1 });
    useRenderStore.getState().setTransition(formula.id, {
      from: formula.snapshot!.key,
      to: 'drop-a',
      map: [null, 0, 1],
    });
    useProjectStore.getState().amend((draft) => {
      remapGlyphRefs(draft, formula.id, [null, 0, 1]);
      const snapshot = draft.formulas[0]!.snapshot!;
      draft.formulas[0]!.snapshot = {
        ...snapshot,
        key: 'drop-a',
        glyphs: snapshot.glyphs.slice(1),
      };
    });
    const current = usePathEdit.getState().target;
    expect(current).toEqual({ origin: { kind: 'relation', relationId: relation.id }, index: 0 });
    expect(findPair(useProjectStore.getState().project, current!)?.pair.from).toEqual([0]);
  });

  it('forgets a path session on document replacement with reused IDs', async () => {
    const { project, relation } = await setup();
    usePathEdit
      .getState()
      .open({ origin: { kind: 'relation', relationId: relation.id }, index: 0 });
    loadProject(structuredClone(project));
    expect(usePathEdit.getState().target).toBeNull();
  });
});

/** A pointer on the canvas of the path session open on `target`, the hook mounted as the panel
 * mounts it: `event` makes a pointer event at a scene point, `start` is where the first node's
 * out handle is. */
function pathPointer(target: PairRef) {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = () => true;
  canvas.releasePointerCapture = vi.fn();
  const { result } = renderHook(() => {
    const project = useProjectStore((s) => s.project);
    const frame = pathEditFrame(
      project,
      createEvaluator(project, useRenderStore.getState().resolved),
      target,
    )!;
    return {
      frame,
      gestures: usePathGestures({
        canvasRef: { current: canvas },
        camera: { frameWidth: 10, frameHeight: 10, center: [0, 0], zoom: 1 },
        surface: { width: 100, height: 100 },
        unit: 0.1,
        target,
        frame,
      }),
    };
  });
  const event = (point: Vec2, type: string) =>
    ({
      clientX: 50 + point[0] * 10,
      clientY: 50 - point[1] * 10,
      type,
      button: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      pointerId: 1,
      currentTarget: canvas,
      preventDefault() {},
    }) as unknown as ReactPointerEvent<HTMLCanvasElement>;
  const first = result.current.frame;
  const start = applyToPoint(first.matrix!, first.spline.nodes[0]!.out!);
  return { result, event, start };
}

describe('a cancelled path drag', () => {
  it.each(['Escape', 'Undo'] as const)(
    'gives back the very project it started from when nothing else changed (%s)',
    async (how) => {
      const { relation } = await setup();
      const target: PairRef = { origin: { kind: 'relation', relationId: relation.id }, index: 0 };
      usePathEdit.getState().open(target);
      const before = useProjectStore.getState().project;
      const { result, event, start } = pathPointer(target);
      act(() => {
        result.current.gestures.onPointerDown(event(start, 'pointerdown'));
      });
      act(() => {
        result.current.gestures.onPointerMove(event([start[0], start[1] + 0.2], 'pointermove'));
      });
      expect(useProjectStore.getState().project.relations[0]!.pairs[0]!.path).toBeDefined();
      if (how === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
      else act(() => history.undo());
      // The same object, not an equal one: the document is unsaved while they differ.
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
      expect(history.isGesturing()).toBe(false);
      expect(usePathEdit.getState().target).toEqual(target);
    },
  );

  it.each(['the next move', 'Undo'] as const)(
    'takes its path back when its session ended under the drag (cancelled by %s)',
    async (how) => {
      const { relation } = await setup();
      const target: PairRef = { origin: { kind: 'relation', relationId: relation.id }, index: 0 };
      usePathEdit.getState().open(target);
      const before = useProjectStore.getState().project;
      const { result, event, start } = pathPointer(target);
      act(() => {
        result.current.gestures.onPointerDown(event(start, 'pointerdown'));
      });
      act(() => {
        result.current.gestures.onPointerMove(event([start[0], start[1] + 0.2], 'pointermove'));
      });
      expect(useProjectStore.getState().project.relations[0]!.pairs[0]!.path).toBeDefined();
      // A re-render that nothing maps to the old glyphs ends the session, not the gesture: derived
      // data is no edit.
      act(() =>
        useProjectStore.getState().amend((draft) => {
          const formula = draft.formulas[0]!;
          formula.snapshot = { ...formula.snapshot!, key: 'unmapped' };
        }),
      );
      expect(usePathEdit.getState().target).toBeNull();
      expect(history.isGesturing()).toBe(true);
      if (how === 'Undo') act(() => history.undo());
      else
        act(() => {
          result.current.gestures.onPointerMove(event([start[0], start[1] + 0.4], 'pointermove'));
        });
      // The path it wrote cannot stay behind, in no undo step: the whole gesture goes.
      expect(useProjectStore.getState().project.relations[0]!.pairs[0]!.path).toBeUndefined();
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
      expect(history.isGesturing()).toBe(false);
    },
  );
});

describe('relation and path lock boundaries', () => {
  it.each(['update', 'amend'] as const)(
    'cancels only its path when a track lock arrives through %s during a pointer drag',
    async (method) => {
      const { relation } = await setup();
      const target: PairRef = { origin: { kind: 'relation', relationId: relation.id }, index: 0 };
      usePathEdit.getState().open(target);
      const { result, event, start } = pathPointer(target);
      act(() => {
        result.current.gestures.onPointerDown(event(start, 'pointerdown'));
      });
      act(() => {
        result.current.gestures.onPointerMove(event([start[0], start[1] + 0.2], 'pointermove'));
      });
      expect(useProjectStore.getState().project.relations[0]!.pairs[0]!.path).toBeDefined();
      act(() =>
        useProjectStore.getState()[method]((draft) => {
          draft.tracks[0]!.locked = true;
          draft.formulas[0]!.name = 'Preserved newer edit';
        }),
      );
      act(() => {
        result.current.gestures.onPointerMove(event([start[0], start[1] + 0.4], 'pointermove'));
      });
      act(() => {
        result.current.gestures.onPointerUp(event(start, 'pointerup'));
      });
      const saved = useProjectStore.getState().project;
      expect(saved.tracks[0]!.locked).toBe(true);
      expect(saved.formulas[0]!.name).toBe('Preserved newer edit');
      expect(saved.relations[0]!.pairs[0]!.path).toBeUndefined();
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(
        method === 'update' ? 1 : 0,
      );
    },
  );

  it.each([0, 1])(
    'disables menu commands and mode entry with endpoint track %s locked',
    async (track) => {
      const { relation } = await setup();
      useProjectStore.getState().update((draft) => {
        draft.tracks[track]!.locked = true;
      });
      const before = useProjectStore.getState().project;
      const steps = useProjectStore.temporal.getState().pastStates.length;
      render(<RelationMenu x={10} y={10} relationId={relation.id} onClose={() => {}} />);
      expect(screen.getByTestId('relation-menu-delete')).toBeDisabled();
      expect(screen.getByTestId('relation-menu-path-0')).toBeDisabled();
      await userEvent.setup().click(screen.getByTestId('relation-menu-delete'));
      usePathEdit
        .getState()
        .open({ origin: { kind: 'relation', relationId: relation.id }, index: 0 });
      expect(usePathEdit.getState().target).toBeNull();
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(steps);
    },
  );

  it.each([0, 1])(
    'rechecks endpoint track %s for keyboard writes and close-time normalization',
    async (track) => {
      const { relation } = await setup();
      const target: PairRef = { origin: { kind: 'relation', relationId: relation.id }, index: 0 };
      useProjectStore.getState().update((draft) => {
        draft.relations[0]!.pairs[0]!.path = arcSpline(60);
      });
      usePathEdit.getState().open(target);
      usePathEdit.getState().select({ node: 0, part: 'out' });
      const project = useProjectStore.getState().project;
      const frame = pathEditFrame(
        project,
        createEvaluator(project, useRenderStore.getState().resolved),
        target,
      );
      renderHook(() =>
        usePathGestures({
          canvasRef: { current: null },
          camera: { frameWidth: 14.22, frameHeight: 8, center: [0, 0], zoom: 1 },
          surface: { width: 800, height: 450 },
          unit: 0.02,
          target,
          frame,
        }),
      );
      act(() =>
        useProjectStore.getState().update((draft) => {
          draft.tracks[track]!.locked = true;
        }),
      );
      const before = useProjectStore.getState().project;
      const steps = useProjectStore.temporal.getState().pastStates.length;
      fireEvent.keyDown(document, { key: 'ArrowUp' });
      act(() => usePathEdit.getState().close());
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(steps);
      // The unlocked path remains editable again.
      act(() => history.undo());
      act(() => usePathEdit.getState().open(target));
      expect(usePathEdit.getState().target).toEqual(target);
    },
  );
});
