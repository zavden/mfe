// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createTextFormula,
  parseProject,
  serializeProject,
  type Project,
  type TextGeometryRef,
} from '../../model';
import { textGeometryFixture } from '../../model/__tests__/textFixtures';
import { readExample } from '../../test/examples';
import { projectPayloads } from '../dependencies';
import {
  fitsProjectFile,
  importEmbeddedTextGeometry,
  MAX_EMBEDDED_GEOMETRY_BYTES,
  MAX_PROJECT_FILE_BYTES,
  prepareProjectFile,
  recoverEmbeddedTextGeometry,
} from '../embeddedGeometry';
import { MediaStorageError } from '../errors';
import { IndexedDbMediaRepository, type OriginalMediaRepository } from '../repository';
import { loadTextGeometry, storeTextGeometry } from '../textGeometry';

function repository() {
  const factory = new IDBFactory();
  return new IndexedDbMediaRepository({ indexedDB: () => factory });
}

/** A geometry as a browser stored it: its reference, and the value a file would carry. */
async function shaped(source: string) {
  const repo = repository();
  const stored = await storeTextGeometry(textGeometryFixture(source), { repository: repo });
  const text = await (await repo.requireOriginal(stored.reference.contentHash)).text();
  return { reference: stored.reference, artifact: stored.artifact, value: JSON.parse(text) };
}

function projectOf(...texts: [name: string, geometry: TextGeometryRef][]): Project {
  const project = createEmptyProject();
  for (const [name, geometry] of texts) {
    project.formulas.push(createTextFormula({ name, source: name, geometry }));
  }
  return project;
}

describe('the geometry a project file carries', () => {
  it('enters a browser that never saw it, from the file alone', async () => {
    const title = await shaped('Title');
    const note = await shaped('note');
    const project = projectOf(['Title', title.reference], ['note', note.reference]);
    const file = serializeProject(project, {
      [title.reference.contentHash]: title.value,
      [note.reference.contentHash]: note.value,
    });
    const parsed = parseProject(file);
    if (!parsed.ok) throw new Error(parsed.error);

    const fresh = repository();
    const result = await importEmbeddedTextGeometry(parsed.project, parsed.textGeometry, {
      repository: fresh,
    });
    expect(result.refused).toEqual([]);
    expect(result.imported.sort()).toEqual(
      [title.reference.contentHash, note.reference.contentHash].sort(),
    );
    expect(await loadTextGeometry(title.reference, { repository: fresh })).toEqual(title.artifact);
    expect(await loadTextGeometry(note.reference, { repository: fresh })).toEqual(note.artifact);
    // The import owns what it stored until someone else does: released alone, it is nobody's.
    expect((await fresh.collectUnowned()).removed).toBe(0);
    await result.lease.release();
    expect((await fresh.collectUnowned()).removed).toBe(2);
  });

  it('does not depend on how the file writes its JSON', async () => {
    const title = await shaped('Title');
    const project = projectOf(['Title', title.reference]);
    const file = serializeProject(project, { [title.reference.contentHash]: title.value });
    // Another program wrote the file again, in its own layout.
    const rewritten = JSON.stringify(JSON.parse(file), null, '\t');
    expect(rewritten).not.toBe(file);
    const parsed = parseProject(rewritten);
    if (!parsed.ok) throw new Error(parsed.error);
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(parsed.project, parsed.textGeometry, {
      repository: fresh,
    });
    expect(result.refused).toEqual([]);
    expect(await loadTextGeometry(title.reference, { repository: fresh })).toEqual(title.artifact);
  });

  it('stores one geometry once for the texts that share it', async () => {
    const shared = await shaped('same');
    const project = projectOf(['first', shared.reference], ['second', { ...shared.reference }]);
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(
      project,
      { [shared.reference.contentHash]: shared.value },
      { repository: fresh },
    );
    expect(result).toMatchObject({ imported: [shared.reference.contentHash], refused: [] });
  });

  it('leaves out a member that is not what its hash names, and says which texts lose it', async () => {
    const good = await shaped('good');
    const bad = await shaped('bad');
    const project = projectOf(
      ['kept', good.reference],
      ['moved', bad.reference],
      ['moved too', { ...bad.reference }],
    );
    const tampered = structuredClone(bad.value);
    // As long as before and a valid geometry still: only the hash tells.
    tampered.glyphs[0].label = 'bud';
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(
      project,
      { [good.reference.contentHash]: good.value, [bad.reference.contentHash]: tampered },
      { repository: fresh },
    );
    expect(result.imported).toEqual([good.reference.contentHash]);
    expect(result.refused).toEqual([
      {
        name: 'moved',
        reason:
          'The saved text geometry is damaged or unsupported. (Text geometry has a conflicting content hash.)',
      },
      {
        name: 'moved too',
        reason:
          'The saved text geometry is damaged or unsupported. (Text geometry has a conflicting content hash.)',
      },
    ]);
    expect(await fresh.getOriginal(bad.reference.contentHash)).toBeNull();
    expect(await loadTextGeometry(good.reference, { repository: fresh })).toEqual(good.artifact);
  });

  type Value = { glyphs: { index: number }[]; warnings: string[] };
  it.each([
    [
      'a geometry the schema refuses',
      (value: Value): unknown => ({ ...value, glyphs: [{ ...value.glyphs[0]!, index: 3 }] }),
      /glyphs\.0\.index: Unordered glyphs/,
    ],
    [
      'another size than the reference states',
      (value: Value): unknown => ({ ...value, warnings: ['longer'] }),
      /Unexpected text geometry byte length/,
    ],
    ['a value that is no geometry', (): unknown => 7, /Unexpected text geometry byte length/],
  ] as const)('refuses %s', async (_what, change, reason) => {
    const one = await shaped('one');
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(
      projectOf(['one', one.reference]),
      { [one.reference.contentHash]: change(one.value as Value) },
      { repository: fresh },
    );
    expect(result.imported).toEqual([]);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]!.reason).toMatch(reason);
    expect(await fresh.listOwners()).toEqual([]);
  });

  it('refuses a geometry that is another render than the text names', async () => {
    const one = await shaped('one');
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(
      projectOf(['one', { ...one.reference, key: 'another-render' }]),
      { [one.reference.contentHash]: one.value },
      { repository: fresh },
    );
    expect(result.refused).toEqual([
      {
        name: 'one',
        reason:
          'The saved text geometry is damaged or unsupported. (Text geometry does not match its declared render identity.)',
      },
    ]);
  });

  it('checks every reference to a shared geometry: a second one of another size is not let by', async () => {
    const one = await shaped('one');
    const right = one.reference;
    const wrong = { ...right, byteLength: right.byteLength + 1 };
    const embedded = { [right.contentHash]: one.value };
    // Whichever of the two texts comes first, the member fails a check and neither text has it.
    for (const [first, second] of [
      [right, wrong],
      [wrong, right],
    ] as const) {
      const fresh = repository();
      const result = await importEmbeddedTextGeometry(
        projectOf(['first', first], ['second', second]),
        embedded,
        { repository: fresh },
      );
      expect(result.imported).toEqual([]);
      expect(result.refused).toEqual(
        ['first', 'second'].map((name) => ({
          name,
          reason:
            'The saved text geometry is damaged or unsupported. (Unexpected text geometry byte length.)',
        })),
      );
      expect(await fresh.listOwners()).toEqual([]);
    }
    // Both of the size it has: one member for the two texts, stored once.
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(
      projectOf(['first', right], ['second', { ...right }]),
      embedded,
      { repository: fresh },
    );
    expect(result).toMatchObject({ imported: [right.contentHash], refused: [] });
  });

  it('opens the file that showed it (two texts, one geometry, the second off by a byte) without it', async () => {
    const file = readFileSync(
      fileURLToPath(new URL('./fixtures/shared-geometry-size.mfe.json', import.meta.url)),
      'utf8',
    );
    const parsed = parseProject(file);
    if (!parsed.ok) throw new Error(parsed.error);
    const texts = parsed.project.formulas.map((f) => (f.kind === 'text' ? f.geometry : null));
    expect(texts.map((geometry) => geometry?.byteLength)).toEqual([877, 878]);
    expect(new Set(texts.map((geometry) => geometry?.contentHash)).size).toBe(1);
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(parsed.project, parsed.textGeometry, {
      repository: fresh,
    });
    // The file opens; the geometry stays out, and the notice names both texts.
    expect(result.imported).toEqual([]);
    expect(result.refused.map((refusal) => refusal.name)).toEqual(['valid', 'wrong_size']);
    expect(result.refused[1]!.reason).toContain('Unexpected text geometry byte length');
    expect(await fresh.listOwners()).toEqual([]);
  });

  it('touches nothing for members that no text names, and for a file without the section', async () => {
    const one = await shaped('one');
    const stray = await shaped('stray');
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(
      projectOf(['one', one.reference]),
      { [stray.reference.contentHash]: stray.value },
      { repository: fresh },
    );
    expect(result).toMatchObject({ imported: [], refused: [] });
    await result.lease.release();
    expect(await fresh.listOwners()).toEqual([]);
    expect(await fresh.getOriginal(stray.reference.contentHash)).toBeNull();
  });

  it('lets go of what it stored when the opening is cancelled', async () => {
    const first = await shaped('first');
    const second = await shaped('second');
    const project = projectOf(['first', first.reference], ['second', second.reference]);
    const fresh = repository();
    const controller = new AbortController();
    const store = fresh.storeOriginal.bind(fresh);
    fresh.storeOriginal = async (blob, options) => {
      const stored = await store(blob, options);
      controller.abort();
      return stored;
    };
    await expect(
      importEmbeddedTextGeometry(
        project,
        {
          [first.reference.contentHash]: first.value,
          [second.reference.contentHash]: second.value,
        },
        { repository: fresh, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(await fresh.listOwners()).toEqual([]);
    expect(await fresh.getOriginal(first.reference.contentHash)).toBeNull();
    expect(await fresh.getOriginal(second.reference.contentHash)).toBeNull();
  });
});

describe('examples/text-pango.mfe.json', () => {
  it('opens in a browser that never shaped its texts: every geometry passes its checks', async () => {
    const parsed = parseProject(readExample('text-pango.mfe.json'));
    if (!parsed.ok) throw new Error(parsed.error);
    const fresh = repository();
    const result = await importEmbeddedTextGeometry(parsed.project, parsed.textGeometry, {
      repository: fresh,
    });
    expect(result.refused).toEqual([]);
    expect(result.imported).toHaveLength(2);
    for (const formula of parsed.project.formulas) {
      if (formula.kind !== 'text') continue;
      const artifact = await loadTextGeometry(formula.geometry!, { repository: fresh });
      // The geometry of the text as it is now: nothing waits for a companion.
      expect(artifact.basis).toMatchObject({ source: formula.source, fontSize: formula.fontSize });
      expect(artifact.provenance.geometrySignature).toMatch(/^[0-9a-f]{64}$/);
    }
    await result.lease.release();
  });
});

describe('the .mfe.json of a project with font text', () => {
  /** A browser that holds the geometry of `sources`, and a project of those texts. */
  async function holding(...sources: string[]) {
    const repo = repository();
    const project = createEmptyProject();
    const references: TextGeometryRef[] = [];
    for (const source of sources) {
      const stored = await storeTextGeometry(textGeometryFixture(source), { repository: repo });
      await repo.pinOwner(`document-${source}`, [stored.reference.contentHash]);
      await stored.lease.release();
      references.push(stored.reference);
      project.formulas.push(
        createTextFormula({ name: source, source, geometry: stored.reference }),
      );
    }
    return { repo, project, references };
  }

  it('is the plain project when no text has geometry', async () => {
    const project = createEmptyProject();
    project.formulas.push(createTextFormula({ source: 'not shaped yet' }));
    const repo = repository();
    const file = await prepareProjectFile(project, { repository: repo });
    expect(file.text).toBe(serializeProject(project));
    expect(file.missing).toEqual([]);
    await file.release();
    expect(await repo.listOwners()).toEqual([]);
  });

  it('carries each geometry in the bytes that are stored, and holds them until released', async () => {
    const { repo, project, references } = await holding('b', 'a');
    const file = await prepareProjectFile(project, { repository: repo });
    expect(file.missing).toEqual([]);
    const parsed = parseProject(file.text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project).toEqual(project);
    for (const reference of references) {
      const stored = await (await repo.requireOriginal(reference.contentHash)).text();
      expect(file.text).toContain(`    "${reference.contentHash}": ${stored}`);
    }
    // Whatever becomes of the document meanwhile, the file's geometry is still there.
    await repo.releaseOwner('document-a');
    await repo.releaseOwner('document-b');
    expect((await repo.collectUnowned()).removed).toBe(0);
    await file.release();
    expect((await repo.collectUnowned()).removed).toBe(2);
  });

  it('goes without a geometry that is not stored, or is not what the text names, and says which', async () => {
    const { repo, project, references } = await holding('kept', 'lost', 'other');
    await repo.releaseOwner('document-lost');
    await repo.collectUnowned([references[1]!.contentHash]);
    const renamed = project.formulas[2]!;
    if (renamed.kind !== 'text') throw new Error('Expected text');
    renamed.geometry = { ...references[2]!, key: 'another-render' };
    const file = await prepareProjectFile(project, { repository: repo });
    expect(file.missing.map((payload) => payload.name)).toEqual(['lost', 'other']);
    const parsed = parseProject(file.text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(Object.keys(parsed.textGeometry)).toEqual([references[0]!.contentHash]);
    expect(parsed.project).toEqual(project);
    await file.release();
  });

  it('refuses more geometry than a .mfe.json carries, before reading any of it', async () => {
    const project = createEmptyProject();
    const each = 16 * 1024 * 1024;
    const count = MAX_EMBEDDED_GEOMETRY_BYTES / each + 1;
    for (let i = 0; i < count; i++) {
      project.formulas.push(
        createTextFormula({
          name: `t${i}`,
          source: 'x',
          geometry: {
            contentHash: i.toString(16).padStart(64, '0'),
            byteLength: each,
            key: 'k',
            basisKey: 'b',
          },
        }),
      );
    }
    const released: string[] = [];
    const repo: OriginalMediaRepository = {
      getOriginal: () => Promise.reject(new Error('Nothing is read.')),
      requireOriginal: () => Promise.reject(new Error('Nothing is read.')),
      storeOriginal: () => Promise.reject(new Error('Nothing is stored.')),
      pinOwner: async () => undefined,
      pinAvailable: async () => [],
      releaseOwner: async (owner) => void released.push(owner),
    };
    await expect(prepareProjectFile(project, { repository: repo })).rejects.toMatchObject({
      code: 'too-large',
      message:
        'The appearance of its texts takes 80 MB, and a .mfe.json file carries up to 64 MB. ' +
        'It needs a .mfe package.',
    });
    expect(released).toHaveLength(1);
    // Save knows beforehand, from the references alone, and writes a package instead.
    expect(fitsProjectFile(project)).toBe(false);
    project.formulas.pop();
    expect(fitsProjectFile(project)).toBe(true);
  });
});

describe('the geometry a .mfe.json on disk still holds', () => {
  async function onDisk() {
    const title = await shaped('Title');
    const project = projectOf(['Title', title.reference]);
    const text = serializeProject(project, { [title.reference.contentHash]: title.value });
    return { title, wanted: projectPayloads(project), text };
  }

  it('comes back for a browser that lost it', async () => {
    const { title, wanted, text } = await onDisk();
    const fresh = repository();
    const found = await recoverEmbeddedTextGeometry(new Blob([text]), wanted, {
      repository: fresh,
    });
    expect(found).toMatchObject({ recovered: [title.reference.contentHash], unreadable: [] });
    expect(await loadTextGeometry(title.reference, { repository: fresh })).toEqual(title.artifact);
    await found.lease.release();
    expect((await fresh.collectUnowned()).removed).toBe(1);
  });

  it('holds nothing when it is no project, has no section or lacks the member', async () => {
    const { title, wanted, text } = await onDisk();
    const other = await shaped('other');
    const fresh = repository();
    const section = { [other.reference.contentHash]: other.value };
    for (const file of [
      '',
      'not json',
      '[1, 2]',
      JSON.stringify({ format: 'something-else', textGeometry: JSON.parse(text).textGeometry }),
      serializeProject(projectOf(['Title', title.reference])),
      serializeProject(projectOf(['Title', title.reference]), section),
    ]) {
      const found = await recoverEmbeddedTextGeometry(new Blob([file]), wanted, {
        repository: fresh,
      });
      expect(found).toMatchObject({ recovered: [], unreadable: [] });
      await found.lease.release();
    }
    expect(await fresh.listOwners()).toEqual([]);
  });

  it.each([
    [
      'changed by hand',
      (member: { glyphs: { label: string }[] }): unknown => ({
        ...member,
        glyphs: [{ ...member.glyphs[0]!, label: 'Titel' }],
      }),
    ],
    [
      'written again by a program that sorts keys',
      (member: Record<string, unknown>): unknown =>
        Object.fromEntries(Object.entries(member).sort(([a], [b]) => a.localeCompare(b))),
    ],
    [
      'of a later format this app does not read',
      (member: Record<string, unknown>): unknown => ({ ...member, version: 2 }),
    ],
  ] as const)(
    'tells a member it cannot take back, %s: the file may be its only copy',
    async (_how, change) => {
      const { title, wanted, text } = await onDisk();
      const file = JSON.parse(text);
      const hash = title.reference.contentHash;
      file.textGeometry[hash] = change(file.textGeometry[hash]);
      expect(JSON.stringify(file.textGeometry[hash])).not.toBe(JSON.stringify(title.value));
      const fresh = repository();
      const found = await recoverEmbeddedTextGeometry(new Blob([JSON.stringify(file)]), wanted, {
        repository: fresh,
      });
      expect(found).toMatchObject({ recovered: [], unreadable: [hash] });
      expect(await fresh.getOriginal(hash)).toBeNull();
    },
  );

  it('tells a member that is whole but is not the render the text names', async () => {
    const { title, text } = await onDisk();
    const wanted = projectPayloads(
      projectOf(['Title', { ...title.reference, key: 'another-render' }]),
    );
    const found = await recoverEmbeddedTextGeometry(new Blob([text]), wanted, {
      repository: repository(),
    });
    expect(found).toMatchObject({ recovered: [], unreadable: [title.reference.contentHash] });
  });

  it('rejects for a project file cut short: nobody knows what it still holds', async () => {
    const { wanted, text } = await onDisk();
    const fresh = repository();
    for (const damaged of [text.slice(0, -40), text.replace('"tracks"', 'tracks')]) {
      await expect(
        recoverEmbeddedTextGeometry(new Blob([damaged]), wanted, { repository: fresh }),
      ).rejects.toMatchObject({ code: 'corrupt' });
    }
    expect(await fresh.listOwners()).toEqual([]);
  });

  it('tells a member the store would not take: the file is then its only copy', async () => {
    const { title, wanted, text } = await onDisk();
    const fresh = repository();
    fresh.storeOriginal = () => Promise.reject(new MediaStorageError('quota', 'No room.'));
    const found = await recoverEmbeddedTextGeometry(new Blob([text]), wanted, {
      repository: fresh,
    });
    expect(found).toMatchObject({ recovered: [], unreadable: [title.reference.contentHash] });
  });

  it('rejects when the file cannot be read, and does not look into one too large to be a project', async () => {
    const { wanted, text } = await onDisk();
    const fresh = repository();
    const unreadable = new Blob([text]);
    unreadable.text = () => Promise.reject(new DOMException('Locked.', 'NotReadableError'));
    await expect(
      recoverEmbeddedTextGeometry(unreadable, wanted, { repository: fresh }),
    ).rejects.toMatchObject({ name: 'NotReadableError' });
    const huge = new Blob([text]);
    Object.defineProperty(huge, 'size', { value: MAX_PROJECT_FILE_BYTES + 1 });
    huge.text = () => Promise.reject(new Error('Not read.'));
    expect(await recoverEmbeddedTextGeometry(huge, wanted, { repository: fresh })).toMatchObject({
      recovered: [],
      unreadable: [],
    });
  });
});
