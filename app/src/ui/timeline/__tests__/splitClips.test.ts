// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  createAppear,
  createAttach,
  createClip,
  createDisappear,
  createEndsAttach,
  createEndsTween,
  createLineFormula,
  createPartTransform,
  createRelation,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type Project,
} from '../../../model';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import { settleAttachments } from '../../../scene';
import { plainClip, sceneWith, type Scene } from '../../../scene/__tests__/sceneKit';
import { planSplit, splitCandidates, splitName } from '../splitClips';

/* Splitting clips at the playhead (D169): what the two halves are, what goes with each, and
 * what refuses the cut. */

/** `a` (x+y=z, five glyphs) and `b` on two tracks; the clip of `a` runs over [0, 10] with a
 * Write intro and a FadeOut outro of one second each. */
async function scene(): Promise<Scene & { a: Clip }> {
  const s = await sceneWith({ a: 'x+y=z', b: 'w' });
  s.project.tracks.push(createTrack('Track 3'));
  const a = plainClip(s, 'a', 0, 0, 10, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
  });
  return { ...s, a };
}

const split = (s: Scene, ids: string[], time: number) =>
  planSplit(s.project, ids, time, { suffix: '_s', resolved: s.formulas });

const clipOf = (project: Project, id: string) => project.clips.find((c) => c.id === id)!;
const errors = (project: Project) =>
  validateProject(project).filter((issue) => issue.severity === 'error');

describe('splitName', () => {
  it('adds the suffix, numbered when the name is taken or cannot be one', () => {
    expect(splitName('f1', '_s', new Set(['f1']))).toBe('f1_s');
    expect(splitName('f1', '_s', new Set(['f1', 'f1_s']))).toBe('f1_s1');
    expect(splitName('f1', '_s', new Set(['f1', 'f1_s', 'f1_s1']))).toBe('f1_s2');
    expect(splitName('a', 's', new Set(), (name) => name !== 'as')).toBe('as1');
  });

  it('ends for a name that nothing makes valid: it is only kept from repeating', () => {
    const never = () => false;
    expect(splitName('x 1', '_s', new Set(['x 1']), never)).toBe('x 1_s');
    expect(splitName('x 1', '_s', new Set(['x 1', 'x 1_s']), never)).toBe('x 1_s1');
  });
});

describe('splitCandidates', () => {
  it('takes the clips the playhead is strictly inside', async () => {
    const s = await scene();
    const b = plainClip(s, 'b', 1, 5, 8);
    const ids = [s.a.id, b.id];
    expect(splitCandidates(s.project, ids, 6).map((c) => c.id)).toEqual(ids);
    expect(splitCandidates(s.project, ids, 5).map((c) => c.id)).toEqual([s.a.id]);
    expect(splitCandidates(s.project, ids, 10)).toEqual([]);
    expect(splitCandidates(s.project, [b.id], 2)).toEqual([]);
  });
});

describe('planSplit', () => {
  it('cuts a clip in two: the intro and what came before stay, the rest goes on', async () => {
    const s = await scene();
    s.a.actions.push(
      createTween(2, 1, { position: [1, 1], color: '#ff0000' }),
      createTween(7, 1, { scale: 2 }),
    );
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    expect(plan.pieces).toHaveLength(1);
    const piece = plan.pieces[0]!;
    const left = clipOf(plan.project, s.a.id);
    const right = clipOf(plan.project, piece.rightId);
    expect([left.start, left.end, right.start, right.end]).toEqual([0, 5, 5, 10]);
    expect(left.intro.kind).toBe('write');
    expect(left.outro).toMatchObject({ kind: 'none', duration: 0 });
    expect(right.intro).toMatchObject({ kind: 'none', duration: 0 });
    expect(right.outro.kind).toBe('fade_out');
    // The first half keeps the tween before the cut; the second starts where it left the clip.
    expect(left.actions.map((x) => x.start)).toEqual([2]);
    expect(right.actions.map((x) => x.start)).toEqual([2]);
    expect(right.actions[0]!.id).toBe(s.a.actions[1]!.id);
    expect(right.initial.position).toEqual([1, 1]);
    expect(right.initial.color).toBe('#ff0000');
    // The second half is a clip of a copy of the formula, right after it in the list.
    expect(left.formulaId).toBe(s.f.a!.id);
    expect(right.formulaId).toBe(piece.copy.id);
    expect(plan.project.formulas.map((f) => f.name)).toEqual(['a', 'a_s', 'b']);
    expect(piece.copy.hiddenGlyphs).toEqual([]);
    expect(right.trackId).toBe(s.a.trackId);
    expect(errors(plan.project)).toEqual([]);
    // The project given is left as it was.
    expect(s.project.clips).toHaveLength(1);
  });

  it('numbers the copies of one formula split twice at once', async () => {
    const s = await scene();
    const other = plainClip(s, 'a', 1, 2, 9);
    const plan = split(s, [s.a.id, other.id], 5);
    expect(plan.pieces.map((p) => p.copy.name)).toEqual(['a_s', 'a_s1']);
    expect(plan.project.formulas.map((f) => f.name)).toEqual(['a', 'a_s', 'a_s1', 'b']);
  });

  it('refuses what crosses the cut, and says what', async () => {
    const s = await scene();
    s.a.actions.push(createTween(4, 2, { scale: 2 }));
    const reason = (time: number) => split(s, [s.a.id], time).refused[0]?.reason ?? '';
    expect(reason(0.5)).toMatch(/intro \(Write\) is still running/);
    expect(reason(9.5)).toMatch(/outro \(FadeOut\) has started/);
    expect(reason(5)).toMatch(/Transform block \(4\.00–6\.00 s\) crosses the playhead/);
    expect(split(s, [s.a.id], 5).pieces).toEqual([]);
    expect(split(s, [s.a.id], 5).project).toBe(s.project);
    // At the end of the block it lies whole in the first half.
    expect(split(s, [s.a.id], 6).refused).toEqual([]);
  });

  it('refuses a clip on a locked track and one too near an end', async () => {
    const s = await scene();
    const b = plainClip(s, 'b', 1, 4, 8);
    expect(split(s, [b.id], 4.05).refused[0]!.reason).toMatch(/too near an end/);
    s.project.tracks[1]!.locked = true;
    expect(split(s, [b.id], 6).refused[0]).toMatchObject({
      name: 'b',
      reason: 'Its track is locked.',
    });
  });

  it('gives each relation to the half its window lies in', async () => {
    const s = await scene();
    // Glyph 3 comes with the second relation: hidden in the formula, it stays out of the intro.
    s.f.a!.hiddenGlyphs = [3];
    const b = plainClip(s, 'b', 1, 1, 9);
    const early = createRelation(b.id, s.a.id, {
      offset: 2,
      duration: 1,
      pairs: [{ from: [0], to: [1], style: 'copy' }],
    });
    const late = createRelation(b.id, s.a.id, {
      offset: 6,
      duration: 1,
      pairs: [{ from: [0], to: [3], style: 'copy' }],
    });
    const out = createRelation(s.a.id, b.id, {
      offset: 6.5,
      duration: 1,
      pairs: [{ from: [0], to: [0], style: 'copy' }],
    });
    s.project.relations.push(early, late, out);
    expect(split(s, [s.a.id], 6.5).refused[0]!.reason).toMatch(
      /relation from “b” to “a” \(6\.00–7\.00 s\) crosses/,
    );
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const { rightId, copy } = plan.pieces[0]!;
    const relation = (id: string) => plan.project.relations.find((r) => r.id === id)!;
    expect(relation(early.id)).toMatchObject({ toClipId: s.a.id, offset: 2 });
    // Its window is still [6, 7]: one second into the second half.
    expect(relation(late.id)).toMatchObject({ fromClipId: b.id, toClipId: rightId, offset: 1 });
    // The window of a relation counts from its target, which did not move.
    expect(relation(out.id)).toMatchObject({ fromClipId: rightId, toClipId: b.id, offset: 6.5 });
    // Glyph 1 arrived before the cut and is there; glyph 3 arrives after it: the copy hides it,
    // and the relation brings it.
    expect(copy.hiddenGlyphs).toEqual([3]);
    const life = clipLifetimes(plan.project).get(rightId)!;
    expect(life.stints.get(1)![0]!.enter.start).toBe(5);
    expect(life.stints.get(3)![0]!.enter.start).toBe(6);
  });

  it('starts the second half with the glyphs on screen at the cut', async () => {
    const s = await scene();
    s.a.actions.push(createDisappear(2, 'fade_out', [0]), createAppear(7, 'fade_in', [0]));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const { rightId, copy } = plan.pieces[0]!;
    expect(copy.hiddenGlyphs).toEqual([0]);
    const life = clipLifetimes(plan.project).get(rightId)!;
    expect(life.stints.get(0)![0]!.enter.start).toBe(7);
    expect(life.stints.get(1)![0]!.enter.start).toBe(5);
  });

  it('names the glyphs of a block that would take in those on screen', async () => {
    const s = await scene();
    // Every glyph but 3 is hidden; 3 comes with a block of its own, and the others with an
    // Appear of all of them. At the cut only 3 is there, and that Appear, the first block of the
    // second half, would make it wait too: it names the glyphs it brought.
    s.f.a!.hiddenGlyphs = [0, 1, 2, 4];
    s.a.intro = defaultIntro('none');
    s.a.actions.push(createAppear(1, 'fade_in', [3]), createAppear(7, 'fade_in', 'all'));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const right = clipOf(plan.project, plan.pieces[0]!.rightId);
    expect(right.actions[0]).toMatchObject({ kind: 'appear', glyphs: [0, 1, 2, 4] });
    expect(plan.pieces[0]!.copy.hiddenGlyphs).toEqual([0, 1, 2, 4]);
    const life = clipLifetimes(plan.project).get(right.id)!;
    expect(life.stints.get(3)![0]!.enter.start).toBe(5);
    expect(life.stints.get(0)![0]!.enter.start).toBe(7);
  });

  it('leaves out of the first half the glyphs that only come on screen after the cut', async () => {
    const s = await scene();
    // Glyphs 3 and 4 wait for their Appear block: the first half, alone, would show them.
    s.a.actions.push(createAppear(7, 'fade_in', [3, 4]));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const left = clipOf(plan.project, s.a.id);
    const right = clipOf(plan.project, plan.pieces[0]!.rightId);
    expect(left.startHidden).toEqual([3, 4]);
    expect(left.actions).toEqual([]);
    // The second half is as it was: the copy hides them, and its block brings them.
    expect('startHidden' in right).toBe(false);
    expect(plan.pieces[0]!.copy.hiddenGlyphs).toEqual([3, 4]);
    expect(right.actions[0]).toMatchObject({ kind: 'appear', start: 2, glyphs: [3, 4] });
    const lives = clipLifetimes(plan.project);
    expect(lives.get(left.id)!.intro).toEqual([0, 1, 2]);
    expect([...lives.get(left.id)!.stints.keys()]).toEqual([0, 1, 2]);
    expect(lives.get(right.id)!.stints.get(3)![0]!.enter.start).toBe(7);
    expect(validateProject(plan.project)).toEqual(validateProject(s.project));
  });

  it('leaves out of the first half a glyph a relation brings after the cut', async () => {
    const s = await scene();
    const b = plainClip(s, 'b', 1, 1, 9);
    const relation = createRelation(b.id, s.a.id, {
      offset: 6,
      duration: 1,
      pairs: [{ from: [0], to: [3], style: 'copy' }],
    });
    s.project.relations.push(relation);
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const piece = plan.pieces[0]!;
    expect(clipOf(plan.project, s.a.id).startHidden).toEqual([3]);
    expect(piece.copy.hiddenGlyphs).toEqual([3]);
    expect(plan.project.relations[0]).toMatchObject({ toClipId: piece.rightId, offset: 1 });
    expect(errors(plan.project)).toEqual([]);
  });

  it('has a block of the first half name its glyphs when it would bring one of those', async () => {
    const s = await scene();
    const b = plainClip(s, 'b', 1, 1, 9);
    // The block brings every glyph but 3, which the relation has still to bring: without the
    // relation, in the first half, 'all' would take glyph 3 in.
    s.a.intro = defaultIntro('none');
    s.a.actions.push(createAppear(1, 'fade_in', 'all'));
    s.project.relations.push(
      createRelation(b.id, s.a.id, {
        offset: 6,
        duration: 1,
        pairs: [{ from: [0], to: [3], style: 'copy' }],
      }),
    );
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const left = clipOf(plan.project, s.a.id);
    expect(left.startHidden).toEqual([3]);
    expect(left.actions[0]).toMatchObject({ kind: 'appear', glyphs: [0, 1, 2, 4] });
    const life = clipLifetimes(plan.project).get(left.id)!;
    expect([...life.stints.keys()]).toEqual([0, 1, 2, 4]);
  });

  it('empties a block of the first half that only named a glyph a relation was to bring', async () => {
    const s = await scene();
    const b = plainClip(s, 'b', 1, 1, 9);
    // The block names glyph 3 alone and brought nothing: the relation had still to bring it.
    s.a.actions.push(createAppear(2, 'fade_in', [3]));
    s.project.relations.push(
      createRelation(b.id, s.a.id, {
        offset: 6,
        duration: 1,
        pairs: [{ from: [0], to: [3], style: 'copy' }],
      }),
    );
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const left = clipOf(plan.project, s.a.id);
    expect(left.startHidden).toEqual([3]);
    expect(left.actions[0]).toMatchObject({ kind: 'appear', glyphs: [] });
    expect(clipLifetimes(plan.project).get(left.id)!.stints.has(3)).toBe(false);
  });

  it('names only the Appear blocks that would bring such a glyph: the others stay as they are', async () => {
    const s = await scene();
    const b = plainClip(s, 'b', 1, 1, 9);
    s.a.intro = defaultIntro('none');
    // The first block brings every glyph but 3; the second finds them there and brings none; the
    // Disappear takes one before the cut. Without the relation, both Appear blocks would take
    // glyph 3 in.
    s.a.actions.push(
      createAppear(1, 'fade_in', 'all'),
      createAppear(2.5, 'fade_in', 'all', { duration: 0.5 }),
      createDisappear(3.5, 'fade_out', 'all', { duration: 0.5 }),
    );
    s.project.relations.push(
      createRelation(b.id, s.a.id, {
        offset: 6,
        duration: 1,
        pairs: [{ from: [0], to: [3], style: 'copy' }],
      }),
    );
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const left = clipOf(plan.project, s.a.id);
    expect(left.startHidden).toEqual([3]);
    expect(left.actions.map((action) => 'glyphs' in action && action.glyphs)).toEqual([
      [0, 1, 2, 4],
      [],
      'all',
    ]);
  });

  it('leaves the blocks of the first half as they are when they bring none of those', async () => {
    const s = await scene();
    s.a.intro = defaultIntro('none');
    s.f.a!.hiddenGlyphs = [4];
    s.a.actions.push(createAppear(1, 'fade_in', 'all'), createDisappear(7, 'fade_out', [0]));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const left = clipOf(plan.project, s.a.id);
    expect(left.actions[0]).toMatchObject({ kind: 'appear', glyphs: 'all' });
    expect('startHidden' in left).toBe(false);
  });

  it('lists for a clip that starts empty the glyphs that came later, not those nothing brings', async () => {
    const s = await scene();
    s.a.startsEmpty = true;
    s.a.actions.push(createAppear(2, 'fade_in', [0, 1]), createAppear(7, 'fade_in', [3, 4]));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const left = clipOf(plan.project, s.a.id);
    const right = clipOf(plan.project, plan.pieces[0]!.rightId);
    expect(left.startsEmpty).toBe(true);
    // Glyph 2, which nothing ever brings, is out only because the clip starts empty.
    expect(left.startHidden).toEqual([3, 4]);
    expect('startsEmpty' in right).toBe(false);
    expect(plan.pieces[0]!.copy.hiddenGlyphs).toEqual([2, 3, 4]);

    // Unticking «Starts empty» on the first half brings what it would have brought on the whole
    // clip before the cut — glyph 2, with the intro —, and not the glyphs that came after it.
    const whole = structuredClone(s.project);
    delete whole.clips[0]!.startsEmpty;
    const halves = structuredClone(plan.project);
    delete halves.clips.find((c) => c.id === s.a.id)!.startsEmpty;
    const before = clipLifetimes(whole).get(s.a.id)!;
    const after = clipLifetimes(halves).get(s.a.id)!;
    const startsOf = (life: typeof before, glyph: number) =>
      (life.stints.get(glyph) ?? []).map((stint) => stint.enter.start).filter((at) => at < 5);
    for (const glyph of [0, 1, 2, 3, 4]) {
      expect(startsOf(after, glyph)).toEqual(startsOf(before, glyph));
    }
    expect(startsOf(after, 2)).toEqual([0]);
    expect(startsOf(after, 3)).toEqual([]);
  });

  it('keeps the list a clip had, and adds to it, when its first half is split again', async () => {
    const s = await scene();
    s.a.actions.push(createAppear(3, 'fade_in', [2]), createAppear(7, 'fade_in', [3, 4]));
    const first = split(s, [s.a.id], 5);
    expect(clipOf(first.project, s.a.id).startHidden).toEqual([3, 4]);
    // Cut again before the block that brings glyph 2.
    const again = planSplit(first.project, [s.a.id], 2, { suffix: '_s' });
    expect(again.refused).toEqual([]);
    const left = clipOf(again.project, s.a.id);
    const middle = clipOf(again.project, again.pieces[0]!.rightId);
    expect(left.startHidden).toEqual([2, 3, 4]);
    // The middle piece is a clip of a copy that hides them: it has no list of its own.
    expect('startHidden' in middle).toBe(false);
    expect(again.pieces[0]!.copy.hiddenGlyphs).toEqual([2, 3, 4]);
    expect(middle.actions[0]).toMatchObject({ kind: 'appear', start: 1, glyphs: [2] });
    expect(clipLifetimes(again.project).get(middle.id)!.stints.get(2)![0]!.enter.start).toBe(3);
  });

  it('warns of a first half that shows nothing: no glyph came before the cut', async () => {
    const s = await scene();
    s.a.intro = defaultIntro('none');
    s.a.actions.push(createAppear(7, 'fade_in', 'all'));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    expect(clipOf(plan.project, s.a.id).startHidden).toEqual([0, 1, 2, 3, 4]);
    expect(
      validateProject(plan.project)
        .filter((issue) => issue.code === 'start-hidden-unused')
        .map((issue) => issue.path),
    ).toEqual([['clips', 0, 'startHidden']]);
  });

  it('refuses a line that only comes on screen after the cut: it is one piece', async () => {
    const s = await scene();
    const formula = createLineFormula({ name: 'l1', snapshot: boxSnapshot(['line']) });
    const clip = createClip(formula.id, s.project.tracks[1]!.id, 1, 9, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      actions: [createAppear(5, 'fade_in', 'all')],
    });
    s.project.formulas.push(formula);
    s.project.clips.push(clip);
    const plan = planSplit(s.project, [clip.id], 5, { suffix: '_s' });
    expect(plan.pieces).toEqual([]);
    expect(plan.refused[0]!.reason).toBe(
      '“l1” only comes on screen after the playhead (the FadeIn block at 6.00 s): the first half would show it from its start. Split after it has appeared.',
    );
  });

  it('lists the glyphs that came later even when the formula hides them', async () => {
    const s = await scene();
    // Glyph 4 comes at 7 s; glyph 3 is only hidden: nothing ever brings it.
    s.f.a!.hiddenGlyphs = [3, 4];
    s.a.actions.push(createAppear(7, 'fade_in', [4]));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    expect(plan.pieces[0]!.copy.hiddenGlyphs).toEqual([3, 4]);
    expect(clipOf(plan.project, s.a.id).startHidden).toEqual([4]);

    // Shown again in the formula, glyph 4 still waits for its block — in the whole clip and in
    // the halves alike —, and glyph 3 comes in with the intro of both.
    const shown = (project: Project) => {
      const copy = structuredClone(project);
      copy.formulas.find((f) => f.id === s.f.a!.id)!.hiddenGlyphs = [];
      return clipLifetimes(copy).get(s.a.id)!;
    };
    const enters = (life: ReturnType<typeof shown>, glyph: number) =>
      (life.stints.get(glyph) ?? []).map((stint) => stint.enter.start).filter((at) => at < 5);
    expect(enters(shown(s.project), 4)).toEqual([]);
    expect(enters(shown(plan.project), 4)).toEqual([]);
    expect(enters(shown(s.project), 3)).toEqual([0]);
    expect(enters(shown(plan.project), 3)).toEqual([0]);
  });

  it('keeps the colour a Transform block gave glyphs, and refuses glyphs it moved', async () => {
    const s = await scene();
    s.a.actions.push(createPartTransform(2, [1, 2], { duration: 1, color: '#00ff00' }));
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    const right = clipOf(plan.project, plan.pieces[0]!.rightId);
    expect(right.initial.glyphColors).toEqual({ '1': '#00ff00', '2': '#00ff00' });
    s.a.actions.push(createPartTransform(3.5, [0], { duration: 1, shift: [0, 1] }));
    expect(split(s, [s.a.id], 5).refused[0]!.reason).toMatch(
      /Transform block at 3\.50 s moved glyph 0/,
    );
  });

  it('lets a tween that comes back take a colour over, as the scene does', async () => {
    const s = await scene();
    // The block colours glyph 1; a tween of the clip's colour that comes back ends that colour
    // all the same: at the cut the glyph has the clip's.
    s.a.actions.push(
      createPartTransform(2, [1], { duration: 0.5, color: '#00ff00' }),
      createTween(3, 1, { color: '#ff0000' }, 'there_and_back'),
    );
    const plan = split(s, [s.a.id], 6);
    expect(plan.refused).toEqual([]);
    expect(clipOf(plan.project, plan.pieces[0]!.rightId).initial.glyphColors).toEqual({});
  });

  it('refuses when a tween after the cut says the colour of a glyph a block coloured', async () => {
    const s = await scene();
    s.a.initial.glyphColors = { '1': '#ff0000' };
    s.a.actions.push(
      createPartTransform(2, [1], { duration: 0.5, color: '#00ff00' }),
      createTween(7, 1, { glyphColors: { '1': '#ff0000', '2': '#0000ff' } }),
    );
    expect(split(s, [s.a.id], 5).refused[0]!.reason).toMatch(
      /Transform at 7\.00 s changes the colour of glyph 1, which a Transform block coloured/,
    );
  });

  it('leaves out of a later Transform block the glyphs that left for good', async () => {
    const s = await scene();
    // Glyph 2 is gone when the block scales glyphs 1 and 2: its centre is glyph 1's. In the
    // copy glyph 2 is only hidden, and would count again.
    s.a.actions.push(
      createDisappear(2, 'fade_out', [2], { duration: 0.5 }),
      createPartTransform(7, [1, 2], { duration: 1, scale: 2 }),
    );
    const plan = split(s, [s.a.id], 5);
    expect(plan.refused).toEqual([]);
    expect(clipOf(plan.project, plan.pieces[0]!.rightId).actions[0]).toMatchObject({
      kind: 'transform',
      glyphs: [1],
    });
  });

  it('refuses what an easing that comes back left half drawn', async () => {
    const s = await scene();
    s.a.intro = { ...defaultIntro('write'), easing: 'there_and_back' };
    expect(split(s, [s.a.id], 5).refused[0]!.reason).toMatch(/Its intro ends where it started/);
  });

  it('says so of an Appear block after the cut that brings nothing', async () => {
    const s = await scene();
    s.a.actions.push(
      createDisappear(1.2, 'fade_out', 'all', { duration: 0.4 }),
      createAppear(2, 'fade_in', 'all', { duration: 0.5 }),
      createAppear(7, 'fade_in', 'all', { duration: 0.5 }),
    );
    expect(split(s, [s.a.id], 5).refused[0]!.reason).toMatch(
      /FadeIn block at 7\.00 s brings no glyph .*: remove it to split/,
    );
  });

  it('waits for the render of what it splits', async () => {
    const s = await scene();
    const without = new Map(s.formulas);
    without.delete(s.f.a!.id);
    const plan = planSplit(s.project, [s.a.id], 5, { suffix: '_s', resolved: without });
    expect(plan.pieces).toEqual([]);
    expect(plan.refused[0]!.reason).toBe(
      '“a” has no render yet: split the clip once the preview draws it.',
    );
  });

  it('keeps the colour a Transform gave a line, and refuses a stroke width', async () => {
    const line = async (to: { color?: string; strokeWidth?: number }) => {
      const s = await scene();
      const formula = createLineFormula({ name: 'l1', snapshot: boxSnapshot(['line']) });
      // From glyph 0 of `a` to a point, and a Transform that leaves its ends where they are.
      const attach = createEndsAttach({ clipId: s.a.id, glyphs: [0] }, { point: [3, -2] }, 0);
      const clip = createClip(formula.id, s.project.tracks[1]!.id, 1, 9, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
        attach,
        actions: [createEndsTween(1, 1, attach, to)],
      });
      s.project.formulas.push(formula);
      s.project.clips.push(clip);
      // No renders: the checks of the plan alone.
      return planSplit(s.project, [clip.id], 5, { suffix: '_s' });
    };
    // A line draws the stroke width of its state only from a Transform of its ends on.
    expect((await line({ strokeWidth: 12 })).refused[0]!.reason).toMatch(
      /Transform at 2\.00 s changed the stroke width of the line/,
    );
    const coloured = await line({ color: '#ff0000' });
    expect(coloured.refused).toEqual([]);
    expect(coloured.pieces[0]!.copy.name).toBe('l1_s');
  });

  it('refuses an attached object that a Transform of its own moved', async () => {
    const s = await scene();
    const label = plainClip(s, 'b', 1, 1.5, 8, {
      attach: createAttach(s.a.id, 'all'),
      actions: [createTween(1, 1, { position: [3, 2] })],
    });
    s.project = settleAttachments(s.project, s.formulas);
    const plan = split(s, [s.a.id, label.id], 5);
    expect(plan.refused.find((r) => r.name === 'b')!.reason).toMatch(
      /A Transform moved it from where its attachment placed it.*Detach it first/,
    );
  });

  it('asks that an object attached across the cut be split too', async () => {
    const s = await scene();
    const across = plainClip(s, 'b', 1, 2, 8, { attach: createAttach(s.a.id, 'all') });
    const after = plainClip(s, 'b', 2, 6, 9, { attach: createAttach(s.a.id, [0]) });
    s.project = settleAttachments(s.project, s.formulas);
    expect(split(s, [s.a.id], 5).refused[0]!.reason).toMatch(
      /“b” \(2\.00–8\.00 s\), attached to it, crosses the playhead: select it too/,
    );
    const plan = split(s, [s.a.id, across.id], 5);
    expect(plan.refused).toEqual([]);
    const [first, second] = plan.pieces;
    expect(first!.clipId).toBe(s.a.id);
    // The first half of the object hangs on the first half of the clip, the second on the second;
    // an object that starts after the cut hangs on the second half.
    expect(clipOf(plan.project, across.id).attach).toMatchObject({ clipId: s.a.id });
    expect(clipOf(plan.project, second!.rightId).attach).toMatchObject({ clipId: first!.rightId });
    expect(clipOf(plan.project, after.id).attach).toMatchObject({ clipId: first!.rightId });
    expect(plan.project.formulas.map((f) => f.name)).toEqual(['a', 'a_s', 'b', 'b_s']);
    expect(errors(plan.project)).toEqual([]);
  });

  it('refuses an attached object whose target moved since it was placed', async () => {
    const s = await scene();
    s.a.actions.push(createTween(3, 1, { position: [2, 0] }));
    const hung = plainClip(s, 'b', 1, 1.5, 8, { attach: createAttach(s.a.id, 'all') });
    s.project = settleAttachments(s.project, s.formulas);
    // Its second half would be placed beside the formula where it is at the cut.
    const plan = split(s, [s.a.id, hung.id], 5);
    expect(plan.refused.map((r) => r.name)).toContain('b');
    expect(plan.refused.find((r) => r.name === 'b')!.reason).toMatch(
      /would not look as the clip does now at .*attached to something that has moved.*Detach it first/,
    );
  });
});
