// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createTextFormula } from '../../model';
import { textGeometry } from '../../test/textGeometry';
import { textArtifactRender, textBoxesKey } from '../../engine/pango';
import { producerOf } from '../../engine/producers';
import { toSnapshot } from '../../engine/key';
import type { CompanionState, FormulaEngine, RenderResult, TextRenderRequest } from '../../engine';

let stores: typeof import('../index');
let media: typeof import('../../media');
let stop: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  stores = await import('../index');
  media = await import('../../media');
  stores.loadProject(createEmptyProject());
  stores.useRenderStore.getState().retain([]);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

function setupEngine() {
  let listener: (state: CompanionState) => void = () => undefined;
  let state: CompanionState = { status: 'offline' };
  const render = vi.fn<FormulaEngine['render']>(async (request) => {
    if (request.kind !== 'text') throw new Error('Unexpected request');
    return { ok: true, render: textArtifactRender(textGeometry(request.source)) };
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
    change(next: CompanionState) {
      state = next;
      listener(next);
    },
  };
}

const project = () => stores.useProjectStore.getState().project;
const current = () => {
  const formula = project().formulas[0]!;
  if (formula.kind !== 'text') throw new Error('Expected font text');
  return formula;
};
const settled = async () =>
  vi.waitFor(() => {
    expect(stores.useRenderStore.getState().entries[current().id]?.status).toBe('ok');
  });

describe('committed text geometry lifecycle', () => {
  it('owns committed geometry without an Undo step, reopens offline and retains it on native changes', async () => {
    const p = createEmptyProject();
    p.formulas.push(createTextFormula({ source: 'AB' }));
    stores.loadProject(p);
    const native = setupEngine();
    stop = stores.startRenderSync(native.engine);
    await settled();
    expect(current().geometry).not.toBeNull();
    expect(stores.useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    const artifact = await media.loadTextGeometry(current().geometry!);
    expect(artifact.basis.source).toBe('AB');
    const saved = structuredClone(project());
    stop();
    stores.loadProject(saved);
    native.render.mockClear();
    native.render.mockResolvedValue({ ok: false, error: { backend: 'pango', message: 'offline' } });
    stop = stores.startRenderSync(native.engine);
    await settled();
    native.change({
      status: 'online',
      health: {
        name: 'mfe-companion',
        protocol: 1,
        version: 'new',
        capabilities: {
          latex: false,
          dvisvgm: false,
          ffmpeg: false,
          manimCE: null,
          manimGL: null,
          pango: {
            ce: { state: 'ready', adapterVersion: 'new', environmentKey: 'different-fonts' },
          },
        },
      },
    });
    await settled();
    expect(native.render).not.toHaveBeenCalled();
    expect(current().geometry).toEqual(
      saved.formulas[0]!.kind === 'text' && saved.formulas[0]!.geometry,
    );
  });

  it('says in plain words that a text has no geometry here, and draws its boxes', async () => {
    const p = createEmptyProject();
    const artifact = textGeometry('AB');
    // Its file was written without the geometry, or held a damaged one: only the reference.
    p.formulas.push(
      createTextFormula({
        source: 'AB',
        geometry: {
          contentHash: 'a'.repeat(64),
          byteLength: 10,
          key: artifact.key,
          basisKey: artifact.basisKey,
        },
        snapshot: toSnapshot(textArtifactRender(artifact)),
      }),
    );
    stores.loadProject(p);
    const native = setupEngine();
    // No companion: the engine has only boxes to give, and they are not that geometry.
    native.render.mockImplementation(async (request) =>
      producerOf('text').free(request, textBoxesKey(request as TextRenderRequest)),
    );
    stop = stores.startRenderSync(native.engine);
    // Drawn all the same, as boxes where its glyphs were; the note says why and what to do.
    await vi.waitFor(() => {
      expect(stores.useRenderStore.getState().entries[current().id]).toMatchObject({
        status: 'ok',
        error: null,
        resolved: {
          render: {
            backend: 'pango',
            exact: false,
            warnings: [
              'The saved appearance of this text is not in the browser’s storage. Open the ' +
                'project file that carries it, or use Refresh appearance in its editor, which ' +
                'needs the companion. It is drawn as placeholder boxes meanwhile.',
            ],
          },
        },
      });
    });
    expect(current().geometry).toEqual(p.formulas[0]!.kind === 'text' && p.formulas[0]!.geometry);
  });

  it('keeps source saveable and old geometry stale while unavailable; Undo restores saved appearance', async () => {
    const p = createEmptyProject();
    p.formulas.push(createTextFormula({ source: 'AB' }));
    stores.loadProject(p);
    const native = setupEngine();
    stop = stores.startRenderSync(native.engine);
    await settled();
    const original = current().geometry;
    native.render.mockResolvedValue({
      ok: false,
      error: { backend: 'pango', message: 'missing font' },
    });
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.source = 'ABC';
    });
    await vi.waitFor(() =>
      expect(stores.useRenderStore.getState().entries[current().id]?.status).toBe('error'),
    );
    expect(current().source).toBe('ABC');
    expect(current().geometry).toEqual(original);
    expect(
      stores.useRenderStore.getState().resolved.get(current().id)?.render.text?.basis.source,
    ).toBe('AB');
    stores.history.undo();
    await settled();
    expect(current().source).toBe('AB');
    expect(current().geometry).toEqual(original);
  });

  it('rejects an old document response even when the replacement uses the same object ID', async () => {
    const p = createEmptyProject();
    p.formulas.push(createTextFormula({ source: 'AB' }));
    stores.loadProject(p);
    const native = setupEngine();
    let resolve!: (result: RenderResult) => void;
    native.render.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    stop = stores.startRenderSync(native.engine);
    const next = structuredClone(p);
    next.formulas[0]!.source = 'CD';
    stores.loadProject(next);
    await settled();
    resolve({ ok: true, render: textArtifactRender(textGeometry('AB')) });
    await new Promise((done) => setTimeout(done, 10));
    expect(current().source).toBe('CD');
    expect((await media.loadTextGeometry(current().geometry!)).basis.source).toBe('CD');
  });

  it.each(['missing', 'corrupt'] as const)(
    'validates a same-ID reopened artifact instead of repairing %s data from a live render cache',
    async (failure) => {
      const p = createEmptyProject();
      p.formulas.push(createTextFormula({ source: 'AB' }));
      stores.loadProject(p);
      const native = setupEngine();
      stop = stores.startRenderSync(native.engine);
      await settled();
      const reopened = structuredClone(project());
      const formula = reopened.formulas[0]!;
      if (formula.kind !== 'text' || !formula.geometry) throw new Error('Expected saved geometry');
      const originalRead = media.mediaRepository.getOriginal.bind(media.mediaRepository);
      const originalHash = formula.geometry.contentHash;
      const originalBlob = await originalRead(originalHash);
      if (!originalBlob) throw new Error('Missing test fixture');
      let restoreRead: (() => void) | undefined;
      if (failure === 'missing') {
        formula.geometry.contentHash = 'f'.repeat(64);
      } else {
        // Same identity and byte length, valid JSON/geometry, but altered content on disk.
        const damaged = new Blob([(await originalBlob.text()).replace('"AB"', '"AC"')]);
        expect(damaged.size).toBe(originalBlob.size);
        const read = vi
          .spyOn(media.mediaRepository, 'getOriginal')
          .mockImplementation((hash) =>
            hash === originalHash ? Promise.resolve(damaged) : originalRead(hash),
          );
        restoreRead = () => read.mockRestore();
      }
      const declared = structuredClone(formula.geometry);
      native.render.mockClear();
      // What a companion would shape now is another geometry (other fonts than that day's): it
      // cannot stand in for the one the references count by.
      native.render.mockImplementation(async (request) => {
        if (request.kind !== 'text') throw new Error('Unexpected request');
        const other = textGeometry(request.source);
        return { ok: true, render: textArtifactRender({ ...other, key: `${other.key}-other` }) };
      });
      try {
        // Keep the service alive: this used to reuse a previous successful same-ID render.
        stores.loadProject(reopened);
        await vi.waitFor(() =>
          expect(stores.useRenderStore.getState().entries[current().id]?.status).toBe('ok'),
        );
        expect(current().source).toBe('AB');
        expect(current().geometry).toEqual(declared);
        expect(current().snapshot).toEqual(formula.snapshot);
        // Not the geometry of the earlier document: the boxes of the snapshot, which is saved.
        const drawn = stores.useRenderStore.getState().resolved.get(current().id)!.render;
        expect(drawn.exact).toBe(false);
        expect(drawn.text).toBeUndefined();
        expect(drawn.warnings[0]).toContain(
          failure === 'missing'
            ? 'is not in the browser’s storage'
            : 'is damaged in the browser’s storage',
        );
        // A damaged one is not even asked for: nothing a companion shapes would mend the store.
        if (failure === 'corrupt') expect(native.render).not.toHaveBeenCalled();
      } finally {
        restoreRead?.();
      }
    },
  );

  it('binds an in-memory artifact to its content hash when another verified payload shares its render key', async () => {
    const p = createEmptyProject();
    p.formulas.push(createTextFormula({ source: 'AB' }));
    stores.loadProject(p);
    const native = setupEngine();
    stop = stores.startRenderSync(native.engine);
    await settled();
    const artifact = textGeometry('AB');
    artifact.warnings = ['Metadata from the second owned payload'];
    const second = await media.storeTextGeometry(artifact);
    expect(second.reference.key).toBe(current().geometry!.key);
    expect(second.reference.contentHash).not.toBe(current().geometry!.contentHash);
    const another = createTextFormula({
      source: 'AB',
      name: 'p2',
      geometry: second.reference,
      snapshot: structuredClone(current().snapshot),
    });
    stores.useProjectStore.getState().update((draft) => {
      draft.formulas.push(another);
    });
    await vi.waitFor(() =>
      expect(stores.useRenderStore.getState().entries[another.id]?.status).toBe('ok'),
    );
    native.render.mockClear();
    stores.useProjectStore.getState().update((draft) => {
      const first = draft.formulas[0]!;
      if (first.kind === 'text') first.geometry = second.reference;
    });
    await settled();
    expect(stores.useRenderStore.getState().resolved.get(current().id)?.render.warnings).toEqual(
      artifact.warnings,
    );
    expect(native.render).not.toHaveBeenCalled();
    await (await import('../mediaOwnership')).syncCurrentMediaOwnership();
    await second.lease.release();
  });
});
