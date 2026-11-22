import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioAsset } from '../../../model';

let model: typeof import('../../../model');
let media: typeof import('../../../media');
let store: typeof import('../../../store');
let actions: typeof import('../../project/actions');
let notices: typeof import('../../project/noticeStore');
let runtime: typeof import('../audioRuntime');
let missing: typeof import('../missingMedia');
const stops: (() => void)[] = [];

/** A recording's metadata; with `stored`, its original is in the media store too. */
async function recording(text: string, stored: boolean): Promise<AudioAsset> {
  const blob = new Blob([text]);
  if (stored) await media.mediaRepository.storeOriginal(blob, { ownerId: 'test-import' });
  return model.createAudioAsset({
    contentHash: await media.hashBlob(blob),
    byteLength: blob.size,
    name: text,
    originalName: `${text}.wav`,
    mimeType: 'audio/wav',
    duration: 1,
    sampleRate: 48000,
    channels: 1,
  });
}

function open(name: string, ...assets: AudioAsset[]) {
  const project = model.createEmptyProject(name);
  project.audioAssets.push(...assets);
  actions.replaceProject(project, { fileName: null, handle: null });
}

const told = () =>
  notices.useNoticeStore.getState().notices.map((notice) => [notice.title, notice.details]);
const state = () => missing.useMissingMedia.getState();
const settled = () => missing.refreshMissingMedia();

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
  sessionStorage.clear();
  model = await import('../../../model');
  media = await import('../../../media');
  store = await import('../../../store');
  actions = await import('../../project/actions');
  notices = await import('../../project/noticeStore');
  runtime = await import('../audioRuntime');
  missing = await import('../missingMedia');
});

afterEach(async () => {
  while (stops.length) stops.pop()!();
  await settled();
  vi.unstubAllGlobals();
});

describe('recordings whose original is missing', () => {
  it('are known once the store has been asked, and not before', async () => {
    const narration = await recording('narration', true);
    const interview = await recording('interview', false);
    open('Talk', narration, interview);
    expect(state().checked.size).toBe(0);
    expect(await missing.refreshMissingMedia()).toEqual(new Set([interview.contentHash]));
    expect(state().missing).toEqual(new Set([interview.contentHash]));
    expect(state().checked).toEqual(new Set([narration.contentHash, interview.contentHash]));
  });

  it('are reported once per document, by the file to import again', async () => {
    const interview = await recording('interview', false);
    open('Talk', await recording('narration', true), interview);
    await missing.refreshMissingMedia();
    expect(told()).toEqual([['A recording is missing', ['interview.wav']]]);
    await missing.refreshMissingMedia();
    expect(told()).toHaveLength(1);

    // One more goes missing in the same document: only that one is news.
    const effect = await recording('effect', false);
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets.push(effect, { ...effect, id: 'copy', name: 'copy', originalName: '' });
    });
    await missing.refreshMissingMedia();
    expect(told().at(-1)).toEqual(['2 recordings are missing', ['effect.wav', 'copy']]);
    expect(told()).toHaveLength(2);

    // Another document with the same recording is told about it again.
    open('Another talk', interview);
    await missing.refreshMissingMedia();
    expect(told().at(-1)).toEqual(['A recording is missing', ['interview.wav']]);
    expect(told()).toHaveLength(3);
  });

  it('are followed as the project changes, as files are imported and as documents open', async () => {
    stops.push(missing.startMissingMedia());
    await settled();
    expect(state().missing.size).toBe(0);

    const interview = await recording('interview', false);
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets.push(interview);
    });
    await settled();
    expect(state().missing).toEqual(new Set([interview.contentHash]));

    // The same file is imported again: the Audio tab says that the media changed.
    await media.mediaRepository.storeOriginal(new Blob(['interview']), { ownerId: 'reimport' });
    runtime.refreshAudioMedia();
    await settled();
    expect(state().missing.size).toBe(0);

    // A rename is not about media: nothing is asked.
    const asked = vi.spyOn(media.mediaRepository, 'missingOriginals');
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets[0]!.name = 'Interview, second take';
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).not.toHaveBeenCalled();

    // The same project opened again is a new document: it is looked at, and told, anew.
    const lost = await recording('lost', false);
    open('Lost', lost);
    await settled();
    open('Lost, again', lost);
    await settled();
    expect(asked).toHaveBeenCalledTimes(2);
    expect(told().filter(([title]) => title === 'A recording is missing')).toHaveLength(3);
  });

  it('are all of them when the media store cannot be read, and that is not news about them', async () => {
    const narration = await recording('narration', true);
    open('Talk', narration);
    vi.stubGlobal('indexedDB', undefined);
    expect(await missing.refreshMissingMedia()).toEqual(new Set([narration.contentHash]));
    expect(state().checked).toEqual(new Set([narration.contentHash]));
    expect(told()).toEqual([]);
  });
});

describe('a clip of a recording', () => {
  it('knows nothing about its original until the store has been asked', async () => {
    const narration = await recording('narration', true);
    const interview = await recording('interview', false);
    open('Talk', narration, interview);
    const available = (asset: AudioAsset | undefined) => {
      const { checked, missing: lost } = state();
      return asset && checked.has(asset.contentHash) ? !lost.has(asset.contentHash) : null;
    };
    expect([available(narration), available(interview), available(undefined)]).toEqual([
      null,
      null,
      null,
    ]);
    await missing.refreshMissingMedia();
    expect([available(narration), available(interview)]).toEqual([true, false]);
  });
});
