import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTrack,
  defaultIntro,
  defaultOutro,
  validateProject,
} from '../../../model';
import { introducedError, introducedIssue } from '../draftValidation';
import { draftProblems, initialDraft } from '../relationDraft';

function conflictProject() {
  const project = createEmptyProject();
  const formula = createFormula({
    name: 'letters',
    source: 'abc',
    snapshot: {
      backend: 'mathjax',
      key: 'abc',
      glyphs: ['a', 'b', 'c'].map((label, i) => ({ label, center: [i, 0], size: [1, 1] })),
    },
  });
  project.formulas = [formula];
  project.tracks = [0, 1, 2, 3].map((i) => createTrack(`Track ${i}`));
  project.clips = project.tracks.map((track, i) =>
    createClip(formula.id, track.id, i === 3 ? 2 : 0, 8, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    }),
  );
  project.relations = [0, 1, 2].map((i) =>
    createRelation(project.clips[i]!.id, project.clips[3]!.id, {
      style: 'copy',
      pairs: [{ from: [i], to: [i === 2 ? 2 : 0], style: null }],
    }),
  );
  return project;
}

const conflicts = (project: ReturnType<typeof conflictProject>) =>
  validateProject(project).filter((issue) => issue.code === 'target-conflict');

describe('candidate issue comparison', () => {
  it('detects a third owner even when validation still reports the second owner', () => {
    const before = conflictProject();
    const after = structuredClone(before);
    after.relations[2]!.pairs.push({ from: [1], to: [0], style: null });
    const issue = conflicts(after)[0]!;
    expect(issue.path[1]).toBe(conflicts(before)[0]!.path[1]);
    expect(introducedIssue(before, after, issue)).toBe(true);
  });

  it('ignores labels and owner array positions when comparing an existing problem', () => {
    const before = conflictProject();
    const after = structuredClone(before);
    after.formulas[0]!.name = 'Renamed';
    after.relations.reverse();
    after.clips.reverse();
    expect(conflicts(after)[0]!.message).not.toBe(conflicts(before)[0]!.message);
    expect(introducedIssue(before, after, conflicts(after)[0]!)).toBe(false);
  });

  it('allows fewer participants while identifying newly affected glyphs', () => {
    const before = conflictProject();
    before.relations[2]!.pairs.push({ from: [1], to: [0], style: null });
    const after = structuredClone(before);
    after.relations[2]!.pairs.pop();
    expect(introducedIssue(before, after, conflicts(after)[0]!)).toBe(false);
    after.relations[0]!.pairs[0]!.to.push(1);
    after.relations[1]!.pairs[0]!.to.push(1);
    const added = conflicts(after).find((issue) =>
      issue.identity!.glyphs.some((g) => g.index === 1),
    )!;
    expect(introducedIssue(before, after, added)).toBe(true);
  });

  it('counts repeated pair owners rather than collapsing participant IDs into a set', () => {
    const before = conflictProject();
    before.relations = [before.relations[0]!];
    // Pairs of one relation that share a target without bringing the same glyphs (D167).
    before.relations[0]!.pairs.push({ from: [1], to: [0, 1], style: null });
    const after = structuredClone(before);
    after.relations[0]!.pairs.push({ from: [2], to: [0, 2], style: null });
    expect(introducedIssue(before, after, conflicts(after)[0]!)).toBe(true);
  });

  it('lets a valid relation edit coexist with unrelated invalid imported relations', () => {
    const project = conflictProject();
    project.relations.push(createRelation('missing-source', 'missing-target'));
    expect(validateProject(project).some((issue) => issue.severity === 'error')).toBe(true);
    const relation = { ...project.relations[2]!, style: 'fade' as const };
    const draft = initialDraft(relation, project.clips[2]!, project.clips[3]!);
    expect(draftProblems(project, draft).filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});

describe('introducedError (audits A3-04, A8-02)', () => {
  it('is the first error an edit brings, not one the project had, nor a warning', () => {
    const project = conflictProject();
    // Relations 0 and 1 bring letter 0 of the last clip twice: an error the project has.
    expect(conflicts(project)).not.toEqual([]);
    expect(introducedError(project, project)).toBeNull();
    // Relation 2 brought onto letter 0 too: a third owner of the conflict is a new error.
    const worse = structuredClone(project);
    worse.relations[2]!.pairs[0]!.to = [0];
    expect(introducedError(project, worse)?.code).toBe('target-conflict');
    // Relation 2 as a fade copy: nothing new.
    const other = structuredClone(project);
    other.relations[2]!.style = 'fade_copy';
    expect(introducedError(project, other)).toBeNull();
  });
});
