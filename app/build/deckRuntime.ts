/* The engine of an exported page, built into the app. Export ▸ HTML writes a folder whose
 * `mfe-runtime.js` is the code that draws and plays the scene (`src/deck/`, entry `main.ts`, with
 * the evaluator and the parts of the app it draws with): the app has to carry that code as text.
 * This plugin gives it as a module, `virtual:mfe-deck-runtime`, by building it when the module is
 * asked for — one classic script (an IIFE, minified, no code splitting: the exported page is
 * opened from disk) — with the licences of what it contains. So the runtime the app exports is
 * always the one its sources make: no built file is kept in the repository, and none can go
 * stale. The build inside the build takes a twentieth of a second.
 *
 * Only the packages of `ALLOWED_PACKAGES` may be inside it (MathJax, the heaviest, never is: the
 * page typesets no LaTeX; `src/deck/__tests__/boundaries.test.ts` holds the sources to the same
 * list). Typed in `src/vite-env.d.ts`. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
import { deckTypeFiles } from './deckTypes.ts';
import { ALLOWED_LICENSES, packageOf, thirdPartyComponents, type Component } from './thirdParty.ts';

export const RUNTIME_MODULE = 'virtual:mfe-deck-runtime';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = fileURLToPath(new URL('../src/deck/main.ts', import.meta.url));
const LICENSE = fileURLToPath(new URL('../../LICENSE', import.meta.url));
const STYLESHEET = fileURLToPath(new URL('../src/deck/player.css', import.meta.url));

/** The packages the runtime may contain, and why it needs them. Anything else is an error: an
 * import that brings a package is looked at (size, licence) before it ships in every export. */
export const ALLOWED_PACKAGES: Readonly<Record<string, string>> = {
  zod: 'the scene file is read with the schema of the project (model/schema.ts)',
};

/** Code of others inside the app's own modules (`EMBEDDED` of thirdParty.ts, within the app): the
 * modules that carry each one. The runtime gives its notice when it has such a module. */
const APP_EMBEDDED_MODULES: Readonly<Record<string, RegExp>> = {
  'Manim Community Edition': /\/src\/(geom\/brace|scene\/easing)\.ts$/,
  ManimGL: /\/src\/scene\/easing\.ts$/,
};

export interface BuiltRuntime {
  /** The script: `mfe-runtime.js`. */
  code: string;
  /** Its licences: `LICENSES.txt`. */
  licenses: string;
  /** The stylesheet that goes with it, `src/deck/player.css` as it is: `player.css`. It comes
   * through here, and not as an import of the app's, so that it is the same text in the build,
   * in the dev server and under the test runner (which reads a stylesheet as nothing). */
  css: string;
  /** The types of its API and of the project a scene file holds, made from the sources
   * (`deckTypes.ts`): `types/mfe.d.ts` and `types/scene.d.ts`. */
  mfeTypes: string;
  sceneTypes: string;
  /** The sources the type files were made of. */
  typeSources: string[];
  /** The modules inside it, by their paths. */
  modules: string[];
  /** The packages inside it. */
  packages: string[];
}

/** The runtime's version, read from its sources. */
function runtimeVersion(): string {
  const index = readFileSync(new URL('../src/deck/index.ts', import.meta.url), 'utf8');
  return /VERSION = '([^']+)'/.exec(index)?.[1] ?? '?';
}

/** The licences file: the app's own licence, then each component inside the runtime, in full. */
export function licensesText(components: readonly Component[], version: string): string {
  const rule = '='.repeat(78);
  const thin = '-'.repeat(78);
  const title = (c: Component) =>
    [c.name, c.version].filter(Boolean).join(' ') + (c.within ? ` (in ${c.within})` : '');
  const bad = components.filter((c) => !ALLOWED_LICENSES.includes(c.license));
  if (bad.length > 0) {
    throw new Error(
      `the runtime contains ${bad.map(title).join(', ')}, under a licence build/thirdParty.ts does not allow`,
    );
  }
  return (
    [
      `MANIM FORMULA EDITOR RUNTIME ${version}: LICENSES`,
      rule,
      'mfe-runtime.js is the engine of a scene exported from Manim Formula Editor: the part of\n' +
        'the editor that draws and plays a scene. That code is distributed under the MIT License\n' +
        'below. It also contains the components listed after it, each under its own license,\n' +
        'reproduced in full. Keep this file with mfe-runtime.js. The scene itself (scene.js,\n' +
        'glyphs.js) and everything else in this folder is yours.',
      rule,
      'Manim Formula Editor',
      'License: MIT',
      thin,
      readFileSync(LICENSE, 'utf8').trim(),
      'COMPONENTS\n' +
        (components.length === 0
          ? '  (none)'
          : components.map((c) => `  ${title(c)}  ${c.license}`).join('\n')),
      ...components.map((c) =>
        [
          rule,
          title(c),
          `License: ${c.license}`,
          ...(c.holder ? [c.holder] : []),
          ...(c.source ? [`Source: ${c.source}`] : []),
          ...(c.repository ? [`Repository: ${c.repository}`] : []),
          ...(c.note ? [c.note] : []),
          thin,
          c.text,
        ].join('\n'),
      ),
    ].join('\n\n') + '\n'
  );
}

/** The components whose notices the runtime carries: the packages inside it, what comes inside
 * those, and the code of others inside the app's own modules that it has. */
export function runtimeComponents(
  modules: readonly string[],
  packages: ReadonlySet<string>,
  all: readonly Component[] = thirdPartyComponents(),
): Component[] {
  const app = 'Manim Formula Editor';
  return [
    ...all.filter((c) => c.within === null && packages.has(c.name)),
    ...all.filter((c) => c.within !== null && packages.has(c.within.split(' ')[0]!)),
    ...all.filter((c) => {
      if (c.within !== app) return false;
      const pattern = APP_EMBEDDED_MODULES[c.name];
      if (!pattern) {
        throw new Error(
          `build/thirdParty.ts lists "${c.name}" inside the app: say in APP_EMBEDDED_MODULES of ` +
            'build/deckRuntime.ts which modules carry it, so the runtime gives its notice when it has them.',
        );
      }
      return modules.some((id) => pattern.test(id.replaceAll('\\', '/')));
    }),
  ];
}

/** Builds the runtime from the sources as they are now. */
export async function buildRuntime(): Promise<BuiltRuntime> {
  const output = await build({
    configFile: false,
    root: APP_DIR,
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    build: {
      write: false,
      minify: true,
      sourcemap: false,
      target: 'es2022',
      reportCompressedSize: false,
      rolldownOptions: {
        input: ENTRY,
        output: { format: 'iife', codeSplitting: false, entryFileNames: 'mfe-runtime.js' },
      },
    },
  });
  const outputs = (Array.isArray(output) ? output : [output]).flatMap((o) =>
    'output' in o ? o.output : [],
  );
  const chunks = outputs.filter((file) => file.type === 'chunk');
  if (chunks.length !== 1 || outputs.length !== 1) {
    throw new Error(
      `the build of the runtime made ${outputs.length} files: it must be one script ` +
        '(no code splitting, nothing beside it).',
    );
  }
  const chunk = chunks[0]!;
  const modules = chunk.moduleIds.filter((id) => !id.startsWith('\0'));
  const packages = new Set(
    chunk.moduleIds.map((id) => packageOf(id)).filter((name): name is string => name !== null),
  );
  const extra = [...packages].filter((name) => !(name in ALLOWED_PACKAGES));
  if (extra.length > 0) {
    throw new Error(
      `the runtime of the exported page contains packages it must not: ${extra.join(', ')}. ` +
        'An import of src/deck/ reaches them (an index of a module that loads them, often): ' +
        'import the file it needs instead, or add the package to ALLOWED_PACKAGES of ' +
        'build/deckRuntime.ts with the reason.',
    );
  }
  const version = runtimeVersion();
  const components = runtimeComponents(modules, packages);
  const names = components.map((c) => `${c.name} ${c.version ?? ''}`.trim()).join(', ');
  const header =
    `/* mfe-runtime.js ${version}: the engine of a scene exported from Manim Formula Editor (MIT)` +
    (names ? `; contains ${names}` : '') +
    ': see LICENSES.txt. Generated; nothing here needs reading or editing: the scene is scene.js. */\n';
  const types = deckTypeFiles();
  return {
    code: header + chunk.code.replace(/\n*$/, '\n'),
    licenses: licensesText(components, version),
    css: readFileSync(STYLESHEET, 'utf8'),
    mfeTypes: types.mfe,
    sceneTypes: types.scene,
    typeSources: types.sources.map((path) =>
      fileURLToPath(new URL(`../src/${path}`, import.meta.url)),
    ),
    modules,
    packages: [...packages],
  };
}

/** The module the app imports for the runtime's text. */
export function runtimeModule(
  runtime: Pick<BuiltRuntime, 'code' | 'licenses' | 'css' | 'mfeTypes' | 'sceneTypes'>,
): string {
  return (
    `export const runtime = ${JSON.stringify(runtime.code)};\n` +
    `export const licenses = ${JSON.stringify(runtime.licenses)};\n` +
    `export const css = ${JSON.stringify(runtime.css)};\n` +
    `export const mfeTypes = ${JSON.stringify(runtime.mfeTypes)};\n` +
    `export const sceneTypes = ${JSON.stringify(runtime.sceneTypes)};\n`
  );
}

/** Gives the app `virtual:mfe-deck-runtime`: the runtime of the exported page, its licences, its
 * stylesheet and its type files, built from the sources when the module is asked for. A source of the runtime that changes
 * makes the module be built again (the dev server and a watching build are told of them). */
export function deckRuntime(): Plugin {
  return {
    name: 'mfe:deck-runtime',
    resolveId(id) {
      return id === RUNTIME_MODULE ? `\0${RUNTIME_MODULE}` : null;
    },
    async load(id) {
      if (id !== `\0${RUNTIME_MODULE}`) return null;
      const runtime = await buildRuntime();
      for (const module of [...runtime.modules, STYLESHEET, ...runtime.typeSources]) {
        this.addWatchFile(module);
      }
      return runtimeModule(runtime);
    },
  };
}
