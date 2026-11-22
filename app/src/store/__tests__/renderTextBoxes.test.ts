// @vitest-environment node
/* A font text where nothing can shape it: the render sync draws it as placeholder boxes, counts
 * its glyphs by them, and carries what was made on them to the real glyphs when a companion
 * shapes the text. */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyProject,
  createTextFormula,
  type TextGeometryArtifact,
  type TextSourceRange,
} from '../../model';
import { textGeometry } from '../../test/textGeometry';
import { textCountedByBoxes } from '../../engine/engine';
import { textArtifactRender, textBasisKey, textBoxesKey } from '../../engine/pango';
import { producerOf, renderRequestFor } from '../../engine/producers';
import { toSnapshot } from '../../engine/key';
import type { CompanionState, FormulaEngine, RenderResult, TextRenderRequest } from '../../engine';

let stores: typeof import('../index');
let stop: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  stores = await import('../index');
  stores.loadProject(createEmptyProject());
  stores.useRenderStore.getState().retain([]);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

const ONLINE: CompanionState = {
  status: 'online',
  health: {
    name: 'mfe-companion',
    protocol: 1,
    version: 'test',
    capabilities: {
      latex: false,
      dvisvgm: false,
      ffmpeg: false,
      manimCE: null,
      manimGL: null,
      pango: {
        ce: { state: 'ready', adapterVersion: 'test-adapter', environmentKey: 'test-environment' },
      },
    },
  },
};

/** The geometry a companion would give `request` in `environment`: one glyph per range (per
 * character by default). */
function shaped(
  request: TextRenderRequest,
  ranges?: TextSourceRange[],
  environment = 'test-environment',
): TextGeometryArtifact {
  const artifact = textGeometry(request.source, ranges, request.target);
  const basisKey = textBasisKey(request);
  return {
    ...artifact,
    basis: {
      source: request.source,
      font: { ...request.font },
      fontSize: request.fontSize,
      target: request.target,
    },
    basisKey,
    key: `${basisKey}-${environment}`,
  };
}

/** An engine that shapes while `online`, by `ranges` when a source has some, and otherwise
 * answers with the boxes, as the real one does. */
function setupEngine(ranges: Record<string, TextSourceRange[]> = {}, environment?: string) {
  let listener: (state: CompanionState) => void = () => undefined;
  let state: CompanionState = { status: 'offline' };
  const render = vi.fn<FormulaEngine['render']>(async (request): Promise<RenderResult> => {
    if (request.kind !== 'text') throw new Error('Unexpected request');
    return state.status === 'online'
      ? {
          ok: true,
          render: textArtifactRender(shaped(request, ranges[request.source], environment)),
        }
      : producerOf('text').free(request, textBoxesKey(request));
  });
  const engine: FormulaEngine = {
    version: 'text-test',
    render,
    companion: () => state,
    onCompanionChange: (next) => {
      listener = next;
      return () => {
        listener = () => undefined;
      };
    },
  };
  return {
    engine,
    render,
    go(next: 'online' | 'offline') {
      state = next === 'online' ? ONLINE : { status: 'offline' };
      listener(state);
    },
  };
}

const project = () => stores.useProjectStore.getState().project;
const current = () => {
  const formula = project().formulas[0]!;
  if (formula.kind !== 'text') throw new Error('Expected font text');
  return formula;
};
const entry = () => stores.useRenderStore.getState().entries[current().id];
const requestOf = () => {
  const request = renderRequestFor(current(), project().meta, 'auto');
  if (request.kind !== 'text') throw new Error('Expected a text request');
  return request;
};
/** Rendered, with the boxes or with the shape. */
const drawn = (exact: boolean) =>
  vi.waitFor(() => {
    expect(entry()).toMatchObject({ status: 'ok', resolved: { render: { exact } } });
    expect(current().snapshot?.key === entry()!.resolved!.render.key || !exact).toBe(true);
  });

function start(source: string, online: boolean, ranges: Record<string, TextSourceRange[]> = {}) {
  const p = createEmptyProject();
  p.formulas.push(createTextFormula({ source }));
  stores.loadProject(p);
  const native = setupEngine(ranges);
  if (online) native.go('online');
  stop = stores.startRenderSync(native.engine);
  return native;
}

const range = (from: number, end: number): TextSourceRange => ({ start: from, end });
/** "office" as a font with the ffi ligature shapes it: o, ffi, c, e. */
const OFFICE = [range(0, 1), range(1, 4), range(4, 5), range(5, 6)];
const RED = '#FF0000';
const BLUE = '#0000FF';

describe('a text nothing has shaped', () => {
  it('is drawn as boxes, and its glyphs are counted by them, without an undo step', async () => {
    start('Hi a', false);
    await drawn(false);
    const snapshot = current().snapshot!;
    expect(snapshot.backend).toBe('pango');
    expect(snapshot.key).toBe(textBoxesKey(requestOf()));
    expect(snapshot.glyphs.map((glyph) => glyph.label)).toEqual(['H', 'i', 'a']);
    expect(current().geometry).toBeNull();
    expect(entry()!.resolved!.canonToRender).toEqual([0, 1, 2]);
    expect(stores.useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('keeps what was made on the boxes when a companion shapes it', async () => {
    const native = start('office', false, { office: OFFICE });
    await drawn(false);
    stores.useProjectStore.getState().update((draft) => {
      // The first f, the c and the e.
      draft.formulas[0]!.glyphColors = { 1: RED, 4: BLUE };
      draft.formulas[0]!.hiddenGlyphs = [5];
    });
    native.go('online');
    await drawn(true);
    expect(current().geometry).not.toBeNull();
    expect(current().snapshot!.key).toBe(current().geometry!.key);
    expect(current().snapshot!.glyphs.map((glyph) => glyph.label)).toEqual(['o', 'ffi', 'c', 'e']);
    // The ligature took the colour of its first letter; nothing was lost, nothing is in doubt.
    expect(current().glyphColors).toEqual({ 1: RED, 2: BLUE });
    expect(current().hiddenGlyphs).toEqual([3]);
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toBeUndefined();
  });

  it('says what a ligature swallowed', async () => {
    const native = start('office', false, { office: OFFICE });
    await drawn(false);
    stores.useProjectStore.getState().update((draft) => {
      // The second f: inside the ligature, whose colour is its first letter's.
      draft.formulas[0]!.glyphColors = { 2: RED };
    });
    native.go('online');
    await drawn(true);
    expect(current().glyphColors).toEqual({});
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toMatchObject({
      cause: 'rebase',
      droppedColors: 1,
      confidence: 1,
    });
  });

  it('is recognised by the key of its snapshot when the project is opened again', async () => {
    start('office', false);
    await drawn(false);
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { 4: BLUE };
    });
    const saved = structuredClone(project());
    stop!();
    // Another session, with a companion: nothing in memory says what the boxes stood for.
    stores.loadProject(saved);
    stores.useRenderStore.getState().retain([]);
    const native = setupEngine({ office: OFFICE });
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    expect(current().glyphColors).toEqual({ 2: BLUE });
    expect(current().geometry).not.toBeNull();
  });

  it('follows an edit of its source from boxes to boxes', async () => {
    start('AB', false);
    await drawn(false);
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { 1: RED };
    });
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.source = 'A xy B';
    });
    await vi.waitFor(() => expect(current().snapshot?.glyphs).toHaveLength(4));
    expect(current().snapshot!.key).toBe(textBoxesKey(requestOf()));
    expect(current().glyphColors).toEqual({ 3: RED });
  });
});

describe('a snapshot of boxes that comes back while something else is on its way', () => {
  it('is known by the request it was taken for: a redo across a shaping loses nothing', async () => {
    // Drawn as boxes at one size, then shaped; a redo then brings back the project of a moment
    // when the author had given it another size and its snapshot was still the boxes'.
    const native = start('office', false, { office: OFFICE });
    await drawn(false);
    const boxes = structuredClone(current().snapshot!);
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { 1: RED, 4: BLUE };
    });
    native.go('online');
    await drawn(true);
    expect(current().glyphColors).toEqual({ 1: RED, 2: BLUE });
    // What the redo restores: the other size, the boxes' snapshot and the references on boxes.
    stores.useProjectStore.getState().update((draft) => {
      const text = draft.formulas[0]!;
      text.fontSize = 60;
      text.snapshot = boxes;
      text.glyphColors = { 1: RED, 4: BLUE };
      if (text.kind === 'text') text.geometry = null;
    });
    await vi.waitFor(() => {
      expect(current().geometry?.basisKey).toBe(textBasisKey(requestOf()));
      expect(current().snapshot!.key).toBe(current().geometry!.key);
    });
    // Nothing at hand had the snapshot's key; the session remembered what it was the boxes of.
    expect(current().glyphColors).toEqual({ 1: RED, 2: BLUE });
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toBeUndefined();
  });

  it('is known by its labels in another session: one glyph per character of the same text', async () => {
    // Saved between the change of size and the render that would have followed it.
    start('office', false);
    await drawn(false);
    const saved = structuredClone(project());
    saved.formulas[0]!.fontSize = 60;
    saved.formulas[0]!.glyphColors = { 4: BLUE };
    stop!();
    stores.loadProject(saved);
    stores.useRenderStore.getState().retain([]);
    const native = setupEngine({ office: OFFICE });
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    expect(current().glyphColors).toEqual({ 2: BLUE });
  });

  it('is not trusted when nothing says what it counted: the shape takes its place, and says what went', async () => {
    start('office', false);
    await drawn(false);
    const saved = structuredClone(project());
    // Another size and another text: neither its key nor its labels are this text's.
    saved.formulas[0]!.fontSize = 60;
    saved.formulas[0]!.source = 'offices';
    saved.formulas[0]!.glyphColors = { 4: BLUE };
    stop!();
    stores.loadProject(saved);
    stores.useRenderStore.getState().retain([]);
    const native = setupEngine();
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    expect(current().glyphColors).toEqual({});
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toMatchObject({
      droppedColors: 1,
      confidence: 0,
    });
  });
});

describe('a snapshot with the key of the boxes and another number of glyphs', () => {
  it('leaves its references alone, drawn or shaped, and says it is unsure', async () => {
    // Boxes cut by another rule (another version of the app, a file written by hand): the key
    // says "the boxes of this text", the count says otherwise.
    const p = createEmptyProject();
    const draft = createTextFormula({ source: 'AB', glyphColors: { 2: RED } });
    const request = renderRequestFor(draft, p.meta, 'auto') as TextRenderRequest;
    p.formulas.push({
      ...draft,
      snapshot: {
        backend: 'pango',
        key: textBoxesKey(request),
        glyphs: ['A', 'B', '!'].map((label, index) => ({
          label,
          center: [index, 0],
          size: [0.5, 0.5],
        })),
      },
    });
    stores.loadProject(p);
    const native = setupEngine();
    stop = stores.startRenderSync(native.engine);
    await drawn(false);
    expect(entry()!.resolved!.confidence).toBe(0);
    expect(current().snapshot!.glyphs).toHaveLength(3);
    expect(current().glyphColors).toEqual({ 2: RED });
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toMatchObject({
      confidence: 0,
      droppedColors: 0,
    });
  });
});

describe('a shaped text where nothing can shape it again', () => {
  it('edited: boxes take the place of its snapshot, its references follow, undo brings the shape back', async () => {
    const native = start('AB', true);
    await drawn(true);
    const shape = current().geometry;
    const exactKey = current().snapshot!.key;
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { 1: RED };
    });
    native.go('offline');
    await drawn(true); // The saved shape draws it: nothing is asked for.
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.source = 'AxB';
    });
    await drawn(false);
    await vi.waitFor(() => expect(current().snapshot!.key).toBe(textBoxesKey(requestOf())));
    expect(current().glyphColors).toEqual({ 2: RED });
    // The geometry was of the earlier source: nothing counts by it any more.
    expect(current().geometry).toBeNull();

    stores.history.undo();
    await drawn(true);
    expect(current().source).toBe('AB');
    expect(current().geometry).toEqual(shape);
    expect(current().snapshot!.key).toBe(exactKey);
    expect(current().glyphColors).toEqual({ 1: RED });
  });

  it('resized: it keeps its snapshot and is drawn as boxes through it, until it is shaped', async () => {
    const native = start('office', true, { office: OFFICE });
    await drawn(true);
    const shape = structuredClone(current().geometry);
    const exactKey = current().snapshot!.key;
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { 1: RED, 3: BLUE };
    });
    native.go('offline');
    await drawn(true);
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.fontSize = 60;
    });
    await drawn(false);
    // The shaped snapshot stays: boxes are the lesser render of the same text.
    expect(current().snapshot!.key).toBe(exactKey);
    expect(current().geometry).toEqual(shape);
    expect(current().glyphColors).toEqual({ 1: RED, 3: BLUE });
    // o → its box, the ligature → the box of its first letter, c and e → theirs.
    expect(entry()!.resolved!.canonToRender).toEqual([0, 1, 4, 5]);

    native.go('online');
    await vi.waitFor(() => {
      expect(entry()).toMatchObject({ status: 'ok', resolved: { render: { exact: true } } });
      expect(current().geometry?.basisKey).toBe(textBasisKey(requestOf()));
    });
    expect(current().snapshot!.key).toBe(current().geometry!.key);
    expect(current().glyphColors).toEqual({ 1: RED, 3: BLUE });
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toBeUndefined();
  });

  it('moved to the other library: the shape the first one gave it stays on screen', async () => {
    const native = start('AB', true);
    await drawn(true);
    const shape = structuredClone(current().geometry);
    const exactKey = current().snapshot!.key;
    native.go('offline');
    await drawn(true);
    native.render.mockClear();
    stores.useProjectStore.getState().update((draft) => {
      draft.meta.target = 'gl';
    });
    await vi.waitFor(() => expect(native.render).toHaveBeenCalled());
    await vi.waitFor(() => expect(entry()?.status).toBe('ok'));
    const render = entry()!.resolved!.render;
    expect(render.exact).toBe(true);
    expect(render.text?.basis.target).toBe('ce');
    expect(render.key).toBe(exactKey);
    expect(current().snapshot!.key).toBe(exactKey);
    expect(current().geometry).toEqual(shape);
  });
});

describe('a text whose saved geometry is not at hand', () => {
  const lost = (source: string, edited = source) => {
    const artifact = textGeometry(source);
    return createTextFormula({
      source: edited,
      glyphColors: { 1: RED },
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 10,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
      snapshot: toSnapshot(textArtifactRender(artifact)),
    });
  };

  it('is drawn as boxes where its glyphs were, not re-counted by what a companion shapes now', async () => {
    const p = createEmptyProject();
    const formula = lost('AB');
    p.formulas.push(formula);
    stores.loadProject(p);
    // A companion with other fonts or versions: what it shapes is another geometry.
    const native = setupEngine({}, 'fonts of another day');
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(false);
    const { render, canonToRender, confidence } = entry()!.resolved!;
    expect(render.boxes).toBeUndefined();
    expect(render.glyphs.map((glyph) => glyph.bbox)).toEqual(
      formula.snapshot!.glyphs.map(({ center, size }) => ({
        minX: center[0] - size[0] / 2,
        minY: center[1] - size[1] / 2,
        maxX: center[0] + size[0] / 2,
        maxY: center[1] + size[1] / 2,
      })),
    );
    expect(canonToRender).toEqual([0, 1]);
    expect(confidence).toBe(1);
    expect(render.warnings).toEqual([
      'The saved appearance of this text is not in the browser’s storage. Open the project ' +
        'file that carries it, or use Refresh appearance in its editor, which needs the ' +
        'companion. It is drawn as placeholder boxes meanwhile.',
    ]);
    expect(current().geometry).toEqual(formula.geometry);
    expect(current().snapshot).toEqual(formula.snapshot);
    expect(current().glyphColors).toEqual({ 1: RED });
  });

  it('gets it back by itself when a companion shapes that very geometry again', async () => {
    const p = createEmptyProject();
    const formula = lost('AB');
    p.formulas.push(formula);
    stores.loadProject(p);
    // The companion of the day it was shaped: the same key, the same glyphs.
    const native = setupEngine();
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    expect(current().snapshot).toEqual(formula.snapshot);
    expect(current().geometry?.key).toBe(formula.geometry!.key);
    // Stored again: the reference names bytes the browser holds now.
    expect(current().geometry?.contentHash).not.toBe('a'.repeat(64));
    expect(current().glyphColors).toEqual({ 1: RED });
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toBeUndefined();
  });

  it('says so when it comes back: the reference is the same, and a file may be without it', async () => {
    const media = await import('../../media');
    const ownership = await import('../mediaOwnership');
    // A text as a browser that shaped it left it in its project…
    const p = createEmptyProject();
    const formula = createTextFormula({ source: 'AB', glyphColors: { 1: RED } });
    const request = renderRequestFor(formula, p.meta, 'auto');
    if (request.kind !== 'text') throw new Error('Expected a text request');
    const artifact = shaped(request);
    const kept = await media.storeTextGeometry(artifact);
    formula.geometry = kept.reference;
    formula.snapshot = toSnapshot(textArtifactRender(artifact));
    p.formulas.push(formula);
    // …in a browser whose storage no longer holds it.
    vi.stubGlobal('indexedDB', new IDBFactory());
    stores.loadProject(p);
    const returned: string[] = [];
    const off = ownership.onMediaReturned((contentHash) => returned.push(contentHash));
    const native = setupEngine();
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    await vi.waitFor(() => expect(returned).toEqual([kept.reference.contentHash]));
    // Nothing of the project tells: the reference names the same bytes as before.
    expect(current().geometry).toEqual(kept.reference);
    expect(await media.loadTextGeometry(kept.reference)).toMatchObject({ key: artifact.key });
    off();
  });

  it('says nothing of a geometry the project did not name before', async () => {
    const ownership = await import('../mediaOwnership');
    const returned: string[] = [];
    const off = ownership.onMediaReturned((contentHash) => returned.push(contentHash));
    start('AB', true);
    await drawn(true);
    await vi.waitFor(() => expect(current().geometry).toBeDefined());
    await ownership.mediaOwnershipSettled();
    expect(returned).toEqual([]);
    off();
  });

  it('damaged in the store, is not asked for again: nothing shaped would mend the store', async () => {
    const native = start('AB', true);
    await drawn(true);
    const reopened = structuredClone(project());
    const media = await import('../../media');
    const read = vi
      .spyOn(media.mediaRepository, 'getOriginal')
      .mockResolvedValue(new Blob(['{"not":"the geometry"}']));
    try {
      native.render.mockClear();
      stores.loadProject(reopened);
      await drawn(false);
      expect(entry()!.resolved!.render.warnings[0]).toContain('damaged in the browser’s storage');
      expect(native.render).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('asks again in a moment when the companion is busy, instead of settling as boxes', async () => {
    const p = createEmptyProject();
    const formula = lost('AB');
    p.formulas.push(formula);
    stores.loadProject(p);
    const native = setupEngine();
    native.go('online');
    native.render.mockResolvedValueOnce({
      ok: false,
      error: {
        backend: 'pango',
        message: 'Waiting for an available Pango worker.',
        retryAfterMs: 100,
      },
    });
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    expect(native.render).toHaveBeenCalledTimes(2);
    expect(current().geometry?.contentHash).not.toBe('a'.repeat(64));
    expect(current().glyphColors).toEqual({ 1: RED });
  });

  it('stays as boxes without a companion, and nothing is stored', async () => {
    const p = createEmptyProject();
    const formula = lost('AB');
    p.formulas.push(formula);
    stores.loadProject(p);
    const native = setupEngine();
    stop = stores.startRenderSync(native.engine);
    await drawn(false);
    expect(entry()!.resolved!.render.boxes).toBeUndefined();
    expect(current().geometry).toEqual(formula.geometry);
  });

  it('and whose snapshot is of an earlier source keeps its references and says it is unsure', async () => {
    const p = createEmptyProject();
    const formula = lost('AB', 'ABC');
    p.formulas.push(formula);
    stores.loadProject(p);
    const native = setupEngine();
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(false);
    expect(entry()!.resolved!.render.boxes?.source).toBe('ABC');
    expect(entry()!.resolved!.confidence).toBe(0);
    // Its glyph references say nothing of these boxes: no export may count by them.
    expect(textCountedByBoxes(current(), entry()!.resolved!, project().meta)).toBe(false);
    // The note of the text says what happened to it and what brings its glyphs back.
    expect(entry()!.resolved!.render.warnings).toEqual([
      'The saved appearance of this text is not in the browser’s storage. Open the project ' +
        'file that carries it, or use Refresh appearance in its editor, which needs the ' +
        'companion. It is drawn as placeholder boxes meanwhile.',
    ]);
    // Never shaped unasked: its references count by a geometry nothing can stand in for.
    expect(native.render).not.toHaveBeenCalled();
    expect(current().snapshot).toEqual(formula.snapshot);
    expect(current().geometry).toEqual(formula.geometry);
    expect(current().glyphColors).toEqual({ 1: RED });
    expect(stores.useSyncWarnings.getState().warnings[current().id]).toMatchObject({
      confidence: 0,
      droppedColors: 0,
    });
  });

  it('with another font size is counted by its letters only where they run left to right', async () => {
    // Nothing shapes it, and the size changed: the boxes of the text stand over a snapshot
    // whose labels are the characters of the text in order.
    const resized = async (source: string) => {
      stop?.();
      const p = createEmptyProject();
      const formula = { ...lost(source), fontSize: 60, glyphColors: { 0: RED } };
      p.formulas.push(formula);
      stores.loadProject(p);
      stop = stores.startRenderSync(setupEngine().engine);
      await drawn(false);
      await vi.waitFor(() => expect(entry()!.resolved!.render.boxes?.source).toBe(source));
      return formula;
    };
    // Left to right, a shaped glyph per letter is a box per letter: the boxes take over.
    await resized('ABA');
    await vi.waitFor(() => expect(current().snapshot!.key).toBe(textBoxesKey(requestOf())));
    expect(entry()!.resolved!.confidence).toBe(1);
    expect(current().glyphColors).toEqual({ 0: RED });
    // Right to left, the first shaped glyph is the last letter. A word that reads the same
    // both ways has the same labels and the other order: nothing is taken for granted.
    const hebrew = await resized('\u05D0\u05D1\u05D0');
    expect(entry()!.resolved!.confidence).toBe(0);
    expect(current().snapshot).toEqual(hebrew.snapshot);
    expect(current().glyphColors).toEqual({ 0: RED });
    expect(textCountedByBoxes(current(), entry()!.resolved!, project().meta)).toBe(false);
  });

  it('but with nothing counted by it is shaped anew, as a text never shaped', async () => {
    const p = createEmptyProject();
    // A reference to a geometry that is not here, and no snapshot of it: no glyph reference
    // of the project can be about that geometry.
    p.formulas.push({ ...lost('AB'), snapshot: null, glyphColors: {} });
    stores.loadProject(p);
    const native = setupEngine();
    native.go('online');
    stop = stores.startRenderSync(native.engine);
    await drawn(true);
    expect(native.render).toHaveBeenCalled();
    expect(current().geometry?.contentHash).not.toBe('a'.repeat(64));
    expect(current().snapshot!.key).toBe(current().geometry!.key);
  });
});
