#!/usr/bin/env node
/* The weight of the web documentation: where the bytes of docs/web/ are. Node only, no browser.
 *
 *   node docs/web/tools/sizes.mjs                 the report
 *   node docs/web/tools/sizes.mjs --top 40        more of the heaviest files (20 by default)
 *   node docs/web/tools/sizes.mjs --page basics/timeline   one page's files, file by file
 *   node docs/web/tools/sizes.mjs --json          the same data as JSON
 *
 * It prints the total against the target (about 35–45 MB in all), the bytes by folder, by page
 * folder of media/, by page (what each page loads or offers: its HTML, its media in both themes,
 * its examples' files, its widgets; the site's shared files once, apart), the heaviest files, and
 * what no page uses (media of items that no longer exist, examples no page shows). What a page
 * uses comes from tools/build.mjs, which reads the pages the same way. */
import { readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB_DIR } from './lib/paths.mjs';
import { build } from './build.mjs';

const MB = 1024 * 1024;
export const TARGET = { low: 35 * MB, high: 45 * MB };

/** Every file under docs/web/ as { rel, bytes } (rel with "/"). */
function listFiles(dir = WEB_DIR, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...listFiles(full, rel));
    else out.push({ rel, bytes: stats.size });
  }
  return out;
}

const human = (bytes) =>
  bytes >= MB
    ? `${(bytes / MB).toFixed(2)} MB`
    : bytes >= 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${bytes} B`;
const padLeft = (text, width) => String(text).padStart(width);

/** The site's own files, which every page loads: counted once, not per page. */
const SHARED = /^assets\/(?:site\.css|site\.js|nav\.js|search-index\.js|player\.js)$/;

/** The report's data. */
export async function sizes() {
  const files = listFiles();
  const bytesOf = new Map(files.map((file) => [file.rel, file.bytes]));
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  const { pages } = await build({ write: false });

  const byFolder = new Map();
  for (const file of files) {
    const top = file.rel.includes('/') ? `${file.rel.split('/')[0]}/` : '(files at the root)';
    const key = file.rel.endsWith('.html') && top !== 'tools/' ? '(the pages, .html)' : top;
    byFolder.set(key, (byFolder.get(key) ?? 0) + file.bytes);
  }

  // media/<section>/<page>/…: the folder of each page's captures.
  const byMediaFolder = new Map();
  for (const file of files) {
    const parts = file.rel.split('/');
    if (parts[0] !== 'media' || parts.length < 4) continue;
    const folder = parts.slice(1, 3).join('/');
    byMediaFolder.set(folder, (byMediaFolder.get(folder) ?? 0) + file.bytes);
  }

  const used = new Set();
  const byPage = [];
  for (const page of pages.values()) {
    const row = { id: page.id, html: bytesOf.get(page.rel) ?? 0, media: 0, examples: 0, other: 0 };
    for (const rel of page.uses) {
      used.add(rel);
      if (SHARED.test(rel)) continue;
      const bytes = bytesOf.get(rel) ?? 0;
      if (rel.startsWith('media/')) row.media += bytes;
      else if (rel.startsWith('examples/')) row.examples += bytes;
      else row.other += bytes;
    }
    row.total = row.html + row.media + row.examples + row.other;
    row.files = Array.from(page.uses)
      .filter((rel) => !SHARED.test(rel))
      .map((rel) => ({ rel, bytes: bytesOf.get(rel) ?? 0 }))
      .sort((a, b) => b.bytes - a.bytes);
    byPage.push(row);
  }
  byPage.sort((a, b) => b.total - a.total);
  const shared = files.filter((file) => SHARED.test(file.rel));

  // What no page uses. A media folder's manifest.json is the capture tool's; an example is unused
  // when no page loads its data or offers one of its files.
  const usedSlugs = new Set(
    Array.from(used)
      .filter((rel) => rel.startsWith('examples/'))
      .map((rel) => posix.basename(rel).split('.')[0]),
  );
  // Data a capture file read out of the app (`.data.js`, `.json`) is for the tools (the tables
  // of the reference pages), not for a page to load.
  const toolData = (rel) => /\.(?:data\.js|json)$/.test(rel);
  const unusedMedia = files.filter(
    (file) => file.rel.startsWith('media/') && !used.has(file.rel) && !toolData(file.rel),
  );
  const captureData = files.filter(
    (file) => file.rel.startsWith('media/') && !used.has(file.rel) && toolData(file.rel),
  );
  const unusedExamples = new Map();
  for (const file of files) {
    if (!file.rel.startsWith('examples/')) continue;
    const slug = posix.basename(file.rel).split('.')[0];
    if (usedSlugs.has(slug)) continue;
    unusedExamples.set(slug, (unusedExamples.get(slug) ?? 0) + file.bytes);
  }

  return {
    total,
    target: TARGET,
    byFolder: Array.from(byFolder, ([folder, bytes]) => ({ folder, bytes })).sort(
      (a, b) => b.bytes - a.bytes,
    ),
    byMediaFolder: Array.from(byMediaFolder, ([folder, bytes]) => ({ folder, bytes })).sort(
      (a, b) => b.bytes - a.bytes,
    ),
    byPage,
    shared: { bytes: shared.reduce((sum, file) => sum + file.bytes, 0), files: shared },
    heaviest: [...files].sort((a, b) => b.bytes - a.bytes),
    unusedMedia,
    captureData: {
      count: captureData.length,
      bytes: captureData.reduce((sum, file) => sum + file.bytes, 0),
    },
    unusedExamples: Array.from(unusedExamples, ([slug, bytes]) => ({ slug, bytes })).sort(
      (a, b) => b.bytes - a.bytes,
    ),
  };
}

function parseArgs(argv) {
  const options = { top: 20, json: false, page: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--top') options.top = Number(argv[++i]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--page') options.page = (argv[++i] || '').replace(/\.html$/, '');
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown option ${arg}`);
  }
  if (!(options.top >= 1)) throw new Error('--top needs a number');
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (options.help) {
    console.log('usage: node docs/web/tools/sizes.mjs [--top <n>] [--page <id>] [--json]');
    return;
  }
  const report = await sizes();
  if (options.json) {
    console.log(JSON.stringify({ ...report, heaviest: report.heaviest.slice(0, options.top) }));
    return;
  }
  const say = (line = '') => console.log(line);
  if (options.page) {
    const row = report.byPage.find((entry) => entry.id === options.page);
    if (!row) {
      console.error(`no page ${options.page}`);
      process.exit(2);
    }
    say(
      `${row.id}: ${human(row.total)} (HTML ${human(row.html)}, media ${human(row.media)}, examples ${human(row.examples)}, other ${human(row.other)}; the site's shared files apart)`,
    );
    for (const file of row.files) say(`  ${padLeft(human(file.bytes), 10)}  ${file.rel}`);
    return;
  }
  const { total, target } = report;
  const verdict =
    total > target.high
      ? `over the target by ${human(total - target.high)}`
      : total < target.low
        ? 'under the target'
        : 'within the target';
  say(
    `docs/web is ${human(total)}: ${verdict} (about ${target.low / MB}–${target.high / MB} MB in all)`,
  );

  say('\nBy folder');
  for (const { folder, bytes } of report.byFolder)
    say(`  ${padLeft(human(bytes), 10)}  ${folder}${folder === 'tools/' ? ' (the tools)' : ''}`);

  say('\nBy page folder of media/');
  for (const { folder, bytes } of report.byMediaFolder)
    say(`  ${padLeft(human(bytes), 10)}  media/${folder}/`);

  say(
    `\nBy page: what it loads or offers (both themes), the site's shared files (${human(report.shared.bytes)}) apart`,
  );
  say(
    `  ${padLeft('total', 10)}  ${padLeft('media', 10)}  ${padLeft('examples', 10)}  ${padLeft('other', 9)}  ${padLeft('html', 9)}  page`,
  );
  for (const row of report.byPage) {
    if (row.total === row.html && row.html < 8 * 1024) continue;
    say(
      `  ${padLeft(human(row.total), 10)}  ${padLeft(human(row.media), 10)}  ${padLeft(human(row.examples), 10)}  ${padLeft(human(row.other), 9)}  ${padLeft(human(row.html), 9)}  ${row.id}`,
    );
  }
  const small = report.byPage.filter((row) => row.total === row.html && row.html < 8 * 1024);
  if (small.length) say(`  (${small.length} pages with nothing but a small HTML file: stubs)`);

  say(`\nThe ${options.top} heaviest files`);
  for (const file of report.heaviest.slice(0, options.top))
    say(`  ${padLeft(human(file.bytes), 10)}  ${file.rel}`);

  if (report.unusedMedia.length) {
    const bytes = report.unusedMedia.reduce((sum, file) => sum + file.bytes, 0);
    say(
      `\nMedia no page uses: ${report.unusedMedia.length} files, ${human(bytes)} (a capture item that no longer exists, or not embedded yet)`,
    );
    for (const file of report.unusedMedia.slice(0, options.top))
      say(`  ${padLeft(human(file.bytes), 10)}  ${file.rel}`);
    if (report.unusedMedia.length > options.top)
      say(`  … and ${report.unusedMedia.length - options.top} more (--top)`);
  }
  if (report.captureData.count) {
    say(
      `\nData of the capture files (manifests, data read out of the app for the tools): ${report.captureData.count} files, ${human(report.captureData.bytes)}`,
    );
  }
  if (report.unusedExamples.length) {
    say('\nExamples no page uses');
    for (const { slug, bytes } of report.unusedExamples)
      say(`  ${padLeft(human(bytes), 10)}  examples/${slug}.*`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
