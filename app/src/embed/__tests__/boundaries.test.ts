// @vitest-environment node
/* What the player's bundle may reach. It is built from `embed/main.ts` alone, and every module it
 * imports at run time goes in: an index that re-exports more than the player needs takes the rest
 * along, and a module whose loading registers something (MathJax's TeX configurations) is kept
 * whole. The scene module's index is such a one — its attach tools import the engine's index,
 * which loads MathJax —, so the player imports the evaluator's own file. This walks the imports
 * the way the bundler does (type imports aside) and holds the player to the core: no `ui/`, no
 * store, no exporter, no engine but its types, no MathJax, no React, no package but zod.
 * `docs/web/tools/build-player.mjs` checks the built file's packages again. */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** `import … from '…'`, `export … from '…'` and `import '…'`, without type-only ones. */
const IMPORT = /^\s*(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/** The modules `file` loads at run time: relative ones as source files, packages by name. */
export function runtimeImports(
  file: string,
  source: string,
): { files: string[]; packages: string[] } {
  const files: string[] = [];
  const packages: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (match[2]) continue; // `import type` / `export type`
    const statement = match[0];
    // `import { type A, type B } from` loads nothing either.
    const names = /\{([^}]*)\}/.exec(statement)?.[1];
    if (names && names.split(',').every((n) => n.trim() === '' || n.trim().startsWith('type '))) {
      if (!/^\s*import\s+[^{]*,/.test(statement)) continue;
    }
    const specifier = match[3]!;
    if (specifier.startsWith('.')) files.push(join(dirname(file), specifier.split('?')[0]!));
    else
      packages.push(
        specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]!,
      );
  }
  return { files, packages };
}

function resolveFile(path: string): string {
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, join(path, 'index.ts')]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next
    }
  }
  throw new Error(`cannot resolve ${path}`);
}

function reach(entries: readonly string[]): { modules: Set<string>; packages: Set<string> } {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (modules.has(file)) continue;
    modules.add(file);
    if (!/\.tsx?$/.test(file)) continue; // a stylesheet
    const found = runtimeImports(file, readFileSync(file, 'utf8'));
    for (const name of found.packages) packages.add(name);
    for (const next of found.files) queue.push(/\.(css)$/.test(next) ? next : resolveFile(next));
  }
  return { modules, packages };
}

describe('the player bundle', () => {
  it('reads the imports the way the bundler does', () => {
    const at = join(SRC, 'embed', 'x.ts');
    expect(
      runtimeImports(
        at,
        [
          "import type { A } from '../engine';",
          "import { type B, type C } from '../scene';",
          "import { createEvaluator } from '../scene/evaluator';",
          "export type { D } from './data';",
          "export { E } from './view';",
          "import styles from './player.css?inline';",
          "import { z } from 'zod';",
        ].join('\n'),
      ),
    ).toEqual({
      files: [
        join(SRC, 'scene', 'evaluator'),
        join(SRC, 'embed', 'view'),
        join(SRC, 'embed', 'player.css'),
      ],
      packages: ['zod'],
    });
  });

  it('stays in the core, without MathJax', () => {
    // Every module of embed/ (main.ts, the bundle's entry, among them), and all they load.
    const own = readdirSync(join(SRC, 'embed'))
      .filter((name) => /\.ts$/.test(name))
      .map((name) => join(SRC, 'embed', name));
    const { modules, packages } = reach(own);
    const names = [...modules].map((m) => relative(SRC, m).replaceAll('\\', '/'));
    expect(names.length).toBeGreaterThan(40);
    const outside = names.filter((name) => !/^(embed|model|geom|scene|render)\//.test(name));
    expect(outside).toEqual([]);
    // The engine's index and the scene's (which imports the engine's) load MathJax.
    expect(names).not.toContain('scene/index.ts');
    expect(names.filter((n) => n.startsWith('engine/'))).toEqual([]);
    expect([...packages]).toEqual(['zod']);
  });
});
