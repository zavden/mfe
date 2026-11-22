// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import {
  createAttach,
  createClip,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createPartTransform,
  createTween,
  type Clip,
  type Project,
} from '../../../model';
import {
  alignRefusal,
  alignSummary,
  alignWarnings,
  nearestOnScreen,
  refusalNotice,
  seconds,
  type AlignedMove,
  type EditRights,
} from '../symbolHold';

const FREE: EditRights = { editing: null, unlocked: [] };
const UNLOCKED: EditRights = { editing: null, unlocked: ['a'] };

/** Clip `a` of a formula of two glyphs, on screen from 10 s to 20 s. */
function build(): { project: Project; clip: Clip } {
  const project = createEmptyProject('t');
  const formula = { ...createFormula({ name: 'eq6', source: 'x=' }), id: 'fa' };
  project.formulas = [formula];
  const clip = createClip('fa', project.tracks[0]!.id, 10, 20);
  clip.id = 'a';
  project.clips = [clip];
  return { project, clip };
}

const refusal = (project: Project, clip: Clip, t: number, rights = FREE, glyph = 0) =>
  alignRefusal(project, clip, glyph, t, rights);

describe('whether a formula can be aligned by a symbol as it is at an instant', () => {
  it('can, when nothing transforms it: its initial state is what moves', () => {
    const { project, clip } = build();
    expect(refusal(project, clip, 12)).toBeNull();
    expect(refusal(project, clip, 10)).toBeNull();
  });

  it('cannot when it hangs on another clip, is on a locked track or locked in the preview', () => {
    const { project, clip } = build();
    clip.attach = createAttach('host', 'all');
    expect(refusal(project, clip, 12)).toEqual({ kind: 'attached', to: ['host'] });
    clip.attach = null;
    clip.previewLocked = true;
    expect(refusal(project, clip, 12)).toEqual({ kind: 'locked' });
    clip.previewLocked = false;
    project.tracks[0]!.locked = true;
    expect(refusal(project, clip, 12)).toEqual({ kind: 'locked' });
  });

  it('cannot after one of its transformations while the clip is locked after them', () => {
    const { project, clip } = build();
    const tween = createTween(2, 1, { position: [3, 0] }); // 12 s to 13 s
    clip.actions.push(tween);
    // Before the transformation, the initial state moves: free.
    expect(refusal(project, clip, 11)).toBeNull();
    // Once it has started, its end is the keyframe: locked.
    expect(refusal(project, clip, 12)).toEqual({ kind: 'after-transform' });
    expect(refusal(project, clip, 15)).toEqual({ kind: 'after-transform' });
    // Unlocked, or with that end state under edit, it can — once the transformation is over.
    expect(refusal(project, clip, 15, UNLOCKED)).toBeNull();
    expect(refusal(project, clip, 13, UNLOCKED)).toBeNull();
    const editing = { clipId: 'a', actionId: tween.id, time: 13 };
    expect(refusal(project, clip, 13, { editing, unlocked: [] })).toBeNull();
  });

  it('cannot while a transformation of the formula runs: a shift of its end shows in part', () => {
    const { project, clip } = build();
    const tween = createTween(2, 1, { opacity: 0.5 }, 'linear'); // 12 s to 13 s, no travel
    clip.actions.push(tween);
    const moving = { kind: 'moving', what: 'tween', from: 12, until: 13 };
    // From its first instant (where nothing of it shows yet) to its last.
    expect(refusal(project, clip, 12, UNLOCKED)).toEqual(moving);
    expect(refusal(project, clip, 12.5, UNLOCKED)).toEqual(moving);
    expect(refusal(project, clip, 12.999, UNLOCKED)).toEqual(moving);
    expect(refusal(project, clip, 13, UNLOCKED)).toBeNull();
    // A transformation with no duration is never running.
    tween.duration = 0;
    expect(refusal(project, clip, 12, UNLOCKED)).toBeNull();
  });

  it('can at the middle of a transformation that comes back: it is at its target there', () => {
    const { project, clip } = build();
    const tween = createTween(2, 2, { position: [3, 0] }, 'there_and_back'); // 12 s to 14 s
    clip.actions.push(tween);
    // The end icon of that block looks at its middle, with its end state under edit.
    const editing = { clipId: 'a', actionId: tween.id, time: 13 };
    expect(refusal(project, clip, 13, { editing, unlocked: [] })).toBeNull();
    expect(refusal(project, clip, 13, UNLOCKED)).toBeNull();
    expect(refusal(project, clip, 12.5, UNLOCKED)).toMatchObject({ kind: 'moving', what: 'tween' });
    // Once over, it left the formula where it was: the initial state is the keyframe again.
    expect(refusal(project, clip, 15)).toBeNull();
  });

  it('cannot while a transformation of the part the symbol is in runs, or an emphasis', () => {
    const { project, clip } = build();
    clip.actions.push(createPartTransform(2, [0], { duration: 1, shift: [0, 1] })); // 12–13 s
    expect(refusal(project, clip, 12.5)).toEqual({
      kind: 'moving',
      what: 'part',
      from: 12,
      until: 13,
    });
    // Another glyph of the formula is at rest, and so is that one once the block is over.
    expect(refusal(project, clip, 12.5, FREE, 1)).toBeNull();
    expect(refusal(project, clip, 13)).toBeNull();
    // A part transform that only recolours moves nothing.
    clip.actions = [createPartTransform(2, [0], { duration: 1, color: '#ff0000' })];
    expect(refusal(project, clip, 12.5)).toBeNull();
    // An Indicate swells its glyphs while it runs; a Flash draws around them and moves nothing.
    clip.actions = [createEmphasis(2, 'indicate', [0], { duration: 1 })];
    expect(refusal(project, clip, 12.5)).toMatchObject({ kind: 'moving', what: 'emphasis' });
    expect(refusal(project, clip, 12.5, FREE, 1)).toBeNull();
    clip.actions = [createEmphasis(2, 'wiggle', 'all', { duration: 1 })];
    expect(refusal(project, clip, 12.5, FREE, 1)).toMatchObject({ what: 'emphasis' });
    clip.actions = [createEmphasis(2, 'flash', 'all', { duration: 1 })];
    expect(refusal(project, clip, 12.5)).toBeNull();
  });

  it('cannot while the end state of one of its parts is under edit', () => {
    const { project, clip } = build();
    const part = createPartTransform(2, [0], { duration: 1, shift: [0, 1] });
    clip.actions.push(part);
    const editing = { clipId: 'a', actionId: part.id, time: 13 };
    expect(refusal(project, clip, 13, { editing, unlocked: [] })).toEqual({ kind: 'part-edit' });
  });
});

describe('what the notice of a refusal says', () => {
  const who = { name: 'eq6', label: '=' };

  it('names the symbol and the instant when it was being kept, the formula when aligned', () => {
    const moving = { kind: 'moving', what: 'tween', from: 17.6, until: 18.4 } as const;
    const kept = refusalNotice(moving, 'keep', who, 18);
    expect(kept.title).toBe('“=” cannot be kept at 18.00 s');
    expect(kept.message).toBe(
      '“=” is moving at 18.00 s: a transformation of the formula runs from 17.60 s to 18.40 s, ' +
        'so an alignment made there would not hold. Keep it at a time when it is at rest.',
    );
    const aligned = refusalNotice(moving, 'align', who, 18);
    expect(aligned.title).toBe('“eq6” was not moved');
    expect(aligned.message).toContain('Align it at a time when it is at rest.');
    expect(refusalNotice({ ...moving, what: 'part' }, 'keep', who, 18).message).toContain(
      'a transformation of that part runs',
    );
    expect(refusalNotice({ ...moving, what: 'emphasis' }, 'keep', who, 18).message).toContain(
      'an emphasis runs',
    );
  });

  it('says what to do about each of the other reasons', () => {
    const message = (kind: 'off-screen' | 'locked' | 'part-edit' | 'after-transform') =>
      refusalNotice({ kind }, 'keep', who, 15).message;
    expect(message('off-screen')).toContain('“eq6” is not on screen at 15.00 s');
    expect(message('off-screen')).toContain('press G');
    expect(message('locked')).toContain('on a locked track, or locked in the preview');
    expect(message('part-edit')).toContain('Finish that edit first');
    expect(message('after-transform')).toContain('unlock the clip with the padlock');
    const attached = refusalNotice({ kind: 'attached', to: ['h'] }, 'align', who, 15, '“eq5”');
    expect(attached.message).toContain('“eq6” is attached to “eq5”');
    expect(attached.message).toContain('Detach');
  });
});

describe('the instant nearest to another at which a clip is on screen', () => {
  it('is that instant when the clip is there, else its first or its last one', () => {
    const clip = { start: 10, end: 20 };
    expect(nearestOnScreen(clip, 12, 30)).toBe(12);
    expect(nearestOnScreen(clip, 4, 30)).toBe(10);
    const last = nearestOnScreen(clip, 25, 30);
    expect(last).toBeLessThan(20);
    expect(last).toBeGreaterThan(19.99999);
    // A clip that lasts to the end of the scene is on screen at its end too.
    expect(nearestOnScreen(clip, 20, 20)).toBe(20);
  });
});

describe('what moves beyond an alignment between two instants', () => {
  const box = (x: number): Box => ({ minX: x, minY: 0, maxX: x + 1, maxY: 1 });
  const move = (clip: Clip, fields: Partial<AlignedMove> = {}): AlignedMove => ({
    clip,
    glyph: 0,
    at: 18,
    ref: { kind: 'initial' },
    name: 'eq6',
    label: '=',
    ...fields,
  });

  it('is nothing for a formula without transformations and a reference that stays', () => {
    const { clip } = build();
    expect(alignWarnings(move(clip))).toEqual([]);
    const reference = { name: 'eq5', label: '=', at: 15, box: box(0), near: 17, nearBox: box(0) };
    expect(alignWarnings(move(clip, { reference }))).toEqual([]);
    // A reference that could not be measured again is not judged.
    expect(alignWarnings(move(clip, { reference: { ...reference, nearBox: null } }))).toEqual([]);
  });

  it('is every transformation that takes the formula to a position of its own', () => {
    const { clip } = build();
    clip.actions.push(createTween(9, 0.5, { position: [1, 1] })); // 19 s
    clip.actions.push(createTween(4, 0.5, { scale: 2 })); // 14 s: it follows, no position
    expect(alignWarnings(move(clip))).toEqual([
      'The transformation of “eq6” at 19.00 s takes it to a position of its own, which did ' +
        'not move.',
    ]);
    clip.actions.push(createTween(6, 0.5, { position: [2, 2] })); // 16 s
    expect(alignWarnings(move(clip))).toEqual([
      'The transformations of “eq6” at 16.00 s, 19.00 s take it to positions of their own, ' +
        'which did not move.',
    ]);
  });

  it('is what came before, when the end of a transformation is what moved', () => {
    const { clip } = build();
    const first = createTween(2, 1, { position: [1, 1] }); // 12 s
    const second = createTween(5, 1, { position: [2, 2] }); // 15 s
    const third = createTween(9, 0.5, { position: [3, 3] }); // 19 s
    clip.actions.push(third, first, second);
    expect(alignWarnings(move(clip, { ref: { kind: 'action', actionId: second.id } }))).toEqual([
      'Only the end of the transformation at 15.00 s moved: before it, “eq6” is where it was.',
      'The transformation of “eq6” at 19.00 s takes it to a position of its own, which did ' +
        'not move.',
    ]);
  });

  it('is a part transform that has moved the symbol by the kept instant', () => {
    const { clip } = build();
    clip.actions.push(createPartTransform(2, [0], { duration: 1, shift: [0, 1] })); // 12 s
    expect(alignWarnings(move(clip))).toEqual([
      '“=” was moved by a transformation of its part (at 12.00 s): the symbols line up from ' +
        'then on, not before.',
    ]);
    // Not one of another glyph, one that comes later, one that came back or only recoloured.
    expect(alignWarnings(move(clip, { glyph: 1 }))).toEqual([]);
    expect(alignWarnings(move(clip, { at: 11 }))).toEqual([]);
    clip.actions = [
      createPartTransform(2, [0], { duration: 1, shift: [0, 1], easing: 'there_and_back' }),
      createPartTransform(4, [0], { duration: 1, color: '#ff0000' }),
    ];
    expect(alignWarnings(move(clip))).toEqual([]);
  });

  it('is a reference that is elsewhere near the kept instant', () => {
    const { clip } = build();
    const reference = { name: 'eq5', label: '+', at: 15, box: box(0), near: 17, nearBox: box(2) };
    expect(alignWarnings(move(clip, { reference }))).toEqual([
      'The reference “+” of “eq5” moves between 15.00 s and 17.00 s: it was taken where it is ' +
        'at 15.00 s.',
    ]);
    // Whichever instant comes first.
    expect(alignWarnings(move(clip, { reference: { ...reference, at: 19 } }))[0]).toContain(
      'moves between 17.00 s and 19.00 s: it was taken where it is at 19.00 s',
    );
  });
});

describe('what the closing notice says was done', () => {
  it('names both symbols, each with its instant, and the side', () => {
    const moved = { name: 'eq6', label: '=', at: 18 };
    const reference = { name: 'eq5', label: '+', at: 15 };
    expect(alignSummary(moved, reference, 'LEFT')).toEqual({
      title: '“eq6” moved',
      message: 'The left edge of its “=” as at 18.00 s is on that of “+” of “eq5” as at 15.00 s.',
    });
    expect(alignSummary(moved, reference, 'CENTER').message).toContain('The centre of its “=”');
    expect(seconds(1.005)).toBe('1.00 s');
  });
});
