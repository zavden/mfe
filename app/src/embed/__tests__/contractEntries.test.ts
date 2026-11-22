// @vitest-environment node
/* The player imports the other modules through their folders (docs/ARCHITECTURE.md §2, in
 * docs/architecture/01-03-foundations.md), but for a few files that are entries of their own: the
 * evaluator, the rate functions and the ends of a line, which `scene/index.ts` would bring with
 * MathJax, and the zod schema, which the index of `model` does not export. The contract's table of
 * entries names each of them, with the files of the player that import it and why: an import of
 * another file fails here until the table names it, or the import names the folder. Type-only
 * imports load nothing and are left out (the player takes the types of `engine` that way). */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const EMBED = fileURLToPath(new URL('../', import.meta.url));
const CONTRACT = readFileSync(
  fileURLToPath(new URL('../../../../docs/architecture/01-03-foundations.md', import.meta.url)),
  'utf8',
);

/** `import … from '../…'` and `export … from '../…'`, with the `type` of a type-only one. */
const IMPORT = /^\s*(?:import|export)\s+(type\s+)?([^'"]*?\s+from\s+)?['"](\.\.\/[^'"]+)['"]/gm;

/** The files of other modules (`scene/lines`, not `scene`) that `source` loads at run time. */
function fileImports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (match[1]) continue; // `import type` / `export type`
    const names = /\{([^}]*)\}/.exec(match[2] ?? '')?.[1];
    if (names?.split(',').every((n) => n.trim() === '' || n.trim().startsWith('type '))) continue;
    const parts = match[3]!.replace(/^\.\.\//, '').split('/');
    if (parts.length > 1) found.push(parts.join('/'));
  }
  return found;
}

/** The files the player imports by file, each with the files of `embed/` that import it. */
function playerEntries(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const name of readdirSync(EMBED).filter((n) => n.endsWith('.ts'))) {
    for (const entry of fileImports(readFileSync(`${EMBED}${name}`, 'utf8'))) {
      found.set(entry, [...(found.get(entry) ?? []), name]);
    }
  }
  return found;
}

/** The rows of the contract's tables: `| entry | who imports it | why |` among them. */
const ROWS = CONTRACT.split('\n').filter((line) => line.startsWith('| `'));

describe('the files the player imports from other modules', () => {
  it('are told from the imports of a folder and from those that load nothing', () => {
    expect(
      fileImports(
        [
          "import { createEvaluator } from '../scene/evaluator';",
          "import type { FormulaRender } from '../engine';",
          "import type { Glyph } from '../engine/types';",
          "import { type Box, type Vec2 } from '../geom/types';",
          'import {',
          '  TIME_EPSILON,',
          '  type Clip,',
          "} from '../model';",
          "export { rateFunction } from '../scene/easing';",
          "import { draw } from './draw';",
        ].join('\n'),
      ),
    ).toEqual(['scene/evaluator', 'scene/easing']);
  });

  it('are each named by a row of the table of entries, with the files that import it', () => {
    const entries = playerEntries();
    expect([...entries.keys()]).toContain('scene/evaluator');
    const unnamed = [...entries].filter(
      ([entry, importers]) =>
        !ROWS.some(
          (row) =>
            row.includes(`\`${entry}.ts\``) &&
            importers.every((file) => row.includes(`\`embed/${file}\``)),
        ),
    );
    expect(unnamed).toEqual([]);
  });
});
