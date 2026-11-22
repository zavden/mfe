// @vitest-environment node
/* A relation in which one side is a brace, a shape or a line (audits A1-02 and A3-05): an object of
 * one piece, whose glyphs no relation sends or receives (`KINDS[kind].transfers`). The editor makes
 * none (`relationBlocker`); one that a saved project has — made before the editor refused it, or
 * by hand — keeps playing and exporting as it does, as a Transform of a part or a Morph block of
 * such an object does (D123), and validation warns about it: what it is, that it cannot be edited,
 * and how to remove it (`relation-kind`, the owner's choice: a warning, not an error). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createLineFormula,
  createRelation,
  createShapeFormula,
  createTrack,
  parseProject,
  validateProject,
  type Project,
} from '../index';
import { relationBlocker } from '../../ui/relations/relationOps';
import { boxSnapshot, smallProject } from './fixtures';

const errors = (project: Project) =>
  validateProject(project).filter((issue) => issue.severity === 'error');
const warned = (project: Project) =>
  validateProject(project).filter((issue) => issue.code === 'relation-kind');
const wording = (name: string, kind: string) =>
  `"${name}" is a ${kind}, one piece: a relation is between formulas and texts. This one still plays and exports, but it cannot be edited; delete it with Delete relation in the menu of its band on the timeline.`;

function braces(): Project {
  const parsed = parseProject(
    readFileSync(new URL('../../../../examples/braces.mfe.json', import.meta.url), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

describe('a relation with an object of one piece', () => {
  it('of a brace, in a saved project, is a warning that says what to do: it still plays', () => {
    const project = braces();
    expect(errors(project)).toEqual([]);
    expect(warned(project)).toEqual([]);
    // The brace under 1+2+3 (c_first, from 2 s) lends a copy of itself to the "+" of "6+15=21"
    // (c_total, from 4.6 s), inside both clips and on a glyph nothing else brings.
    project.relations.push(
      createRelation('c_first', 'c_total', {
        style: 'copy',
        pairs: [{ from: [0], to: [1], style: null }],
      }),
    );
    expect(warned(project)).toEqual([
      {
        severity: 'warning',
        code: 'relation-kind',
        message: wording('first', 'brace'),
        path: ['relations', project.relations.length - 1],
      },
    ]);
    // A warning only: the project is as valid as it was.
    expect(errors(project)).toEqual([]);
  });

  it('of a shape or a line, which the editor refuses to make, is reported too', () => {
    const project = smallProject();
    const [a] = project.clips;
    expect(warned(project)).toEqual([]);
    const track = createTrack('Objects');
    project.tracks.push(track);
    const shape = createShapeFormula({ name: 'box', snapshot: boxSnapshot(['box']) });
    project.formulas.push(shape);
    const box = createClip(shape.id, track.id, 2, 6);
    project.clips.push(box);
    expect(relationBlocker(project, a!, box)).toMatch(/one piece/);
    // A file may hold it all the same: a:2 turns into the shape over [2.5, 3).
    project.relations.push(
      createRelation(a!.id, box.id, {
        offset: 0.5,
        duration: 0.5,
        pairs: [{ from: [2], to: [0], style: null }],
      }),
    );
    const at = project.relations.length - 1;
    expect(warned(project).map((issue) => [issue.path, issue.message])).toEqual([
      [['relations', at], wording('box', 'shape')],
    ]);
    // A line, on either side.
    const line = createLineFormula({ name: 'l1' });
    project.formulas.push(line);
    box.formulaId = line.id;
    project.relations[at] = { ...project.relations[at]!, fromClipId: box.id, toClipId: a!.id };
    expect(warned(project).map((issue) => [issue.path, issue.message])).toEqual([
      [['relations', at], wording('l1', 'line')],
    ]);
  });
});
