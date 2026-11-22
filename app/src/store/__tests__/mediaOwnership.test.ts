// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let model: typeof import('../../model');
let media: typeof import('../../media');
let store: typeof import('../projectStore');
let ownership: typeof import('../mediaOwnership');
let pins: ReturnType<typeof vi.spyOn>;
/** The repository's own pin, under the spy. */
let pin: (owner: string, hashes: readonly string[]) => Promise<string[]>;
const stops: (() => void)[] = [];

/** A project that declares one stored original per text given. */
async function projectWith(...sounds: string[]) {
  const project = model.createEmptyProject('Audio project');
  for (const sound of sounds) {
    const original = await media.mediaRepository.storeOriginal(new Blob([sound]), {
      ownerId: 'test-import',
    });
    project.audioAssets.push(
      model.createAudioAsset({
        ...original,
        name: sound,
        originalName: `${sound}.wav`,
        mimeType: 'audio/wav',
        duration: 4,
        sampleRate: 48000,
        channels: 1,
      }),
    );
  }
  return project;
}

const historyOwner = async () =>
  (await media.mediaRepository.listOwners()).find((owner) => owner.id.startsWith('history:'));

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  model = await import('../../model');
  media = await import('../../media');
  store = await import('../projectStore');
  ownership = await import('../mediaOwnership');
  pin = media.mediaRepository.pinAvailable.bind(media.mediaRepository);
  pins = vi.spyOn(media.mediaRepository, 'pinAvailable');
});

/** The writes requested so far are done. */
const settled = () => ownership.mediaOwnershipSettled();

afterEach(async () => {
  while (stops.length) stops.pop()!();
  await settled().catch(() => undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the history owner of the open project', () => {
  it('is written once for edits that leave the set of originals as it was', async () => {
    const project = await projectWith('narration');
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await settled();
    expect(pins).toHaveBeenCalledTimes(1);
    // What a drag sends: one update per frame, none of them about media.
    for (let frame = 0; frame < 40; frame++) {
      store.useProjectStore.getState().update((draft) => {
        draft.meta.name = `Frame ${frame}`;
      });
    }
    store.history.undo();
    store.history.redo();
    await settled();
    expect(pins).toHaveBeenCalledTimes(1);
    expect((await historyOwner())?.hashes).toEqual([project.audioAssets[0]!.contentHash]);
  });

  it('is written again when an original joins or leaves the project and its history', async () => {
    const project = await projectWith('narration', 'effect');
    const [narration, effect] = project.audioAssets.map((asset) => asset.contentHash);
    store.loadProject({ ...project, audioAssets: [project.audioAssets[0]!] });
    stops.push(ownership.startMediaOwnership());
    await settled();
    expect((await historyOwner())?.hashes).toEqual([narration]);

    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets.push(project.audioAssets[1]!);
    });
    await settled();
    expect(pins).toHaveBeenCalledTimes(2);
    expect((await historyOwner())?.hashes).toEqual([effect, narration].sort());

    // Deleted, but Undo can bring it back: the history still holds it, so nothing is written.
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets = [];
    });
    await settled();
    expect(pins).toHaveBeenCalledTimes(2);

    // The history is gone with the document: now the set is empty.
    store.loadProject(model.createEmptyProject('Next'));
    await settled();
    expect(pins).toHaveBeenCalledTimes(3);
    expect((await historyOwner())?.hashes).toEqual([]);
  });

  it('writes nothing more for the same set while its write is on its way', async () => {
    const project = await projectWith('narration');
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    pins.mockImplementation(async (owner: string, hashes: readonly string[]) => {
      await held;
      return pin(owner, hashes);
    });
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    for (let frame = 0; frame < 5; frame++) {
      store.useProjectStore.getState().update((draft) => {
        draft.meta.name = `Frame ${frame}`;
      });
    }
    let done = false;
    const waiting = settled().then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);
    expect(await historyOwner()).toBeUndefined();
    release();
    await waiting;
    expect(pins).toHaveBeenCalledTimes(1);
    expect((await historyOwner())?.hashes).toEqual([project.audioAssets[0]!.contentHash]);
  });

  it('is written at every hand-over, whatever it held before', async () => {
    const project = await projectWith('narration');
    const arrivals = vi.fn();
    stops.push(ownership.onMediaArrival(arrivals));
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await settled();
    expect(pins).toHaveBeenCalledTimes(1);
    expect(arrivals).not.toHaveBeenCalled();
    // An import stored its bytes and hands them over: the owner is written, and whoever else
    // keeps originals is told.
    await ownership.syncCurrentMediaOwnership();
    await ownership.syncCurrentMediaOwnership();
    expect(pins).toHaveBeenCalledTimes(3);
    expect(arrivals).toHaveBeenCalledTimes(2);
  });

  it('owns again what is handed over after the media store was emptied under the page', async () => {
    const project = await projectWith('narration');
    const hash = project.audioAssets[0]!.contentHash;
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await settled();
    // The user cleared the site's data, or the browser evicted it: nothing is stored any more,
    // and the page still believes that its owner holds the recording.
    vi.stubGlobal('indexedDB', new IDBFactory());
    expect(await historyOwner()).toBeUndefined();
    // The same file is imported again, and its import hands the bytes over.
    await media.mediaRepository.storeOriginal(new Blob(['narration']), { ownerId: 'reimport' });
    await ownership.syncCurrentMediaOwnership();
    expect((await historyOwner())?.hashes).toEqual([hash]);
    await media.mediaRepository.releaseOwner('reimport');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('carries the name of its page, asked for when it is first written', async () => {
    const project = await projectWith('narration');
    media.setMediaPage(() => 's_session');
    store.loadProject(project);
    await ownership.syncCurrentMediaOwnership();
    expect(pins).toHaveBeenCalledTimes(1);
    expect(media.ownerPage((await historyOwner())!.id)).toEqual({
      kind: 'history',
      page: 's_session',
    });
  });

  it('is written again every few minutes while the page is open, and not when it owns nothing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      stops.push(ownership.startMediaOwnership());
      vi.advanceTimersByTime(media.OWNER_TOUCH_MS * 3);
      expect(pins).not.toHaveBeenCalled();

      store.loadProject(await projectWith('narration'));
      await settled();
      const written = (await historyOwner())!.updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 2));
      vi.advanceTimersByTime(media.OWNER_TOUCH_MS);
      await settled();
      expect(pins).toHaveBeenCalledTimes(2);
      expect((await historyOwner())!.updatedAt).toBeGreaterThan(written);

      // The media left the project and its history: an owner of nothing is not written again.
      store.loadProject(model.createEmptyProject('Next'));
      await settled();
      vi.advanceTimersByTime(media.OWNER_TOUCH_MS * 3);
      await settled();
      expect(pins).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is released when the page leaves, and written again if the page goes on', async () => {
    const project = await projectWith('narration');
    const hash = project.audioAssets[0]!.contentHash;
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await settled();
    await media.mediaRepository.releaseOwner('test-import');

    await ownership.releaseMediaOwnership();
    expect(await historyOwner()).toBeUndefined();
    // Releasing twice, or with nothing owned, writes nothing.
    const release = vi.spyOn(media.mediaRepository, 'releaseOwner');
    await ownership.releaseMediaOwnership();
    expect(release).not.toHaveBeenCalled();

    // Back from the back/forward cache, say: the same set, owned again.
    await ownership.reassertMediaOwnership();
    expect((await historyOwner())?.hashes).toEqual([hash]);
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('writes its owner again on demand, although the set did not change', async () => {
    const project = await projectWith('narration');
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await settled();
    // Another page took this one for gone.
    await media.mediaRepository.releaseOwner((await historyOwner())!.id);
    store.useProjectStore.getState().update((draft) => {
      draft.meta.name = 'An edit that is not about media';
    });
    await settled();
    expect(await historyOwner()).toBeUndefined();
    await ownership.reassertMediaOwnership();
    expect((await historyOwner())?.hashes).toEqual([project.audioAssets[0]!.contentHash]);
  });

  it('holds what exists of a project that lacks an original, and the rest once it is back', async () => {
    const project = await projectWith('narration');
    const narration = project.audioAssets[0]!.contentHash;
    const lost = new Blob(['effect']);
    const effect = await media.hashBlob(lost);
    project.audioAssets.push(
      model.createAudioAsset({
        contentHash: effect,
        byteLength: lost.size,
        name: 'effect',
        originalName: 'effect.wav',
        mimeType: 'audio/wav',
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await settled();
    expect((await historyOwner())?.hashes).toEqual([narration]);

    // Ordinary edits write nothing, missing original or not.
    for (let frame = 0; frame < 10; frame++) {
      store.useProjectStore.getState().update((draft) => {
        draft.meta.name = `Frame ${frame}`;
      });
    }
    await settled();
    expect(pins).toHaveBeenCalledTimes(1);

    // The same file is imported again: its bytes are stored under the import's lease, and the
    // hand-over makes them the history's although the project did not change.
    await media.mediaRepository.storeOriginal(lost, { ownerId: 'reimport' });
    await ownership.syncCurrentMediaOwnership();
    expect((await historyOwner())?.hashes).toEqual([effect, narration].sort());
    await media.mediaRepository.releaseOwner('reimport');
    await media.mediaRepository.releaseOwner('test-import');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('writes after the write on its way, which looked before the bytes were stored', async () => {
    const lost = new Blob(['effect']);
    const effect = await media.hashBlob(lost);
    const project = model.createEmptyProject('Repair');
    project.audioAssets.push(
      model.createAudioAsset({
        contentHash: effect,
        byteLength: lost.size,
        name: 'effect',
        originalName: 'effect.wav',
        mimeType: 'audio/wav',
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    // The first write has read the store, and its answer is still on its way.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    pins.mockImplementationOnce(async (owner: string, hashes: readonly string[]) => {
      const missing = await pin(owner, hashes);
      await held;
      return missing;
    });
    store.loadProject(project);
    stops.push(ownership.startMediaOwnership());
    await vi.waitFor(() => expect(pins).toHaveBeenCalledTimes(1));
    // The file is imported again, and its import hands the bytes over.
    await media.mediaRepository.storeOriginal(lost, { ownerId: 'reimport' });
    const handed = ownership.syncCurrentMediaOwnership();
    release();
    await handed;
    expect((await historyOwner())?.hashes).toEqual([effect]);
    await media.mediaRepository.releaseOwner('reimport');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('tries a failed write again, for the same set too', async () => {
    const project = await projectWith('narration');
    pins.mockRejectedValueOnce(new Error('The database is busy'));
    store.loadProject(project);
    await expect(ownership.syncCurrentMediaOwnership()).rejects.toThrow('The database is busy');
    expect(await historyOwner()).toBeUndefined();
    await ownership.syncCurrentMediaOwnership();
    expect(pins).toHaveBeenCalledTimes(2);
    expect((await historyOwner())?.hashes).toEqual([project.audioAssets[0]!.contentHash]);
  });
});
