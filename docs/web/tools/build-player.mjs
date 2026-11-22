#!/usr/bin/env node
/* Builds the player of the documentation: `app/src/embed/` (entry `main.ts`) into
 * `docs/web/assets/player.js`, one classic script (an IIFE, minified, no code splitting: the
 * pages are opened from disk), with its stylesheet inside it, and writes the licences of what it
 * contains next to it, in `docs/web/assets/player-licenses.txt`.
 *
 *   node docs/web/tools/build-player.mjs           build, print the size and the packages inside
 *   node docs/web/tools/build-player.mjs --check   build in memory and fail if the files on disk
 *                                                  are not what the sources make now
 *
 * The build uses the app's own Vite (`app/node_modules`), configured here: no config file is added
 * to `app/`. The player is the app's code (MIT) and the packages that code imports; only the
 * packages of `ALLOWED_PACKAGES` may be inside it (MathJax, the heaviest, never is: nothing in the
 * player typesets LaTeX). Their notices come from the app's own list (`app/build/thirdParty.ts`).
 * It starts no browser, no server and no Manim, so it needs no machine lock. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_DIR, REPO, WEB_DIR, importFromApp } from './lib/paths.mjs';

const ENTRY = join(APP_DIR, 'src', 'embed', 'main.ts');
const OUT_DIR = join(WEB_DIR, 'assets');
const OUT_JS = join(OUT_DIR, 'player.js');
const OUT_LICENSES = join(OUT_DIR, 'player-licenses.txt');

/** The packages the player may contain, and why it needs them. Anything else is an error: a new
 * import that brings a package must be looked at (size, licence) before it ships. */
const ALLOWED_PACKAGES = {
  zod: 'the model module builds the lists of animation kinds from its schemas (model/kinds.ts)',
};

/** Code of others inside the app's own modules (`EMBEDDED` of thirdParty.ts, within the app):
 * the modules that carry each one. The player carries its notice when it has such a module. */
const APP_EMBEDDED_MODULES = {
  'Manim Community Edition': /\/src\/(geom\/brace|scene\/easing)\.ts$/,
  ManimGL: /\/src\/scene\/easing\.ts$/,
};

const bytes = (n) => `${n.toLocaleString('en-US')} bytes (${(n / 1024).toFixed(1)} KiB)`;

async function bundle() {
  const { build } = await importFromApp('vite/dist/node/index.js');
  const output = await build({
    configFile: false,
    root: APP_DIR,
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    build: {
      write: false,
      minify: true,
      cssMinify: true,
      sourcemap: false,
      target: 'es2022',
      reportCompressedSize: false,
      rolldownOptions: {
        input: ENTRY,
        output: { format: 'iife', codeSplitting: false, entryFileNames: 'player.js' },
      },
    },
  });
  const outputs = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output);
  const chunks = outputs.filter((file) => file.type === 'chunk');
  const assets = outputs.filter((file) => file.type === 'asset');
  if (chunks.length !== 1 || assets.length > 0) {
    throw new Error(
      `the build made ${chunks.length} scripts and ${assets.length} other files: ` +
        'the player must be one script (no code splitting, its CSS inside it).',
    );
  }
  return chunks[0];
}

/** The license file: the app's own licence, then each component, as the app's notices give it. */
function licensesText(thirdParty, components, version) {
  const rule = '='.repeat(78);
  const thin = '-'.repeat(78);
  const title = (c) =>
    [c.name, c.version].filter(Boolean).join(' ') + (c.within ? ` (in ${c.within})` : '');
  const parts = [
    `MANIM FORMULA EDITOR PLAYER ${version}: LICENSES`,
    rule,
    'player.js is built from the code of Manim Formula Editor (app/src/embed/ and the parts of\n' +
      'the app it draws with) by docs/web/tools/build-player.mjs. That code is distributed\n' +
      'under the MIT License below. The player also contains the components listed after it,\n' +
      'each under its own license, reproduced in full. Keep this file with player.js.',
    rule,
    'Manim Formula Editor',
    'License: MIT',
    thin,
    readFileSync(join(REPO, 'LICENSE'), 'utf8').trim(),
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
  ];
  if (!components.every((c) => thirdParty.ALLOWED_LICENSES.includes(c.license))) {
    throw new Error(
      'a component of the player has a licence app/build/thirdParty.ts does not allow',
    );
  }
  return parts.join('\n\n') + '\n';
}

async function main() {
  const check = process.argv.includes('--check');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length > 0) throw new Error(`unknown arguments: ${unknown.join(' ')}`);

  const chunk = await bundle();
  // Node strips the types of the app's build module (it imports nothing but Node's own).
  const thirdParty = await import(pathToFileURL(join(APP_DIR, 'build', 'thirdParty.ts')).href);
  const packages = new Set(
    chunk.moduleIds.map((id) => thirdParty.packageOf(id)).filter((name) => name !== null),
  );
  const extra = [...packages].filter((name) => !(name in ALLOWED_PACKAGES));
  if (extra.length > 0) {
    throw new Error(
      `the player contains packages it must not: ${extra.join(', ')}. ` +
        'An import of the player reaches them (an index of a module that loads them, often): ' +
        'import the file it needs instead, or add the package to ALLOWED_PACKAGES with the reason.',
    );
  }
  const all = thirdParty.thirdPartyComponents();
  const app = 'Manim Formula Editor';
  const components = [
    ...all.filter((c) => c.within === null && packages.has(c.name)),
    ...all.filter((c) => c.within !== null && packages.has(c.within.split(' ')[0])),
    ...all.filter((c) => {
      if (c.within !== app) return false;
      const pattern = APP_EMBEDDED_MODULES[c.name];
      if (!pattern) {
        throw new Error(
          `app/build/thirdParty.ts lists "${c.name}" inside the app: say in ` +
            'APP_EMBEDDED_MODULES which modules carry it, so the player gives its notice when it has them.',
        );
      }
      return chunk.moduleIds.some((id) => pattern.test(id.replaceAll('\\', '/')));
    }),
  ];
  const { VERSION } = {
    VERSION:
      /VERSION = '([^']+)'/.exec(
        readFileSync(join(APP_DIR, 'src', 'embed', 'index.ts'), 'utf8'),
      )?.[1] ?? '?',
  };
  const names = components.map((c) => `${c.name} ${c.version ?? ''}`.trim()).join(', ');
  const header =
    `/* Generated by tools/build-player.mjs from app/src/embed/ — do not edit. ` +
    `Manim Formula Editor player ${VERSION} (MIT)` +
    (names ? `; contains ${names}` : '') +
    ': see player-licenses.txt. */\n';
  const js = header + chunk.code.replace(/\n*$/, '\n');
  const licenses = licensesText(thirdParty, components, VERSION);

  if (check) {
    const stale = [
      [OUT_JS, js],
      [OUT_LICENSES, licenses],
    ].filter(([file, text]) => {
      try {
        return readFileSync(file, 'utf8') !== text;
      } catch {
        return true;
      }
    });
    if (stale.length > 0) {
      throw new Error(
        `not what the sources make now: ${stale.map(([f]) => relative(REPO, f)).join(', ')} ` +
          '(run node docs/web/tools/build-player.mjs)',
      );
    }
    console.log(`player.js is up to date: ${bytes(Buffer.byteLength(js))}`);
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JS, js);
  writeFileSync(OUT_LICENSES, licenses);
  const own = chunk.moduleIds.filter((id) => thirdParty.packageOf(id) === null).length;
  console.log(`wrote ${relative(REPO, OUT_JS)}: ${bytes(Buffer.byteLength(js))}`);
  console.log(
    `  ${own} modules of the app; packages inside: ${[...packages].join(', ') || 'none'}`,
  );
  console.log(`wrote ${relative(REPO, OUT_LICENSES)}: ${components.length} component(s)`);
}

main().catch((error) => {
  console.error(`build-player: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
