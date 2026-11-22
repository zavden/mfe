// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createShapeAttach,
  createShapeFormula,
  FORMAT_VERSION,
  parseProject,
  serializeProject,
  type Project,
} from '../index';
import { smallProject } from './fixtures';

/* A cross line in the file (format 25, D128): the shape `cross_line`, one line over a diagonal of
 * its target's box, and `diagonal`, which of the two — absent, the rising one. */

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

/** The small project with a cross line over its first clip, along `diagonal` when given. */
function struck(diagonal?: 'dl_ur' | 'ul_dr'): Project {
  const project = smallProject();
  const line = createShapeFormula({
    name: 's1',
    shape: 'cross_line',
    width: 2,
    height: 1,
    ...(diagonal ? { diagonal } : {}),
  });
  project.formulas.push(line);
  project.clips.push(
    createClip(line.id, project.tracks[0]!.id, 20, 26, {
      attach: createShapeAttach(project.clips[0]!.id, 'all', 0),
    }),
  );
  return project;
}

describe('a cross line in a project file', () => {
  it('goes to the file and back, with the diagonal it names', () => {
    const text = serializeProject(opened(serializeProject(struck('ul_dr'))));
    const again = opened(text);
    expect(again.formulas.at(-1)).toMatchObject({ shape: 'cross_line', diagonal: 'ul_dr' });
    expect(serializeProject(again)).toBe(text);
    expect(parseProject(serializeProject(struck('dl_ur'))).ok).toBe(true);
  });

  it('names no diagonal when it is the rising one by default', () => {
    const text = serializeProject(opened(serializeProject(struck())));
    expect(text).toContain('"shape": "cross_line"');
    expect(text).not.toContain('"diagonal"');
    expect('diagonal' in opened(text).formulas.at(-1)!).toBe(false);
  });

  it('refuses a diagonal that is not one of the two, and a shape that is none', () => {
    const text = serializeProject(struck('ul_dr'));
    for (const broken of [
      text.replace('"diagonal": "ul_dr"', '"diagonal": "ur_dl"'),
      text.replace('"diagonal": "ul_dr"', '"diagonal": true'),
      text.replace('"shape": "cross_line"', '"shape": "line"'),
    ]) {
      expect(broken).not.toBe(text);
      expect(parseProject(broken).ok).toBe(false);
    }
  });

  it('is not in a file of format 24, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 24');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(24);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(serializeProject(result.project)).toBe(text);
  });
});
