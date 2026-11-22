// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createAudioAsset, createEmptyProject } from '../../model';
import { importAudioOriginal } from '../import';
import { importPackage, preparePackage } from '../package';
import { persistentStorageRequest } from '../persistence';
import { IndexedDbMediaRepository } from '../repository';

const info = async () => ({ duration: 1, sampleRate: 48000, channels: 1 });
function repository() {
  const factory = new IDBFactory();
  return new IndexedDbMediaRepository({ indexedDB: () => factory });
}

describe('the request for persistent storage', () => {
  it('asks the browser once, and every caller gets that answer', async () => {
    const persist = vi.fn(async () => true);
    const request = persistentStorageRequest(() => ({ persisted: async () => false, persist }));
    expect(await Promise.all([request(), request(), request()])).toEqual([true, true, true]);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not ask for what the origin already has', async () => {
    const persist = vi.fn(async () => false);
    const request = persistentStorageRequest(() => ({ persisted: async () => true, persist }));
    expect(await request()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('takes a refusal, a failure or a browser without the API as "no"', async () => {
    expect(await persistentStorageRequest(() => ({ persist: async () => false }))()).toBe(false);
    expect(
      await persistentStorageRequest(() => ({
        persist: async () => {
          throw new DOMException('Not here', 'SecurityError');
        },
      }))(),
    ).toBe(false);
    expect(await persistentStorageRequest(() => undefined)()).toBe(false);
    expect(await persistentStorageRequest(() => ({}))()).toBe(false);
    expect(
      await persistentStorageRequest(() => {
        throw new Error('No navigator');
      })(),
    ).toBe(false);
  });
});

describe('who asks for it', () => {
  it('an audio import, once its original is stored and never when it fails', async () => {
    const persist = vi.fn();
    const repo = repository();
    await expect(
      importAudioOriginal(new Blob([]), info, { repository: repo, persist }),
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(persist).not.toHaveBeenCalled();
    await importAudioOriginal(new Blob(['sound']), info, { repository: repo, persist });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('a package that brings originals, and not one without any', async () => {
    const persist = vi.fn();
    const source = repository();
    const empty = createEmptyProject('No media');
    const prepared = await preparePackage(empty, { repository: source });
    await importPackage(prepared.toBlob(), { repository: repository(), persist });
    expect(persist).not.toHaveBeenCalled();

    const stored = await source.storeOriginal(new Blob(['sound']), { ownerId: 'current' });
    const project = createEmptyProject('Media');
    project.audioAssets.push(
      createAudioAsset({
        ...stored,
        name: 'Sound',
        originalName: 'sound.wav',
        mimeType: 'audio/wav',
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    const packed = await preparePackage(project, { repository: source });
    await importPackage(packed.toBlob(), { repository: repository(), persist });
    expect(persist).toHaveBeenCalledOnce();
  });
});
