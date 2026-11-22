/* A small scene for the tests of the deck in the browser's way (jsdom reads no file): the mock
 * example of the documentation's player — two formulas, a clip each on two tracks, a relation
 * from the first to the second, 5 s long — as the two files of an exported page. */
import { canonOf, unpackRender } from '../../embed/data';
import { mockExampleData } from '../../embed/__tests__/mockExample';
import type { ResolvedFormula } from '../../engine';
import type { Project, SlideMark } from '../../model';
import { packGlyphs, type GlyphFile } from '../glyphFile';

export interface MockFiles {
  project: Project;
  glyphs: GlyphFile;
}

/** The files of the mock scene, with these marks of the Slides mode when given. Its first clip
 * is on screen over [0, 3], written during its first second and fading out during its last; its
 * second over [2, 5], there at once and fading out during its last second; the relation runs
 * during [2, 3]. So the scene animates over [0, 1], [2, 3] and [4, 5], and rests over [1, 2] and
 * [3, 4]. */
export async function mockFiles(marks: SlideMark[] = []): Promise<MockFiles> {
  const data = await mockExampleData();
  const project = structuredClone(data.player.project);
  const resolved = new Map<string, ResolvedFormula>();
  for (const formula of project.formulas) {
    const packed = data.player.renders[formula.id];
    if (!packed) continue;
    resolved.set(formula.id, {
      formula,
      render: unpackRender(packed),
      canonToRender: canonOf(packed),
      confidence: packed.confidence ?? 1,
    });
  }
  const glyphs = packGlyphs(project, resolved);
  if (marks.length > 0) project.slides = { marks };
  return JSON.parse(JSON.stringify({ project, glyphs })) as MockFiles;
}
