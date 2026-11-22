// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClip, createRelation, type Project, type Relation } from '../../../model';
import {
  attachmentConsumer,
  noPhases,
  timingErrorsOf,
  timingScene,
} from '../../../model/__tests__/timingFixtures';
import { clampWindow } from '../windowRange';

function scene(side: 'source' | 'target', offset: number, style: 'copy' | 'transform' = 'copy') {
  const { project, clip: from } = timingScene();
  const to = createClip(from.formulaId, project.tracks[1]!.id, 0, 10, noPhases());
  project.clips.push(to);
  const relation = createRelation(from.id, to.id, {
    offset,
    duration: 1,
    style,
    pairs: [{ from: [0], to: [0], style: null }],
  });
  project.relations.push(relation);
  attachmentConsumer(project, side === 'source' ? from : to);
  return { project, relation, from, to };
}

const placed = (
  project: Project,
  relation: Relation,
  timing: { offset: number; duration: number },
) => ({
  ...project,
  relations: project.relations.map((r) => (r.id === relation.id ? { ...r, ...timing } : r)),
});

describe.each(['source', 'target'] as const)('attachments on a relation %s', (side) => {
  it.each([
    ['move', 2, 4.5, 5.5, 4, 1],
    ['move', 6, 4.5, 5.5, 5, 1],
    ['start', 6, 4.5, 7, 5, 2],
    ['end', 2, 2, 6, 2, 3],
  ] as const)(
    '%s from %s stops at the exact measurement boundary',
    (edit, offset, start, end, expectedOffset, expectedDuration) => {
      const { project, relation } = scene(side, offset);
      expect(timingErrorsOf(project)).toEqual([]);
      const result = clampWindow(project, relation.id, { start, end }, edit);
      expect(result).toEqual({ offset: expectedOffset, duration: expectedDuration });
      expect(timingErrorsOf(placed(project, relation, result!))).toEqual([]);
    },
  );

  it('permits a transfer entirely after measurement and exactly on either safe edge', () => {
    const { project, relation } = scene(side, 2);
    for (const start of [4, 5, 6]) {
      const result = clampWindow(project, relation.id, { start, end: start + 1 }, 'move');
      expect(result).toEqual({ offset: start, duration: 1 });
      expect(timingErrorsOf(placed(project, relation, result!))).toEqual([]);
    }
  });
});

it('does not move a consuming relation before a source attachment and leave its target gone', () => {
  const { project, relation } = scene('source', 6, 'transform');
  const result = clampWindow(project, relation.id, { start: 3, end: 4 }, 'move');
  expect(result).toEqual({ offset: 5, duration: 1 });
  expect(timingErrorsOf(placed(project, relation, result!))).toEqual([]);
});

it('checks branching attachments on both relation sides', () => {
  const { project, relation, from, to } = scene('source', 8, 'transform');
  attachmentConsumer(project, from, 6);
  attachmentConsumer(project, to, 7);
  const result = clampWindow(project, relation.id, { start: 5.5, end: 6.5 }, 'move');
  expect(result).toEqual({ offset: 7, duration: 1 });
  expect(timingErrorsOf(placed(project, relation, result!))).toEqual([]);
});
