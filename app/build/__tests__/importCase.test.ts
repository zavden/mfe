// @vitest-environment node
/* A disk that does not tell `Foo` from `foo` (macOS and Windows as they come) answers for
 * `Foo.ts` with the file `foo.ts`. An import without its extension is resolved by trying the
 * extensions in order, `.ts` before `.tsx`: where a folder holds `foo.ts` and `Foo.tsx`, `./Foo`
 * is the component on Linux and the module there, and the app stops at that import ("does not
 * provide an export named …") on an empty page. The two can share a folder as long as the import
 * of the one found second names its extension (`./Foo.tsx`). This resolves every relative import
 * both ways from the names of the files alone, so that it says the same on any disk. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
/** Where the sources that import each other are; the files right under `app/` join them. */
const ROOTS = ['app/src', 'app/e2e', 'app/build', 'tests'];
/** The order Vite tries them in (`resolve.extensions`); TypeScript too takes `.ts` before `.tsx`. */
const EXTENSIONS = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];
/** `from '…'`, `import '…'`, `import('…')` and Vitest's `vi.mock('…')`, of a relative path. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bvi\.\w+\(\s*)(['"])(\.{1,2}(?:\/[^'"\n]*)?)\1/g;

interface Tree {
  /** The files, by their path from the root. */
  files: ReadonlySet<string>;
  /** The same files under the one name a disk that ignores case knows each by. */
  folded: ReadonlyMap<string, readonly string[]>;
}

function treeOf(paths: readonly string[]): Tree {
  const folded = new Map<string, string[]>();
  for (const path of paths) {
    const key = path.toLowerCase();
    folded.set(key, [...(folded.get(key) ?? []), path]);
  }
  return { files: new Set(paths), folded };
}

/** The relative specifiers a source imports. */
function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].flatMap((match) => match[2] ?? []);
}

/** The file `specifier` names from `importer`: `exact` on a disk that tells cases apart, `folded`
 * on one that does not. Each takes the first name that exists there: the path as written, then
 * with each extension, then the `index` of a folder. */
function resolved(
  importer: string,
  specifier: string,
  tree: Tree,
): { exact: string | undefined; folded: string | undefined } {
  const target = posix.join(posix.dirname(importer), specifier.replace(/[?#].*$/, ''));
  const candidates = [
    target,
    ...EXTENSIONS.map((extension) => target + extension),
    ...EXTENSIONS.map((extension) => `${target}/index${extension}`),
  ];
  const exact = candidates.find((candidate) => tree.files.has(candidate));
  const found = candidates.flatMap((candidate) => tree.folded.get(candidate.toLowerCase()) ?? []);
  // Two files under one folded name are told apart by nothing there: the other test's business.
  return { exact, folded: exact !== undefined && found[0] === exact ? exact : found[0] };
}

function repoFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const entry of readdirSync(join(REPO, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      files.push(relative(REPO, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
    }
  }
  for (const entry of readdirSync(join(REPO, 'app'), { withFileTypes: true })) {
    if (entry.isFile()) files.push(`app/${entry.name}`);
  }
  return files;
}

describe('imports on a disk that ignores the case of names', () => {
  const tree = treeOf([
    'ui/Dialog.tsx',
    'ui/EasingCurve.tsx',
    'ui/easingCurve.ts',
    'ui/Preview.tsx',
    'ui/preview/index.ts',
    'ui/styles.css',
    'ui/__tests__/Dialog.test.tsx',
  ]);

  it('finds the relative imports of a source', () => {
    expect(
      specifiers(
        [
          "import { a } from './a';",
          "import type { B } from '../b';",
          'import {',
          '  c,',
          "} from './c.tsx';",
          "import './styles.css';",
          "export { d } from './d';",
          "const e = await import('./e');",
          "vi.mock('../f', () => ({}));",
          "import { g } from '..';",
          "import { render } from '@testing-library/react';",
          "const url = new URL('./h.json', import.meta.url);",
        ].join('\n'),
      ),
    ).toEqual(['./a', '../b', './c.tsx', './styles.css', './d', './e', '../f', '..']);
  });

  it('resolves an import as each kind of disk does', () => {
    // `.ts` is tried before `.tsx`: the module answers for the component.
    expect(resolved('ui/Dialog.tsx', './EasingCurve', tree)).toEqual({
      exact: 'ui/EasingCurve.tsx',
      folded: 'ui/easingCurve.ts',
    });
    // Named with its extension, the component is the first name tried.
    expect(resolved('ui/Dialog.tsx', './EasingCurve.tsx', tree)).toEqual({
      exact: 'ui/EasingCurve.tsx',
      folded: 'ui/EasingCurve.tsx',
    });
    // The module is found first either way.
    expect(resolved('ui/EasingCurve.tsx', './easingCurve', tree)).toEqual({
      exact: 'ui/easingCurve.ts',
      folded: 'ui/easingCurve.ts',
    });
    // A file is tried before a folder's index: `Preview.tsx` answers for the folder `preview`.
    expect(resolved('ui/Dialog.tsx', './preview', tree)).toEqual({
      exact: 'ui/preview/index.ts',
      folded: 'ui/Preview.tsx',
    });
    expect(resolved('ui/__tests__/Dialog.test.tsx', '../styles.css?raw', tree)).toEqual({
      exact: 'ui/styles.css',
      folded: 'ui/styles.css',
    });
    expect(
      resolved('ui/preview/index.ts', '..', treeOf(['ui/index.ts', 'ui/preview/index.ts'])),
    ).toEqual({ exact: 'ui/index.ts', folded: 'ui/index.ts' });
    expect(resolved('ui/Dialog.tsx', './missing', tree)).toEqual({
      exact: undefined,
      folded: undefined,
    });
  });

  it('every import of the app is the same file there', () => {
    const repo = treeOf(repoFiles());
    const found: string[] = [];
    for (const file of repo.files) {
      if (!/\.(?:tsx?|m[jt]s)$/.test(file) || file.startsWith('app/src/data/')) continue;
      for (const specifier of specifiers(readFileSync(join(REPO, file), 'utf8'))) {
        const { exact, folded } = resolved(file, specifier, repo);
        if (exact === undefined || folded === exact) continue;
        found.push(
          `${file}: '${specifier}' is ${exact}, but ${folded} on a disk that ignores case: ` +
            'name its extension',
        );
      }
    }
    expect(found).toEqual([]);
  });

  it('no two files of the app are one name there', () => {
    const repo = treeOf(repoFiles());
    expect([...repo.folded.values()].filter((names) => names.length > 1)).toEqual([]);
  });
});
