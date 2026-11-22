import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createTween,
  setIdGenerator,
  type Clip,
  type Project,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import {
  blockDescription,
  clipDescription,
  isNavKey,
  moveItem,
  nudgedClip,
  revealScroll,
  sameItem,
  tabStop,
  type TimelineItem,
} from '../keyboardNav';
import { tracksLayout } from '../trackLayout';

/* Three tracks: t1 holds a (0–4, three blocks on two lanes) and b (6–9); t2 is empty; t3 holds
 * c (2–5). Blocks of a: x 0–2 and z 2.5–3.5 on one lane, y 1–3 on another. */
function build(edit?: (p: Project) => void): Project {
  setIdGenerator(sequentialIds());
  const p = createEmptyProject('t');
  p.tracks = [
    { id: 't1', kind: 'visual', name: 'Track 1', hidden: false, muted: false, locked: false },
    { id: 't2', kind: 'visual', name: 'Track 2', hidden: false, muted: false, locked: false },
    { id: 't3', kind: 'visual', name: 'Track 3', hidden: false, muted: false, locked: false },
  ];
  const clip = (id: string, trackId: string, start: number, end: number): Clip => {
    const c = createClip('f', trackId, start, end);
    c.id = id;
    return c;
  };
  const a = clip('a', 't1', 0, 4);
  a.actions = [
    { ...createTween(0, 2, {}), id: 'x' },
    { ...createTween(1, 2, {}), id: 'y' },
    { ...createTween(2.5, 1, {}), id: 'z' },
  ];
  p.clips = [a, clip('b', 't1', 6, 9), clip('c', 't3', 2, 5)];
  edit?.(p);
  return p;
}

const clipItem = (clipId: string): TimelineItem => ({ kind: 'clip', clipId });
const blockItem = (clipId: string, actionId: string): TimelineItem => ({
  kind: 'block',
  clipId,
  actionId,
});

describe('tabStop', () => {
  it('is the selected block, else the first selected clip, else the first clip', () => {
    const p = build();
    expect(tabStop({ kind: 'action', clipId: 'a', actionId: 'y' }, p)).toEqual(blockItem('a', 'y'));
    expect(tabStop({ kind: 'clips', ids: ['c', 'b'] }, p)).toEqual(clipItem('b'));
    expect(tabStop({ kind: 'none' }, p)).toEqual(clipItem('a'));
    expect(tabStop({ kind: 'formula', id: 'f' }, p)).toEqual(clipItem('a'));
    // A selection of what no longer exists falls back.
    expect(tabStop({ kind: 'action', clipId: 'a', actionId: 'gone' }, p)).toEqual(clipItem('a'));
    expect(tabStop({ kind: 'none' }, { ...p, clips: [] })).toBeNull();
  });

  it('sameItem compares kind and ids', () => {
    expect(sameItem(clipItem('a'), clipItem('a'))).toBe(true);
    expect(sameItem(clipItem('a'), blockItem('a', 'x'))).toBe(false);
    expect(sameItem(blockItem('a', 'x'), blockItem('a', 'y'))).toBe(false);
    expect(sameItem(null, null)).toBe(true);
    expect(sameItem(clipItem('a'), null)).toBe(false);
    expect(isNavKey('ArrowUp')).toBe(true);
    expect(isNavKey('Enter')).toBe(false);
  });
});

describe('moveItem', () => {
  const p = build();
  const layout = tracksLayout(p);
  const move = (key: Parameters<typeof moveItem>[0], from: TimelineItem) =>
    moveItem(key, from, p, layout);

  it('walks the clips of a track in time order, stopping at the ends', () => {
    expect(move('ArrowRight', clipItem('a'))).toEqual(clipItem('b'));
    expect(move('ArrowRight', clipItem('b'))).toBeNull();
    expect(move('ArrowLeft', clipItem('b'))).toEqual(clipItem('a'));
    expect(move('ArrowLeft', clipItem('a'))).toBeNull();
    expect(move('End', clipItem('a'))).toEqual(clipItem('b'));
    expect(move('Home', clipItem('b'))).toEqual(clipItem('a'));
    expect(move('Home', clipItem('a'))).toBeNull();
  });

  it('goes to the nearest clip of the next track that has one, skipping empty tracks', () => {
    expect(move('ArrowDown', clipItem('a'))).toEqual(clipItem('c')); // t2 is empty
    expect(move('ArrowDown', clipItem('b'))).toEqual(clipItem('c'));
    expect(move('ArrowUp', clipItem('c'))).toEqual(clipItem('a')); // c starts at 2: a (0–4) covers it
    expect(move('ArrowDown', clipItem('c'))).toBeNull();
    expect(move('ArrowUp', clipItem('b'))).toBeNull(); // no blocks, no track above
    const far = build((q) => {
      q.clips.find((c) => c.id === 'c')!.start = 7;
      q.clips.find((c) => c.id === 'c')!.end = 8;
    });
    expect(moveItem('ArrowUp', clipItem('c'), far, tracksLayout(far))).toEqual(clipItem('b'));
  });

  it('enters the blocks of a clip from its lowest lane and walks the lanes', () => {
    // Lanes: x and z share lane 0 (x first), y is on lane 1.
    expect(layout.clips.get('a')!.laneOf.get('x')).toBe(0);
    expect(layout.clips.get('a')!.laneOf.get('y')).toBe(1);
    expect(layout.clips.get('a')!.laneOf.get('z')).toBe(0);
    expect(move('ArrowUp', clipItem('a'))).toEqual(blockItem('a', 'y'));
    expect(move('ArrowUp', blockItem('a', 'y'))).toEqual(blockItem('a', 'x')); // nearest in time
    expect(move('ArrowRight', blockItem('a', 'x'))).toEqual(blockItem('a', 'z'));
    expect(move('ArrowRight', blockItem('a', 'z'))).toBeNull();
    expect(move('Home', blockItem('a', 'z'))).toEqual(blockItem('a', 'x'));
    expect(move('End', blockItem('a', 'x'))).toEqual(blockItem('a', 'z'));
    expect(move('ArrowLeft', blockItem('a', 'x'))).toBeNull();
    expect(move('ArrowDown', blockItem('a', 'z'))).toEqual(blockItem('a', 'y')); // lane below
    expect(move('ArrowDown', blockItem('a', 'y'))).toEqual(clipItem('a')); // lowest lane: the clip
    expect(move('ArrowUp', blockItem('a', 'x'))).toBeNull(); // top lane, no track above
    expect(moveItem('ArrowUp', blockItem('c', 'nope'), p, layout)).toBeNull();
    expect(moveItem('ArrowUp', clipItem('nope'), p, layout)).toBeNull();
  });

  it('from the top lane goes to the track above, by the block’s time', () => {
    const q = build((r) => {
      const c = r.clips.find((x) => x.id === 'c')!;
      c.trackId = 't1';
      c.start = 10;
      c.end = 12;
      const d = createClip('f', 't3', 0, 1);
      d.id = 'd';
      d.actions = [{ ...createTween(0, 1, {}), id: 'w' }];
      r.clips.push(d);
    });
    // d's only block (lane 0) at 0–1: the nearest clip of track 1 is a (0–4).
    expect(moveItem('ArrowUp', blockItem('d', 'w'), q, tracksLayout(q))).toEqual(clipItem('a'));
  });
});

describe('descriptions', () => {
  it('say what a clip and a block are', () => {
    const p = build();
    const a = p.clips[0]!;
    const track = { name: 'Track 1', locked: false };
    expect(clipDescription(a, 'f1', track)).toBe('f1, 0.00 to 4.00 s, Track 1, 3 blocks');
    expect(clipDescription(p.clips[1]!, 'f2', { name: 'T', locked: true })).toBe(
      'f2, 6.00 to 9.00 s, T, locked',
    );
    expect(clipDescription(p.clips[2]!, 'f3', undefined)).toBe('f3, 2.00 to 5.00 s');
    const one = { ...a, actions: a.actions.slice(0, 1) };
    expect(clipDescription(one, 'f1', track)).toBe('f1, 0.00 to 4.00 s, Track 1, 1 block');
    expect(blockDescription(a.actions[1]!, a, 1, 2)).toBe('Transform, 1.00 to 3.00 s, lane 2 of 2');
    expect(blockDescription(a.actions[0]!, { ...a, start: 1.5 }, 0, 1)).toBe(
      'Transform, 1.50 to 3.50 s',
    );
  });
});

describe('revealScroll', () => {
  // A 1000 px viewport whose first 164 px are the sticky headers.
  it('keeps the view when the stretch shows, else moves as little as needed', () => {
    expect(revealScroll(0, 1000, 164, 100, 200)).toBe(0);
    expect(revealScroll(500, 1000, 164, 600, 200)).toBe(500);
    expect(revealScroll(500, 1000, 164, 400, 50)).toBe(400); // hidden under the headers
    expect(revealScroll(0, 1000, 164, 900, 200)).toBe(264); // right edge at the viewport's
    expect(revealScroll(900, 1000, 164, 0, 100)).toBe(0);
    expect(revealScroll(0, 1000, 164, 100, 2000)).toBe(100); // too long: its start
  });
});

describe('nudgedClip', () => {
  it('moves along the track as far as the neighbours allow, and never off time 0', () => {
    const p = build();
    const a = p.clips[0]!;
    expect(nudgedClip(p, a, 0.5, 0)).toEqual({ ok: true, trackId: 't1', start: 0.5, end: 4.5 });
    expect(nudgedClip(p, a, -0.5, 0)).toEqual({ ok: false, reason: 'No room that way' });
    expect(nudgedClip(p, a, 3, 0)).toEqual({ ok: true, trackId: 't1', start: 2, end: 6 }); // up to b
    const b = p.clips[1]!;
    expect(nudgedClip(p, b, -5, 0)).toEqual({ ok: true, trackId: 't1', start: 4, end: 7 });
  });

  it('moves to the track above or below, onto free space, and refuses locked tracks', () => {
    const p = build();
    const a = p.clips[0]!;
    expect(nudgedClip(p, a, 0, 1)).toEqual({ ok: true, trackId: 't2', start: 0, end: 4 });
    expect(nudgedClip(p, a, 0, -1)).toEqual({ ok: false, reason: 'No track above' });
    const c = p.clips[2]!;
    expect(nudgedClip(p, c, 0, 1)).toEqual({ ok: false, reason: 'No track below' });
    // Onto track 1, where a (0–4) and b (6–9) sit: c (2–5, three seconds) only fits after b.
    const q = build((r) => {
      r.tracks.splice(1, 1); // t1, t3
    });
    expect(nudgedClip(q, q.clips[2]!, 0, -1)).toEqual({
      ok: true,
      trackId: 't1',
      start: 9,
      end: 12,
    });
    const locked = build((r) => {
      r.tracks[1]!.locked = true;
    });
    expect(nudgedClip(locked, locked.clips[0]!, 0, 1)).toEqual({
      ok: false,
      reason: 'Track 2 is locked',
    });
    const own = build((r) => {
      r.tracks[0]!.locked = true;
    });
    expect(nudgedClip(own, own.clips[0]!, 1, 0)).toEqual({
      ok: false,
      reason: 'Track 1 is locked',
    });
  });
});
