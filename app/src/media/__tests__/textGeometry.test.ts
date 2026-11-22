// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, createTextFormula } from '../../model';
import { textGeometryFixture } from '../../model/__tests__/textFixtures';
import { projectMediaHashes } from '../ownership';
import { importPackage, preparePackage, readPackageManifest } from '../package';
import { IndexedDbMediaRepository } from '../repository';
import {
  discardTextGeometry,
  loadTextGeometry,
  readTextGeometryBlob,
  storeTextGeometry,
} from '../textGeometry';
import { hashBlob } from '../hash';
import { TEXT_GEOMETRY_MIME_TYPE, validateTextGeometryArtifact } from '../../model';

function repository() {
  const factory = new IDBFactory();
  return new IndexedDbMediaRepository({ indexedDB: () => factory });
}

describe('owned text geometry', () => {
  it('round-trips shared text-only packages into a fresh repository without fonts or renderer', async () => {
    const repo = repository();
    const artifact = textGeometryFixture('office');
    const stored = await storeTextGeometry(artifact, { repository: repo });
    const project = createEmptyProject();
    project.formulas.push(
      createTextFormula({
        source: 'office',
        font: artifact.basis.font,
        geometry: stored.reference,
      }),
      createTextFormula({
        name: 'p2',
        source: 'newer source',
        font: artifact.basis.font,
        geometry: stored.reference,
      }),
    );
    await repo.pinOwner('history', projectMediaHashes(project));
    await stored.lease.release();
    const prepared = await preparePackage(project, { repository: repo });
    const blob = prepared.toBlob();
    const manifest = await readPackageManifest(blob);
    expect(manifest.media).toHaveLength(1);
    expect(manifest.parsed.project.audioAssets).toEqual([]);
    const fresh = repository();
    const imported = await importPackage(blob, { repository: fresh });
    expect(imported.parsed.project).toEqual(project);
    expect(await loadTextGeometry(stored.reference, { repository: fresh })).toEqual(artifact);
    // The stale artifact preserves its old source basis, without overwriting new authored text.
    expect(imported.parsed.project.formulas[1]!.source).toBe('newer source');
    await prepared.release();
    await imported.lease.release();
  });

  it('retains leased results until handoff and collects only discarded touched bytes', async () => {
    const repo = repository();
    const first = await storeTextGeometry(textGeometryFixture('first'), { repository: repo });
    const abandoned = await storeTextGeometry(textGeometryFixture('abandoned'), {
      repository: repo,
    });
    await repo.pinOwner('other-tab', [first.reference.contentHash]);
    await first.lease.release();
    expect((await repo.collectUnowned()).removed).toBe(0);
    await discardTextGeometry(abandoned, repo);
    expect(await repo.getOriginal(abandoned.reference.contentHash)).toBeNull();
    expect(await repo.getOriginal(first.reference.contentHash)).not.toBeNull();
  });

  it('refuses missing payloads and mismatched reference identity before a complete save', async () => {
    const repo = repository();
    const stored = await storeTextGeometry(textGeometryFixture(), { repository: repo });
    const project = createEmptyProject();
    project.formulas.push(
      createTextFormula({ source: 'A', geometry: { ...stored.reference, key: 'wrong-result' } }),
    );
    await expect(preparePackage(project, { repository: repo })).rejects.toMatchObject({
      code: 'corrupt',
    });
    await stored.lease.release();
    await repo.collectUnowned();
    await expect(preparePackage(project, { repository: repo })).rejects.toMatchObject({
      code: 'missing',
    });
  });

  it('stores the compact JSON of the geometry, and reads no other form of it', async () => {
    const repo = repository();
    const stored = await storeTextGeometry(textGeometryFixture('fi'), { repository: repo });
    const blob = await repo.requireOriginal(stored.reference.contentHash);
    const text = await blob.text();
    // What is stored is the value as JSON writes it: read back and written again, the same.
    expect(JSON.stringify(JSON.parse(text))).toBe(text);
    expect(JSON.parse(text)).toEqual(validateTextGeometryArtifact(textGeometryFixture('fi')));
    const artifact = stored.artifact;
    const payload = async (written: string) => {
      const other = new Blob([written], { type: TEXT_GEOMETRY_MIME_TYPE });
      const reference = {
        ...stored.reference,
        contentHash: await hashBlob(other),
        byteLength: other.size,
      };
      return readTextGeometryBlob(other, reference);
    };
    await expect(payload(text)).resolves.toEqual(artifact);
    // The same value, written another way: other bytes, another hash, for the same geometry.
    const notCompact = /not the compact JSON of its value/;
    for (const [written, why] of [
      [JSON.stringify(JSON.parse(text), null, 2), notCompact],
      [`${text}\n`, notCompact],
      [` ${text}`, notCompact],
      [text.replace('"calibration":1', '"calibration":1.0'), notCompact],
      [text.replace('"version":1', '"version":1,"version":1'), notCompact],
      // A byte order mark is not JSON at all.
      [`\ufeff${text}`, /Unexpected token/],
    ] as const) {
      expect(written).not.toBe(text);
      await expect(payload(written)).rejects.toMatchObject({
        code: 'corrupt',
        cause: expect.objectContaining({ message: expect.stringMatching(why) }),
      });
    }
  });

  it('validates before storing and leaves no owner or payload for invalid geometry', async () => {
    const repo = repository();
    const artifact = textGeometryFixture();
    artifact.glyphs[0]!.sourceRanges[0]!.end = 99;
    await expect(storeTextGeometry(artifact, { repository: repo })).rejects.toMatchObject({
      code: 'corrupt',
    });
    expect(await repo.listOwners()).toEqual([]);
  });
});
