/* Collection of the originals that nothing needs any more. Pages close, crash and are discarded
 * without releasing what they owned (`pagehide` promises nothing), so a later page does it for
 * them: it releases the owners that `media/collection.ts` calls abandoned, going by what the
 * autosave knows about the other pages, and then removes the originals left without any owner.
 * So the bytes of a deleted recording, or of a project that was closed, are freed once their page
 * is gone and no autosave record needs them: later, never at once. A recovery owner holds every
 * original its document ever had, because copies of its record in other tabs name it too. */
import { abandonedOwners, mediaRepository } from '../../media';
import { autosaveClaims, onAutosavePruned } from './autosave';

/** After startup, and after pruning: late enough for the page to own what it restored, and out
 * of the way of whatever the user is doing first. */
export const COLLECT_DELAY_MS = 5_000;

export interface Collected {
  /** The owners released. */
  released: string[];
  /** The originals removed, and their size. */
  removed: number;
  bytes: number;
}

let pass: Promise<Collected> = Promise.resolve({ released: [], removed: 0, bytes: 0 });

async function collect(now: number): Promise<Collected> {
  const owners = await mediaRepository.listOwners();
  // The autosave is read after the owners, so that a record naming one of them is seen however
  // lately it was published.
  const claims = autosaveClaims(now);
  if (!claims.sees) return { released: [], removed: 0, bytes: 0 };
  const released = await mediaRepository.releaseUnchanged(abandonedOwners(owners, claims, now));
  return { released, ...(await mediaRepository.collectUnowned()) };
}

/** One pass, after any that is running. `now` is the clock the ages are judged by. */
export function collectMedia(now = Date.now()): Promise<Collected> {
  pass = pass.catch(() => undefined).then(() => collect(now));
  return pass;
}

/** A pass after startup and after every pruning of the autosave; returns a stop function. A
 * pass that fails (no database here, another page upgrading it) is left for the next one. */
export function startMediaCollection(delayMs = COLLECT_DELAY_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void collectMedia().catch(() => undefined);
    }, delayMs);
  };
  const offPruned = onAutosavePruned(schedule);
  schedule();
  return () => {
    offPruned();
    if (timer !== null) clearTimeout(timer);
  };
}
