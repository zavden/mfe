// @vitest-environment node
/* Nothing outside `ui/` imports from it (CLAUDE.md, "Architecture constraints";
 * docs/ARCHITECTURE.md §2): the model, the scene, the stores and the generated Python work without
 * a component, a test of them loads no React, and an import the other way round is the first half
 * of a cycle. Only the three files that start the app stand above `ui/`. This reads the sources of
 * the product for it; a test may import from anywhere, and so may the helpers of the tests
 * (`src/test/`). It sees the imports written as such: a path put together at run time passes
 * unseen, and so would the words `from '../ui/x'` in a comment be taken for one.
 *
 * And no source of the product imports what is the tests' alone — their helpers (`src/test/`:
 * the engine that draws boxes, the ids in sequence) or a file of a `__tests__` folder —: a tree
 * of the product without its tests is the same sources, none of them edited. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
/** The files that start the app: the layout, its mount and the dev handle. */
const ABOVE_UI = new Set(['App.tsx', 'main.tsx', 'devtools.ts']);
/** `from '…'` (an import or a re-export), `import '…'` and `import('…')`, of a relative path. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}(?:\/[^'"\n]*)?)\1/g;

/** Whether `file` (its path from `src/`) is a source of the product that must not know `ui/`. */
function keptFromUi(file: string): boolean {
  if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || file.endsWith('.d.ts')) return false;
  if (/(^|\/)__tests__\//.test(file) || /^(?:ui|test|data)\//.test(file)) return false;
  return !ABOVE_UI.has(file);
}

/** The imports of `source`, a file at `file`, that name something of `ui/`. */
function uiImports(file: string, source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .flatMap((match) => match[2] ?? [])
    .filter((specifier) => {
      const target = posix.join(posix.dirname(file), specifier);
      return target === 'ui' || target.startsWith('ui/');
    });
}

describe('the modules under ui/', () => {
  it('tells an import of ui/ from one beside it', () => {
    expect(
      uiImports(
        'store/renderSync.ts',
        [
          "import { announce } from '../ui/announcer';",
          "import type { Theme } from '../ui';",
          "export { notify } from '../ui/project/noticeStore';",
          "const dialog = await import('../ui/project/Dialog');",
          "import '../ui/styles.css';",
          "import { createEngine } from '../engine';",
          "import { history } from './projectStore';",
          "import { render } from '@testing-library/react';",
        ].join('\n'),
      ),
    ).toEqual([
      '../ui/announcer',
      '../ui',
      '../ui/project/noticeStore',
      '../ui/project/Dialog',
      '../ui/styles.css',
    ]);
    // A folder deeper, and a folder whose name only starts the same way.
    expect(uiImports('export/codegen/steps.ts', "import { x } from '../../ui/time';")).toEqual([
      '../../ui/time',
    ]);
    expect(uiImports('export/codegen/steps.ts', "import { x } from '../../uix/time';")).toEqual([]);
    expect(uiImports('model/io.ts', "import { x } from './ui';")).toEqual([]);
  });

  it('knows which sources the rule is for', () => {
    expect(
      [
        'model/io.ts',
        'store/renderSync.ts',
        'export/codegen/steps.ts',
        'audio/plan.ts',
        'media/package.ts',
        'ui/preview/overlay.ts',
        'store/__tests__/gestureAmendments.test.ts',
        'model/__tests__/fixtures.ts',
        'test/services.ts',
        'data/templates.json',
        'App.tsx',
        'App.test.tsx',
        'devtools.ts',
        'vite-env.d.ts',
      ].filter(keptFromUi),
    ).toEqual([
      'model/io.ts',
      'store/renderSync.ts',
      'export/codegen/steps.ts',
      'audio/plan.ts',
      'media/package.ts',
    ]);
  });

  it('nothing outside ui/ imports from it', () => {
    const found: string[] = [];
    let read = 0;
    for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      const file = relative(SRC, path).replaceAll('\\', '/');
      if (!keptFromUi(file)) continue;
      read += 1;
      for (const specifier of uiImports(file, readFileSync(path, 'utf8'))) {
        found.push(`${file} imports '${specifier}'`);
      }
    }
    expect(found).toEqual([]);
    // The walk found the sources: an empty list is not a folder that moved.
    expect(read).toBeGreaterThan(100);
  });
});

/** Whether `file` (its path from `src/`) is a source of the product: not a test, nor a helper of
 * the tests. */
function ofTheProduct(file: string): boolean {
  if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || file.endsWith('.d.ts')) return false;
  return !/(^|\/)__tests__\//.test(file) && !file.startsWith('test/');
}

/** The imports of `source`, a file at `file`, that name something of the tests' alone. */
function testImports(file: string, source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .flatMap((match) => match[2] ?? [])
    .filter((specifier) => {
      const target = posix.join(posix.dirname(file), specifier);
      return (
        target === 'test' || target.startsWith('test/') || /(^|\/)__tests__(\/|$)/.test(target)
      );
    });
}

describe('what is the tests’ alone', () => {
  it('tells an import of the tests’ helpers or of a test’s folder from another', () => {
    expect(
      testImports(
        'ui/creator/CreatorPanel.tsx',
        [
          "import { createMockEngine } from '../../test/mockEngine';",
          "import { sequentialIds } from '../../test/sequentialIds';",
          "import { smallProject } from '../../model/__tests__/fixtures';",
          "const kit = await import('./__tests__/kit');",
          "import { getEngine } from '../../engine';",
          "import { latest } from './testing';",
          "import { render } from '@testing-library/react';",
        ].join('\n'),
      ),
    ).toEqual([
      '../../test/mockEngine',
      '../../test/sequentialIds',
      '../../model/__tests__/fixtures',
      './__tests__/kit',
    ]);
    expect(testImports('devtools.ts', "import { startServices } from './test/services';")).toEqual([
      './test/services',
    ]);
    // A folder whose name only starts the same way.
    expect(testImports('devtools.ts', "import { x } from './tests/x';")).toEqual([]);
  });

  it('knows which sources are the product’s', () => {
    expect(
      [
        'model/io.ts',
        'ui/preview/overlay.ts',
        'App.tsx',
        'devtools.ts',
        'App.test.tsx',
        'store/__tests__/gestureAmendments.test.ts',
        'model/__tests__/fixtures.ts',
        'test/mockEngine.ts',
        'test/services.ts',
        'vite-env.d.ts',
        'data/templates.json',
      ].filter(ofTheProduct),
    ).toEqual(['model/io.ts', 'ui/preview/overlay.ts', 'App.tsx', 'devtools.ts']);
  });

  it('no source of the product imports it', () => {
    const found: string[] = [];
    let read = 0;
    for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      const file = relative(SRC, path).replaceAll('\\', '/');
      if (!ofTheProduct(file)) continue;
      read += 1;
      for (const specifier of testImports(file, readFileSync(path, 'utf8'))) {
        found.push(`${file} imports '${specifier}'`);
      }
    }
    expect(found).toEqual([]);
    expect(read).toBeGreaterThan(500);
  });
});
