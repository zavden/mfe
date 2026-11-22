/* Captures the real app for the web documentation — screenshots, short clips with a visible
 * pointer and the keys pressed, step-by-step tours, in both themes of the app, and data read out
 * of it — from capture files that run again whenever the app changes.
 *
 *   node docs/web/tools/capture.mjs                          every capture file
 *   node docs/web/tools/capture.mjs basics/timeline          one page (or a section: basics)
 *   node docs/web/tools/capture.mjs basics/timeline --only move-clip --theme dark
 *   node docs/web/tools/capture.mjs --list                   what each file makes (no browser)
 *   node docs/web/tools/capture.mjs --sizes                  the weight of each page and item
 *
 * A capture file is `tools/captures/<page-id>.mjs`; it exports `{ page, project?, viewport?,
 * items }` and the tool writes what its items make into `media/<page-id>/` with a
 * `manifest.json`, then prints the sizes against the budgets. CAPTURES.md tells how to write
 * one and how a page embeds what it makes. Everything runs in one `withChrome` (the machine lock,
 * the CPU guard, the app's dev server on its own port); clips need ffmpeg. The capture files are
 * read once the run has its slot of the machine: a run that waited for its turn captures them as
 * they are when it starts, not as they were when it was launched. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChrome } from './lib/browser.mjs';
import { withMachineLock } from './lib/lock.mjs';
import { REPO, WEB_DIR } from './lib/paths.mjs';
import { readCpuTemperature } from './lib/temperature.mjs';
import {
  captureClip,
  captureData,
  captureShot,
  captureTour,
  tourImages,
} from './capture-kit/kinds.mjs';
import { projectReader } from './capture-kit/kit.mjs';
import {
  DEFAULTS,
  formatBytes,
  hasFfmpeg,
  removeStale,
  shown,
  sizeReport,
  weightReport,
  WebpEncoder,
  writeManifest,
} from './capture-kit/output.mjs';

const CAPTURES = join(WEB_DIR, 'tools', 'captures');
const MEDIA = join(WEB_DIR, 'media');
const KINDS = ['shot', 'clip', 'tour', 'data'];
const THEMES = ['dark', 'light'];
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEYS_AT = [
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

/** The fields each kind takes (others are reported: a typo would be silently ignored). */
const FIELDS = {
  common: ['kind', 'name', 'project', 'viewport', 'setup', 'scale', 'quality', 'target', 'padding'],
  shot: ['steps', 'highlight', 'cursor'],
  clip: [
    'act',
    'highlight',
    'keysAt',
    'cursorStart',
    'loop',
    'holdStart',
    'holdEnd',
    'fps',
    'crf',
    'maxSeconds',
  ],
  tour: ['steps', 'cursor'],
  data: ['extract'],
};
const STEP_FIELDS = ['caption', 'act', 'focus', 'focusPadding', 'highlight', 'cursor'];

const log = (...parts) => console.log(...parts);
const warn = (message) => console.log(`  ⚠ ${message}`);

function usage() {
  return [
    'usage: node docs/web/tools/capture.mjs [page-id | section | file.mjs …] [options]',
    '  --only <name>[,<name>…]  only these items (by name)',
    '  --theme dark|light        one theme only (both by default)',
    '  --list                    list the capture files and what they make; capture nothing',
    '  --sizes                   the bytes of each page and item, both themes; capture nothing',
    '  --check                   check the capture files (and --only); capture nothing',
    'See docs/web/tools/CAPTURES.md.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    targets: [],
    only: null,
    themes: THEMES,
    list: false,
    sizes: false,
    check: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') {
      const value = argv[++i];
      if (!value) throw new Error('--only needs item names');
      options.only = [...(options.only ?? []), ...value.split(',').map((s) => s.trim())];
    } else if (arg === '--theme') {
      const value = argv[++i];
      if (!THEMES.includes(value)) throw new Error('--theme is dark or light');
      options.themes = [value];
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--sizes') {
      options.sizes = true;
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg === '--help' || arg === '-h') {
      log(usage());
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option ${arg}\n${usage()}`);
    } else {
      options.targets.push(arg);
    }
  }
  return options;
}

/** A file or folder whose name starts with `_` is no page: `captures/_shared/` holds what capture
 * files import from each other (CAPTURES.md, "Helpers shared by capture files"). */
const isShared = (name) => name.startsWith('_');

/** Every capture file under `dir`, sorted. */
function captureFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isShared(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...captureFiles(path));
    else if (entry.name.endsWith('.mjs')) out.push(path);
  }
  return out.sort();
}

/** The capture files the arguments name: page ids, sections, or paths of files. */
function selectFiles(targets) {
  if (targets.length === 0) return captureFiles(CAPTURES);
  const files = [];
  for (const target of targets) {
    if (target.split(/[\\/]/).some(isShared))
      throw new Error(`${target} is a helper shared by capture files, not a page`);
    const asPath = resolve(target);
    const asPage = join(CAPTURES, `${target.replace(/\.mjs$/, '')}.mjs`);
    const asSection = join(CAPTURES, target);
    if (target.endsWith('.mjs') && existsSync(asPath)) files.push(asPath);
    else if (existsSync(asPage)) files.push(asPage);
    else if (existsSync(asSection) && statSync(asSection).isDirectory())
      files.push(...captureFiles(asSection));
    else throw new Error(`no capture file for ${target} (looked for ${shown(asPage, REPO)})`);
  }
  return [...new Set(files)];
}

/** The examples git tracks in `examples/` (null when git cannot tell: then every file goes). */
function trackedExamples() {
  const run = spawnSync('git', ['ls-files', 'examples'], { cwd: REPO, encoding: 'utf8' });
  if (run.status !== 0) {
    warn('git cannot list the tracked examples: every file of examples/ is allowed');
    return null;
  }
  return new Set(run.stdout.split('\n').filter(Boolean));
}

/** A caption is HTML of a few elements only (AUTHORING.md §3, "Tours"). */
function captionProblem(caption) {
  if (typeof caption !== 'string' || caption.trim() === '')
    return 'a caption is a non-empty string';
  for (const [, closing, tag, attrs] of caption.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g)) {
    const name = tag.toLowerCase();
    if (!['b', 'i', 'em', 'strong', 'code', 'kbd', 'span'].includes(name))
      return `<${name}> is not allowed`;
    const a = attrs.trim();
    if (closing || a === '') continue;
    if (name === 'kbd' && /^data-keys="[^"]*"$/.test(a)) continue;
    if (name === 'span' && /^class="ui"$/.test(a)) continue;
    return `<${name} ${a}> is not allowed (kbd takes data-keys, span takes class="ui")`;
  }
  if (/<span(?![^>]*class="ui")/.test(caption)) return 'a <span> needs class="ui"';
  return null;
}

/** The files an item writes, both themes. */
function outputsOf(item) {
  const themed = (base, ext) => THEMES.map((theme) => `${base}.${theme}.${ext}`);
  if (item.kind === 'shot') return themed(item.name, 'webp');
  if (item.kind === 'clip') return [...themed(item.name, 'webm'), ...themed(item.name, 'webp')];
  if (item.kind === 'tour') {
    const images = new Set(tourImages(item.steps));
    return [
      ...[...images].flatMap((n) => themed(`${item.name}-${n}`, 'webp')),
      `${item.name}.tour.js`,
    ];
  }
  return [`${item.name}.data.js`];
}

/** The page id of a capture file: its path under `captures/`, without `.mjs`. */
function pageOf(file) {
  return relative(CAPTURES, file)
    .split('\\')
    .join('/')
    .replace(/\.mjs$/, '');
}

/** Loads and checks a capture file; returns its spec with defaults filled in, or throws with
 * every problem found. */
async function loadCapture(file, readProject) {
  const page = pageOf(file);
  const spec = (await import(pathToFileURL(file).href)).default;
  const problems = [];
  if (!spec || typeof spec !== 'object') throw new Error(`${shown(file, REPO)}: no default export`);
  if (spec.page !== page) problems.push(`page is '${spec.page}', but the file says '${page}'`);
  if (!Array.isArray(spec.items) || spec.items.length === 0)
    problems.push('items is an empty list');
  const names = new Set();
  const outputs = new Set();
  const items = [];
  for (const [index, raw] of (spec.items ?? []).entries()) {
    const where = `item ${index + 1}${raw?.name ? ` (${raw.name})` : ''}`;
    const item = {
      project: spec.project ?? null,
      viewport: spec.viewport ?? DEFAULT_VIEWPORT,
      ...raw,
    };
    if (!KINDS.includes(item.kind)) {
      problems.push(`${where}: kind is one of ${KINDS.join(', ')}`);
      continue;
    }
    if (!SLUG.test(item.name ?? ''))
      problems.push(`${where}: name is lowercase words joined by hyphens`);
    if (names.has(item.name)) problems.push(`${where}: the name is used twice`);
    names.add(item.name);
    const known = [...FIELDS.common, ...FIELDS[item.kind]];
    for (const key of Object.keys(raw))
      if (!known.includes(key)) problems.push(`${where}: unknown field ${key}`);
    const { width, height } = item.viewport;
    if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) {
      problems.push(`${where}: viewport is { width, height } in whole CSS px`);
    }
    if (
      item.scale !== undefined &&
      !(typeof item.scale === 'number' && item.scale >= 1 && item.scale <= 3)
    ) {
      problems.push(`${where}: scale is a number from 1 to 3`);
    }
    if (item.project) {
      try {
        readProject(item.project);
      } catch (error) {
        problems.push(`${where}: ${error.message}`);
      }
    }
    if (
      item.quality !== undefined &&
      !(typeof item.quality === 'number' && item.quality > 0 && item.quality <= 1)
    ) {
      problems.push(`${where}: quality is a number above 0, at most 1`);
    }
    if (item.kind === 'clip' && !item.act) problems.push(`${where}: a clip needs act(page, kit)`);
    if (item.fps !== undefined && !(Number.isInteger(item.fps) && item.fps >= 1 && item.fps <= 60))
      problems.push(`${where}: fps is a whole number from 1 to 60`);
    if (item.crf !== undefined && !(Number.isInteger(item.crf) && item.crf >= 0 && item.crf <= 63))
      problems.push(`${where}: crf is a whole number from 0 to 63`);
    if (
      item.maxSeconds !== undefined &&
      !(typeof item.maxSeconds === 'number' && item.maxSeconds > 0)
    ) {
      problems.push(`${where}: maxSeconds is a number of seconds`);
    }
    const keysPoint =
      item.keysAt !== null &&
      typeof item.keysAt === 'object' &&
      Number.isFinite(item.keysAt.x) &&
      Number.isFinite(item.keysAt.y);
    if (item.kind === 'clip' && item.keysAt && !KEYS_AT.includes(item.keysAt) && !keysPoint) {
      problems.push(`${where}: keysAt is one of ${KEYS_AT.join(', ')}, or { x, y } in the clip`);
    }
    if (item.kind === 'data' && typeof item.extract !== 'function') {
      problems.push(`${where}: data needs extract(page, kit)`);
    }
    if (item.kind === 'tour') {
      if (!Array.isArray(item.steps) || item.steps.length === 0) {
        problems.push(`${where}: a tour needs steps`);
        continue;
      }
      item.steps.forEach((step, i) => {
        const problem = captionProblem(step?.caption);
        if (problem) problems.push(`${where}, step ${i + 1}: ${problem}`);
        for (const key of Object.keys(step ?? {})) {
          if (!STEP_FIELDS.includes(key))
            problems.push(`${where}, step ${i + 1}: unknown field ${key}`);
        }
      });
    }
    for (const output of outputsOf(item)) {
      if (outputs.has(output)) problems.push(`${where}: ${output} is also written by another item`);
      outputs.add(output);
    }
    items.push(item);
  }
  if (problems.length) {
    throw new Error(`${shown(file, REPO)}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  // `declared`: every file the items of the file write, both themes — what a run, even of some
  // items only, keeps in the page's folder.
  return { file, page, items, dir: join(MEDIA, ...page.split('/')), declared: outputs };
}

function jsFile(file, global, key, value) {
  return (
    `/* Generated by tools/capture.mjs from ${shown(file, WEB_DIR)} — do not edit. */\n` +
    `(window.${global} ||= {})[${JSON.stringify(key)}] = ${JSON.stringify(value, null, 2)};\n`
  );
}

/** Names the files a failing item left to look at (kinds.mjs, `saveFailure`). */
function savedFor(error) {
  if (error?.saved?.length) {
    log(`    what the app showed when it failed: ${error.saved.join(', ')}`);
  }
}

function describe(entry) {
  const size = entry.width ? ` ${entry.width}×${entry.height}` : '';
  const density = entry.scale ? ` @${entry.scale}x` : '';
  const duration = entry.duration ? ` ${entry.duration.toFixed(1)} s` : '';
  return `${size}${density}${duration} ${formatBytes(entry.bytes)}`;
}

function list(captures) {
  for (const capture of captures) {
    log(`${capture.page}  (${shown(capture.file, REPO)})`);
    for (const item of capture.items) {
      const outputs = outputsOf(item);
      const made =
        outputs.length > 4
          ? `${outputs.slice(0, 2).join(', ')} … ${outputs.length} files`
          : outputs.join(', ');
      log(
        `  ${item.kind.padEnd(5)} ${item.name.padEnd(22)} ${item.project ?? '(no project)'}  ${item.viewport.width}×${item.viewport.height}`,
      );
      log(`        → ${made}`);
    }
  }
}

/** `--sizes`: the weight of each page of the capture files, by item and theme, from the
 * manifests (no browser). With no page named, the media folders that no capture file makes are
 * listed too. */
function sizes(captures, everything) {
  const pages = captures.map((capture) => ({
    page: capture.page,
    dir: capture.dir,
    limits: Object.fromEntries(
      capture.items
        .filter((item) => item.kind === 'clip')
        .map((item) => [item.name, item.maxSeconds ?? DEFAULTS.maxSeconds]),
    ),
  }));
  if (everything) {
    const known = new Set(pages.map((p) => p.page));
    const folders = (dir) => {
      const out = [];
      if (existsSync(join(dir, 'manifest.json'))) out.push(dir);
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (entry.isDirectory()) out.push(...folders(join(dir, entry.name)));
      return out;
    };
    for (const dir of existsSync(MEDIA) ? folders(MEDIA) : []) {
      const page = shown(dir, MEDIA);
      if (!known.has(page)) pages.push({ page: `${page} (no capture file)`, dir });
    }
  }
  const long = weightReport(pages, WEB_DIR, log);
  if (long.length) {
    log('\nLong clips (trim them to the action, or set `maxSeconds` if they must be long):');
    for (const { page, item, duration, limit } of long)
      log(`  ⚠ ${page} ${item}: ${duration.toFixed(1)} s, over ${limit} s`);
  }
}

/** Loads the capture files the options name; `selected` holds those with items to capture (all,
 * or the `--only` ones), `captures` every file with all its items. Throws on any problem. */
async function loadAll(options, readProject) {
  const captures = [];
  for (const file of selectFiles(options.targets))
    captures.push(await loadCapture(file, readProject));
  let selected = captures;
  if (options.only) {
    const all = new Set(captures.flatMap((c) => c.items.map((i) => i.name)));
    for (const name of options.only)
      if (!all.has(name)) throw new Error(`--only: no item named ${name}`);
    selected = captures.map((capture) => ({
      ...capture,
      items: capture.items.filter((i) => options.only.includes(i.name)),
    }));
  }
  return { captures, selected: selected.filter((capture) => capture.items.length > 0) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const readProject = projectReader(trackedExamples());
  if (options.list || options.sizes || options.check) {
    const { captures, selected } = await loadAll(options, readProject);
    if (options.sizes) sizes(captures, options.targets.length === 0);
    else if (options.list) list(selected);
    return 0;
  }
  // The files are checked at once, in a process of their own (what it imports does not stay in
  // this one), so that a mistake is said before the wait for a slot; this process reads them
  // only once it has its slot, as they are then.
  const check = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), ...process.argv.slice(2), '--check'],
    { stdio: 'inherit' },
  );
  if (check.status !== 0) return 1;
  const pages = selectFiles(options.targets).map(pageOf);
  const label = `capture ${pages.join(', ')}${options.only ? ` --only ${options.only.join(',')}` : ''}`;
  return withMachineLock(label, async () => {
    const { selected } = await loadAll(options, readProject);
    if (selected.length === 0) {
      log('nothing to capture');
      return 0;
    }
    return run(selected, options, readProject, label);
  });
}

/** Captures the items of `selected` (loaded inside the slot this process holds). */
async function run(selected, options, readProject, label) {
  const ffmpeg = hasFfmpeg();
  if (!ffmpeg && selected.some((c) => c.items.some((i) => i.kind === 'clip'))) {
    warn('ffmpeg with VP9 (libvpx-vp9) is not on the PATH: clips are skipped, their files kept');
  }
  const before = readCpuTemperature();
  if (before !== null) log(`CPU at ${before} °C`);
  let failures = 0;
  const longClips = [];
  await withChrome(label, async ({ browser }) => {
    const encoder = new WebpEncoder(browser);
    try {
      for (const capture of selected) {
        log(`\n${capture.page}`);
        mkdirSync(capture.dir, { recursive: true });
        const written = {};
        const write = (name, bytes, entry) => {
          writeFileSync(join(capture.dir, name), bytes);
          written[name] = { ...entry, bytes: bytes.length };
          log(`  ✓ ${name.padEnd(30)}${describe(written[name])}`);
        };
        for (const item of capture.items) {
          const context = { browser, item, readProject, encoder, pageId: capture.page };
          if (item.kind === 'clip' && !ffmpeg) {
            warn(`${item.name}: skipped (no ffmpeg)`);
            continue;
          }
          if (item.kind === 'data') {
            try {
              const value = await captureData({
                ...context,
                warn: (message) => warn(`${item.name}: ${message}`),
              });
              const text = jsFile(capture.file, 'MFE_DATA', `${capture.page}/${item.name}`, value);
              write(`${item.name}.data.js`, Buffer.from(text), { kind: 'data', item: item.name });
            } catch (error) {
              failures += 1;
              log(`  ✗ ${item.name}: ${error.stack ?? error}`);
              savedFor(error);
            }
            continue;
          }
          let tour = null;
          for (const theme of options.themes) {
            const itemWarn = (message) => warn(`${item.name} (${theme}): ${message}`);
            try {
              if (item.kind === 'tour') {
                const result = await captureTour({ ...context, theme, warn: itemWarn });
                for (const file of result.files)
                  write(file.name, file.bytes, {
                    kind: file.kind,
                    item: item.name,
                    theme,
                    width: file.width,
                    height: file.height,
                    scale: file.scale,
                  });
                if (!tour) tour = result.tour;
                else if (
                  JSON.stringify(result.tour.steps.map((s) => s.boxes)) !==
                  JSON.stringify(tour.steps.map((s) => s.boxes))
                ) {
                  itemWarn('the focus boxes differ from the first theme: the first are kept');
                }
              } else {
                const run = item.kind === 'shot' ? captureShot : captureClip;
                const files = await run({ ...context, theme, warn: itemWarn });
                for (const file of files) {
                  const { name, bytes, ...entry } = file;
                  write(name, bytes, { ...entry, item: item.name, theme });
                  const limit = item.maxSeconds ?? DEFAULTS.maxSeconds;
                  if (entry.duration > limit) {
                    const note = `${capture.page} ${item.name} (${theme}) lasts ${entry.duration.toFixed(1)} s, over ${limit} s`;
                    longClips.push(note);
                    itemWarn(
                      `the clip lasts ${entry.duration.toFixed(1)} s, over ${limit} s: trim it to ` +
                        'the action, or set `maxSeconds` if it must be long',
                    );
                  }
                }
              }
            } catch (error) {
              failures += 1;
              log(`  ✗ ${item.name} (${theme}): ${error.stack ?? error}`);
              savedFor(error);
            }
          }
          if (tour) {
            const text = jsFile(capture.file, 'MFE_TOURS', `${capture.page}/${item.name}`, tour);
            write(`${item.name}.tour.js`, Buffer.from(text), {
              kind: 'tour',
              item: item.name,
              width: tour.width,
              height: tour.height,
              steps: tour.steps.length,
            });
          }
        }
        // What no item of the file makes — an item renamed or removed, a tour with fewer images —
        // goes, whichever items and themes this run captured.
        for (const name of removeStale(capture.dir, capture.declared))
          log(`  − ${name} (no item of the capture file makes it: removed)`);
        const unknown = writeManifest(capture.dir, capture.page, written);
        for (const name of unknown)
          warn(`${name} is in media/${capture.page}/ but no capture made it`);
      }
    } finally {
      await encoder.close();
    }
  });
  sizeReport(
    selected.map((c) => ({ page: c.page, dir: c.dir })),
    WEB_DIR,
    log,
  );
  if (longClips.length) {
    log('\nLong clips (trim them to the action, or set `maxSeconds` if they must be long):');
    for (const note of longClips) log(`  ⚠ ${note}`);
  }
  const after = readCpuTemperature();
  if (after !== null) log(`CPU at ${after} °C`);
  if (failures) log(`\n${failures} capture(s) failed`);
  return failures ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message ?? error);
    process.exit(1);
  },
);
