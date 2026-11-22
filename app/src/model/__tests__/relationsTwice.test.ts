// @vitest-environment node
/* Two clips with several relations (format 31): the same source and the same target, more than
 * once. No rule is about the pair of clips; the rules about glyphs keep two relations off one
 * glyph, whether their windows overlap or not. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  createRelation,
  glyphTransfers,
  parseProject,
  serializeProject,
  setIdGenerator,
  validateProject,
  type Project,
  type Relation,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { buildEvents } from '../../scene';
import { smallProject } from './fixtures';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

const errors = (project: Project) =>
  validateProject(project)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);

/** `smallProject` — a (5 glyphs) on [0, 4], b (4 glyphs) on [2, 6], a:0 → b:3 during [2, 3) —
 * with a second relation a → b: its pairs, over [2 + offset, 2 + offset + duration). */
function twice(
  pairs: Relation['pairs'],
  window: { offset: number; duration: number } = { offset: 1.2, duration: 0.5 },
): { project: Project; first: Relation; second: Relation } {
  const project = smallProject();
  const [a, b] = project.clips;
  const second = createRelation(a!.id, b!.id, { ...window, pairs });
  project.relations.push(second);
  return { project, first: project.relations[0]!, second };
}

describe('two relations between the same two clips', () => {
  it('are valid one after the other, on different glyphs', () => {
    const { project, first, second } = twice([{ from: [2], to: [1], style: null }]);
    expect(validateProject(project)).toEqual(validateProject(smallProject()));
    // Each is a transfer of its own, in the relations' order.
    expect(glyphTransfers(project).map((t) => t.key)).toEqual([
      `relation:${first.id}`,
      `relation:${second.id}`,
    ]);
    expect(
      buildEvents(project)
        .filter((e) => e.kind === 'transfer')
        .map((e) => [e.start, e.end]),
    ).toEqual([
      [2, 3],
      [3.2, 3.7],
    ]);
  });

  it('bring their glyphs to the target each in its window, and take them from the source', () => {
    const { project } = twice([{ from: [2], to: [1], style: null }]);
    const [a, b] = project.clips;
    const lives = clipLifetimes(project);
    const target = lives.get(b!.id)!;
    expect(target.intro).toEqual([0, 2]);
    expect(target.stints.get(3)!.map((s) => s.enter.start)).toEqual([2]);
    expect(target.stints.get(1)!.map((s) => s.enter.start)).toEqual([3.2]);
    const source = lives.get(a!.id)!;
    expect(source.stints.get(0)!.map((s) => s.exit.start)).toEqual([2]);
    expect(source.stints.get(2)!.map((s) => s.exit.start)).toEqual([3.2]);
    expect(source.outro).toEqual([1, 3, 4]);
  });

  it('may run at the same time, on different glyphs', () => {
    const same = { offset: 0, duration: 1 };
    expect(errors(twice([{ from: [2], to: [1], style: null }], same).project)).toEqual([]);
    // Windows that only overlap in part, too.
    const partly = { offset: 0.5, duration: 1 };
    expect(errors(twice([{ from: [2], to: [1], style: null }], partly).project)).toEqual([]);
  });

  it('cannot bring one target glyph twice, at the same time or later', () => {
    for (const window of [
      { offset: 0, duration: 1 },
      { offset: 1.2, duration: 0.5 },
    ]) {
      const { project } = twice([{ from: [2], to: [3], style: null }], window);
      expect(errors(project)).toEqual(['target-conflict']);
    }
  });

  it('cannot consume one source glyph twice; a copy of it must start before it is consumed', () => {
    // a:0 is consumed by the first relation over [2, 3).
    expect(errors(twice([{ from: [0], to: [1], style: null }]).project)).toEqual([
      'source-consumed-twice',
    ]);
    expect(errors(twice([{ from: [0], to: [1], style: 'copy' }]).project)).toEqual([
      'source-used-after-consumed',
    ]);
    // A copy that starts with the consumption (or before it) is fine: both leave from the glyph
    // as it stands.
    const together = twice([{ from: [0], to: [1], style: 'copy' }], { offset: 0, duration: 1 });
    expect(errors(together.project)).toEqual([]);
  });

  it('are kept by a save and a load, in their order', () => {
    const { project, first, second } = twice([{ from: [2], to: [1], style: null }]);
    const text = serializeProject(project);
    const again = parseProject(text);
    if (!again.ok) throw new Error(again.error);
    expect(again.project.relations.map((r) => r.id)).toEqual([first.id, second.id]);
    expect(again.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(serializeProject(again.project)).toBe(text);
  });
});
