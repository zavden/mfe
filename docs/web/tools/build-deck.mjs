#!/usr/bin/env node
/* Builds the live exported pages of the documentation: what Export ▸ HTML writes for an example,
 * embedded in a page of the site with its own tags (`<div class="mfe-deck" data-scene="…">`, the
 * stylesheet, the engine, the scene's two files), as a reader embeds a scene in a page of theirs.
 *
 *   node docs/web/tools/build-deck.mjs           write the files of every deck of DECKS
 *   node docs/web/tools/build-deck.mjs --check   make them in memory and fail if the files on disk
 *                                                are not what the app's sources make now
 *
 * Every file comes from the app itself, so that a deck of the documentation cannot drift from
 * what the app exports: the engine, its licences and its stylesheet from the app's own Vite plugin
 * (`app/build/deckRuntime.ts`, `RUNTIME_ASSETS` of `app/src/export/html/runtimeAssets.ts`), and
 * the scene's files from the export itself (`exportedFolder`, `app/src/export/html/exportHtml.ts`)
 * of the example's project, `docs/web/examples/<slug>.mfe.json`, with the renders its data carries
 * (`<slug>.data.js`, made by `examples.mjs build`: the outlines MathJax drew in the app). So the
 * order is: change the example, `examples.mjs build <slug>`, then this tool.
 *
 * What it writes, in `docs/web/decks/`:
 *   mfe-runtime.js, player.css, LICENSES.txt   the engine, its look and its licences, shared by
 *                                              every deck of the site (a page loads them once)
 *   <slug>/scene.js, <slug>/glyphs.js          the scene and the outlines of its formulas
 *   <slug>/AGENTS.md                           the guide its folder carries, which a page quotes
 *                                              (`data-excerpt`)
 *
 * The app's modules are loaded with Vite's module runner (`runnerImport`, the app's own Vite): no
 * browser, no server and no Manim, so it needs no machine lock. Run it after a change of
 * `app/src/deck/`, of `app/src/export/html/` or of the core the engine draws with, and after
 * building one of its examples again; commit what it writes. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import vm from 'node:vm';
import { APP_DIR, REPO, WEB_DIR, importFromApp } from './lib/paths.mjs';

/** The examples shown as live exported pages, by slug. */
const DECKS = ['slides-talk'];

/** The files of an exported folder a deck of the site keeps: the scene, its outlines, its guide.
 * The others are the same for every scene (kept once, beside the decks) or are not needed to
 * play it in a page of the site. */
const SCENE_FILES = ['scene.js', 'glyphs.js', 'AGENTS.md'];
/** The files of the folder every deck shares, by their name in the folder. */
const SHARED_FILES = ['mfe-runtime.js', 'player.css', 'LICENSES.txt'];

const OUT_DIR = join(WEB_DIR, 'decks');
const EXAMPLES_DIR = join(WEB_DIR, 'examples');
const ENTRY = 'virtual:docs-deck-export';

const bytes = (n) => `${n.toLocaleString('en-US')} bytes (${(n / 1024).toFixed(1)} KiB)`;
const rel = (file) => relative(REPO, file).replaceAll('\\', '/');

/** The app's modules this tool uses, loaded as the app's own Vite loads them, with the plugin
 * that gives the engine (`virtual:mfe-deck-runtime`). */
async function appModules() {
  const { runnerImport } = await importFromApp('vite/dist/node/index.js');
  const base = { root: APP_DIR, logLevel: 'warn' };
  const { module: plugin } = await runnerImport(join(APP_DIR, 'build', 'deckRuntime.ts'), base);
  const source = (path) => JSON.stringify(join(APP_DIR, 'src', path).replaceAll('\\', '/'));
  const entry = {
    name: 'docs:deck-export',
    resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : null),
    load: (id) =>
      id === `\0${ENTRY}`
        ? `export { exportedFolder } from ${source('export/html/exportHtml.ts')};\n` +
          `export { RUNTIME_ASSETS } from ${source('export/html/runtimeAssets.ts')};\n` +
          `export { parseProject } from ${source('model/io.ts')};\n` +
          `export { unpackRender, canonOf, dataProblem } from ${source('embed/data.ts')};\n`
        : null,
  };
  const { module } = await runnerImport(ENTRY, { ...base, plugins: [plugin.deckRuntime(), entry] });
  return module;
}

/** `<slug>.data.js` as a page reads it: `MFE_EXAMPLES[slug]`. */
function exampleData(slug) {
  const file = join(EXAMPLES_DIR, `${slug}.data.js`);
  const window = {};
  vm.runInNewContext(readFileSync(file, 'utf8'), { window });
  const data = window.MFE_EXAMPLES?.[slug];
  if (!data) throw new Error(`${rel(file)} does not define the example "${slug}"`);
  return data;
}

/** The files of the deck of `slug`, as Export ▸ HTML writes them for its project. */
function deckFiles(app, slug) {
  const projectFile = join(EXAMPLES_DIR, `${slug}.mfe.json`);
  const parsed = app.parseProject(readFileSync(projectFile, 'utf8'));
  if (!parsed.ok) {
    throw new Error(`${rel(projectFile)} does not open: ${parsed.error} ${parsed.details.join('; ')}`);
  }
  const { project } = parsed;
  const data = exampleData(slug);
  const problem = app.dataProblem(data);
  if (problem) throw new Error(`the data of ${slug} cannot be used: ${problem}`);
  // The renders the example's data carries: what the app drew of each formula when it was built.
  const resolved = new Map();
  for (const formula of project.formulas) {
    const packed = data.player.renders[formula.id];
    if (!packed) continue;
    resolved.set(formula.id, {
      formula,
      render: app.unpackRender(packed),
      canonToRender: app.canonOf(packed),
      confidence: packed.confidence ?? 1,
    });
  }
  const missing = project.formulas.filter(
    (formula) => formula.kind !== 'line' && formula.source.trim() !== '' && !resolved.has(formula.id),
  );
  if (missing.length > 0) {
    throw new Error(
      `${slug}.data.js has no render of ${missing.map((f) => f.name).join(', ')}: ` +
        `run node docs/web/tools/examples.mjs build ${slug}`,
    );
  }
  const decoder = new TextDecoder();
  return app
    .exportedFolder({ project, resolved, assets: app.RUNTIME_ASSETS })
    .map((file) => ({ path: file.path, text: decoder.decode(file.bytes) }));
}

/** Every file this tool writes, as `[file, text]`. */
async function wanted() {
  const app = await appModules();
  const out = [];
  let shared = null;
  for (const slug of DECKS) {
    const files = deckFiles(app, slug);
    const byPath = new Map(files.map((file) => [file.path, file.text]));
    for (const name of SCENE_FILES) {
      if (!byPath.has(name)) throw new Error(`the export of ${slug} has no ${name}`);
      out.push([join(OUT_DIR, slug, name), byPath.get(name)]);
    }
    shared ??= SHARED_FILES.map((name) => [join(OUT_DIR, name), byPath.get(name)]);
  }
  return [...(shared ?? []), ...out];
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const unknown = args.filter((arg) => arg !== '--check');
  if (unknown.length > 0) throw new Error(`unknown arguments: ${unknown.join(' ')}`);

  const files = await wanted();
  if (check) {
    const stale = files.filter(([file, text]) => {
      try {
        return readFileSync(file, 'utf8') !== text;
      } catch {
        return true;
      }
    });
    if (stale.length > 0) {
      throw new Error(
        `not what the app's sources make now: ${stale.map(([file]) => rel(file)).join(', ')} ` +
          '(run node docs/web/tools/build-deck.mjs)',
      );
    }
    const total = files.reduce((sum, [, text]) => sum + Buffer.byteLength(text), 0);
    console.log(`the decks are up to date: ${files.length} files, ${bytes(total)}`);
    return;
  }
  for (const [file, text] of files) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    console.log(`wrote ${rel(file)}: ${bytes(Buffer.byteLength(text))}`);
  }
}

main().catch((error) => {
  console.error(`build-deck: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
