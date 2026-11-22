/* What the capture tool writes and how: WebP images encoded by Chrome itself (a canvas's
 * `toBlob('image/webp', quality)`, so that no image tool is needed), WebM clips encoded by ffmpeg
 * (VP9, no sound) when it is installed, the `manifest.json` of a page's folder and the size
 * report. Without ffmpeg the tool makes no clip: it says so and keeps the files a clip already
 * has (CAPTURES.md, "Without ffmpeg"). */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import { join, relative } from 'node:path';

/** The budgets of AUTHORING.md §6: a warning above them. The whole of `docs/web/` should weigh
 * about 35 to 45 MB (the owner's decision, 2026-11-16). */
export const BUDGET = {
  image: 200 * 1024,
  clip: 1024 * 1024,
  web: 45 * 1024 * 1024,
};

/** What an item gets unless it says otherwise (CAPTURES.md, "Density, quality and budgets"): the
 * WebP quality of its images, the frame rate and the VP9 quality (CRF) of a clip, and the length
 * above which a clip is said to be long. Chosen to keep the site light: a clip shows a gesture,
 * not a film. */
export const DEFAULTS = {
  quality: 0.8,
  fps: 20,
  crf: 42,
  maxSeconds: 6,
};

// ---- WebP through Chrome ----

/** Encodes PNG screenshots as WebP in a blank page of its own (one per run). */
export class WebpEncoder {
  constructor(browser) {
    this.browser = browser;
    this.context = null;
    this.page = null;
  }

  async #ready() {
    if (this.page) return this.page;
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    await this.page.goto('about:blank');
    return this.page;
  }

  /** `png` (a Buffer) drawn at `ratio` of its size — 0.5 halves a 2x screenshot — on an opaque
   * canvas, then encoded at `quality` (0–1). Returns the bytes and the pixel size. */
  async encode(png, { ratio = 1, quality = DEFAULTS.quality } = {}) {
    const page = await this.#ready();
    const result = await page.evaluate(
      async ({ data, ratio, quality }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * ratio);
        canvas.height = Math.round(image.naturalHeight * ratio);
        // Opaque: no alpha channel to store.
        const context = canvas.getContext('2d', { alpha: false });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob || blob.type !== 'image/webp') throw new Error('this browser encodes no WebP');
        const url = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        return {
          data: url.slice(url.indexOf(',') + 1),
          width: canvas.width,
          height: canvas.height,
        };
      },
      { data: png.toString('base64'), ratio, quality },
    );
    return {
      bytes: Buffer.from(result.data, 'base64'),
      width: result.width,
      height: result.height,
    };
  }

  async close() {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
  }
}

// ---- WebM through ffmpeg ----

let ffmpegChecked = null;

/** Whether ffmpeg with the VP9 encoder is on the PATH. */
export function hasFfmpeg() {
  if (ffmpegChecked === null) {
    const run = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    ffmpegChecked = run.status === 0 && /\blibvpx-vp9\b/.test(run.stdout);
  }
  return ffmpegChecked;
}

/** The pixel size of a JPEG (its first SOF marker). */
export function jpegSize(buffer) {
  let at = 2;
  while (at + 9 < buffer.length) {
    if (buffer[at] !== 0xff) return null;
    const marker = buffer[at + 1];
    const length = buffer.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

/** Runs ffmpeg with `args`, at a lower priority; rejects with its error output. */
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    try {
      setPriority(child.pid, 10);
    } catch {
      // not allowed here: it runs at the normal priority
    }
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${stderr.trim()}`)),
    );
  });
}

/** Encodes the frames of a recording — `[{ file, time }]`, times in seconds from the first,
 * lasting until `end` — cropped to `crop` (frame pixels, even sizes) as a WebM (VP9, `fps`
 * frames a second, no sound) at `out`. */
export async function encodeClip({
  frames,
  end,
  crop,
  out,
  fps = DEFAULTS.fps,
  crf = DEFAULTS.crf,
  dir,
}) {
  const lines = ['ffconcat version 1.0'];
  frames.forEach((frame, index) => {
    const next = index + 1 < frames.length ? frames[index + 1].time : end;
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.time).toFixed(4)}`);
  });
  // The concat demuxer drops the last duration unless the last file is named again.
  lines.push(`file '${frames[frames.length - 1].file}'`);
  const list = join(dir, 'frames.ffconcat');
  writeFileSync(list, `${lines.join('\n')}\n`);
  await ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    // The frames are JPEG, whose colours take the full range. A clip left in it plays where the
    // browser decodes it itself and not where a graphics adapter does: on Windows, Chrome and
    // Edge gave "video decode error" for every clip 364 px high or more. So the clip is converted
    // to the limited range video has everywhere, and says so.
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},fps=${fps},scale=out_range=tv,format=yuv420p`,
    '-color_range',
    'tv',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    String(crf),
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-an',
    out,
  ]);
}

// ---- the manifest and the sizes ----

/** The files the capture tool writes in a page's folder. */
export const MEDIA_FILE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.(?:dark|light)\.(?:webp|webm)|\.tour\.js|\.data\.js)$/;

function readManifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).files ?? {};
  } catch {
    return {};
  }
}

/** Writes `media/<page>/manifest.json`: the entries written by this run over those of the runs
 * before (a run of some items or of one theme keeps the others), without the files that are no
 * longer on disk. Returns the files of the folder the manifest does not know. */
export function writeManifest(dir, page, written) {
  const files = { ...readManifest(dir), ...written };
  for (const name of Object.keys(files)) {
    if (!existsSync(join(dir, name))) delete files[name];
    else files[name].bytes = statSync(join(dir, name)).size;
  }
  const sorted = Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((name) => [name, files[name]]),
  );
  const manifest = {
    '//': 'Generated by tools/capture.mjs — do not edit.',
    page,
    files: sorted,
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return readdirSync(dir).filter((name) => name !== 'manifest.json' && !(name in sorted));
}

/** Removes the media of a page's folder that no item of its capture file makes (`declared`: the
 * files of all its items, both themes; an item renamed or removed leaves its files behind).
 * Returns their names. */
export function removeStale(dir, declared) {
  if (!existsSync(dir)) return [];
  const stale = readdirSync(dir).filter((name) => MEDIA_FILE.test(name) && !declared.has(name));
  for (const name of stale) rmSync(join(dir, name));
  return stale;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function folderBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += folderBytes(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
}

/** The budget a file is held to, by its kind; null for none. */
function budgetOf(entry) {
  if (entry.kind === 'clip') return BUDGET.clip;
  if (['shot', 'poster', 'tour-step'].includes(entry.kind)) return BUDGET.image;
  return null;
}

/** Prints, for each page of the run, its files (size in CSS px, density, bytes) and its total,
 * then the whole of `docs/web/`; warns above the budgets. Returns the number of warnings. */
export function sizeReport(pages, webDir, log = console.log) {
  let warnings = 0;
  log('');
  log('Sizes');
  for (const { page, dir } of pages) {
    const files = readManifest(dir);
    const names = Object.keys(files);
    const total = names.reduce((sum, name) => sum + files[name].bytes, 0);
    log(`  media/${page}/  ${names.length} files, ${formatBytes(total)}`);
    for (const name of names) {
      const entry = files[name];
      const size = entry.width ? `${entry.width}×${entry.height}` : '';
      const density = entry.scale ? `@${entry.scale}x` : '';
      const duration = entry.duration ? `${entry.duration.toFixed(1)} s` : '';
      const budget = budgetOf(entry);
      const over = budget !== null && entry.bytes > budget;
      if (over) warnings += 1;
      log(
        `    ${name.padEnd(34)} ${size.padStart(10)} ${density.padStart(4)} ${duration.padStart(6)}` +
          ` ${formatBytes(entry.bytes).padStart(10)}${over ? `  ⚠ over ${formatBytes(budget)}` : ''}`,
      );
    }
  }
  if (webTotal(webDir, log)) warnings += 1;
  return warnings;
}

/** Prints the weight of the whole of `docs/web/` and of its media against the target; returns
 * whether it is over. */
function webTotal(webDir, log) {
  if (!existsSync(webDir)) return false;
  const web = folderBytes(webDir);
  const media = existsSync(join(webDir, 'media')) ? folderBytes(join(webDir, 'media')) : 0;
  const over = web > BUDGET.web;
  log(
    `  docs/web/ ${formatBytes(web)} (media ${formatBytes(media)}); the target is about 35 to ` +
      `${BUDGET.web / 1024 / 1024} MB${over ? '  ⚠ over budget' : ''}`,
  );
  return over;
}

/** The files of a page's folder grouped by the item that made them, from its manifest:
 * `[{ item, kind, dark, light, other, total, duration }]`, the heaviest first. `dark` and `light`
 * are the bytes of each theme's files; `other` the files of no theme (a tour's script, data). */
export function itemSizes(dir) {
  const files = readManifest(dir);
  const items = new Map();
  for (const [name, entry] of Object.entries(files)) {
    const key = entry.item ?? name.split('.')[0];
    const row = items.get(key) ?? {
      item: key,
      kinds: new Set(),
      dark: 0,
      light: 0,
      other: 0,
      total: 0,
      duration: 0,
    };
    row.kinds.add(entry.kind);
    const theme = entry.theme === 'dark' || entry.theme === 'light' ? entry.theme : 'other';
    row[theme] += entry.bytes ?? 0;
    row.total += entry.bytes ?? 0;
    if (entry.duration) row.duration = Math.max(row.duration, entry.duration);
    items.set(key, row);
  }
  const kindOf = (kinds) =>
    kinds.has('clip') || kinds.has('poster')
      ? 'clip'
      : kinds.has('tour') || kinds.has('tour-step')
        ? 'tour'
        : kinds.has('data')
          ? 'data'
          : 'shot';
  return [...items.values()]
    .map(({ kinds, ...row }) => ({ ...row, kind: kindOf(kinds) }))
    .sort((a, b) => b.total - a.total);
}

const bytesOrDash = (bytes) => (bytes ? formatBytes(bytes) : '—');

/** The `--sizes` report: for each page (`[{ page, dir, limits }]`, `limits` the longest a clip
 * of each item may be), its weight by item and theme, the heaviest first, with the clips longer
 * than their limit; then the pages together and the whole of `docs/web/`. Reads the manifests
 * only. Returns the clips that are too long, `[{ page, item, duration, limit }]`. */
export function weightReport(pages, webDir, log = console.log) {
  const long = [];
  let sum = 0;
  const totals = [];
  for (const { page, dir, limits = {} } of pages) {
    const rows = itemSizes(dir);
    const total = rows.reduce((s, row) => s + row.total, 0);
    const dark = rows.reduce((s, row) => s + row.dark, 0);
    const light = rows.reduce((s, row) => s + row.light, 0);
    sum += total;
    totals.push({ page, total });
    const themes = dark + light ? `  (dark ${formatBytes(dark)}, light ${formatBytes(light)})` : '';
    log(`${page}  ${formatBytes(total)}${themes}${rows.length ? '' : '  (nothing captured yet)'}`);
    for (const row of rows) {
      const limit = limits[row.item] ?? DEFAULTS.maxSeconds;
      const tooLong = row.kind === 'clip' && row.duration > limit;
      if (tooLong) long.push({ page, item: row.item, duration: row.duration, limit });
      const length = row.duration ? `${row.duration.toFixed(1)} s` : '';
      log(
        `  ${row.item.padEnd(28)} ${String(row.kind).padEnd(5)}` +
          ` ${bytesOrDash(row.dark).padStart(9)} ${bytesOrDash(row.light).padStart(9)}` +
          `${row.other ? ` +${formatBytes(row.other)}` : ''}` +
          ` = ${formatBytes(row.total).padStart(9)} ${length.padStart(6)}` +
          `${tooLong ? `  ⚠ over ${limit} s` : ''}`,
      );
    }
  }
  if (pages.length > 1) {
    log('');
    log(`These ${pages.length} pages: ${formatBytes(sum)}. The heaviest:`);
    for (const { page, total } of totals.sort((a, b) => b.total - a.total).slice(0, 10))
      log(`  ${formatBytes(total).padStart(9)}  ${page}`);
  }
  webTotal(webDir, log);
  return long;
}

/** A path as the tool prints it: relative to `base`, with `/`. */
export function shown(path, base) {
  return relative(base, path).split('\\').join('/');
}
