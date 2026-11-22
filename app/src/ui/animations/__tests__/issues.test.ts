// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createDisappear,
  createShapeAttach,
  createShapeFormula,
  validateProject,
  type Issue,
} from '../../../model';
import { refreshLocalRenders } from '../../../engine';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  blockIssues,
  clipIssues,
  graver,
  issueMark,
  issueSection,
  projectIssues,
  relationIssues,
  relationSeverities,
  severities,
} from '../issues';

/** The small project with a block on its first clip and a pair, both naming glyph 99. */
function broken() {
  const p = smallProject();
  const [first, second] = p.clips;
  const block = createAppear(0.5, 'write', [99]);
  first!.actions.push(block);
  p.relations[0]!.pairs.push({ from: [99], to: [0], style: null });
  return { p, first: first!, second: second!, block, relation: p.relations[0]! };
}

describe('issues of one object', () => {
  it('validates a project once', () => {
    const { p } = broken();
    expect(projectIssues(p)).toBe(projectIssues(p));
    expect(projectIssues(p)).toEqual(validateProject(p));
  });

  it("give a block its own issues, a clip its blocks' and its relations'", () => {
    const { p, first, second, block, relation } = broken();
    const ofBlock = blockIssues(p, first.id, block.id);
    const ofRelation = relationIssues(p, relation.id);
    expect(ofBlock.length).toBeGreaterThan(0);
    expect(ofRelation.length).toBeGreaterThan(0);
    expect(clipIssues(p, first.id)).toEqual(expect.arrayContaining([...ofBlock, ...ofRelation]));
    // The second clip has no block issue, only the relation's.
    expect(clipIssues(p, second.id)).toEqual(ofRelation);
    // Glyph 99 does not exist: an error.
    expect(relationSeverities(p)).toEqual(new Map([[relation.id, 'error']]));
  });

  it('give a clip inside another of its track its overlap, whatever lies between the two', () => {
    const p = smallProject();
    const [first, second] = p.clips;
    p.relations = [];
    // The first clip takes the whole track; the second and a third lie inside it, apart.
    Object.assign(first!, { start: 0, end: 10 });
    Object.assign(second!, { trackId: first!.trackId, start: 1, end: 2 });
    const third = { ...structuredClone(second!), id: 'third', start: 3, end: 4 };
    p.clips.push(third);
    const overlap = (id: string) => clipIssues(p, id).filter((i) => i.code === 'track-overlap');
    expect(overlap(second!.id)).toHaveLength(1);
    expect(overlap(third.id)).toHaveLength(1);
    expect(overlap(first!.id)).toEqual([]);
  });

  it('find nothing in a valid project', () => {
    const p = smallProject();
    expect(clipIssues(p, p.clips[0]!.id)).toEqual([]);
    expect(relationSeverities(p).size).toBe(0);
  });

  it('mark a relation with only warnings as warned, one with an error as bad', () => {
    const p = smallProject();
    const relation = p.relations[0]!;
    // r0 moves glyph 0 of a at [2, 3); a Disappear block took it off screen at 1 s: it appears
    // out of nowhere, a warning (`source-hidden`), and the relation has nothing else.
    p.clips[0]!.actions.push(createDisappear(1, 'fade_out', [0], { duration: 0.5 }));
    expect(relationIssues(p, relation.id).map((i) => [i.severity, i.code])).toEqual([
      ['warning', 'source-hidden'],
    ]);
    expect(relationSeverities(p)).toEqual(new Map([[relation.id, 'warning']]));
    // A pair onto glyph 99, which b does not have: an error besides the warning.
    const broken = structuredClone(p);
    broken.relations[0]!.pairs.push({ from: [1], to: [99], style: null });
    expect(relationSeverities(broken)).toEqual(new Map([[relation.id, 'error']]));
  });

  it('invalidates measured shape diagnostics when a missing target render arrives', () => {
    const p = smallProject();
    const host = createShapeFormula({ name: 'host', width: 2, height: 1 });
    const shape = createShapeFormula({ name: 'shape' });
    p.formulas = [host, shape];
    p.clips[0]!.formulaId = host.id;
    p.clips[1]!.formulaId = shape.id;
    p.clips[1]!.attach = createShapeAttach(p.clips[0]!.id, 'all', -5);
    p.relations = [];
    const missing = new Map();
    expect(projectIssues(p, missing).some((issue) => issue.code === 'attach-shape-fit')).toBe(
      false,
    );
    const rendered = refreshLocalRenders(p, missing).formulas;
    const issues = clipIssues(p, p.clips[1]!.id, rendered);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'attach-shape-fit', severity: 'error' }),
      ]),
    );
    expect(projectIssues(p, rendered)).toBe(projectIssues(p, rendered));
    expect(projectIssues(p, missing)).not.toBe(projectIssues(p, rendered));
  });
});

describe('how grave issues are (D177)', () => {
  const issue = (severity: Issue['severity'], code: string): Issue => ({
    severity,
    code: code as Issue['code'],
    message: code,
    path: ['clips', 0],
  });

  it('take the graver severity: an error as soon as one is, null for none', () => {
    expect(graver([])).toBeNull();
    expect(graver([undefined, null])).toBeNull();
    expect(graver(['warning', undefined])).toBe('warning');
    expect(graver(['warning', 'error', 'warning'])).toBe('error');
    expect(
      severities([
        ['a', 'warning'],
        ['b', 'error'],
        ['a', 'warning'],
        ['b', 'warning'],
        ['c', 'warning'],
        ['c', 'error'],
      ] as const),
    ).toEqual(
      new Map([
        ['a', 'warning'],
        ['b', 'error'],
        ['c', 'error'],
      ]),
    );
  });

  it('mark an error in red and warnings alone in the warning colour', () => {
    expect(issueMark('error')).toBe('is-bad');
    expect(issueMark('warning')).toBe('is-warned');
    expect(issueMark(undefined)).toBeNull();
    expect(issueMark(null)).toBeNull();
  });

  it('list only warnings under Warnings, as they came', () => {
    const list = [issue('warning', 'intro-empty'), issue('warning', 'action-empty')];
    expect(issueSection(list)).toEqual({ title: 'Warnings', tone: 'warnings', issues: list });
  });

  it('list only errors under Problems, as they came', () => {
    const list = [issue('error', 'clip-length'), issue('error', 'track-overlap')];
    expect(issueSection(list)).toEqual({ title: 'Problems', tone: 'problems', issues: list });
  });

  it('list errors and warnings under Problems, the errors first, each in its order', () => {
    const [w1, e1, w2, e2] = [
      issue('warning', 'intro-empty'),
      issue('error', 'clip-length'),
      issue('warning', 'action-empty'),
      issue('error', 'track-overlap'),
    ];
    expect(issueSection([w1!, e1!, w2!, e2!])).toEqual({
      title: 'Problems',
      tone: 'problems',
      issues: [e1, e2, w1, w2],
    });
  });

  it('have no section for no issues', () => {
    expect(issueSection([])).toBeNull();
  });
});
