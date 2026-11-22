// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  producerOf,
  renderRequestFor,
  textArtifactRender,
  textBoxesKey,
  toSnapshot,
  type TextRenderRequest,
} from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import { IndexedDbMediaRepository, storeTextGeometry } from '../../../media';
import { createEmptyProject, createTextFormula, type TextGeometryRef } from '../../../model';
import { textGeometry } from '../../../test/textGeometry';
import { clearThumbRenders, thumbRender } from '../libraryThumbs';

const meta = createEmptyProject('T').meta;

/** A text shaped somewhere else: its reference, and the value its file carries. */
async function shaped(source: string) {
  const factory = new IDBFactory();
  const elsewhere = new IndexedDbMediaRepository({ indexedDB: () => factory });
  const stored = await storeTextGeometry(textGeometry(source), { repository: elsewhere });
  const bytes = await elsewhere.requireOriginal(stored.reference.contentHash);
  return { reference: stored.reference, value: JSON.parse(await bytes.text()) as unknown };
}

const text = (source: string, geometry: TextGeometryRef | null) =>
  createTextFormula({ name: 'title', source, geometry });

afterEach(() => {
  vi.unstubAllGlobals();
  clearThumbRenders();
});

describe('the thumbnail of a font text of a listed project', () => {
  it('is drawn from the geometry its file carries, in a browser that holds none of it', async () => {
    // No database at all: nothing may be read from it, and nothing stored.
    vi.stubGlobal('indexedDB', undefined);
    const { reference, value } = await shaped('Title');
    const formula = text('Title', reference);
    const resolved = await thumbRender(formula, meta, createMockEngine(), {
      [reference.contentHash]: value,
    });
    expect(resolved?.formula).toBe(formula);
    expect(resolved?.render.backend).toBe('pango');
    expect(resolved?.render.glyphs.map((glyph) => glyph.label)).toEqual([...'Title']);
  });

  it('is checked once per session: the list opened again does not read the member again', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { reference, value } = await shaped('Title');
    const embedded = { [reference.contentHash]: value };
    const first = await thumbRender(text('Title', reference), meta, createMockEngine(), embedded);
    const stringify = vi.spyOn(JSON, 'stringify');
    const again = text('Title', reference);
    const second = await thumbRender(again, meta, createMockEngine(), embedded);
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
    expect(second?.render).toBe(first?.render);
    expect(second?.formula).toBe(again);
    // Forgotten on request, as the MathJax renders are.
    clearThumbRenders();
    const third = await thumbRender(text('Title', reference), meta, createMockEngine(), embedded);
    expect(third?.render).not.toBe(first?.render);
  });

  it('is its boxes for a member that is not the geometry the text names', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const { reference, value } = await shaped('Title');
    const other = structuredClone(value) as { glyphs: { label: string }[] };
    other.glyphs[0]!.label = 'X';
    const formula = text('Title', reference);
    const resolved = await thumbRender(formula, meta, createMockEngine(), {
      [reference.contentHash]: other,
    });
    // Never the damaged member: the placeholder boxes of the text, which are not exact.
    expect(resolved?.render.exact).toBe(false);
    expect(resolved?.render.text).toBeUndefined();
    expect(resolved?.render.glyphs.map((glyph) => glyph.label)).toEqual([...'Title']);
  });

  it('is its boxes without geometry, in the file or in the browser', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const { reference } = await shaped('Title');
    for (const formula of [text('Ti tle', null), text('Ti tle', reference)]) {
      const resolved = await thumbRender(formula, meta, createMockEngine(), {});
      expect(resolved?.render).toMatchObject({ backend: 'pango', exact: false });
      // One box per letter; the space draws nothing.
      expect(resolved?.render.glyphs.map((glyph) => glyph.label)).toEqual([...'Title']);
    }
  });

  it('is the boxes of a text nothing shaped, with the colours made on them', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const draft = createTextFormula({ name: 'title', source: 'AB', glyphColors: { 1: '#FF0000' } });
    const request = renderRequestFor(draft, meta, 'auto') as TextRenderRequest;
    const boxes = producerOf('text').free(request, textBoxesKey(request));
    if (!boxes.ok) throw new Error(boxes.error.message);
    const formula = { ...draft, snapshot: toSnapshot(boxes.render) };
    const resolved = await thumbRender(formula, meta, createMockEngine());
    // The snapshot is the boxes': glyph k is canonical glyph k, and its colour applies.
    expect(resolved?.canonToRender).toEqual([0, 1]);
    expect(resolved?.confidence).toBe(1);
  });

  it('is boxes where its glyphs were for a text whose geometry is not at hand', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const artifact = textGeometry('AB');
    const shape = textArtifactRender(artifact);
    const formula = createTextFormula({
      name: 'title',
      source: 'AB',
      snapshot: toSnapshot(shape),
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 10,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
    });
    const resolved = await thumbRender(formula, meta, createMockEngine());
    expect(resolved?.render.exact).toBe(false);
    expect(resolved?.render.glyphs.map((glyph) => glyph.bbox)).toEqual(
      shape.glyphs.map((glyph) => glyph.bbox),
    );
    expect(resolved?.canonToRender).toEqual([0, 1]);
  });

  it('comes from the browser for a file that carries none (a package, by its manifest)', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const stored = await storeTextGeometry(textGeometry('Title'));
    const resolved = await thumbRender(text('Title', stored.reference), meta, createMockEngine());
    expect(resolved?.render.glyphs.map((glyph) => glyph.label)).toEqual([...'Title']);
    await stored.lease.release();
  });
});
