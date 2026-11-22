/* Current edits, both history stacks and gesture cancellation own immutable project payloads.
 * The UI supplies reporting; native render sync can await the same durable handoff directly.
 *
 * The owner belongs to this page and lasts as long as it: it is released when the page leaves
 * for good, and another page releases it if this one dies first (`media/collection.ts`). */
import {
  derivedMediaHashes,
  mediaOwnerId,
  mediaRepository,
  OWNER_TOUCH_MS,
  projectMediaHashes,
} from '../media';
import type { Project } from '../model';
import { history, useProjectStore } from './projectStore';

/** Named on first use: by then the app has told `media/` how its pages are called. */
let ownerId: string | null = null;
let queue: Promise<void> = Promise.resolve();
let gestureStart: Project | null = null;
let hasOwnedMedia = false;
/** The set the last write asked for, and whether that write failed. */
let asked: string | null = null;
let failed = false;
const arrivalListeners = new Set<() => void>();
const returnListeners = new Set<(contentHash: string) => void>();

/** Called when originals may have arrived for the open project: an import, or a repair, is
 * handing them over. */
export function onMediaArrival(listener: () => void): () => void {
  arrivalListeners.add(listener);
  return () => void arrivalListeners.delete(listener);
}

/** Called when a payload the open project names, and the store did not hold, is stored again
 * with nothing of the project changing (a text shaped again to the very geometry it had). The
 * document layer listens: the file the document was read from, or written to, may not carry it. */
export function onMediaReturned(listener: (contentHash: string) => void): () => void {
  returnListeners.add(listener);
  return () => void returnListeners.delete(listener);
}

/** Tell the `onMediaReturned` listeners, once the payload is stored and owned. */
export function announceMediaReturned(contentHash: string): void {
  for (const listener of returnListeners) listener(contentHash);
}

/** Publish a reference only with an import lease; await this before releasing that lease. The
 * owner then holds every original of the project and its history that is stored now. A hand-over
 * always writes, whatever the last write asked for: the caller stored bytes that it may not have
 * seen (the same file imported again brings an original back without changing the project), and
 * the store may have been emptied under the page since. */
export function syncCurrentMediaOwnership(extra?: Project): Promise<void> {
  const handed = sync(extra, true);
  for (const listener of arrivalListeners) listener();
  return handed;
}

/** The writes requested so far, without asking for another. */
export function mediaOwnershipSettled(): Promise<void> {
  return queue;
}

/** `always`: write although the set is the one last asked for. */
function sync(extra: Project | undefined, always: boolean): Promise<void> {
  const temporal = useProjectStore.temporal.getState();
  const projects = [
    useProjectStore.getState().project,
    ...temporal.pastStates.map((state) => state.project),
    ...temporal.futureStates.map((state) => state.project),
    ...(gestureStart ? [gestureStart] : []),
    ...(extra ? [extra] : []),
  ].filter((project): project is Project => !!project);
  const hashes = [...new Set(projects.flatMap(projectMediaHashes))].sort();
  if (hashes.length === 0 && !hasOwnedMedia) return queue;
  // Most edits leave the set as it was, and a drag sends one per frame: no transaction for
  // those. The queue is then the write of this very set, on its way or done; one that failed
  // is tried again.
  const key = hashes.join(' ');
  if (!always && key === asked && !failed) return queue;
  hasOwnedMedia = true;
  asked = key;
  failed = false;
  const id = (ownerId ??= mediaOwnerId('history'));
  // A project's metadata outlives its originals: the owner holds the ones that are stored.
  const derived = derivedMediaHashes(...projects);
  queue = queue
    .catch(() => undefined)
    .then(async () => void (await mediaRepository.pinAvailable(id, hashes, derived)));
  queue.catch(() => {
    if (asked === key) failed = true;
  });
  return queue;
}

/** Write the owner again although its set did not change. While this page was not looking
 * (suspended, or in the back/forward cache) another page may have taken it for gone and released
 * what it held; and the same write, repeated while the page is open, shows that it is there. */
export function reassertMediaOwnership(): Promise<void> {
  return sync(undefined, true);
}

/** The page is leaving for good: what only its history held is nobody's now. A page that goes on
 * after all owns its originals again at its next write. */
export function releaseMediaOwnership(): Promise<void> {
  if (!ownerId || !hasOwnedMedia) return queue;
  const id = ownerId;
  hasOwnedMedia = false;
  asked = null;
  queue = queue.catch(() => undefined).then(() => mediaRepository.releaseOwner(id));
  return queue;
}

export function startMediaOwnership(
  onError: (error: unknown) => void = () => undefined,
): () => void {
  const schedule = (extra?: Project) => {
    void sync(extra, false).catch(onError);
  };
  gestureStart = history.isGesturing() ? useProjectStore.getState().project : null;
  const offProject = useProjectStore.subscribe((state, previous) => {
    if (state.project !== previous.project) schedule(previous.project);
  });
  const offTemporal = useProjectStore.temporal.subscribe(() => schedule());
  const offGesture = history.subscribe(() => {
    gestureStart = history.isGesturing() ? useProjectStore.getState().project : null;
    schedule();
  });
  // An owner of nothing has nothing to lose.
  const touch = setInterval(() => {
    if (asked) void reassertMediaOwnership().catch(onError);
  }, OWNER_TOUCH_MS);
  schedule();
  return () => {
    offProject();
    offTemporal();
    offGesture();
    clearInterval(touch);
  };
}
