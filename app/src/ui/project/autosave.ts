/* Autosave to localStorage: the current project is written (debounced) as it changes and
 * restored on startup, so reloading the page brings everything back. This is a safety net, not
 * the project file: Save still writes the real file.
 *
 * Each page load has its own writer id, allocated in memory: sessionStorage can be inherited
 * by another window, so it is only a pointer for recovery, never proof of exclusive ownership.
 * The page writes `mfe.autosave.<session>`; while it is open it
 * refreshes `mfe.alive.<session>` every 15 s and removes it when the page goes away (pagehide).
 * At startup a tab copies its previous record (a reload, which says by itself that the page
 * before it is gone, crashed or not), else the newest record of a tab that is gone — no alive
 * mark, or one older than a minute (a crash) — which it takes over; the other such records stay
 * listed under File → Recover autosave for a week. So two tabs never overwrite each other's
 * work, and the work of a closed or crashed tab is not lost. A record that was taken over is not
 * offered again: the one of a page that left in order is removed; the one of a page that only
 * stopped answering stays hidden for that page, which the browser may have suspended or discarded
 * and may bring back, until it is a week old. */
import { parseProject, serializeProject } from '../../model';
import {
  derivedMediaHashes,
  mediaRepository,
  projectMediaHashes,
  setMediaPage,
  type MediaClaims,
} from '../../media';
import { loadProject, useProjectStore } from '../../store';
import { onMediaArrival, releaseMediaOwnership } from '../../store/mediaOwnership';
import { safeSession, safeStorage } from '../storage';
import { confirmDiscard, restoreDocumentHandle } from './actions';
import { randomId, useDocumentStore } from './documentStore';
import { downloadBlob } from './files';
import { notify } from './noticeStore';

/** `mfe.autosave.<session>`: the record of one tab. */
export const AUTOSAVE_PREFIX = 'mfe.autosave.';
/** `mfe.alive.<session>`: when the tab was last seen (a timestamp), while it is open; `taken:` and
 * a timestamp once another page copied the record of a tab that stopped answering. */
export const ALIVE_PREFIX = 'mfe.alive.';
/** `mfe.away.<session>`: when the page went into the back/forward cache. Its alive mark goes then,
 * as when it closes, and for the autosave it is a closed tab; but it may be shown again as it
 * was, with its undo history, so what it owns in the media store waits for it (`autosaveClaims`). */
export const AWAY_PREFIX = 'mfe.away.';
/** The one record every tab shared before (record versions 1 and 2): migrated at startup. */
export const LEGACY_AUTOSAVE_KEY = 'mfe.autosave';
/** The copies of the autosaves this app could not read (say, ones of a newer version), which the
 * next autosave would otherwise overwrite: each under this key and its record's session
 * (`backupKeyOf`). The key alone is the one copy every such record shared before, which a second
 * record went over: one found there is left where it is. */
export const AUTOSAVE_BACKUP_KEY = 'mfe.autosave.unreadable';
/** How many of those copies are kept: past it, the one saved longest ago goes. */
export const MAX_UNREADABLE = 5;
/** sessionStorage: this tab's session id. */
export const SESSION_KEY = 'mfe.session';
/** A failed transfer's source: reload must retry it before an older record of this tab. */
const RECOVERY_SOURCE_KEY = 'mfe.recoverySource';
export const AUTOSAVE_DELAY_MS = 400;
export const ALIVE_INTERVAL_MS = 15_000;
/** A tab whose alive mark is older than this is taken for gone (crashed, or the mark could not
 * be refreshed). */
export const STALE_AFTER_MS = 60_000;
/** How long, and how many, records of tabs that are gone are kept for File → Recover autosave. */
export const KEEP_RECOVERABLE_MS = 7 * 24 * 3600_000;
export const MAX_RECOVERABLE = 5;
/** An alive mark without a record that nobody refreshed for this long is removed at startup: its
 * page died before it wrote anything, or its record went another way. */
export const KEEP_MARK_MS = 24 * 3600_000;
/** How long after a mark would expire it is read again (`awaitPrevious`): a page that is open but
 * throttled in the background refreshes its mark about once a minute. */
export const RECHECK_MARGIN_MS = 2_000;

interface AutosaveRecord {
  v: 3 | 4;
  /** v4 originals are durable under this owner before the metadata is published. Copies keep
   * the owner token; it is never expired while another tab may be suspended or recovering. */
  mediaOwner?: string;
  savedAt: number;
  /** The project's name, for the menu (without parsing the project). */
  name: string;
  fileName: string | null;
  /** The project had unsaved changes relative to its file. */
  dirty: boolean;
  /** The document's id (`documentStore`), which its stored file handle carries too. Records of
   * version 1 had none: their document gets a new id, so no stored handle matches it. */
  documentId: string;
  /** serializeProject output. */
  text: string;
}

/** A record as read back: any version, fields unchecked. */
type RawRecord = Partial<Omit<AutosaveRecord, 'v'>> & { v?: number };

const recordKey = (session: string) => AUTOSAVE_PREFIX + session;
const aliveKey = (session: string) => ALIVE_PREFIX + session;
const awayKey = (session: string) => AWAY_PREFIX + session;

/** The session of a record key, or null for any other key (the backup keys among them). */
function sessionOf(key: string): string | null {
  if (!key.startsWith(AUTOSAVE_PREFIX) || key.startsWith(AUTOSAVE_BACKUP_KEY)) return null;
  return key.slice(AUTOSAVE_PREFIX.length);
}

interface PageOwner {
  id: string;
  persisted: boolean;
  inherited: string | null;
  previous: string | null;
  recoverySource: string | null;
  /** This page replaced the page `previous` belongs to, in the same tab: that page is gone,
   * whatever its alive mark says. */
  reloaded: boolean;
  /** This page's record reached the store: its own write, or a record it took over. */
  published: boolean;
  /** Startup restored a project. */
  restored: boolean;
  /** The page of `previous` looked alive at startup, and this load was not a reload: a session
   * the browser restored after it died, or a duplicated tab whose original is open. `seen` is
   * the mark it had then; `awaitPrevious` reads it again when it would expire. */
  awaiting: { session: string; seen: string } | null;
}

let pageOwner: PageOwner | null = null;
/** What `owner()` names a page (`randomId`). */
const SESSION_ID = /^s_[0-9a-z]{8}$/;

/** Whether this page load continues the tab's previous page: a reload (F5, or "Reload" after a
 * crash) or a tab the browser discarded to save memory and loaded again. A duplicated tab, a
 * window opened from another and a session restored after a restart are navigations of other
 * kinds, and their inherited session id may belong to a page that is still open. */
function continuesTab(): boolean {
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entry?.type === 'reload') return true;
  } catch {
    // no Navigation Timing here
  }
  return (document as { wasDiscarded?: boolean }).wasDiscarded === true;
}

function owner(): PageOwner {
  const stored = safeSession.getItem(SESSION_KEY);
  if (pageOwner && stored === (pageOwner.persisted ? pageOwner.id : pageOwner.inherited))
    return pageOwner;
  const id = randomId('s_');
  const persisted = safeSession.setItem(SESSION_KEY, id);
  pageOwner = {
    id,
    persisted,
    inherited: stored,
    previous: stored ? recordKey(stored) : null,
    recoverySource: safeSession.getItem(RECOVERY_SOURCE_KEY) || null,
    // Every page writes its own id over the one it found. Where that write fails, an id
    // inherited from another window would stay there for good, so a reload proves nothing.
    reloaded: stored !== null && persisted && continuesTab(),
    published: false,
    restored: false,
    awaiting: null,
  };
  // Publish liveness before startup exposes a copied record to another recovering page.
  safeStorage.setItem(aliveKey(id), String(Date.now()));
  return pageOwner;
}

/** This live page's writer id. A reload gets a fresh writer and copies the previous record;
 * no inherited browser state can make two live pages write the same key. This needs neither
 * BroadcastChannel nor Web Locks — Chrome has both on a page opened from file:// too, and the
 * autosave does not count on them anywhere —, and works without sessionStorage (then a reload
 * is told from a crash only by the age of the alive mark). */
export function sessionId(): string {
  return owner().id;
}

// What this page owns in the media store carries its session, so that the page collecting
// abandoned originals (`autosaveClaims`) can ask the alive marks about it.
setMediaPage(sessionId);

/** What the alive mark of a record holds once another page copied the record while its own page
 * only looked gone (see `handOver`): `taken:<when>`. */
const TAKEN = 'taken:';

interface Mark {
  /** - `alive`: seen lately;
   * - `stale`: not seen for a minute. The page crashed, or the browser suspended or discarded
   *   it, and a suspended or discarded page comes back;
   * - `taken`: stale, and another page already copied its record;
   * - `gone`: no mark. The page left in order (pagehide), or never was. */
  state: 'alive' | 'stale' | 'taken' | 'gone';
  /** When the mark was written: the page was there then, or its record was taken (0: unknown). */
  at: number;
}

/** What the alive mark says about the page of `session`. */
function readMark(session: string, now: number): Mark {
  const value = safeStorage.getItem(aliveKey(session));
  if (value === null) return { state: 'gone', at: 0 };
  const taken = value.startsWith(TAKEN);
  const time = Number(taken ? value.slice(TAKEN.length) : value);
  const at = Number.isFinite(time) && time > 0 ? time : 0;
  if (taken) return { state: 'taken', at };
  // Either way: a mark from far ahead was written under another clock, not by a page seen lately.
  return { state: at > 0 && Math.abs(now - at) < STALE_AFTER_MS ? 'alive' : 'stale', at };
}

function presence(session: string, now: number): Mark['state'] {
  return readMark(session, now).state;
}

/** Whether the tab of `session` was seen lately. */
function tabAlive(session: string, now: number): boolean {
  return presence(session, now) === 'alive';
}

/** The user was told that this browser keeps no autosave. */
let toldBlocked = false;
/** Whether the last write reached the store (null before the first one). */
let lastWriteOk: boolean | null = null;

/** Whether this browser keeps the autosave, as far as the last write told. */
export function autosaveStatus(): 'ok' | 'blocked' {
  return lastWriteOk === false ? 'blocked' : 'ok';
}

function reportWrite(ok: boolean): void {
  lastWriteOk = ok;
  if (ok || toldBlocked) return;
  toldBlocked = true;
  notify({
    kind: 'warning',
    title: 'No autosave in this browser',
    message:
      'The browser does not let the app keep an autosave (its storage is blocked or full). Save to a file to keep your work.',
  });
}

interface Stored {
  key: string;
  raw: string;
  record: RawRecord;
}

/** Transfers retain their source until a verified write succeeds. In particular, subscribing
 * after a settled restore must not make retry depend on a future edit or render amendment. */
let pendingRecovery: { stored: Stored; documentSession: number } | null = null;
const pendingBackups = new Map<string, Stored>();
let writeGeneration = 0;
let mediaWriteQueue: Promise<void> = Promise.resolve();
/** What is known of a recovery owner: the originals it holds, which is every one its document
 * ever had (a copy of the record in another tab names this owner, and may be older than the
 * record), and those the project names that were not stored (its metadata outlives them). While
 * that is `settled`, a write whose originals are all known is published at once, on unload too. */
const recoveryMedia = new Map<
  string,
  { held: Set<string>; absent: Set<string>; settled: boolean }
>();
/** How many times the knowledge above was put in doubt. */
let mediaArrivals = 0;

/** What the page remembers of its recovery owners may be wrong: an original may be back (a
 * hand-over of media), the store may have been emptied under the page, or the collection may
 * have released an owner no record named. The next write pins anew, with everything held so far:
 * what is no longer stored comes back as absent. */
function unsettleRecoveryMedia(): void {
  mediaArrivals++;
  for (const known of recoveryMedia.values()) {
    known.settled = false;
    known.absent.clear();
  }
}

/** Settle already-requested durable media writes (imports/tests can await a recovery handoff). */
export function waitForAutosaveMedia(): Promise<void> {
  return mediaWriteQueue;
}

function rememberSource(key: string | null): void {
  owner().recoverySource = key;
  safeSession.setItem(RECOVERY_SOURCE_KEY, key ?? '');
}

function verifiedWrite(key: string, raw: string): boolean {
  return safeStorage.setItem(key, raw) && safeStorage.getItem(key) === raw;
}

/** What happens to a source once its copy is verified. A page that still writes it keeps it: one
 * seen lately, or one that changed the record since it was read. The record of a page that left
 * in order is removed. Behind a stale mark the page may be suspended or discarded, and come back
 * to its tab after the user gave up the copy elsewhere: its record stays, for that page alone
 * (a reload of its tab, or the page resuming), and its mark says `taken`, so that no other page
 * lists it or restores it once more. When the taker is that tab itself (`ownTab`: its
 * sessionStorage names the record), a record that was already taken has done its part and goes. */
function handOver(stored: Stored, ownTab = false): void {
  const session = sessionOf(stored.key);
  const state = session ? presence(session, Date.now()) : 'gone';
  if (state === 'alive' || safeStorage.getItem(stored.key) !== stored.raw) return;
  if (state === 'stale') {
    safeStorage.setItem(aliveKey(session!), TAKEN + Date.now());
  } else if (state === 'gone' || ownTab) {
    safeStorage.removeItem(stored.key);
    if (session) safeStorage.removeItem(aliveKey(session));
  }
}

const pruneListeners = new Set<() => void>();

/** Called after pruning ended a record: the originals that only it kept can go too. */
export function onAutosavePruned(listener: () => void): () => void {
  pruneListeners.add(listener);
  return () => void pruneListeners.delete(listener);
}

/** Pruning: a record nobody writes goes for good, with its mark. A page suspended for that long
 * writes both again if it ever resumes; the originals that nothing else held are collected
 * meanwhile, and it finds them missing. */
function drop(stored: Stored): void {
  const session = sessionOf(stored.key);
  if (session && tabAlive(session, Date.now())) return;
  if (safeStorage.getItem(stored.key) !== stored.raw) return;
  safeStorage.removeItem(stored.key);
  if (session) safeStorage.removeItem(aliveKey(session));
  for (const listener of pruneListeners) listener();
}

/** A mark that outlived its record: the page died before it wrote one, or its record was pruned
 * or taken. A mark with a record goes with the record. And the away mark of a page that never
 * came back: no back/forward cache keeps a page for a day. */
function dropOldMarks(now: number): void {
  for (const key of safeStorage.keys()) {
    if (key.startsWith(AWAY_PREFIX)) {
      const left = Number(safeStorage.getItem(key));
      if (!Number.isFinite(left) || now - left > KEEP_MARK_MS) safeStorage.removeItem(key);
      continue;
    }
    if (!key.startsWith(ALIVE_PREFIX)) continue;
    if (safeStorage.getItem(recordKey(key.slice(ALIVE_PREFIX.length))) !== null) continue;
    const value = safeStorage.getItem(key) ?? '';
    const seen = Number(value.startsWith(TAKEN) ? value.slice(TAKEN.length) : value);
    if (!Number.isFinite(seen) || now - seen > KEEP_MARK_MS) safeStorage.removeItem(key);
  }
}

function copyBeforeDelete(stored: Stored, destination: string, ownTab = false): boolean {
  if (stored.key === destination) return true;
  if (!verifiedWrite(destination, stored.raw)) return false;
  handOver(stored, ownTab);
  return true;
}

/** Where the copy of a record this app could not read is kept: a key of its own, so that the
 * copy of another record does not go over it. */
function backupKeyOf(stored: Stored): string {
  return `${AUTOSAVE_BACKUP_KEY}.${sessionOf(stored.key) ?? 'legacy'}`;
}

/** Copy an unreadable record out of the way, then let its record go; no more than
 * `MAX_UNREADABLE` such copies stay, the one just made among them. */
function backUp(stored: Stored): boolean {
  const destination = backupKeyOf(stored);
  if (!copyBeforeDelete(stored, destination)) return false;
  const savedAt = (key: string): number => {
    try {
      const record = JSON.parse(safeStorage.getItem(key) ?? '') as { savedAt?: unknown };
      return typeof record.savedAt === 'number' ? record.savedAt : 0;
    } catch {
      return 0;
    }
  };
  const others = safeStorage
    .keys()
    .filter((key) => key.startsWith(`${AUTOSAVE_BACKUP_KEY}.`) && key !== destination)
    .map((key) => ({ key, at: savedAt(key) }))
    .sort((a, b) => b.at - a.at);
  for (const { key } of others.slice(MAX_UNREADABLE - 1)) safeStorage.removeItem(key);
  return true;
}

function needsRetry(): boolean {
  return lastWriteOk === false || pendingRecovery !== null || pendingBackups.size > 0;
}

function write(): void {
  const generation = ++writeGeneration;
  // An unreadable record may occupy our own slot. Never overwrite it while its backup is only
  // in memory; quota and write-denied errors leave it intact for this or a later app version.
  for (const [key, stored] of pendingBackups) {
    if (backUp(stored)) pendingBackups.delete(key);
  }
  if (pendingBackups.size > 0) {
    reportWrite(false);
    return;
  }
  const project = useProjectStore.getState().project;
  const { fileName, dirty, documentId, session } = useDocumentStore.getState();
  const hashes = projectMediaHashes(project);
  const destination = recordKey(sessionId());
  const mediaOwner = `recovery:${destination}:${session}`;
  const record: AutosaveRecord = {
    v: hashes.length ? 4 : 3,
    ...(hashes.length ? { mediaOwner } : {}),
    savedAt: Date.now(),
    name: project.meta.name,
    fileName,
    dirty,
    documentId,
    text: serializeProject(project),
  };
  const publish = () => {
    if (generation !== writeGeneration || useDocumentStore.getState().session !== session) return;
    const ok = verifiedWrite(destination, JSON.stringify(record));
    reportWrite(ok);
    if (!ok) return;
    owner().published = true;
    // New/Open can replace a document while retry is pending. Its source remains recoverable;
    // a successful write of a different document does not authorize deleting that source.
    if (pendingRecovery?.documentSession === session) handOver(pendingRecovery.stored);
    pendingRecovery = null;
    rememberSource(null);
  };
  const known = recoveryMedia.get(mediaOwner);
  if (
    !hashes.length ||
    (known?.settled && hashes.every((hash) => known.held.has(hash) || known.absent.has(hash)))
  ) {
    // Once originals are pinned, ordinary trim/volume changes still flush synchronously on unload.
    publish();
    return;
  }
  mediaWriteQueue = mediaWriteQueue
    .catch(() => undefined)
    .then(async () => {
      // Only committed sets accumulate: a failed pin must not poison every later recovery write.
      // An original that is not stored does not hold the record back: the record says what the
      // project is, and the owner holds what there is of it.
      const captured = [...new Set([...(recoveryMedia.get(mediaOwner)?.held ?? []), ...hashes])];
      const arrivals = mediaArrivals;
      const absent = new Set(
        await mediaRepository.pinAvailable(mediaOwner, captured, derivedMediaHashes(project)),
      );
      // A pin that looked before the knowledge was put in doubt settles nothing: the owner holds
      // what it found, and the next write looks again.
      const settled = arrivals === mediaArrivals;
      recoveryMedia.set(mediaOwner, {
        held: new Set(captured.filter((hash) => !absent.has(hash))),
        absent: settled ? absent : new Set(),
        settled,
      });
      publish();
    })
    .catch((error: unknown) => {
      if (generation !== writeGeneration) return;
      reportWrite(false);
      notify({
        kind: 'error',
        title: project.formulas.some((formula) => formula.kind === 'text' && formula.geometry)
          ? 'Project recovery could not be saved'
          : 'Audio recovery could not be saved',
        message: String(error),
      });
    });
}

function readStored(key: string): Stored | null {
  const raw = safeStorage.getItem(key);
  if (!raw) return null;
  let record: RawRecord = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) record = parsed as RawRecord;
  } catch {
    // not JSON: an empty record, reported as damaged
  }
  return { key, raw, record };
}

/** What the collection of abandoned originals (`mediaCollection.ts`) asks the autosave: which
 * pages may come back to what they own, and which recovery owners the stored records name.
 * - A page seen lately is there. One that left in order (no mark) is not, unless it left for the
 *   back/forward cache less than a day ago: it may be shown again as it was.
 * - Behind a stale mark the page crashed, or the browser suspended or discarded it, and those
 *   come back: to its record, as long as it has one (a taken record counts: it waits for that
 *   very page), and for a day without one, which is how long such a mark is kept.
 * - Every record names its owner: the listed ones, the hidden ones, the one of older versions
 *   and the backup of an unreadable one.
 * - A page name that is not a session of this app says nothing (null).
 * `sees` is false when this page cannot read its own alive mark: then it cannot tell which
 * other pages are there, and must not judge them. */
export function autosaveClaims(now = Date.now()): MediaClaims & { sees: boolean } {
  const own = sessionId();
  const named = new Set<string>();
  for (const key of safeStorage.keys()) {
    if (key !== LEGACY_AUTOSAVE_KEY && !key.startsWith(AUTOSAVE_PREFIX)) continue;
    const owner = readStored(key)?.record.mediaOwner;
    if (typeof owner === 'string') named.add(owner);
  }
  return {
    sees: safeStorage.getItem(aliveKey(own)) !== null,
    named,
    pageMayReturn(page) {
      // An owner names its page by the session; a recovery owner, by the session's record key.
      const session = sessionOf(page) ?? page;
      if (session === own) return true;
      // Not a session: an owner of an earlier version, whose pages no mark speaks for.
      if (!SESSION_ID.test(session)) return null;
      const mark = readMark(session, now);
      if (mark.state === 'alive') return true;
      if (mark.state === 'gone') {
        const left = Number(safeStorage.getItem(awayKey(session)));
        return left > 0 && now - left <= KEEP_MARK_MS;
      }
      return safeStorage.getItem(recordKey(session)) !== null || now - mark.at <= KEEP_MARK_MS;
    },
  };
}

/** The unreadable record last reported. */
let reported: string | null = null;

/** Load `stored` into the app. On failure it is backed up and offered as a download. If the
 * backup cannot be written, retain the original and retry before the next autosave. */
function restoreStored(stored: Stored): boolean {
  const { raw, record } = stored;
  let reason: string;
  let text = raw;
  if ([1, 2, 3, 4].includes(record.v ?? 0) && typeof record.text === 'string') {
    text = record.text;
    const parsed = parseProject(record.text);
    if (parsed.ok) {
      loadProject(parsed.project);
      const project = useProjectStore.getState().project;
      const fileName = typeof record.fileName === 'string' ? record.fileName : null;
      const documentId = typeof record.documentId === 'string' ? record.documentId : undefined;
      const document = useDocumentStore.getState();
      if (record.dirty) document.markDirty({ fileName, documentId });
      else document.beginDocument(project, { fileName, handle: null, documentId });
      return true;
    }
    reason = parsed.error;
  } else if (record.v === undefined && Object.keys(record).length === 0) {
    reason = 'The autosave is damaged.';
  } else {
    reason = 'The autosave was written by another version of the app.';
  }
  if (!backUp(stored)) {
    pendingBackups.set(stored.key, stored);
    rememberSource(stored.key);
    reportWrite(false);
  } else {
    pendingBackups.delete(stored.key);
    if (owner().recoverySource === stored.key) rememberSource(null);
  }
  // Once per record (React's StrictMode runs the app's initializer twice in development).
  if (raw === reported) return false;
  reported = raw;
  notify({
    kind: 'error',
    title: 'Could not restore the autosaved project',
    message: `${reason} Download it to keep a copy.`,
    action: {
      label: 'Download it',
      run: () => downloadBlob('autosave.mfe.json', new Blob([text], { type: 'application/json' })),
    },
  });
  return false;
}

/** The record is this tab's from now on: under its key, gone from the old one. */
function takeOver(stored: Stored): void {
  const own = recordKey(sessionId());
  const ok = copyBeforeDelete(stored, own, stored.key === owner().previous);
  if (ok) owner().published = true;
  reportWrite(ok);
  pendingRecovery = ok ? null : { stored, documentSession: useDocumentStore.getState().session };
  rememberSource(ok ? null : stored.key);
}

/** The one record of older versions becomes the record of a tab that is gone. */
function migrateLegacy(): Stored | null {
  const stored = readStored(LEGACY_AUTOSAVE_KEY);
  if (!stored) return null;
  const destination = recordKey('legacy');
  // Preserve a previous incomplete migration too; startup can recover the legacy source
  // directly when there is no room for the intermediate copy.
  const existing = safeStorage.getItem(destination);
  if (existing !== null && existing !== stored.raw) return stored;
  if (copyBeforeDelete(stored, destination)) return null;
  reportWrite(false);
  return stored;
}

/** What File → Recover autosave offers: a record of a tab that is gone. */
export interface Recoverable {
  session: string;
  name: string;
  fileName: string | null;
  dirty: boolean;
  savedAt: number;
}

/** The records of tabs that are gone, other than this tab's, newest first: at most
 * MAX_RECOVERABLE. A record another page already took is not offered again: it only waits for
 * its own tab. Pruning happens on the way:
 * - any record goes a week after its page was last there (its last save or its mark, whichever
 *   is later);
 * - of the tabs that were closed, and of the records that were taken, only the newest
 *   MAX_RECOVERABLE stay;
 * - a record behind a stale mark is never ended by count. Its page may be one the browser
 *   suspended or discarded, which comes back to its tab and has no other copy: beyond the list's
 *   length it is just not listed. */
export function recoverableAutosaves(now = Date.now()): Recoverable[] {
  const own = sessionId();
  const protectedKeys = new Set([
    owner().recoverySource,
    pendingRecovery?.stored.key,
    ...pendingBackups.keys(),
  ]);
  const found: { item: Recoverable; closed: boolean }[] = [];
  const taken: { stored: Stored; at: number }[] = [];
  for (const key of safeStorage.keys()) {
    const other = sessionOf(key);
    if (other === null || other === own || protectedKeys.has(key)) continue;
    const mark = readMark(other, now);
    if (mark.state === 'alive') continue;
    const stored = readStored(key);
    if (!stored) continue;
    const { record } = stored;
    const savedAt = typeof record.savedAt === 'number' ? record.savedAt : 0;
    // The record of older versions is kept whatever its age: it is what the app last showed.
    if (other !== 'legacy' && now - Math.max(savedAt, mark.at) > KEEP_RECOVERABLE_MS) {
      drop(stored);
      continue;
    }
    if (mark.state === 'taken') {
      taken.push({ stored, at: mark.at });
      continue;
    }
    found.push({
      closed: mark.state === 'gone',
      item: {
        session: other,
        name: typeof record.name === 'string' ? record.name : 'Untitled',
        fileName: typeof record.fileName === 'string' ? record.fileName : null,
        dirty: record.dirty === true,
        savedAt,
      },
    });
  }
  taken.sort((a, b) => b.at - a.at);
  for (const extra of taken.splice(MAX_RECOVERABLE)) drop(extra.stored);
  found.sort((a, b) => b.item.savedAt - a.item.savedAt);
  for (const extra of found.splice(MAX_RECOVERABLE)) {
    if (!extra.closed) continue;
    const stored = readStored(recordKey(extra.item.session));
    if (stored) drop(stored);
  }
  return found.map((entry) => entry.item);
}

/** Load the autosaved project, if any: this tab's own record (a reload), else the newest of a
 * tab that is gone, which becomes this tab's. Returns true when one was restored. A tab whose
 * previous page still looks alive restores nothing yet (`awaitPrevious`). */
export function restoreAutosave(): boolean {
  const page = owner();
  const legacy = migrateLegacy();
  const retry = page.recoverySource ? readStored(page.recoverySource) : null;
  const own = readStored(recordKey(page.id));
  const previousSession = page.previous ? sessionOf(page.previous) : null;
  // A crash leaves a fresh mark behind (no pagehide ran). The page a reload replaced is gone
  // all the same: its mark goes, so that its record can be handed over at once.
  if (previousSession && page.reloaded) safeStorage.removeItem(aliveKey(previousSession));
  const previousAlive = previousSession !== null && tabAlive(previousSession, Date.now());
  const previous = previousSession && !previousAlive ? readStored(page.previous!) : null;
  if (previousAlive && safeStorage.getItem(page.previous!) !== null) {
    const seen = safeStorage.getItem(aliveKey(previousSession));
    if (seen !== null) page.awaiting = { session: previousSession, seen };
  }
  // A page that waits for its previous record takes no other meanwhile: what the tab showed
  // before is on its way, and another tab's work would only stand in front of it.
  const stored = retry ?? own ?? previous ?? legacy ?? (page.awaiting ? null : newestRecoverable());
  if (!stored) return false;
  const restored = restoreStored(stored);
  if (restored) {
    takeOver(stored);
    page.restored = true;
  }
  return restored;
}

function newestRecoverable(): Stored | null {
  const [first] = recoverableAutosaves();
  return first ? readStored(recordKey(first.session)) : null;
}

/** File → Recover autosave: bring back the record of `session` (after the unsaved-changes
 * question); it becomes this tab's. */
export async function recoverAutosave(session: string): Promise<boolean> {
  if (!(await confirmDiscard())) return false;
  const stored = readStored(recordKey(session));
  if (!stored || ['alive', 'taken'].includes(presence(session, Date.now()))) {
    notify({ kind: 'warning', title: 'That autosave is gone', message: 'Another tab took it.' });
    return false;
  }
  const restored = restoreStored(stored);
  if (restored) takeOver(stored);
  return restored;
}

/** A restored browser session, seen from the page: sessionStorage names the tab's previous page,
 * the load is not a reload, and that page's mark is fresh, because the browser died without
 * running pagehide. A duplicated tab whose original is open looks the same, so startup leaves
 * the record alone. A dead page never refreshes its mark again: once the mark it had would
 * expire, an unchanged one says the page is gone. Its record then comes back by itself if the
 * user has not used this page yet, and through a notice otherwise: nothing replaces what the
 * user is doing. Returns a function that stops waiting. */
function awaitPrevious(page: PageOwner): () => void {
  const waiting = page.awaiting!;
  const documentSession = useDocumentStore.getState().session;
  let used = false;
  const onInput = () => {
    used = true;
  };
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('pointerdown', onInput, true);
    window.removeEventListener('keydown', onInput, true);
  };
  const look = () => {
    stop();
    page.awaiting = null;
    // Refreshed: that page is open. Removed: it left in order meanwhile, and its record is
    // listed like any other. Marked as taken: another page has it.
    if (safeStorage.getItem(aliveKey(waiting.session)) !== waiting.seen) return;
    const stored = readStored(recordKey(waiting.session));
    if (!stored) return;
    const name = typeof stored.record.name === 'string' ? stored.record.name : 'Untitled';
    const document = useDocumentStore.getState();
    const untouched =
      !used &&
      !page.restored &&
      !document.dirty &&
      document.fileName === null &&
      document.session === documentSession;
    if (!untouched) {
      const savedAt = typeof stored.record.savedAt === 'number' ? stored.record.savedAt : 0;
      notify({
        kind: 'warning',
        title: "Work from this tab's last session is available",
        message: `“${name}”, autosaved ${timeAgo(savedAt)}. Recover it now, or later from File → Recover autosave.`,
        action: { label: 'Recover', run: () => void recoverAutosave(waiting.session) },
      });
      return;
    }
    if (!restoreStored(stored)) return;
    takeOver(stored);
    page.restored = true;
    void restoreDocumentHandle();
    notify({
      kind: 'info',
      title: 'Restored from the autosave',
      message: `“${name}” was open in this tab before.`,
    });
  };
  window.addEventListener('pointerdown', onInput, true);
  window.addEventListener('keydown', onInput, true);
  // A live page refreshes its mark within STALE_AFTER_MS whatever the clocks say.
  const expires = Number(waiting.seen) + STALE_AFTER_MS - Date.now();
  const wait = Math.min(Math.max(0, expires), STALE_AFTER_MS);
  const timer = setTimeout(look, wait + RECHECK_MARGIN_MS);
  return stop;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago". */
export function timeAgo(savedAt: number, now = Date.now()): string {
  const minutes = Math.round((now - savedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Start writing autosaves and marking the tab alive; returns a stop function. Pending writes
 * are flushed when the page is hidden or closed, so a reload right after an edit loses nothing;
 * the alive mark goes with the page, so a new tab may take the record over. */
export function startAutosave(delayMs = AUTOSAVE_DELAY_MS): () => void {
  const first = owner();
  /** The writer of this page now, and every id it has had. A page gets another id when the
   * browser's storage is emptied under it ("Clear site data" with the tab open: `owner` finds
   * no session and names a new one). Its record goes on under the new id; what it owns in the
   * media store is still named after the first, so each of them stays marked alive. */
  let page = first;
  const ids = new Set([first.id]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer === null && !needsRetry()) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    write();
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };
  const beat = () => {
    const now = String(Date.now());
    for (const id of ids) safeStorage.setItem(aliveKey(id), now);
  };
  const gone = () => {
    for (const id of ids) safeStorage.removeItem(aliveKey(id));
  };
  const offProject = useProjectStore.subscribe((state, previous) => {
    if (state.project !== previous.project) schedule();
  });
  const offDocument = useDocumentStore.subscribe((state, previous) => {
    if (state.dirty !== previous.dirty || state.fileName !== previous.fileName) schedule();
  });
  // An original the record lacked may be back (the same file imported again): the next write
  // pins its owner anew, so that the record does not lose it once more when this page is gone.
  const offArrival = onMediaArrival(() => {
    unsettleRecoveryMedia();
    // Only a project that names originals has an owner to write.
    if (projectMediaHashes(useProjectStore.getState().project).length) schedule();
  });
  /** The page is here, still or again. While it looked gone — in the back/forward cache (pagehide
   * runs on the way in), suspended, or with its timers throttled in the background — another
   * page may have taken its record and its mark: it goes on under its own writer, with its own
   * state. A page that never had a record has nothing to put back. */
  const revive = () => {
    // A page that had a record keeps having one, under whatever id it writes now: once written
    // under a new id, it is there, and nothing is written again for its sake.
    const had = page.published;
    page = owner();
    ids.add(page.id);
    beat();
    for (const id of ids) safeStorage.removeItem(awayKey(id));
    if ((had || page.published) && safeStorage.getItem(recordKey(page.id)) === null) {
      // With no record to name it, the owner of its originals may have been collected too.
      unsettleRecoveryMedia();
      write();
    } else if (needsRetry()) flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
    else revive();
  };
  const onPageHide = (event: PageTransitionEvent) => {
    flush();
    gone();
    // A page on its way into the back/forward cache (`persisted`) may be shown again: it keeps
    // what its history owns, and says where it went. Any other page that hides is leaving for
    // good: its history owner goes, once the recovery owner holds what the last write needs.
    // The browser promises nothing about this; what stays behind, another page collects
    // (`mediaCollection.ts`).
    if (event.persisted) for (const id of ids) safeStorage.setItem(awayKey(id), String(Date.now()));
    else void mediaWriteQueue.then(releaseMediaOwnership).catch(() => undefined);
  };
  dropOldMarks(Date.now());
  beat();
  if (needsRetry()) schedule();
  const heartbeat = setInterval(revive, ALIVE_INTERVAL_MS);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', revive);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('resume', revive);
  const stopWaiting = first.awaiting ? awaitPrevious(first) : null;
  return () => {
    stopWaiting?.();
    offProject();
    offDocument();
    offArrival();
    clearInterval(heartbeat);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', revive);
    window.removeEventListener('beforeunload', flush);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('resume', revive);
    flush();
    gone();
  };
}
