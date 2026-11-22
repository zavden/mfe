// @vitest-environment node
/* `relationEligibility` against the validation it reads ahead of: over many small projects —
 * three clips, a few relations and Morph blocks between them, each with one pair — every glyph of
 * the source and every glyph of the target of a draft relation is tried in a pair, consuming and
 * copying, and the project with that pair has an error exactly when the drawing would have said
 * so: a dimmed glyph on either side, or a source that is only noted when the pair consumes it. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
  createTrack,
  setIdGenerator,
  validateProject,
  type Clip,
  type Project,
  type Relation,
  type RelationStyle,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import { relationEligibility } from '../relationDraft';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** A small generator of the same numbers at every run. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
  };
}

const GLYPHS = 4;
const STARTS = [1, 2, 3, 4, 5];
const STYLES: RelationStyle[] = ['transform', 'copy'];

/** Three clips of four glyphs each on three tracks over [0, 10], without intro or outro, and a
 * few transfers of one pair each between them: relations in any direction, Morph blocks in the
 * first two clips. */
function scene(seed: number): { project: Project; a: Clip; b: Clip } {
  const rng = random(seed);
  const project = createEmptyProject();
  project.tracks.push(createTrack('Track 3'));
  const clips = ['a', 'b', 'c'].map((name, i) => {
    const formula = createFormula({ name, snapshot: boxSnapshot(['w', 'x', 'y', 'z']) });
    project.formulas.push(formula);
    const clip = createClip(formula.id, project.tracks[i]!.id, 0, 10);
    project.clips.push(clip);
    return clip;
  });
  const [a, b] = clips as [Clip, Clip, Clip];
  const window = () => ({ start: rng.pick(STARTS), duration: rng.pick([1, 2]) });
  for (let i = rng.int(4); i > 0; i--) {
    const from = rng.pick(clips);
    const to = rng.pick(clips.filter((c) => c !== from));
    const { start, duration } = window();
    project.relations.push(
      createRelation(from.id, to.id, {
        offset: start - to.start,
        duration,
        pairs: [{ from: [rng.int(GLYPHS)], to: [rng.int(GLYPHS)], style: rng.pick(STYLES) }],
      }),
    );
  }
  for (let i = rng.int(3); i > 0; i--) {
    const clip = rng.pick([a, b]);
    const from = rng.int(GLYPHS);
    const to = (from + 1 + rng.int(GLYPHS - 1)) % GLYPHS;
    const { start, duration } = window();
    clip.actions.push(
      createMorph(start - clip.start, {
        duration,
        style: rng.pick(STYLES),
        pairs: [{ from: [from], to: [to], style: null }],
      }),
    );
    clip.actions.sort((x, y) => x.start - y.start);
  }
  return { project, a, b };
}

const errorsOf = (project: Project) =>
  validateProject(project).filter((issue) => issue.severity === 'error');

describe('relationEligibility, against the validation', () => {
  it('dims or notes a glyph exactly when a pair on it would be an error', () => {
    let scenes = 0;
    let dimmed = 0;
    let noted = 0;
    const wrong: string[] = [];
    for (let seed = 1; seed <= 900; seed++) {
      const { project, a, b } = scene(seed);
      // A scene that is wrong by itself says nothing about the pair.
      if (errorsOf(project).length > 0) continue;
      scenes += 1;
      const rng = random(seed * 7919);
      const draft: Relation = createRelation(a.id, b.id, {
        offset: rng.pick(STARTS) - b.start,
        duration: rng.pick([1, 2]),
      });
      const { ineligible, notes } = relationEligibility(project, draft);
      dimmed += ineligible.from.size + ineligible.to.size;
      noted += notes.from.size;
      for (let from = 0; from < GLYPHS; from++) {
        for (let to = 0; to < GLYPHS; to++) {
          for (const style of STYLES) {
            const pair = { from: [from], to: [to], style };
            const next = {
              ...project,
              relations: [...project.relations, { ...draft, pairs: [pair] }],
            };
            const found = errorsOf(next);
            const expected =
              ineligible.from.has(from) ||
              ineligible.to.has(to) ||
              (style === 'transform' && notes.from.has(from));
            if (found.length > 0 !== expected) {
              wrong.push(
                `seed ${seed}, ${from} → ${to} (${style}): ${
                  found.map((issue) => issue.code).join(', ') || 'no error'
                }; the drawing: from ${ineligible.from.get(from) ?? notes.from.get(from) ?? 'free'}, to ${ineligible.to.get(to) ?? 'free'}`,
              );
            }
          }
        }
      }
    }
    expect(wrong.slice(0, 12)).toEqual([]);
    // The scenes do meet the rules: many are valid, and glyphs are dimmed and noted in them.
    expect(scenes).toBeGreaterThan(150);
    expect(dimmed).toBeGreaterThan(300);
    expect(noted).toBeGreaterThan(60);
  });
});
