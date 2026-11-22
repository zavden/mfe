// @vitest-environment node
/* A clip that starts empty (format 31, `Clip.startsEmpty`): none of its glyphs comes in with the
 * intro, as the hidden glyphs of its formula do not — each appears when a relation, a Morph block
 * or an Appear block brings it, and one nothing brings never shows. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  clipLifetimes,
  createAppear,
  createBraceFormula,
  createClip,
  createMorph,
  parseProject,
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
 * with b starting empty. */
function emptyTarget(): Project {
  const p = smallProject();
  p.clips[1]!.startsEmpty = true;
  return p;
}

describe('a clip that starts empty, in the file', () => {
  it('is kept by a save and a load, and absent from a clip that does not', () => {
    const text = serializeProject(emptyTarget());
    const again = opened(text);
    expect(again.clips[1]!.startsEmpty).toBe(true);
    expect('startsEmpty' in again.clips[0]!).toBe(false);
    expect(serializeProject(again)).toBe(text);
    expect(text.match(/"startsEmpty"/g)).toHaveLength(1);
  });

  it('is not in a file of format 30, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 30');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(30);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(result.project.clips.some((clip) => clip.startsEmpty)).toBe(false);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('is a boolean: a file that says anything else is refused', () => {
    const project = smallProject();
    (project.clips[0] as { startsEmpty?: unknown }).startsEmpty = 'yes';
    expect(parseProject(serializeProject(project)).ok).toBe(false);
  });
});

describe('startHiddenGlyphs', () => {
  it('is the hidden glyphs of the formula, or every glyph of a clip that starts empty', () => {
    const p = smallProject();
    const [a, b] = p.formulas;
    a!.hiddenGlyphs = [3, 1];
    expect(startHiddenGlyphs(p.clips[0]!, a)).toEqual([1, 3]);
    expect(startHiddenGlyphs({ startsEmpty: true }, a)).toEqual([0, 1, 2, 3, 4]);
    expect(startHiddenGlyphs({ startsEmpty: true }, b)).toEqual([0, 1, 2, 3]);
    expect(startHiddenGlyphs({ startsEmpty: true }, undefined)).toEqual([]);
    expect(startHiddenGlyphs({}, b)).toEqual([]);
  });
});

describe('the lifetime of a clip that starts empty', () => {
  it('shows only what the relation brings: the intro animates nothing', () => {
    const p = emptyTarget();
    const life = clipLifetimes(p).get(p.clips[1]!.id)!;
    expect(life.intro).toEqual([]);
    expect([...life.stints.keys()]).toEqual([3]);
    expect(life.stints.get(3)!.map((s) => [s.enter.cause.kind, s.exit.cause.kind])).toEqual([
      ['transfer', 'outro'],
    ]);
    expect(life.outro).toEqual([3]);
    // The source is as it was: the relation takes its glyph, the outro the others.
    const source = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(source.intro).toEqual([0, 1, 2, 3, 4]);
    expect(source.outro).toEqual([1, 2, 3, 4]);
  });

  it('is what the scene plays: an intro and an outro without the glyphs that never came', () => {
    const p = emptyTarget();
    const events = buildEvents(p);
    const intro = events.find((e) => e.id === `intro:${p.clips[1]!.id}`);
    const outro = events.find((e) => e.id === `outro:${p.clips[1]!.id}`);
    expect(intro?.kind === 'intro' && intro.except).toEqual([0, 1, 2, 3]);
    expect(outro?.kind === 'outro' && outro.except).toEqual([0, 1, 2]);
  });

  it('lets an Appear block bring glyphs in, on every one that is not there with "all"', () => {
    const p = emptyTarget(); // b on [2, 6]; glyph 3 arrives during [2, 3)
    const clip = p.clips[1]!;
    const some = createAppear(1.5, 'write', [0, 1], { duration: 0.5 }); // [3.5, 4)
    clip.actions.push(some);
    let life = clipLifetimes(p).get(clip.id)!;
    expect(life.actions.get(some.id)).toEqual({ glyphs: [0, 1], skipped: [] });
    expect([...life.stints.keys()].sort()).toEqual([0, 1, 3]);
    expect(life.outro).toEqual([0, 1, 3]);

    const all = createAppear(1.5, 'write', 'all', { duration: 0.5 });
    clip.actions = [all];
    life = clipLifetimes(p).get(clip.id)!;
    // Glyph 3 is on screen already (the relation brought it): 'all' leaves it out silently.
    expect(life.actions.get(all.id)).toEqual({ glyphs: [0, 1, 2], skipped: [] });
    expect(life.outro).toEqual([0, 1, 2, 3]);
  });

  it('lets a Morph block go on from what a relation brought', () => {
    const p = emptyTarget();
    const clip = p.clips[1]!;
    // b:3 (arrived by [2, 3)) becomes b:0 during [3.5, 4.5).
    const morph = createMorph(1.5, {
      style: 'transform',
      pairs: [{ from: [3], to: [0], style: null }],
    });
    clip.actions.push(morph);
    const life = clipLifetimes(p).get(clip.id)!;
    expect(life.absentSources).toEqual([]);
    expect(life.stints.get(3)!.map((s) => [s.enter.start, s.exit.start])).toEqual([[2, 3.5]]);
    expect(life.stints.get(0)!.map((s) => [s.enter.start, s.exit.cause.kind])).toEqual([
      [3.5, 'outro'],
    ]);
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('hides the glyphs the project names past the snapshot too', () => {
    const p = emptyTarget();
    p.clips[1]!.actions.push(createAppear(1.5, 'write', [1, 9], { duration: 0.5 }));
    const life = clipLifetimes(p).get(p.clips[1]!.id)!;
    expect(life.glyphs).toEqual([0, 1, 2, 3, 9]);
    expect(life.intro).toEqual([]);
  });
});

describe('validation of a clip that starts empty', () => {
  it('has nothing to say of a target that a relation fills', () => {
    const p = emptyTarget();
    expect(validateProject(p)).toEqual(validateProject(smallProject()));
  });

  it('does not call its intro a leftover when Appear blocks bring its glyphs', () => {
    const p = emptyTarget();
    p.relations = [];
    p.clips[1]!.actions.push(createAppear(1.5, 'write', 'all', { duration: 0.5 }));
    expect(issuesOf(p, 'intro-empty')).toEqual([]);
    // The same clip without the mark: every glyph waits for the block, and the intro is idle.
    delete p.clips[1]!.startsEmpty;
    expect(issuesOf(p, 'intro-empty')).toHaveLength(1);
  });

  it('warns when nothing brings any glyph: the clip never shows', () => {
    const p = emptyTarget();
    p.relations = [];
    expect(issuesOf(p, 'starts-empty-unused').map((i) => [i.severity, i.message, i.path])).toEqual([
      [
        'warning',
        '"b" starts empty and nothing brings its glyphs in (a relation, a Morph block or an Appear block): this clip never shows.',
        ['clips', 1, 'startsEmpty'],
      ],
    ]);
    // One glyph brought is enough.
    p.clips[1]!.actions.push(createAppear(1.5, 'write', [2], { duration: 0.5 }));
    expect(issuesOf(p, 'starts-empty-unused')).toEqual([]);
  });

  it('refuses it on a brace, a shape or a line: they are one piece', () => {
    const p = smallProject();
    const brace = createBraceFormula({ name: 'under' });
    p.formulas.push(brace);
    p.clips.push(createClip(brace.id, p.tracks[0]!.id, 4.5, 6, { startsEmpty: true }));
    expect(issuesOf(p, 'starts-empty-kind').map((i) => [i.severity, i.message, i.path])).toEqual([
      [
        'error',
        '"under" is a brace: only a formula or a text can start empty.',
        ['clips', 2, 'startsEmpty'],
      ],
    ]);
  });
});
