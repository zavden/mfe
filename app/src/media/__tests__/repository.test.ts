// @vitest-environment node
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashBlob } from '../hash';
import { IndexedDbMediaRepository } from '../repository';

afterEach(() => vi.restoreAllMocks());

function repositories() {
  const factory = new IDBFactory();
  const options = { indexedDB: () => factory };
  return [new IndexedDbMediaRepository(options), new IndexedDbMediaRepository(options)] as const;
}

describe('durable original-media ownership', () => {
  it('reopens immutable originals across repository instances and shares duplicate bytes', async () => {
    const [first, second] = repositories();
    const blob = new Blob(['original'], { type: 'audio/mpeg' });
    const saved = await first.storeOriginal(blob, { ownerId: 'tab-a' });
    expect(await second.storeOriginal(blob, { ownerId: 'tab-b' })).toEqual(saved);
    expect(await (await second.requireOriginal(saved.contentHash)).text()).toBe('original');
    await first.releaseOwner('tab-a');
    expect(await second.collectUnowned()).toEqual({ removed: 0, bytes: 0 });
    await second.releaseOwner('tab-b');
    expect(await first.collectUnowned()).toEqual({ removed: 1, bytes: blob.size });
  });

  it('retains history, recovery and pending saves until every owner releases', async () => {
    const [repository, otherTab] = repositories();
    const { contentHash } = await repository.storeOriginal(new Blob(['sound']), {
      ownerId: 'import',
    });
    for (const owner of ['history', 'recovery', 'pending-save'])
      await repository.pinOwner(owner, [contentHash]);
    await repository.releaseOwner('import');
    await repository.releaseOwner('history');
    await repository.releaseOwner('recovery');
    expect((await otherTab.collectUnowned()).removed).toBe(0);
    expect((await otherTab.listOwners()).map((owner) => owner.id)).toEqual(['pending-save']);
    await repository.releaseOwner('pending-save');
    expect((await otherTab.collectUnowned()).removed).toBe(1);
  });

  it('releases listed owners only while they are as they were listed', async () => {
    const [repository, otherTab] = repositories();
    const { contentHash } = await repository.storeOriginal(new Blob(['sound']), {
      ownerId: 'history:s_a:1',
    });
    await repository.pinOwner('history:s_b:1', [contentHash]);
    const listed = await otherTab.listOwners();
    // The page of the first owner was there after all: it wrote its owner again.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await repository.pinOwner('history:s_a:1', [contentHash]);
    expect(
      await otherTab.releaseUnchanged([
        ...listed,
        { id: 'history:s_never:1', hashes: [], updatedAt: 1 },
      ]),
    ).toEqual(['history:s_b:1']);
    expect((await repository.listOwners()).map((owner) => owner.id)).toEqual(['history:s_a:1']);
    expect((await otherTab.collectUnowned()).removed).toBe(0);
    expect(await otherTab.releaseUnchanged([])).toEqual([]);
  });

  it('does not replace an existing owner when any requested original is missing', async () => {
    const [repository] = repositories();
    const { contentHash } = await repository.storeOriginal(new Blob(['existing']), {
      ownerId: 'history',
    });
    await expect(
      repository.pinOwner('history', [contentHash, '0'.repeat(64)]),
    ).rejects.toMatchObject({ code: 'missing' });
    expect((await repository.listOwners())[0]?.hashes).toEqual([contentHash]);
    expect((await repository.collectUnowned()).removed).toBe(0);
  });

  it('pins what exists of a set and tells what does not, when asked to', async () => {
    const [repository, otherTab] = repositories();
    const { contentHash } = await repository.storeOriginal(new Blob(['existing']), {
      ownerId: 'import',
    });
    const lost = ['f'.repeat(64), '0'.repeat(64)];
    expect(await repository.pinAvailable('history', [...lost, contentHash, contentHash])).toEqual(
      [...lost].sort(),
    );
    expect((await otherTab.listOwners()).find((owner) => owner.id === 'history')?.hashes).toEqual([
      contentHash,
    ]);
    await repository.releaseOwner('import');
    expect((await otherTab.collectUnowned()).removed).toBe(0);
    // Nothing of it is stored: the owner exists, and holds nothing.
    expect(await repository.pinAvailable('recovery', lost)).toEqual([...lost].sort());
    expect((await otherTab.listOwners()).find((owner) => owner.id === 'recovery')?.hashes).toEqual(
      [],
    );
    expect(await repository.pinAvailable('history', [contentHash])).toEqual([]);
  });

  it('tells which originals are not stored, without owning anything', async () => {
    const [repository] = repositories();
    const { contentHash } = await repository.storeOriginal(new Blob(['existing']), {
      ownerId: 'import',
    });
    const lost = ['f'.repeat(64), '0'.repeat(64)];
    expect(await repository.missingOriginals([lost[0]!, contentHash, lost[1]!, lost[0]!])).toEqual(
      [...lost].sort(),
    );
    expect(await repository.missingOriginals([contentHash])).toEqual([]);
    expect(await repository.missingOriginals([])).toEqual([]);
    expect((await repository.listOwners()).map((owner) => owner.id)).toEqual(['import']);
    await expect(repository.missingOriginals(['not a hash'])).rejects.toMatchObject({
      code: 'corrupt',
    });
  });

  it('rejects quota failures without a false durable original or partial owner', async () => {
    const [repository] = repositories();
    const blob = new Blob(['quota']);
    const hash = await hashBlob(blob);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      ...args
    ) {
      if (this.name === 'owners') throw new DOMException('Quota exhausted', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await expect(repository.storeOriginal(blob, { ownerId: 'import' })).rejects.toMatchObject({
      code: 'quota',
    });
    expect(await repository.getOriginal(hash)).toBeNull();
    expect(await repository.listOwners()).toEqual([]);
  });

  it('reports unavailable storage and refuses a forged declared identity', async () => {
    const unavailable = new IndexedDbMediaRepository({ indexedDB: () => undefined });
    await expect(unavailable.getOriginal('0'.repeat(64))).rejects.toMatchObject({
      code: 'unavailable',
    });
    const [repository] = repositories();
    await expect(
      repository.storeOriginal(new Blob(['real bytes']), {
        ownerId: 'import',
        expectedHash: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(await repository.listOwners()).toEqual([]);
  });
});
