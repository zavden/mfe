/* Which recordings of the open project the browser holds no original of. A project can come
 * without some: a file saved without its missing media, a recovery after the browser evicted its
 * storage. Their clips stay where they were, marked, and importing the same file again repairs
 * them. The check is one read of the media store: it runs when the project's recordings change,
 * when something is imported and when a document opens. Playback goes by what is known here, and
 * asks for another look when an original turns out to be missing. */
import { create } from 'zustand';
import { mediaRepository } from '../../media';
import type { AudioAsset } from '../../model';
import { onProjectLoaded, useProjectStore } from '../../store';
import { useDocumentStore } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { useAudioMediaRevision } from './audioRuntime';

interface MissingMedia {
  /** The content hashes without an original. */
  missing: ReadonlySet<string>;
  /** The hashes the last check covered: a recording outside it is not known yet. */
  checked: ReadonlySet<string>;
}

export const useMissingMedia = create<MissingMedia>(() => ({
  missing: new Set<string>(),
  checked: new Set<string>(),
}));

/** Whether the original of `asset` is there: null until a check has covered it. */
export function useOriginalAvailable(asset: AudioAsset | undefined): boolean | null {
  return useMissingMedia((state) =>
    asset && state.checked.has(asset.contentHash) ? !state.missing.has(asset.contentHash) : null,
  );
}

const hashesOf = (assets: readonly AudioAsset[]) => [
  ...new Set(assets.map((asset) => asset.contentHash)),
];

/** The recordings the user was told about, per document: each is reported once. */
let told = { session: -1, hashes: new Set<string>() };

function tell(assets: readonly AudioAsset[], missing: ReadonlySet<string>): void {
  const session = useDocumentStore.getState().session;
  if (told.session !== session) told = { session, hashes: new Set() };
  const fresh = assets.filter(
    (asset) => missing.has(asset.contentHash) && !told.hashes.has(asset.contentHash),
  );
  if (!fresh.length) return;
  for (const asset of fresh) told.hashes.add(asset.contentHash);
  notify({
    kind: 'warning',
    title: fresh.length === 1 ? 'A recording is missing' : `${fresh.length} recordings are missing`,
    message:
      'The browser does not hold the original audio. The clips stay in place, marked “missing media”, and are silent. To restore them, import the same files again in the Audio tab, or open a complete .mfe project.',
    details: fresh.slice(0, 8).map((asset) => asset.originalName || asset.name),
  });
}

let checking: Promise<ReadonlySet<string>> = Promise.resolve(new Set<string>());
/** The look that waits for the one that is running: it answers everyone who asks meanwhile. */
let waiting: Promise<ReadonlySet<string>> | null = null;

async function check(): Promise<ReadonlySet<string>> {
  const assets = useProjectStore.getState().project.audioAssets;
  const { session } = useDocumentStore.getState();
  const hashes = hashesOf(assets);
  let missing: ReadonlySet<string>;
  try {
    missing = new Set(hashes.length ? await mediaRepository.missingOriginals(hashes) : []);
  } catch {
    // No media store to ask: nothing of it can be used now. That is the store's trouble, and
    // whatever needs it reports it; it is not news about these recordings.
    missing = new Set(hashes);
    useMissingMedia.setState({ missing, checked: missing });
    return missing;
  }
  useMissingMedia.setState({ missing, checked: new Set(hashes) });
  // A document that was replaced meanwhile gets a look of its own.
  if (useDocumentStore.getState().session === session) tell(assets, missing);
  return missing;
}

/** Look at the open project's recordings: now, or right after the look that is running. */
export function refreshMissingMedia(): Promise<ReadonlySet<string>> {
  if (!waiting) {
    const look = () => {
      waiting = null;
      return check();
    };
    waiting = checking = checking.then(look, look);
  }
  return waiting;
}

/** Keep the knowledge current; returns a stop function. */
export function startMissingMedia(): () => void {
  const offProject = useProjectStore.subscribe((state, previous) => {
    const assets = state.project.audioAssets;
    if (
      assets !== previous.project.audioAssets &&
      hashesOf(assets).join() !== hashesOf(previous.project.audioAssets).join()
    )
      void refreshMissingMedia();
  });
  // Another document, perhaps with the very same recordings: it is told about them anew.
  const offLoad = onProjectLoaded(() => void refreshMissingMedia());
  const offMedia = useAudioMediaRevision.subscribe(() => void refreshMissingMedia());
  void refreshMissingMedia();
  return () => {
    offProject();
    offLoad();
    offMedia();
  };
}
