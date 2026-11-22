// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  abandonedOwners,
  OWNER_FORGOTTEN_MS,
  OWNER_GRACE_MS,
  OWNER_TOUCH_MS,
  type MediaClaims,
} from '../collection';
import { mediaOwnerId, ownerPage, setMediaPage } from '../ownership';
import type { MediaOwner } from '../repository';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const OLD = NOW - OWNER_GRACE_MS - 1;
const owner = (id: string, updatedAt = OLD): MediaOwner => ({ id, hashes: [], updatedAt });

/** Pages `here` may come back; the records name `named`. A page is one of the app's sessions
 * when its name, or the record key it is named by, says so. */
function claims(here: string[] = [], named: string[] = []): MediaClaims {
  return {
    pageMayReturn: (page) => (/^(mfe\.autosave\.)?s_/.test(page) ? here.includes(page) : null),
    named: new Set(named),
  };
}

const abandoned = (owners: MediaOwner[], known: MediaClaims) =>
  abandonedOwners(owners, known, NOW).map((entry) => entry.id);

describe('owner names', () => {
  it('carry the kind and the page, whatever names the page', () => {
    expect(ownerPage('history:s_Ab3dEf9h:1')).toEqual({ kind: 'history', page: 's_Ab3dEf9h' });
    expect(ownerPage('package-import:s_Ab3dEf9h:12')).toEqual({
      kind: 'package-import',
      page: 's_Ab3dEf9h',
    });
    // A recovery owner: the record key of its session, then the document.
    expect(ownerPage('recovery:mfe.autosave.s_Ab3dEf9h:3')).toEqual({
      kind: 'recovery',
      page: 'mfe.autosave.s_Ab3dEf9h',
    });
    // The page names of the versions before this one.
    expect(ownerPage('history:mh2k3j9a-4fzyo82mvyr:1')?.page).toBe('mh2k3j9a-4fzyo82mvyr');
    for (const other of ['test-import', 'history', 'history:s_x', 'history:s_x:', ':s_x:1'])
      expect(ownerPage(other)).toBeNull();
  });

  it('are made with the name the app gives its pages', () => {
    const own = ownerPage(mediaOwnerId('save'))!;
    expect(own.kind).toBe('save');
    expect(own.page).toMatch(/^p_/);
    try {
      setMediaPage(() => 's_session');
      expect(ownerPage(mediaOwnerId('import'))).toEqual({ kind: 'import', page: 's_session' });
    } finally {
      setMediaPage(() => own.page);
    }
  });
});

describe('abandoned owners', () => {
  it('are those of pages that will not come back', () => {
    const owners = [
      owner('history:s_gone:1'),
      owner('save:s_gone:4'),
      owner('import:s_gone:5'),
      owner('history:s_here:1'),
      owner('pending:s_here:2'),
    ];
    expect(abandoned(owners, claims(['s_here']))).toEqual([
      'history:s_gone:1',
      'save:s_gone:4',
      'import:s_gone:5',
    ]);
  });

  it('never include a recovery owner that a record names, whatever became of its page', () => {
    const owners = [
      owner('recovery:mfe.autosave.s_gone:0'),
      owner('recovery:mfe.autosave.s_gone:1'),
    ];
    expect(abandoned(owners, claims([], ['recovery:mfe.autosave.s_gone:1']))).toEqual([
      'recovery:mfe.autosave.s_gone:0',
    ]);
  });

  it('spare a recovery owner without a record while its page may come back', () => {
    // The page pinned it and has not published its record yet, or cannot (no room).
    expect(
      abandoned([owner('recovery:mfe.autosave.s_here:0')], claims(['mfe.autosave.s_here'])),
    ).toEqual([]);
  });

  it('do not let a record protect an owner that is not a recovery owner', () => {
    expect(abandoned([owner('history:s_gone:1')], claims([], ['history:s_gone:1']))).toEqual([
      'history:s_gone:1',
    ]);
  });

  it('spare every owner written within the grace', () => {
    const fresh = NOW - OWNER_GRACE_MS + 1;
    expect(
      abandoned([owner('history:s_gone:1', fresh), owner('recovery:r:0', fresh)], claims()),
    ).toEqual([]);
    // Written under a clock that runs ahead of this one: lately or not, nobody can tell.
    expect(abandoned([owner('history:s_gone:1', NOW + 3600_000)], claims())).toEqual([]);
    // A page that is open writes its owner again well within the grace.
    expect(OWNER_TOUCH_MS * 2).toBeLessThan(OWNER_GRACE_MS);
  });

  it('do not judge an owner this app did not name', () => {
    expect(abandoned([owner('test-import'), owner('tab-a')], claims())).toEqual([]);
  });

  it('give an owner whose page nobody can ask about a week since its last write', () => {
    // Written by the version before this one, perhaps by a tab that is still open: its pages
    // had names of their own, and no alive mark says anything about them.
    const old = ['history:mh2k3j9a-4fzyo82mvyr:1', 'save:mh2k3j9a-4fzyo82mvyr:7'];
    const idle = NOW - OWNER_FORGOTTEN_MS + 60_000;
    expect(
      abandoned(
        old.map((id) => owner(id, idle)),
        claims(),
      ),
    ).toEqual([]);
    expect(
      abandoned(
        old.map((id) => owner(id, NOW - OWNER_FORGOTTEN_MS - 1)),
        claims(),
      ),
    ).toEqual(old);
    // Its records are read like any other: a named recovery owner stays whatever its age.
    const recovery = owner('recovery:mfe.autosave.legacy:0', NOW - 2 * OWNER_FORGOTTEN_MS);
    expect(abandoned([recovery], claims([], [recovery.id]))).toEqual([]);
    expect(abandoned([recovery], claims())).toEqual([recovery.id]);
  });
});
