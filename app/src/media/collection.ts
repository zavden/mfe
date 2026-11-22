/* Which owners nobody stands behind any more.
 *
 * An owner is a promise a page made: the document it shows and its undo history, a save or an
 * import it is running, or the recovery record it published, need these originals. Pages close,
 * crash and get discarded without taking their promises back, so another page does it for them,
 * once it is sure that nobody will come back for them. Being wrong here loses a recording, and
 * being slow only keeps some bytes longer: every doubt is resolved by keeping. */
import { ownerPage } from './ownership';
import type { MediaOwner } from './repository';

/** An owner written this lately is left alone, whatever else is known: its page may be between
 * two steps (a recovery record is published after its owner), or in the back/forward cache. */
export const OWNER_GRACE_MS = 10 * 60_000;
/** How often a page writes its history owner again while it is open: well within the grace, so
 * that a page nothing else speaks for (its alive mark could not be written) keeps what it has. */
export const OWNER_TOUCH_MS = 4 * 60_000;

/** An owner whose page nobody can ask about goes when it was not written for this long: it was
 * named by an earlier version of the app, whose pages may still be open in another tab. */
export const OWNER_FORGOTTEN_MS = 7 * 24 * 3600_000;

/** What the autosave knows about the pages and their recovery records. */
export interface MediaClaims {
  /** Whether the page of this name is there, or may come back to what it owns; null when the
   * name is not one the app gives its pages, so that nothing is known about it. */
  pageMayReturn(page: string): boolean | null;
  /** The owners that the stored recovery records name. */
  named: ReadonlySet<string>;
}

/** The owners to release: those of pages that are gone for good, except a recovery owner that a
 * record still names (a record outlives its page: it is what a later page recovers). An owner
 * this app did not name is not judged, and one of a page that cannot be asked about only ages. */
export function abandonedOwners(
  owners: readonly MediaOwner[],
  claims: MediaClaims,
  now: number,
): MediaOwner[] {
  return owners.filter((owner) => {
    // Also an owner dated ahead of this clock: it was written under another one, lately or not.
    if (now - owner.updatedAt < OWNER_GRACE_MS) return false;
    const named = ownerPage(owner.id);
    if (!named) return false;
    if (named.kind === 'recovery' && claims.named.has(owner.id)) return false;
    const returns = claims.pageMayReturn(named.page);
    return returns === null ? now - owner.updatedAt > OWNER_FORGOTTEN_MS : !returns;
  });
}
