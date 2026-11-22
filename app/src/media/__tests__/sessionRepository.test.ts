// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  createAudioAsset,
  createEmptyProject,
  createTextFormula,
  parseProject,
  TEXT_GEOMETRY_MIME_TYPE,
} from '../../model';
import { textGeometryFixture } from '../../model/__tests__/textFixtures';
import { derivedMediaHashes } from '../dependencies';
import { importEmbeddedTextGeometry, prepareProjectFile } from '../embeddedGeometry';
import { hashBlob } from '../hash';
import { pinAvailableProjectMedia, projectMediaHashes } from '../ownership';
import { IndexedDbMediaRepository } from '../repository';
import { SessionFallbackRepository } from '../sessionRepository';
import { loadTextGeometry, storeTextGeometry } from '../textGeometry';

/** A page whose browser has no database: every transaction is refused. */
const withoutDatabase = () =>
  new SessionFallbackRepository(new IndexedDbMediaRepository({ indexedDB: () => undefined }));

function withDatabase() {
  const factory = new IDBFactory();
  const durable = new IndexedDbMediaRepository({ indexedDB: () => factory });
  return { durable, repository: new SessionFallbackRepository(durable) };
}

const derived = (text: string) => new Blob([text], { type: TEXT_GEOMETRY_MIME_TYPE });

describe('the media store where the browser has no database', () => {
  it('keeps derived data in memory, under the rules of the database', async () => {
    const repository = withoutDatabase();
    const blob = derived('{"derived":true}');
    const hash = await hashBlob(blob);
    const stored = await repository.storeOriginal(blob, { ownerId: 'import', derived: true });
    expect(stored).toEqual({ contentHash: hash, byteLength: blob.size });
    expect(await (await repository.requireOriginal(hash)).text()).toBe('{"derived":true}');
    expect(await repository.getOriginal(hash)).not.toBeNull();
    expect(await repository.missingOriginals([hash])).toEqual([]);
    // Another owner takes it over; the first one lets go; it stays while someone holds it.
    expect(await repository.pinAvailable('document', [hash])).toEqual([]);
    await repository.pinOwner('save', [hash]);
    await repository.releaseOwner('import');
    await repository.releaseOwner('save');
    expect(await repository.collectUnowned()).toEqual({ removed: 0, bytes: 0 });
    await repository.pinAvailable('document', []);
    expect(await repository.collectUnowned([hash])).toEqual({ removed: 1, bytes: blob.size });
    await expect(repository.getOriginal(hash)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('checks what it is given against the hash it is given for', async () => {
    const repository = withoutDatabase();
    await expect(
      repository.storeOriginal(derived('{}'), {
        ownerId: 'import',
        derived: true,
        expectedHash: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(await repository.collectUnowned()).toEqual({ removed: 0, bytes: 0 });
  });

  it('does not take a recording: its bytes would exist nowhere else', async () => {
    const repository = withoutDatabase();
    const recording = new Blob(['RIFF'], { type: 'audio/wav' });
    await expect(repository.storeOriginal(recording, { ownerId: 'import' })).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(repository.getOriginal(await hashBlob(recording))).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('cannot answer for what is not in memory, and leaves its owners as they were', async () => {
    const repository = withoutDatabase();
    const held = derived('{"held":1}');
    const { contentHash } = await repository.storeOriginal(held, {
      ownerId: 'document',
      derived: true,
    });
    const elsewhere = 'b'.repeat(64);
    for (const pin of [
      () => repository.pinAvailable('document', [contentHash, elsewhere]),
      () => repository.pinOwner('document', [contentHash, elsewhere]),
      () => repository.pinAvailable('document', [elsewhere]),
    ]) {
      await expect(pin()).rejects.toMatchObject({ code: 'unavailable' });
    }
    await expect(repository.missingOriginals([contentHash, elsewhere])).rejects.toMatchObject({
      code: 'unavailable',
    });
    // The refused pins changed nothing: the document still holds what it held.
    expect(await repository.collectUnowned()).toEqual({ removed: 0, bytes: 0 });
    expect(await repository.getOriginal(contentHash)).not.toBeNull();
  });

  it('opens, draws and saves a project with font text from its file alone', async () => {
    // Somewhere with a database, the text was shaped and its project saved.
    const author = withDatabase().repository;
    const shaped = await storeTextGeometry(textGeometryFixture('Title'), { repository: author });
    const project = createEmptyProject('Titles');
    project.formulas.push(createTextFormula({ source: 'Title', geometry: shaped.reference }));
    const saved = await prepareProjectFile(project, { repository: author });
    await saved.release();

    const repository = withoutDatabase();
    const parsed = parseProject(saved.text);
    if (!parsed.ok) throw new Error(parsed.error);
    const opened = await importEmbeddedTextGeometry(parsed.project, parsed.textGeometry, {
      repository,
    });
    expect(opened).toMatchObject({ imported: [shaped.reference.contentHash], refused: [] });
    // The document takes it over, as the open flow does.
    expect(await repository.pinAvailable('history', [shaped.reference.contentHash])).toEqual([]);
    await opened.lease.release();
    expect(await loadTextGeometry(shaped.reference, { repository })).toEqual(shaped.artifact);
    const again = await prepareProjectFile(parsed.project, { repository });
    expect(again.missing).toEqual([]);
    expect(again.text).toBe(saved.text);
    await again.release();

    // A text shaped here by the companion is kept the same way.
    const here = await storeTextGeometry(textGeometryFixture('Subtitle'), { repository });
    expect(await loadTextGeometry(here.reference, { repository })).toEqual(here.artifact);
    // And a text whose geometry is in no file and no memory is a text without it, not an error
    // about the browser.
    const lost = { ...here.reference, contentHash: 'c'.repeat(64) };
    await expect(loadTextGeometry(lost, { repository })).rejects.toMatchObject({
      code: 'missing',
    });
  });
});

describe('what the page keeps in memory', () => {
  it('is collected as a whole where there is no database: the pass finds no owners there', async () => {
    const repository = withoutDatabase();
    const kept = await repository.storeOriginal(derived('{"kept":1}'), {
      ownerId: 'history',
      derived: true,
    });
    const dropped = await repository.storeOriginal(derived('{"dropped":1}'), {
      ownerId: 'history',
      derived: true,
    });
    // The document moved on from one of them.
    await repository.pinAvailable('history', [kept.contentHash], new Set([kept.contentHash]));
    // The collection pass, as `ui/project/mediaCollection.ts` runs it.
    const owners = await repository.listOwners();
    expect(owners).toEqual([]);
    expect(await repository.releaseUnchanged(owners)).toEqual([]);
    expect(await repository.collectUnowned()).toEqual({ removed: 1, bytes: dropped.byteLength });
    expect(await repository.getOriginal(kept.contentHash)).not.toBeNull();
  });

  it('is not owned again by a pin that a release overtook', async () => {
    let refuse = true;
    const factory = new IDBFactory();
    const durable = new IndexedDbMediaRepository({
      indexedDB: () => (refuse ? undefined : factory),
    });
    const repository = new SessionFallbackRepository(durable);
    const { contentHash } = await repository.storeOriginal(derived('{"n":1}'), {
      ownerId: 'first',
      derived: true,
    });
    refuse = false;
    // A save pins what it captured; before the database answers, the save is over.
    const pinning = repository.pinAvailable('save', [contentHash]);
    const releasing = repository.releaseOwner('save');
    await Promise.all([pinning, releasing]);
    await repository.releaseOwner('first');
    expect(await repository.collectUnowned()).toEqual({ removed: 1, bytes: 7 });
  });

  it('follows the last of two pins of one owner, whichever the database answers first', async () => {
    let refuse = true;
    const factory = new IDBFactory();
    const durable = new IndexedDbMediaRepository({
      indexedDB: () => (refuse ? undefined : factory),
    });
    const repository = new SessionFallbackRepository(durable);
    const store = (text: string) =>
      repository.storeOriginal(derived(text), { ownerId: 'import', derived: true });
    const [a, b] = [await store('{"n":"a"}'), await store('{"n":"b"}')];
    refuse = false;
    await Promise.all([
      repository.pinAvailable('history', [a.contentHash]),
      repository.pinAvailable('history', [b.contentHash]),
    ]);
    await repository.releaseOwner('import');
    await repository.collectUnowned();
    expect(await repository.getOriginal(a.contentHash)).toBeNull();
    expect(await repository.getOriginal(b.contentHash)).not.toBeNull();
  });
});

describe('a project with a text whose geometry is nowhere, where the browser has no database', () => {
  it('is told which geometry is missing, and saves without it', async () => {
    const repository = withoutDatabase();
    const kept = await storeTextGeometry(textGeometryFixture('kept'), { repository });
    const project = createEmptyProject('Titles');
    const lost = { ...kept.reference, contentHash: 'c'.repeat(64) };
    project.formulas.push(
      createTextFormula({ name: 'kept', source: 'kept', geometry: kept.reference }),
      createTextFormula({ name: 'lost', source: 'lost', geometry: lost }),
    );
    // The document's owner and the autosave's: both learn what is not there, and hold the rest.
    const derived = derivedMediaHashes(project);
    expect([...derived].sort()).toEqual([kept.reference.contentHash, lost.contentHash].sort());
    expect(await repository.pinAvailable('history', projectMediaHashes(project), derived)).toEqual([
      lost.contentHash,
    ]);
    await kept.lease.release();
    expect(await repository.collectUnowned()).toEqual({ removed: 0, bytes: 0 });
    const pinned = await pinAvailableProjectMedia(project, 'save', repository);
    expect(pinned.missing).toEqual([lost.contentHash]);
    await pinned.release();
    // Save goes on to ask the user about the missing one.
    const file = await prepareProjectFile(project, { repository });
    expect(file.missing.map((payload) => payload.name)).toEqual(['lost']);
    const parsed = parseProject(file.text);
    expect(parsed.ok && Object.keys(parsed.textGeometry)).toEqual([kept.reference.contentHash]);
    await file.release();
  });

  it('still cannot answer for a recording: nobody knows whether it is stored', async () => {
    const repository = withoutDatabase();
    const project = createEmptyProject('Lecture');
    const recording = 'd'.repeat(64);
    project.audioAssets.push(
      createAudioAsset({
        name: 'voice',
        originalName: 'voice.wav',
        mimeType: 'audio/wav',
        contentHash: recording,
        byteLength: 4,
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    expect(derivedMediaHashes(project).size).toBe(0);
    await expect(
      repository.pinAvailable('history', projectMediaHashes(project), derivedMediaHashes(project)),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await expect(pinAvailableProjectMedia(project, 'save', repository)).rejects.toMatchObject({
      code: 'unavailable',
    });
    // Not even with a text beside it: one unknown is enough.
    const text = await storeTextGeometry(textGeometryFixture('title'), { repository });
    project.formulas.push(createTextFormula({ source: 'title', geometry: text.reference }));
    await expect(pinAvailableProjectMedia(project, 'save', repository)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('never calls derived what a recording also is', () => {
    const project = createEmptyProject();
    const hash = 'e'.repeat(64);
    project.formulas.push(
      createTextFormula({
        source: 'x',
        geometry: { contentHash: hash, byteLength: 4, key: 'k', basisKey: 'b' },
      }),
    );
    project.audioAssets.push(
      createAudioAsset({
        name: 'same bytes',
        originalName: 'same.wav',
        mimeType: 'audio/wav',
        contentHash: hash,
        byteLength: 4,
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    expect(derivedMediaHashes(project).size).toBe(0);
  });
});

describe('the media store where the browser has a database', () => {
  it('is the database: nothing stays in memory', async () => {
    const { durable, repository } = withDatabase();
    const blob = derived('{"derived":true}');
    const { contentHash } = await repository.storeOriginal(blob, {
      ownerId: 'import',
      derived: true,
    });
    expect(await durable.getOriginal(contentHash)).not.toBeNull();
    expect((await repository.listOwners()).map((owner) => owner.id)).toEqual(['import']);
    expect(await repository.pinAvailable('document', [contentHash, 'd'.repeat(64)])).toEqual([
      'd'.repeat(64),
    ]);
    await expect(repository.pinOwner('save', ['d'.repeat(64)])).rejects.toMatchObject({
      code: 'missing',
    });
    await repository.releaseOwner('import');
    expect(await repository.missingOriginals([contentHash])).toEqual([]);
    const [document] = await repository.listOwners();
    expect(await repository.releaseUnchanged([document!])).toEqual(['document']);
    expect(await repository.collectUnowned()).toEqual({ removed: 1, bytes: blob.size });
    expect(await repository.getOriginal(contentHash)).toBeNull();
  });

  it('holds in memory what the database refused once, beside what the database holds', async () => {
    let refuse = true;
    const factory = new IDBFactory();
    const durable = new IndexedDbMediaRepository({
      indexedDB: () => (refuse ? undefined : factory),
    });
    const repository = new SessionFallbackRepository(durable);
    const first = await repository.storeOriginal(derived('{"n":1}'), {
      ownerId: 'document',
      derived: true,
    });
    refuse = false;
    const second = await repository.storeOriginal(derived('{"n":2}'), {
      ownerId: 'document',
      derived: true,
    });
    expect(await durable.getOriginal(first.contentHash)).toBeNull();
    expect(await durable.getOriginal(second.contentHash)).not.toBeNull();
    // One owner, two places: each side holds its own.
    expect(
      await repository.pinAvailable('document', [first.contentHash, second.contentHash]),
    ).toEqual([]);
    expect((await durable.listOwners())[0]!.hashes).toEqual([second.contentHash]);
    expect(await repository.collectUnowned()).toEqual({ removed: 0, bytes: 0 });
    await repository.releaseOwner('document');
    expect((await repository.collectUnowned()).removed).toBe(2);
  });
});
