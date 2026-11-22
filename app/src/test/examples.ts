/* Node-only example loading, separate from the browser-safe project fixture builders. */
import { readFileSync } from 'node:fs';

export function readExample(name: string): string {
  return readFileSync(new URL(`../../../examples/${name}`, import.meta.url), 'utf8');
}

/** The example projects the repo versions that have a scene, by file name: what the tests play,
 * draw and export. The folder also holds files of the owner's that are not part of the project,
 * so the list is written out. */
export const EXAMPLES = [
  'hello.mfe.json',
  'one-to-many.mfe.json',
  'animation-blocks.mfe.json',
  'multiline.mfe.json',
  'completing-the-square.mfe.json',
  'match-colors.mfe.json',
  'custom-paths.mfe.json',
  'text-title.mfe.json',
  'braces.mfe.json',
  'emphasis.mfe.json',
  'text-pango.mfe.json',
  'shapes.mfe.json',
  'lines.mfe.json',
  'camera.mfe.json',
] as const;

/** The examples that are formulas alone, a project to start a scene from: nothing to play. */
export const EXAMPLES_WITHOUT_SCENE = ['quadratic-formula.mfe.json'] as const;

/** Every example file the repo versions: each is a file of the current format, with the
 * snapshots its backend gives now (a format bump writes all of them again). */
export const EXAMPLE_FILES = [...EXAMPLES, ...EXAMPLES_WITHOUT_SCENE] as const;
