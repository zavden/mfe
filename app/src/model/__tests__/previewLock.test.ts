// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, parseProject, serializeProject, type Project } from '../index';
import { smallProject } from './fixtures';

/* A clip locked in the preview (format 20): a mark on the clip that the preview reads. In the
 * file it is `previewLocked`, there only when the clip is locked. */

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

describe('a clip locked in the preview, in the file', () => {
  it('is kept by a save and a load, and absent from a clip that is not locked', () => {
    const project = smallProject();
    expect(project.clips.length).toBeGreaterThan(1);
    project.clips[0]!.previewLocked = true;
    const text = serializeProject(project);
    const again = opened(text);
    expect(again.clips[0]!.previewLocked).toBe(true);
    expect('previewLocked' in again.clips[1]!).toBe(false);
    expect(serializeProject(again)).toBe(text);
    expect(text.match(/"previewLocked"/g)).toHaveLength(1);
  });

  it('is not in a file of format 19, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 19');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(19);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(result.project.clips.some((clip) => clip.previewLocked)).toBe(false);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('is a boolean: a file that says anything else is refused', () => {
    const project = smallProject();
    (project.clips[0] as { previewLocked?: unknown }).previewLocked = 'yes';
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(false);
  });
});
