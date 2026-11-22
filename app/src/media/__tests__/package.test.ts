// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createAudioAsset, createEmptyProject, type Project } from '../../model';
import { UnopenedProjectError } from '../errors';
import { hashBlob, MEDIA_CHUNK_BYTES } from '../hash';
import { projectPayloads } from '../dependencies';
import {
  importPackage,
  MAX_MANIFEST_BYTES,
  MAX_PACKAGE_PAYLOADS,
  PACKAGE_HEADER_BYTES,
  preparePackage,
  readPackageManifest,
  recoverOriginals,
} from '../package';
import { IndexedDbMediaRepository } from '../repository';

function repository() {
  const factory = new IDBFactory();
  return new IndexedDbMediaRepository({ indexedDB: () => factory });
}

async function audioProject(repo = repository(), sources: Blob[] = [new Blob(['original bytes'])]) {
  const project = createEmptyProject('Portable audio');
  for (const [index, blob] of sources.entries()) {
    const original = await repo.storeOriginal(blob, { ownerId: 'current' });
    project.audioAssets.push(
      createAudioAsset({
        ...original,
        name: `Unused ${index}`,
        originalName: `source-${index}.mp3`,
        mimeType: 'audio/mpeg',
        duration: 3,
        sampleRate: 48000,
        channels: 2,
      }),
    );
  }
  return { project, repo };
}

async function replaceManifest(
  blob: Blob,
  change: (manifest: Record<string, unknown>) => void,
): Promise<Blob> {
  const bytes = new Uint8Array(await blob.slice(0, PACKAGE_HEADER_BYTES).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const end = PACKAGE_HEADER_BYTES + view.getUint32(12, true);
  const manifest = JSON.parse(await blob.slice(PACKAGE_HEADER_BYTES, end).text()) as Record<
    string,
    unknown
  >;
  change(manifest);
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  view.setUint32(12, json.length, true);
  return new Blob([bytes, json, blob.slice(end)]);
}

describe('portable .mfe packages', () => {
  it('round-trips unused and duplicate assets while storing original bytes once', async () => {
    const source = new Blob(['shared original']);
    const { repo, project } = await audioProject(repository(), [source, source]);
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    const summary = await readPackageManifest(blob);
    expect(summary.media).toHaveLength(1);
    expect(summary.parsed.project.audioAssets).toHaveLength(2);
    expect(blob.size - summary.payloadOffset).toBe(source.size);
    await repo.releaseOwner('current');
    expect((await repo.collectUnowned()).removed).toBe(0);
    const fresh = repository();
    const imported = await importPackage(blob, { repository: fresh });
    expect(imported.parsed.project).toEqual(project);
    const hash = project.audioAssets[0]!.contentHash;
    expect(await (await fresh.requireOriginal(hash)).text()).toBe('shared original');
    await prepared.release();
    expect((await repo.collectUnowned()).removed).toBe(1);
    expect((await fresh.collectUnowned()).removed).toBe(0);
    await imported.lease.release();
    expect((await fresh.collectUnowned()).removed).toBe(1);
  });

  it('ignores a textGeometry section inside its project: a package carries geometry as payloads', async () => {
    const { repo, project } = await audioProject();
    const prepared = await preparePackage(project, { repository: repo });
    for (const section of [[], null, { ['a'.repeat(64)]: { not: 'a payload' } }]) {
      const blob = await replaceManifest(prepared.toBlob(), (manifest) => {
        (manifest.project as Record<string, unknown>).textGeometry = section;
      });
      const imported = await importPackage(blob, { repository: repository() });
      expect(imported.parsed.project).toEqual(project);
      expect(imported.parsed.textGeometry).toEqual({});
      await imported.lease.release();
    }
    await prepared.release();
  });

  it('lists a package by bounded manifest reads without touching the payload', async () => {
    const { repo, project } = await audioProject();
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    const all = vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('Whole-file read'));
    const slice = vi.spyOn(blob, 'slice');
    const summary = await readPackageManifest(blob);
    expect(slice.mock.calls).toEqual([
      [0, PACKAGE_HEADER_BYTES],
      [PACKAGE_HEADER_BYTES, summary.payloadOffset],
    ]);
    expect(all).not.toHaveBeenCalled();
    await prepared.release();
  });

  it('streams under sink backpressure with bounded chunks and identical bytes', async () => {
    const original = new Blob([new Uint8Array(MEDIA_CHUNK_BYTES * 2 + 1).fill(27)]);
    const { repo, project } = await audioProject(repository(), [original]);
    const prepared = await preparePackage(project, { repository: repo });
    const chunks: BlobPart[] = [];
    let writes = 0;
    let active = 0;
    let peak = 0;
    await prepared.writeTo({
      async write(chunk) {
        writes++;
        active++;
        peak = Math.max(peak, active);
        expect(chunk.byteLength).toBeLessThanOrEqual(MEDIA_CHUNK_BYTES);
        await Promise.resolve();
        chunks.push(new Uint8Array(chunk));
        active--;
      },
    });
    expect(writes).toBeGreaterThan(3);
    expect(peak).toBe(1);
    expect(await hashBlob(new Blob(chunks))).toBe(await hashBlob(prepared.toBlob()));
    await prepared.release();
  });

  it('never prepares a complete save when an unused original is missing', async () => {
    const { repo, project } = await audioProject();
    await repo.releaseOwner('current');
    await repo.collectUnowned();
    await expect(preparePackage(project, { repository: repo })).rejects.toMatchObject({
      code: 'missing',
    });
  });

  it('refuses a media type that its reader cannot represent, before publishing a package', async () => {
    const { repo, project } = await audioProject();
    project.audioAssets[0]!.mimeType = 'x'.repeat(257);
    await expect(preparePackage(project, { repository: repo })).rejects.toMatchObject({
      code: 'corrupt',
    });
    expect((await repo.listOwners()).map((owner) => owner.id)).toEqual(['current']);
  });

  it('rejects a corrupt payload before publishing its source or project', async () => {
    const { repo, project } = await audioProject();
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    const damaged = new Blob([blob.slice(0, blob.size - 1), new Uint8Array([0xff])]);
    const fresh = repository();
    await expect(importPackage(damaged, { repository: fresh })).rejects.toMatchObject({
      code: 'corrupt',
    });
    expect(await fresh.listOwners()).toEqual([]);
    expect(await fresh.getOriginal(project.audioAssets[0]!.contentHash)).toBeNull();
    await prepared.release();
  });

  it.each([false, true])(
    'reclaims only failed-import bytes, preserving another owner (%s)',
    async (shared) => {
      const { repo, project } = await audioProject(repository(), [
        new Blob(['first original']),
        new Blob(['second original']),
      ]);
      const prepared = await preparePackage(project, { repository: repo });
      const blob = prepared.toBlob();
      const { media, payloadOffset } = await readPackageManifest(blob);
      const first = media[0]!;
      const fresh = repository();
      const unrelated = await fresh.storeOriginal(new Blob(['unrelated unowned source']), {
        ownerId: 'temporary',
      });
      await fresh.releaseOwner('temporary');
      if (shared) {
        await fresh.storeOriginal(blob.slice(payloadOffset, payloadOffset + first.byteLength), {
          ownerId: 'other-tab',
          expectedHash: first.contentHash,
        });
      }
      const corrupted = new Blob([blob.slice(0, blob.size - 1), new Uint8Array([0xff])]);
      await expect(importPackage(corrupted, { repository: fresh })).rejects.toMatchObject({
        code: 'corrupt',
      });
      expect((await fresh.getOriginal(first.contentHash)) !== null).toBe(shared);
      expect(await fresh.getOriginal(media[1]!.contentHash)).toBeNull();
      expect(await fresh.getOriginal(unrelated.contentHash)).not.toBeNull();
      expect((await fresh.listOwners()).map((owner) => owner.id)).toEqual(
        shared ? ['other-tab'] : [],
      );
      await prepared.release();
    },
  );

  it('preserves the corruption error when failed-import cleanup also fails', async () => {
    const { repo, project } = await audioProject(repository(), [new Blob(['a']), new Blob(['b'])]);
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    const fresh = repository();
    const cleanup = vi
      .spyOn(fresh, 'collectUnowned')
      .mockRejectedValue(new Error('Cleanup storage denied'));
    const corrupted = new Blob([blob.slice(0, blob.size - 1), new Uint8Array([0xff])]);
    await expect(importPackage(corrupted, { repository: fresh })).rejects.toMatchObject({
      code: 'corrupt',
      message: 'A project payload failed its content-integrity check.',
    });
    expect(cleanup).toHaveBeenCalledOnce();
    cleanup.mockRestore();
    await prepared.release();
  });

  it.each(['overlap', 'duplicate', 'unsafe-offset', 'missing', 'extra'] as const)(
    'rejects a %s media index',
    async (kind) => {
      const { repo, project } = await audioProject();
      const prepared = await preparePackage(project, { repository: repo });
      const damaged = await replaceManifest(prepared.toBlob(), (manifest) => {
        const media = manifest.media as {
          offset: number;
          byteLength: number;
          contentHash: string;
        }[];
        if (kind === 'overlap') media[0]!.offset = 1;
        if (kind === 'duplicate') media.push({ ...media[0]! });
        if (kind === 'unsafe-offset') media[0]!.byteLength = Number.MAX_SAFE_INTEGER;
        if (kind === 'missing') media.length = 0;
        if (kind === 'extra') (manifest.project as Project).audioAssets = [];
      });
      await expect(readPackageManifest(damaged)).rejects.toMatchObject({ code: 'corrupt' });
      await prepared.release();
    },
  );

  // The container is whole: what does not open is the project in it, and it is not damaged.
  it('says why the project of a whole package does not open, in the project’s own words', async () => {
    const { repo, project } = await audioProject();
    const prepared = await preparePackage(project, { repository: repo });
    const failure = (blob: Blob) => readPackageManifest(blob).catch((error: unknown) => error);

    const newer = await replaceManifest(prepared.toBlob(), (manifest) => {
      (manifest.project as { version: number }).version = 99;
    });
    const refused = (await failure(newer)) as UnopenedProjectError;
    expect(refused).toBeInstanceOf(UnopenedProjectError);
    expect(refused.code).toBe('unsupported');
    expect(refused.message).toMatch(
      /^The project was saved by a newer version of the app \(format 99; this app reads up to \d+\)\.$/,
    );
    expect(refused.details).toEqual([]);
    // Opening it fails the same way, before anything is stored.
    const store = vi.spyOn(repo, 'storeOriginal');
    await expect(importPackage(newer, { repository: repo })).rejects.toBeInstanceOf(
      UnopenedProjectError,
    );
    expect(store).not.toHaveBeenCalled();

    // With a field out of place: where it is travels with the reason.
    const malformed = await replaceManifest(prepared.toBlob(), (manifest) => {
      (manifest.project as { meta: { fps: unknown } }).meta.fps = 'fast';
    });
    const bad = (await failure(malformed)) as UnopenedProjectError;
    expect(bad).toBeInstanceOf(UnopenedProjectError);
    expect(bad.message).toBe('The project file is malformed.');
    expect(bad.details.join('\n')).toMatch(/meta\.fps/);

    // What is no project of this app is a package that is not one: that one is damaged.
    const foreign = await replaceManifest(prepared.toBlob(), (manifest) => {
      manifest.project = { format: 'other', version: 1 };
    });
    const damaged = (await failure(foreign)) as Error & { code: string };
    expect(damaged).not.toBeInstanceOf(UnopenedProjectError);
    expect(damaged.code).toBe('corrupt');
    expect(damaged.message).toBe(
      'The .mfe project is damaged or unsupported: This is not a Manim Formula Editor project.',
    );
    await prepared.release();
  });

  it('rejects truncated/trailing bytes and oversized manifest declarations before reading them', async () => {
    const { repo, project } = await audioProject();
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    await expect(readPackageManifest(blob.slice(0, blob.size - 1))).rejects.toMatchObject({
      code: 'corrupt',
    });
    await expect(readPackageManifest(new Blob([blob, 'extra']))).rejects.toMatchObject({
      code: 'corrupt',
    });
    const header = new Uint8Array(await blob.slice(0, PACKAGE_HEADER_BYTES).arrayBuffer());
    new DataView(header.buffer).setUint32(12, MAX_MANIFEST_BYTES + 1, true);
    const oversized = new Blob([header, blob.slice(PACKAGE_HEADER_BYTES)]);
    const slice = vi.spyOn(oversized, 'slice');
    await expect(readPackageManifest(oversized)).rejects.toMatchObject({ code: 'corrupt' });
    expect(slice).toHaveBeenCalledTimes(1);
    await prepared.release();
  });
});

/** A project of two recordings whose browser lost the second one. */
async function incompleteProject() {
  const kept = new Blob(['kept original']);
  const lost = new Blob(['lost original']);
  const { repo, project } = await audioProject(repository(), [kept, lost]);
  const [keptHash, lostHash] = [await hashBlob(kept), await hashBlob(lost)];
  await repo.pinOwner('current', [keptHash]);
  await repo.collectUnowned();
  return { repo, project, keptHash, lostHash };
}

describe('packages without the originals that are missing', () => {
  it('are refused unless the caller allows them', async () => {
    const { repo, project } = await incompleteProject();
    await expect(preparePackage(project, { repository: repo })).rejects.toMatchObject({
      code: 'missing',
    });
    expect((await repo.listOwners()).map((owner) => owner.id)).toEqual(['current']);
  });

  it('carry the rest, list what they lack, and open with the whole project', async () => {
    const { repo, project, keptHash, lostHash } = await incompleteProject();
    const prepared = await preparePackage(project, { repository: repo, allowMissing: true });
    expect(prepared.missing.map((payload) => payload.contentHash)).toEqual([lostHash]);
    expect(prepared.missing[0]).toMatchObject({ role: 'audio-source', name: 'Unused 1' });
    const blob = prepared.toBlob();
    await prepared.release();

    const manifest = await readPackageManifest(blob);
    expect(manifest.missing).toEqual([lostHash]);
    expect(manifest.media.map((entry) => entry.contentHash)).toEqual([keptHash]);
    expect(manifest.parsed.project.audioAssets.map((asset) => asset.contentHash)).toEqual([
      keptHash,
      lostHash,
    ]);

    const fresh = repository();
    const imported = await importPackage(blob, { repository: fresh });
    expect(imported.parsed.project.audioAssets).toEqual(project.audioAssets);
    expect(await (await fresh.requireOriginal(keptHash)).text()).toBe('kept original');
    expect(await fresh.getOriginal(lostHash)).toBeNull();
    await imported.lease.release();
  });

  it('are written like any package when nothing is missing', async () => {
    const { repo, project } = await audioProject(repository(), [new Blob(['a']), new Blob(['b'])]);
    const strict = await preparePackage(project, { repository: repo });
    const lenient = await preparePackage(project, { repository: repo, allowMissing: true });
    expect(lenient.missing).toEqual([]);
    expect(new Uint8Array(await lenient.toBlob().arrayBuffer())).toEqual(
      new Uint8Array(await strict.toBlob().arrayBuffer()),
    );
    expect((await readPackageManifest(strict.toBlob())).missing).toEqual([]);
    expect(await strict.toBlob().text()).not.toContain('"missing"');
    await strict.release();
    await lenient.release();
  });

  it.each([
    ['is not a list', () => 'all of them'],
    ['holds something that is not a hash', () => ['lost']],
    ['repeats a hash', (lost: string) => [lost, lost]],
    ['is not sorted', (lost: string) => [lost, '0'.repeat(64)]],
    ['names a payload the package carries', (lost: string, kept: string) => [kept, lost].sort()],
    ['names a payload the project does not use', (lost: string) => [lost, 'f'.repeat(64)].sort()],
    ['leaves out a payload that is absent', () => []],
    ['is gone although a payload is absent', () => undefined],
  ] as const)('are rejected when their list of missing payloads %s', async (_, list) => {
    const { repo, project, keptHash, lostHash } = await incompleteProject();
    const prepared = await preparePackage(project, { repository: repo, allowMissing: true });
    const damaged = await replaceManifest(prepared.toBlob(), (manifest) => {
      manifest.missing = list(lostHash, keptHash);
    });
    await expect(readPackageManifest(damaged)).rejects.toMatchObject({ code: 'corrupt' });
    await prepared.release();
  });
});

describe('originals brought back from a package', () => {
  it('are the wanted ones that it carries, under a lease of their own', async () => {
    const { repo, project } = await audioProject(repository(), [
      new Blob(['first']),
      new Blob(['second']),
    ]);
    const [first, second] = projectPayloads(project);
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    await prepared.release();

    const fresh = repository();
    const { lease, recovered, unreadable } = await recoverOriginals(
      blob,
      [
        first!,
        first!,
        // Not in this package, and one it carries under another size: neither is this file's.
        { ...first!, contentHash: 'f'.repeat(64) },
        { ...second!, byteLength: second!.byteLength + 1 },
      ],
      { repository: fresh },
    );
    expect(recovered).toEqual([first!.contentHash]);
    expect(unreadable).toEqual([]);
    expect(await (await fresh.requireOriginal(first!.contentHash)).text()).toBe('first');
    expect(await fresh.getOriginal(second!.contentHash)).toBeNull();
    expect(await fresh.listOwners()).toMatchObject([
      { id: lease.ownerId, hashes: [first!.contentHash] },
    ]);
    await lease.release();
    expect((await fresh.collectUnowned()).removed).toBe(1);
  });

  it('tells which ones the package carries but could not give back, and keeps the others', async () => {
    const { repo, project } = await audioProject(repository(), [
      new Blob(['first']),
      new Blob(['second']),
    ]);
    const wanted = projectPayloads(project);
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    await prepared.release();
    // The payloads are stored in hash order: damage the last byte of the last one.
    const last = [...wanted].sort((x, y) => (x.contentHash < y.contentHash ? -1 : 1)).at(-1)!;
    const other = wanted.find((payload) => payload !== last)!;
    const corrupted = new Blob([blob.slice(0, blob.size - 1), new Uint8Array([0xff])]);
    const fresh = repository();
    const found = await recoverOriginals(corrupted, wanted, { repository: fresh });
    expect(found.recovered).toEqual([other.contentHash]);
    expect(found.unreadable).toEqual([last.contentHash]);
    expect(await fresh.getOriginal(last.contentHash)).toBeNull();
    expect(await fresh.listOwners()).toMatchObject([
      { id: found.lease.ownerId, hashes: [other.contentHash] },
    ]);

    // The store refuses one (no room): the same answer, for another reason.
    const full = repository();
    const store = full.storeOriginal.bind(full);
    vi.spyOn(full, 'storeOriginal').mockImplementation(async (original, options) => {
      if (options.expectedHash === other.contentHash)
        throw new DOMException('Quota exhausted', 'QuotaExceededError');
      return store(original, options);
    });
    const partial = await recoverOriginals(blob, wanted, { repository: full });
    expect(partial.recovered).toEqual([last.contentHash]);
    expect(partial.unreadable).toEqual([other.contentHash]);
  });

  it('are not looked for in a file that is not a package, and a cancellation stores nothing', async () => {
    const { repo, project } = await audioProject();
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    await prepared.release();
    const wanted = projectPayloads(project);
    const fresh = repository();
    await expect(
      recoverOriginals(new Blob(['{"version":17}']), wanted, { repository: fresh }),
    ).rejects.toMatchObject({ code: 'corrupt' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      recoverOriginals(blob, wanted, { repository: fresh, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(await fresh.listOwners()).toEqual([]);
    expect(await fresh.getOriginal(wanted[0]!.contentHash)).toBeNull();
  });
});

/** A project that declares `count` recordings of one byte each, and its package as a reader
 * meets it: the payload bytes are not what their hashes say, which only an import would see. */
function manyPayloads(count: number, missing = 0) {
  const project = createEmptyProject('Many payloads');
  const hashes = Array.from({ length: count }, (_, index) => index.toString(16).padStart(64, '0'));
  for (const contentHash of hashes) {
    project.audioAssets.push(
      createAudioAsset({
        contentHash,
        byteLength: 1,
        name: 'Tiny',
        originalName: 'tiny.wav',
        mimeType: 'audio/wav',
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
  }
  const carried = hashes.slice(missing);
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      format: 'manim-formula-editor-package',
      version: 1,
      project,
      media: carried.map((contentHash, offset) => ({
        contentHash,
        byteLength: 1,
        offset,
        mimeType: 'audio/wav',
      })),
      ...(missing ? { missing: hashes.slice(0, missing) } : {}),
    }),
  );
  const header = new Uint8Array(PACKAGE_HEADER_BYTES);
  header.set(new TextEncoder().encode('MFEPACK\n'));
  const view = new DataView(header.buffer);
  view.setUint32(8, 1, true);
  view.setUint32(12, manifest.length, true);
  return { project, blob: new Blob([header, manifest, new Uint8Array(carried.length)]) };
}

describe('the number of payloads of a package', () => {
  it('is bounded for the reader, before anything is imported', async () => {
    const full = manyPayloads(MAX_PACKAGE_PAYLOADS);
    expect((await readPackageManifest(full.blob)).media).toHaveLength(MAX_PACKAGE_PAYLOADS);

    const hostile = manyPayloads(MAX_PACKAGE_PAYLOADS + 1);
    await expect(readPackageManifest(hostile.blob)).rejects.toMatchObject({
      code: 'corrupt',
      message: expect.stringContaining(`more than ${MAX_PACKAGE_PAYLOADS} payloads`),
    });
    const fresh = repository();
    const stored = vi.spyOn(fresh, 'storeOriginal');
    await expect(importPackage(hostile.blob, { repository: fresh })).rejects.toMatchObject({
      code: 'corrupt',
    });
    expect(stored).not.toHaveBeenCalled();
  });

  it('counts the payloads a package lists as missing', async () => {
    const most = manyPayloads(MAX_PACKAGE_PAYLOADS, 10);
    expect((await readPackageManifest(most.blob)).missing).toHaveLength(10);
    await expect(
      readPackageManifest(manyPayloads(MAX_PACKAGE_PAYLOADS + 1, 10).blob),
    ).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('is bounded for the writer too: no save produces a file that cannot be opened', async () => {
    const repo = repository();
    const pinned = vi.spyOn(repo, 'pinOwner');
    const { project } = manyPayloads(MAX_PACKAGE_PAYLOADS + 1);
    for (const allowMissing of [false, true]) {
      await expect(
        preparePackage(project, { repository: repo, allowMissing }),
      ).rejects.toMatchObject({
        code: 'corrupt',
        message: expect.stringContaining(`more than ${MAX_PACKAGE_PAYLOADS} payloads`),
      });
    }
    expect(pinned).not.toHaveBeenCalled();
    expect(await repo.listOwners()).toEqual([]);
  });
});
