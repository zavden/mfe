// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAudioAsset,
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTrack,
  createTween,
  type Clip,
  type Project,
} from '../../../model';
import { applyTrim, memberRange, trimMembers, trimRange } from '../groupTrim';

/* Trimming several selected clips together (D168): who takes part, how far they can go, and
 * what the edit does. */

/** Track 1: a [1, 3] and b [4, 6]. Track 2: c [2, 5]. Track 3 (locked): d [0, 2]. A sound track:
 * s [1, 4], from the second 2 of a recording of 10 s. */
function scene() {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'f' });
  project.formulas.push(formula);
  const locked = createTrack('Locked');
  locked.locked = true;
  const sound = createAudioTrack('Sound');
  project.tracks.push(locked, sound);
  const [t1, t2] = project.tracks;
  const clip = (track: string, start: number, end: number): Clip => {
    const c = createClip(formula.id, track, start, end);
    // No intro nor outro to keep room for: the shortest clip is 0.1 s.
    c.intro.duration = 0;
    c.outro.duration = 0;
    project.clips.push(c);
    return c;
  };
  const a = clip(t1!.id, 1, 3);
  const b = clip(t1!.id, 4, 6);
  const c = clip(t2!.id, 2, 5);
  const d = clip(locked.id, 0, 2);
  const asset = createAudioAsset({
    name: 'take',
    originalName: 'take.wav',
    mimeType: 'audio/wav',
    byteLength: 1,
    contentHash: 'x'.repeat(64),
    duration: 10,
    sampleRate: 10,
    channels: 1,
  });
  project.audioAssets.push(asset);
  const s = createAudioClip(asset.id, sound.id, 1, 4, { sourceStart: 2 });
  project.audioClips.push(s);
  return { project, a, b, c, d, s, asset };
}
const ids = (members: { clip: { id: string } }[]) => members.map((m) => m.clip.id);
const near = (range: [number, number], lo: number, hi: number) => {
  expect(range[0]).toBeCloseTo(lo, 6);
  expect(range[1]).toBeCloseTo(hi, 6);
};

describe('who a trim moves', () => {
  it('the pressed clip alone, unless it is among several selected ones', () => {
    const { project, a, b, c, s } = scene();
    expect(ids(trimMembers(project, [], a.id))).toEqual([a.id]);
    expect(ids(trimMembers(project, [a.id], a.id))).toEqual([a.id]);
    // Pressed outside the selection: itself, not the selection.
    expect(ids(trimMembers(project, [b.id, c.id], a.id))).toEqual([a.id]);
    // Among the selected: all of them, a sound too, in the order of the selection.
    expect(ids(trimMembers(project, [c.id, s.id, a.id], a.id))).toEqual([c.id, s.id, a.id]);
    expect(trimMembers(project, [c.id, s.id, a.id], s.id).map((m) => m.kind)).toEqual([
      'clip',
      'audio',
      'clip',
    ]);
  });

  it('leaves out what cannot be trimmed, and nobody when the pressed clip cannot', () => {
    const { project, a, d, s } = scene();
    // A clip on a locked track stays as it is and holds nobody back.
    expect(ids(trimMembers(project, [a.id, d.id], a.id))).toEqual([a.id]);
    expect(trimMembers(project, [a.id, d.id], d.id)).toEqual([]);
    expect(trimMembers(project, [], 'gone')).toEqual([]);
    // A sound whose recording the project does not have.
    project.audioAssets = [];
    expect(ids(trimMembers(project, [a.id, s.id], a.id))).toEqual([a.id]);
    expect(trimMembers(project, [a.id, s.id], s.id)).toEqual([]);
  });
});

describe('how far the edge can go', () => {
  it('one clip: its gap on the track and its shortest length', () => {
    const { project, a, b } = scene();
    const [member] = trimMembers(project, [], a.id);
    // The end of a [1, 3]: back to 0.1 s long, forward to b at 4.
    near(memberRange(project, member!, 'end'), -1.9, 1);
    // Its start: back to 0, forward to 0.1 s long.
    near(memberRange(project, member!, 'start'), -1, 1.9);
    const [last] = trimMembers(project, [], b.id);
    expect(memberRange(project, last!, 'end')[1]).toBe(Infinity);
  });

  it('a sound: the ends of its recording and its gap', () => {
    const { project, s } = scene();
    const [member] = trimMembers(project, [], s.id);
    // s [1, 4] plays 2…5 s of 10 s: its end can go back to one frame long, forward 5 s.
    near(memberRange(project, member!, 'end'), -2.9, 5);
    // Its start can go back 1 s (the timeline starts at 0), forward to one frame long.
    near(memberRange(project, member!, 'start'), -1, 2.9);
  });

  it('together: as far as all of them allow', () => {
    const { project, a, b, c, s } = scene();
    // a's end stops at b (1 s); c's end could go on for ever.
    near(trimRange(project, trimMembers(project, [a.id, c.id], a.id), 'end'), -1.9, 1);
    // a and b, neighbours on a track, both selected: b's start does not move with the ends.
    near(trimRange(project, trimMembers(project, [a.id, b.id], b.id), 'end'), -1.9, 1);
    // With the sound: back, the shortest clip (a, 2 s) says how far.
    near(trimRange(project, trimMembers(project, [a.id, c.id, s.id], c.id), 'end'), -1.9, 1);
    near(trimRange(project, trimMembers(project, [c.id, s.id], c.id), 'end'), -2.9, 5);
    // The starts: a and the sound start at 1, c at 2; nobody goes before 0.
    near(trimRange(project, trimMembers(project, [a.id, c.id, s.id], a.id), 'start'), -1, 1.9);
    expect(trimRange(project, [], 'end')).toEqual([0, 0]);
  });
});

describe('the edit', () => {
  const state = (project: Project) => ({
    clips: project.clips.map((c) => [c.start, c.end]),
    audio: project.audioClips.map((c) => [c.start, c.end, c.sourceStart]),
  });

  it('moves the same edge of every member by the same time, each from where it was', () => {
    const { project, a, c, s } = scene();
    const members = trimMembers(project, [a.id, c.id, s.id], a.id);
    const draft = structuredClone(project);
    applyTrim(draft, project, members, 'end', 0.5);
    expect(state(draft)).toEqual({
      clips: [
        [1, 3.5],
        [4, 6],
        [2, 5.5],
        [0, 2],
      ],
      audio: [[1, 4.5, 2]],
    });
    // Each step starts over from the project as it was: no drift.
    applyTrim(draft, project, members, 'end', -0.5);
    expect(state(draft).clips[0]).toEqual([1, 2.5]);
    expect(state(draft).audio[0]).toEqual([1, 3.5, 2]);
    // The starts: a sound's start moves into its recording.
    const again = structuredClone(project);
    applyTrim(again, project, members, 'start', 0.5);
    expect(state(again)).toEqual({
      clips: [
        [1.5, 3],
        [4, 6],
        [2.5, 5],
        [0, 2],
      ],
      audio: [[1.5, 4, 2.5]],
    });
  });

  it('keeps blocks and relation windows where they are in time', () => {
    const { project, a, c } = scene();
    a.actions.push(createTween(0.5, 1, { position: [1, 0] })); // [1.5, 2.5]
    // a → c over [2.2, 2.8]: offset 0.2 from c's start.
    project.relations.push(createRelation(a.id, c.id, { offset: 0.2, duration: 0.6 }));
    const members = trimMembers(project, [a.id, c.id], a.id);
    const draft = structuredClone(project);
    applyTrim(draft, project, members, 'start', -0.5);
    const [ta, , tc] = draft.clips;
    expect([ta!.start, tc!.start]).toEqual([0.5, 1.5]);
    // The block is still at 1.5 s, the window still starts at 2.2 s.
    expect(ta!.start + ta!.actions[0]!.start).toBeCloseTo(1.5, 6);
    expect(tc!.start + draft.relations[0]!.offset).toBeCloseTo(2.2, 6);
    expect(draft.relations[0]!.duration).toBeCloseTo(0.6, 6);
  });
});
