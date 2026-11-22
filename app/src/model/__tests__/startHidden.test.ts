// @vitest-environment node
/* Glyphs a clip leaves out of its intro itself (format 33, `Clip.startHidden`): besides the hidden
 * glyphs of its formula, and in that clip alone. Each appears when a relation, a Morph block or an
 * Appear block brings it, and one nothing brings never shows — what `startsEmpty` says of them
 * all. A split writes the list (`ui/timeline/splitClips.ts`). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  clipLifetimes,
  createAppear,
  createBraceFormula,
  createClip,
  createDisappear,
  parseProject,
  remapGlyphRefs,
  serializeProject,
  setIdGenerator,
  startHiddenGlyphs,
  validateProject,
  type IssueCode,
  type Project,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { buildEvents } from '../../scene';
import { smallProject } from './fixtures';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

const issuesOf = (project: Project, code: IssueCode) =>
  validateProject(project).filter((issue) => issue.code === code);

/** `smallProject` — a (5 glyphs) on [0, 4], b (4 glyphs) on [2, 6], a:0 → b:3 during [2, 3) —
 * with a leaving its glyphs 1 and 3 out of its intro. */
function withList(): Project {
  const p = smallProject();
  p.clips[0]!.startHidden = [1, 3];
  return p;
}

describe('the glyphs a clip leaves out of its intro, in the file', () => {
  it('are kept by a save and a load, and absent from a clip that leaves none out', () => {
    const text = serializeProject(withList());
    const again = opened(text);
    expect(again.clips[0]!.startHidden).toEqual([1, 3]);
    expect('startHidden' in again.clips[1]!).toBe(false);
    expect(serializeProject(again)).toBe(text);
    expect(text.match(/"startHidden"/g)).toHaveLength(1);
  });

  it('are not in a file of format 32, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 32');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(32);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(result.project.clips.some((clip) => clip.startHidden)).toBe(false);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('are indices of glyphs: a file that says anything else is refused', () => {
    for (const bad of ['all', [1.5], [-1], ['2'], true]) {
      const project = smallProject();
      (project.clips[0] as { startHidden?: unknown }).startHidden = bad;
      expect(parseProject(serializeProject(project)).ok).toBe(false);
    }
  });
});

describe('startHiddenGlyphs', () => {
  it('joins the hidden glyphs of the formula and those the clip leaves out, once each', () => {
    const p = smallProject();
    const [a] = p.formulas;
    a!.hiddenGlyphs = [3, 0];
    expect(startHiddenGlyphs({ startHidden: [4, 3, 1] }, a)).toEqual([0, 1, 3, 4]);
    expect(startHiddenGlyphs({ startHidden: [2] }, undefined)).toEqual([2]);
    expect(startHiddenGlyphs({}, a)).toEqual([0, 3]);
    // A clip that starts empty leaves them all out, whatever its list says.
    expect(startHiddenGlyphs({ startsEmpty: true, startHidden: [1] }, a)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('the lifetime of a clip that leaves glyphs out of its intro', () => {
  it('brings the others with the intro, and the glyphs left out never show', () => {
    const p = withList(); // a:0 goes to b during [2, 3)
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.intro).toEqual([0, 2, 4]);
    expect([...life.stints.keys()].sort()).toEqual([0, 2, 4]);
    expect(life.outro).toEqual([2, 4]);
    // The other clip, of another formula, is as it was: the relation brings its glyph 3.
    expect(clipLifetimes(p).get(p.clips[1]!.id)!.intro).toEqual([0, 1, 2]);
  });

  it('is in that clip alone: another clip of the same formula brings them all', () => {
    const p = withList();
    const twin = createClip(p.formulas[0]!.id, p.tracks[0]!.id, 7, 9);
    p.clips.push(twin);
    expect(clipLifetimes(p).get(twin.id)!.intro).toEqual([0, 1, 2, 3, 4]);
  });

  it('is what the scene plays: an intro and an outro without them', () => {
    const p = withList();
    const events = buildEvents(p);
    const intro = events.find((e) => e.id === `intro:${p.clips[0]!.id}`);
    const outro = events.find((e) => e.id === `outro:${p.clips[0]!.id}`);
    expect(intro?.kind === 'intro' && intro.except).toEqual([1, 3]);
    expect(outro?.kind === 'outro' && outro.except).toEqual([0, 1, 3]);
  });

  it('lets an Appear block bring one in, as it brings a hidden glyph', () => {
    const p = withList();
    const clip = p.clips[0]!;
    const appear = createAppear(1, 'write', [1], { duration: 0.5 }); // [1, 1.5)
    clip.actions.push(appear);
    const life = clipLifetimes(p).get(clip.id)!;
    expect(life.actions.get(appear.id)).toEqual({ glyphs: [1], skipped: [] });
    expect(life.stints.get(1)!.map((s) => [s.enter.start, s.exit.cause.kind])).toEqual([
      [1, 'outro'],
    ]);
    expect(life.stints.has(3)).toBe(false);
  });

  it('keeps out a glyph whose first block is a Disappear, which finds nothing to take', () => {
    const p = withList();
    const clip = p.clips[0]!;
    const gone = createDisappear(1, 'fade_out', [3], { duration: 0.5 });
    clip.actions.push(gone);
    const life = clipLifetimes(p).get(clip.id)!;
    expect(life.intro).toEqual([0, 2, 4]);
    expect(life.actions.get(gone.id)).toEqual({
      glyphs: [],
      skipped: [{ glyph: 3, reason: 'off-screen' }],
    });
  });
});

describe('a formula whose glyphs change', () => {
  it('carries the list of its clips to the new glyphs, and drops what is gone', () => {
    const p = withList();
    const clip = p.clips[0]!;
    // 0 → 2, 1 → 0, 2 gone, 3 gone, 4 → 1.
    const report = remapGlyphRefs(p, p.formulas[0]!.id, [2, 0, null, null, 1]);
    expect(clip.startHidden).toEqual([0]);
    expect(report.droppedHidden).toBe(1);
    // The clip of the other formula is left alone.
    expect('startHidden' in p.clips[1]!).toBe(false);
  });

  it('takes the list off a clip that keeps none of its glyphs', () => {
    const p = withList();
    const report = remapGlyphRefs(p, p.formulas[0]!.id, [0, null, 1, null, 2]);
    expect('startHidden' in p.clips[0]!).toBe(false);
    expect(report.droppedHidden).toBe(2);
  });

  it('keeps one index for two glyphs that become one', () => {
    const p = withList();
    remapGlyphRefs(p, p.formulas[0]!.id, [0, 2, 1, 2, 3]);
    expect(p.clips[0]!.startHidden).toEqual([2]);
  });
});

describe('validation of a clip that leaves glyphs out of its intro', () => {
  it('has nothing to say of glyphs of its formula left out', () => {
    expect(validateProject(withList())).toEqual(validateProject(smallProject()));
  });

  it('warns of the glyphs of the list that do not exist', () => {
    const p = withList();
    p.clips[0]!.startHidden = [1, 5, 8];
    expect(issuesOf(p, 'glyph-range').map((i) => [i.severity, i.message, i.path])).toEqual([
      [
        'warning',
        'Glyphs 5, 8 that a clip of "a" leaves out of its intro do not exist.',
        ['clips', 0, 'startHidden'],
      ],
    ]);
  });

  it('warns when the clip leaves them all out and nothing brings one: it never shows', () => {
    const p = smallProject();
    p.relations = [];
    p.clips[1]!.startHidden = [0, 1, 2, 3];
    expect(issuesOf(p, 'start-hidden-unused').map((i) => [i.severity, i.message, i.path])).toEqual([
      [
        'warning',
        '"b" leaves its glyphs out of its intro and nothing brings one in (a relation, a Morph block or an Appear block): this clip never shows.',
        ['clips', 1, 'startHidden'],
      ],
    ]);
    // One glyph on screen is enough: brought by a block, or by the intro.
    p.clips[1]!.actions.push(createAppear(1.5, 'write', [2], { duration: 0.5 }));
    expect(issuesOf(p, 'start-hidden-unused')).toEqual([]);
    p.clips[1]!.actions = [];
    p.clips[1]!.startHidden = [0, 1, 2];
    expect(issuesOf(p, 'start-hidden-unused')).toEqual([]);
  });

  it('says it once of a clip that starts empty too', () => {
    const p = smallProject();
    p.relations = [];
    p.clips[1]!.startsEmpty = true;
    p.clips[1]!.startHidden = [0, 1];
    expect(issuesOf(p, 'starts-empty-unused')).toHaveLength(1);
    expect(issuesOf(p, 'start-hidden-unused')).toEqual([]);
  });

  it('calls them hidden at the start when it says why an intro animates nothing', () => {
    const p = smallProject();
    p.relations = [];
    const clip = p.clips[1]!; // b, 4 glyphs, a Write intro
    clip.startHidden = [2, 3];
    clip.actions.push(createAppear(1.5, 'write', [0, 1], { duration: 0.5 }));
    expect(issuesOf(p, 'intro-empty').map((i) => i.message)).toEqual([
      expect.stringMatching(
        /intro of "b" animates no glyph: its glyphs wait for Appear blocks or are hidden at the start\.$/,
      ),
    ]);
  });

  it('refuses the list on a brace, a shape or a line: they are one piece', () => {
    const p = smallProject();
    const brace = createBraceFormula({ name: 'under' });
    p.formulas.push(brace);
    p.clips.push(createClip(brace.id, p.tracks[0]!.id, 4.5, 6, { startHidden: [0] }));
    expect(issuesOf(p, 'start-hidden-kind').map((i) => [i.severity, i.message, i.path])).toEqual([
      [
        'error',
        '"under" is a brace: only a formula or a text can leave glyphs out of its intro.',
        ['clips', 2, 'startHidden'],
      ],
    ]);
  });
});
