#!/usr/bin/env node
/* The examples of the documentation: projects of the app in `docs/web/examples/<slug>.mfe.json`,
 * turned into what the pages show — the player's data, the exported Python, a video rendered by
 * ManimCE — and the helpers to write them: the glyphs of a formula by index, the pairs the app
 * would suggest for a relation, a check of everything. Each command runs inside the app itself,
 * on its dev server (tools/lib/browser.mjs): the app's own parser, renderer (MathJax: the
 * companion is never started), exporter and glyph matcher do the work, never a copy of them.
 * docs/web/tools/EXAMPLES.md is the guide.
 *
 *   node docs/web/tools/examples.mjs new <slug> --formula 'x+3=5' --formula 'x=2' [--title …]
 *   node docs/web/tools/examples.mjs build [slug…]       data.js, ce.py, gl.py (all examples)
 *   node docs/web/tools/examples.mjs glyphs <slug> [--png <dir>] [--json]
 *   node docs/web/tools/examples.mjs glyphs --latex '<tex>' [--target ce|gl] [--png <dir>]
 *   node docs/web/tools/examples.mjs pairs <slug> <relation> [--mode label|edit] [--write]
 *   node docs/web/tools/examples.mjs derive <from-slug> <new-slug> --steps <file.mjs>
 *       the example after gestures in the app (the capture kit), saved as a new one and built
 *   node docs/web/tools/examples.mjs validate [slug…]
 *   node docs/web/tools/examples.mjs render <slug>       ManimCE, 480p15, examples/<slug>.mp4
 *   node docs/web/tools/examples.mjs check [page.html…] [--shots <dir>]
 *
 * Every Chrome, dev server and Manim run takes the machine lock and the CPU guard. */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openApp, waitForRenders, withChrome } from './lib/browser.mjs';
import { killTree, withMachineLock } from './lib/lock.mjs';
import { APP_DIR, REPO, WEB_DIR } from './lib/paths.mjs';
import { waitUntilCool, watchTemperature } from './lib/temperature.mjs';

const EXAMPLES_DIR = join(WEB_DIR, 'examples');
/** The site's files, which a page links and the site's own tools make. */
const SITE_ASSET = /\/assets\/(?:site\.css|site\.js|nav\.js|search-index\.js)$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** An error the tool reports as it is, without a stack: the author's to fix. */
class ExampleError extends Error {}

const fail = (message) => {
  throw new ExampleError(message);
};

const say = (line = '') => console.log(line);
const rel = (file) => relative(REPO, file).replaceAll('\\', '/');
/** A file for a message: from the repository's root, or its whole path when it is outside. */
const shownPath = (file) => (rel(file).startsWith('..') ? file : rel(file));

// ---- Arguments --------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    const takesValue = [
      'latex',
      'target',
      'png',
      'mode',
      'title',
      'description',
      'formula',
      'hold',
      'window',
      'shots',
      'align',
      'font-size',
      'background',
      'steps',
      'viewport',
    ].includes(name);
    const value = takesValue ? (inline ?? argv[++i]) : true;
    if (takesValue && value === undefined) fail(`--${name} needs a value`);
    if (name === 'formula') (flags.formula ??= []).push(value);
    else flags[name] = value;
  }
  return { positional, flags };
}

function slugPaths(slug) {
  if (!SLUG.test(slug)) fail(`"${slug}" is not a slug: lowercase words joined by hyphens`);
  return {
    project: join(EXAMPLES_DIR, `${slug}.mfe.json`),
    about: join(EXAMPLES_DIR, `${slug}.about.json`),
    data: join(EXAMPLES_DIR, `${slug}.data.js`),
    ce: join(EXAMPLES_DIR, `${slug}.ce.py`),
    gl: join(EXAMPLES_DIR, `${slug}.gl.py`),
    video: join(EXAMPLES_DIR, `${slug}.mp4`),
  };
}

/** The slugs of every example, or the ones given (each must exist). */
function slugsOf(given) {
  const all = existsSync(EXAMPLES_DIR)
    ? readdirSync(EXAMPLES_DIR)
        .filter((name) => name.endsWith('.mfe.json'))
        .map((name) => name.slice(0, -'.mfe.json'.length))
        .sort()
    : [];
  if (given.length === 0) {
    if (all.length === 0) fail(`no examples in ${rel(EXAMPLES_DIR)}`);
    return all;
  }
  for (const slug of given) {
    if (!existsSync(slugPaths(slug).project)) fail(`no example ${rel(slugPaths(slug).project)}`);
  }
  return given;
}

/** The example's sidecar: what the documentation says of it beside its project. */
function readAbout(slug) {
  const { about } = slugPaths(slug);
  if (!existsSync(about)) {
    fail(`${rel(about)} is missing: it holds the example's description, {"description": "…"}`);
  }
  let value;
  try {
    value = JSON.parse(readFileSync(about, 'utf8'));
  } catch (error) {
    fail(`${rel(about)} is not JSON: ${error.message}`);
  }
  const keys = Object.keys(value ?? {});
  const unknown = keys.filter((key) => key !== 'description');
  if (typeof value?.description !== 'string' || !value.description.trim()) {
    fail(`${rel(about)} has no "description" (one or two sentences)`);
  }
  if (unknown.length > 0) fail(`${rel(about)} has fields it should not: ${unknown.join(', ')}`);
  return { description: value.description.trim() };
}

// ---- The app ------------------------------------------------------------------------------

/** Runs `fn(page)` with the app open on the dev server (one Chrome, one page, for every
 * example of the command). */
async function withAppPage(label, fn) {
  return withChrome(`examples.mjs ${label}`, async ({ browser, appUrl }) => {
    // The dev server of this run's slot of the machine lock (its port is the lock's to give).
    const { context, page, errors } = await openApp(browser, { theme: 'dark', url: appUrl });
    try {
      return await fn(page, errors);
    } finally {
      await context.close();
    }
  });
}

/** Loads a project's text into the app as File ▸ Open does, waits for every render and for the
 * project to settle (snapshots taken, attached objects placed). Returns the issues the file
 * opened with. */
async function loadInApp(page, text, label) {
  const opened = await page.evaluate((source) => {
    const mfe = window.__mfe;
    const parsed = mfe.parseProject(source);
    if (!parsed.ok) return { ok: false, error: parsed.error, details: parsed.details };
    mfe.loadProject(parsed.project);
    return {
      ok: true,
      migratedFrom: parsed.migratedFrom,
      issues: parsed.issues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        path: issue.path.join('.'),
      })),
    };
  }, text);
  if (!opened.ok) {
    fail(`${label}: ${opened.error}${opened.details.map((d) => `\n  ${d}`).join('')}`);
  }
  await settleInApp(page, label);
  return opened;
}

/** Waits for every render of the project open in the app, then for the project to settle
 * (snapshots taken, attached objects placed: no change for 400 ms). */
async function settleInApp(page, label) {
  const failed = await waitForRenders(page);
  if (failed.length > 0) {
    fail(
      `${label}: ${failed.length} formula(s) did not render:` +
        failed.map((f) => `\n  ${f.name}: ${f.error}`).join(''),
    );
  }
  await page.evaluate(async () => {
    const mfe = window.__mfe;
    const started = performance.now();
    let last = mfe.useProjectStore.getState().project;
    let quiet = performance.now();
    while (performance.now() - started < 20_000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const project = mfe.useProjectStore.getState().project;
      const busy = Object.values(mfe.useRenderStore.getState().entries).some(
        (entry) => entry.status === 'loading' || entry.status === 'idle',
      );
      if (project !== last || busy) {
        last = project;
        quiet = performance.now();
      } else if (performance.now() - quiet >= 400) return;
    }
    throw new Error('the project did not settle in 20 s');
  });
}

/** The notes every example built without the companion gets: said once, in a word. */
const EXPECTED_NOTES = {
  'export-positional': 'glyphs matched by position in the scene (MathJax renders, no companion)',
  'export-other-target': 'exported for the other library than the project’s (sizes, easings)',
};

function printIssues(label, issues, { prefix = '  ' } = {}) {
  const expected = new Map();
  for (const issue of issues) {
    if (issue.code in EXPECTED_NOTES) {
      expected.set(issue.code, (expected.get(issue.code) ?? 0) + 1);
      continue;
    }
    say(
      `${prefix}${issue.severity === 'error' ? 'error' : 'note'}: ${label}${issue.path ? ` (${issue.path})` : ''}: ${issue.message}`,
    );
  }
  for (const [code, count] of expected) {
    say(
      `${prefix}note: ${label}: ${EXPECTED_NOTES[code]}${count > 1 ? ` (${count} objects)` : ''}`,
    );
  }
}

/** Everything the documentation takes of the project open in the app: the file as the app
 * would save it, the Python of Export ▸ Python for both libraries, the player's data, and what
 * the app says of it. */
async function exportOpen(page) {
  return page.evaluate(async () => {
    const mfe = window.__mfe;
    const model = await import('/src/model/index.ts');
    const { generatePython, sceneClassName } = await import('/src/export/index.ts');
    const { packScene } = await import('/src/embed/data.ts');
    const project = mfe.useProjectStore.getState().project;
    const resolved = mfe.useRenderStore.getState().resolved;
    const visual = model.visualProject(project);
    const plain = (issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      path: issue.path.join('.'),
    });
    const sceneName = sceneClassName(visual.meta.name);
    const python = {};
    const exportIssues = {};
    const helper = {};
    for (const target of ['ce', 'gl']) {
      const result = generatePython(visual, resolved, {
        target,
        sceneName,
        indexing: 'auto',
        comments: true,
      });
      python[target] = result.code;
      exportIssues[target] = result.issues.map(plain);
      helper[target] = result.usedPositionalHelper;
    }
    return {
      file: model.serializeProject(project),
      meta: visual.meta,
      duration: model.sceneDuration(visual),
      sceneName,
      python,
      exportIssues,
      helper,
      issues: model.validateProject(visual).map(plain),
      player: packScene(visual, resolved),
      formulas: visual.formulas.map((f) => ({
        name: f.name,
        kind: f.kind,
        glyphs: f.snapshot?.glyphs.length ?? 0,
        backend: f.snapshot?.backend ?? null,
      })),
      counts: {
        tracks: visual.tracks.length,
        clips: visual.clips.length,
        relations: visual.relations.length,
        blocks: visual.clips.reduce((n, c) => n + c.actions.length, 0),
      },
    };
  });
}

// ---- build ------------------------------------------------------------------------------

function dataScript(slug, data) {
  const meta = JSON.stringify(data.meta, null, 2).replace(/\n/g, '\n  ');
  return (
    `/* Generated by tools/examples.mjs from examples/${slug}.mfe.json — do not edit. */\n` +
    `(window.MFE_EXAMPLES ||= {})[${JSON.stringify(slug)}] = {\n` +
    `  "meta": ${meta},\n` +
    `  "python": {\n` +
    `    "ce": ${JSON.stringify(data.python.ce)},\n` +
    `    "gl": ${JSON.stringify(data.python.gl)}\n` +
    `  },\n` +
    `  "player": ${JSON.stringify(data.player)}\n` +
    `};\n`
  );
}

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;

async function buildOne(page, slug) {
  const paths = slugPaths(slug);
  const about = readAbout(slug);
  const text = readFileSync(paths.project, 'utf8');
  const opened = await loadInApp(page, text, rel(paths.project));
  const out = await exportOpen(page);
  const errors = [
    ...opened.issues.filter((i) => i.severity === 'error'),
    ...out.issues.filter((i) => i.severity === 'error'),
  ];
  if (errors.length > 0) {
    printIssues(slug, errors);
    fail(`${slug}: the project has errors the app reports; fix them first`);
  }
  for (const target of ['ce', 'gl']) {
    const bad = out.exportIssues[target].filter((i) => i.severity === 'error');
    if (bad.length > 0) {
      printIssues(`${slug} ${target}`, bad);
      fail(`${slug}: the ${target === 'ce' ? 'ManimCE' : 'ManimGL'} export reports errors`);
    }
  }
  if (out.formulas.some((f) => f.glyphs === 0 && ['math', 'tex'].includes(f.kind))) {
    fail(`${slug}: a formula has no glyphs (an empty formula?)`);
  }
  // The file as the app saves it: the snapshots the renders gave (they fix the glyph indices of
  // the pairs and colours for every reader, with the companion or without), attached objects
  // placed. Written back when it differs from the file.
  const normalized = out.file !== text;
  if (normalized) writeFileSync(paths.project, out.file);
  const files = {
    project: `examples/${slug}.mfe.json`,
    ce: `examples/${slug}.ce.py`,
    gl: `examples/${slug}.gl.py`,
    ...(existsSync(paths.video) ? { video: `examples/${slug}.mp4` } : {}),
  };
  const data = {
    meta: {
      slug,
      title: out.meta.name,
      description: about.description,
      duration: out.duration,
      fps: out.meta.fps,
      width: out.meta.width,
      height: out.meta.height,
      background: out.meta.background,
      target: out.meta.target,
      files,
    },
    python: out.python,
    player: out.player,
  };
  const script = dataScript(slug, data);
  writeFileSync(paths.data, script);
  writeFileSync(paths.ce, out.python.ce);
  writeFileSync(paths.gl, out.python.gl);
  say(
    `${slug}: ${out.duration.toFixed(2)} s, ${out.counts.clips} clips, ${out.counts.relations} relations` +
      ` — data.js ${kib(Buffer.byteLength(script))}, ce.py ${kib(Buffer.byteLength(out.python.ce))},` +
      ` gl.py ${kib(Buffer.byteLength(out.python.gl))}${files.video ? ', with its video' : ''}`,
  );
  if (normalized)
    say(`  ${rel(paths.project)} rewritten as the app saves it (snapshots, placements)`);
  const notes = [...opened.issues, ...out.issues].filter((i) => i.severity !== 'error');
  printIssues(slug, notes, { prefix: '  ' });
  for (const target of ['ce', 'gl']) {
    printIssues(`${slug} ${target}`, out.exportIssues[target], { prefix: '  ' });
  }
}

async function build(slugs) {
  const list = slugsOf(slugs);
  const failed = [];
  await withAppPage(`build ${list.join(' ')}`, async (page) => {
    for (const slug of list) {
      try {
        await buildOne(page, slug);
      } catch (error) {
        if (!(error instanceof ExampleError)) throw error;
        console.error(`examples.mjs: ${error.message}`);
        failed.push(slug);
      }
    }
  });
  if (failed.length > 0) fail(`not built: ${failed.join(', ')}`);
}

// ---- glyphs -----------------------------------------------------------------------------

/** The glyphs of every formula of the project open in the app, in canonical order. */
async function glyphsOpen(page, png) {
  return page.evaluate(async (wantPng) => {
    const mfe = window.__mfe;
    const { traceContours } = await import('/src/render/index.ts');
    const project = mfe.useProjectStore.getState().project;
    const resolved = mfe.useRenderStore.getState().resolved;
    const out = [];
    for (const formula of project.formulas) {
      const entry = resolved.get(formula.id);
      const snapshot = formula.snapshot?.glyphs ?? [];
      const glyphs = snapshot.map((g, index) => ({
        index,
        label: g.label,
        x: g.center[0],
        y: g.center[1],
        w: g.size[0],
        h: g.size[1],
      }));
      // Reading order: left to right, then top to bottom (the relation editor's Suggest).
      const reading = [...glyphs].sort((a, b) => a.x - b.x || b.y - a.y || a.index - b.index);
      let image = null;
      if (wantPng && entry && glyphs.length > 0) {
        const pad = 0.35;
        const box = entry.render.bbox;
        const scale = 120;
        const width = Math.ceil((box.maxX - box.minX + 2 * pad) * scale);
        const height = Math.ceil((box.maxY - box.minY + 2 * pad) * scale) + 40;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0b1520';
        ctx.fillRect(0, 0, width, height);
        const toX = (x) => (x - box.minX + pad) * scale;
        const toY = (y) => (box.maxY - y + pad) * scale + 20;
        entry.canonToRender.forEach((renderIndex, index) => {
          const glyph = renderIndex === null ? null : entry.render.glyphs[renderIndex];
          if (!glyph) return;
          ctx.save();
          ctx.setTransform(scale, 0, 0, -scale, toX(0), toY(0));
          ctx.beginPath();
          traceContours(ctx, glyph.contours);
          ctx.fillStyle = index % 2 === 0 ? '#e8f6f6' : '#9ad8ff';
          ctx.fill('nonzero');
          ctx.restore();
          ctx.font = '600 13px monospace';
          ctx.textAlign = 'center';
          const above = index % 2 === 0;
          ctx.fillStyle = above ? '#f4c867' : '#7bf4e6';
          const cx = toX((glyph.bbox.minX + glyph.bbox.maxX) / 2);
          ctx.fillText(
            String(index),
            cx,
            above ? toY(glyph.bbox.maxY) - 6 : toY(glyph.bbox.minY) + 16,
          );
        });
        image = canvas.toDataURL('image/png');
      }
      out.push({
        name: formula.name,
        kind: formula.kind,
        source: formula.source,
        backend: formula.snapshot?.backend ?? null,
        glyphs,
        reading: reading.map((g) => g.index),
        image,
      });
    }
    return out;
  }, Boolean(png));
}

function printGlyphs(formulas, { png, json, prefix }) {
  if (json) {
    say(
      JSON.stringify(
        formulas.map(({ image, ...f }) => f),
        null,
        2,
      ),
    );
  }
  for (const formula of formulas) {
    if (!json) {
      say(
        `${formula.name} (${formula.kind}${formula.source ? `: ${formula.source}` : ''}) — ` +
          `${formula.glyphs.length} glyphs, canonical order${formula.backend ? ` (${formula.backend} snapshot)` : ''}`,
      );
      say('    #  glyph      x       y      w      h');
      for (const g of formula.glyphs) {
        say(
          `  ${String(g.index).padStart(3)}  ${g.label.padEnd(5)} ${g.x.toFixed(3).padStart(7)} ${g.y
            .toFixed(3)
            .padStart(7)} ${g.w.toFixed(3).padStart(6)} ${g.h.toFixed(3).padStart(6)}`,
        );
      }
      say(
        `  reading order: ${formula.reading.map((i) => `${i}:${formula.glyphs[i].label}`).join(' ')}`,
      );
    }
    if (png && formula.image) {
      mkdirSync(png, { recursive: true });
      const file = join(png, `${prefix}${formula.name}.png`);
      writeFileSync(file, Buffer.from(formula.image.split(',')[1], 'base64'));
      if (!json) say(`  image with the indices: ${file}`);
    }
    if (!json) say();
  }
}

async function glyphs(positional, flags) {
  const png = typeof flags.png === 'string' ? flags.png : null;
  if (typeof flags.latex === 'string') {
    const target = flags.target ?? 'ce';
    if (target !== 'ce' && target !== 'gl') fail('--target is ce or gl');
    await withAppPage('glyphs --latex', async (page) => {
      const text = await page.evaluate(
        async ({ latex, target }) => {
          const model = await import('/src/model/index.ts');
          const project = model.createEmptyProject('glyphs');
          project.meta.target = target;
          project.formulas.push(model.createFormula({ name: 'f', source: latex }));
          return model.serializeProject(project);
        },
        { latex: flags.latex, target },
      );
      await loadInApp(page, text, 'the formula');
      printGlyphs(await glyphsOpen(page, png), { png, json: flags.json, prefix: 'latex-' });
    });
    return;
  }
  const [slug] = positional;
  if (!slug) fail('glyphs needs an example (glyphs <slug>) or --latex');
  const paths = slugPaths(slug);
  if (!existsSync(paths.project)) fail(`no example ${rel(paths.project)}`);
  await withAppPage(`glyphs ${slug}`, async (page) => {
    await loadInApp(page, readFileSync(paths.project, 'utf8'), rel(paths.project));
    printGlyphs(await glyphsOpen(page, png), { png, json: flags.json, prefix: `${slug}-` });
  });
}

// ---- pairs ------------------------------------------------------------------------------

async function pairs(positional, flags) {
  const [slug, which] = positional;
  if (!slug || !which) fail('pairs needs an example and a relation: pairs <slug> <relation>');
  const mode = flags.mode ?? 'label';
  if (mode !== 'label' && mode !== 'edit') fail('--mode is label or edit');
  const paths = slugPaths(slug);
  if (!existsSync(paths.project)) fail(`no example ${rel(paths.project)}`);
  await withAppPage(`pairs ${slug}`, async (page) => {
    await loadInApp(page, readFileSync(paths.project, 'utf8'), rel(paths.project));
    const out = await page.evaluate(
      async ({ which, mode, write, replace }) => {
        const mfe = window.__mfe;
        const model = await import('/src/model/index.ts');
        const { suggestPairs, describePair } = await import('/src/ui/relations/relationOps.ts');
        const { matchGlyphs } = await import('/src/engine/index.ts');
        const project = mfe.useProjectStore.getState().project;
        const name = (clipId) => {
          const clip = project.clips.find((c) => c.id === clipId);
          return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';
        };
        const list = project.relations.map((r, i) => ({
          index: i + 1,
          id: r.id,
          label: `${name(r.fromClipId)}:${name(r.toClipId)}`,
        }));
        const found =
          list.find((r) => r.id === which) ??
          list.find((r) => String(r.index) === which) ??
          list.find((r) => r.label === which);
        if (!found) return { ok: false, list };
        const relation = project.relations[found.index - 1];
        const snapOf = (clipId) => {
          const clip = project.clips.find((c) => c.id === clipId);
          return project.formulas.find((f) => f.id === clip?.formulaId)?.snapshot ?? null;
        };
        const from = snapOf(relation.fromClipId);
        const to = snapOf(relation.toClipId);
        if (!from || !to) return { ok: false, list, error: 'a formula of it has no glyphs' };
        const existing = replace ? [] : relation.pairs;
        let suggested;
        if (mode === 'label') suggested = suggestPairs(from, to, existing);
        else {
          const usedFrom = new Set(existing.flatMap((p) => p.from));
          const usedTo = new Set(existing.flatMap((p) => p.to));
          suggested = matchGlyphs(from.glyphs, to.glyphs, 'edit')
            .map.map((target, source) => ({ source, target }))
            .filter(
              ({ source, target }) =>
                target !== null && !usedFrom.has(source) && !usedTo.has(target),
            )
            .map(({ source, target }) => ({ from: [source], to: [target], style: null }))
            .sort((a, b) => a.to[0] - b.to[0]);
        }
        const describe = (pair) => describePair(pair, from, to);
        const unpairedTo = to.glyphs
          .map((g, i) => i)
          .filter((i) => ![...existing, ...suggested].some((p) => p.to.includes(i)));
        const unpairedFrom = from.glyphs
          .map((g, i) => i)
          .filter((i) => ![...existing, ...suggested].some((p) => p.from.includes(i)));
        let file = null;
        let issues = [];
        if (write) {
          const next = structuredClone(project);
          next.relations[found.index - 1].pairs = [...existing, ...suggested];
          issues = model
            .validateProject(next)
            .filter((i) => i.severity === 'error')
            .map((i) => i.message);
          file = model.serializeProject(next);
        }
        return {
          ok: true,
          relation: found,
          existing: existing.map((p) => ({ pair: p, text: describe(p) })),
          suggested: suggested.map((p) => ({ pair: p, text: describe(p) })),
          leaves: unpairedFrom.map((i) => `${i}:${from.glyphs[i].label}`),
          arrives: unpairedTo.map((i) => `${i}:${to.glyphs[i].label}`),
          file,
          issues,
        };
      },
      { which, mode, write: Boolean(flags.write), replace: Boolean(flags.replace) },
    );
    if (!out.ok) {
      fail(
        `${slug} has no relation "${which}"${out.error ? ` (${out.error})` : ''}. Its relations:` +
          out.list.map((r) => `\n  ${r.index}  ${r.id}  ${r.label}`).join(''),
      );
    }
    say(
      `relation ${out.relation.index} (${out.relation.id}) ${out.relation.label.replace(':', ' → ')}`,
    );
    say(`  pairs it has${flags.replace ? ' (set aside: --replace)' : ''}: ${out.existing.length}`);
    for (const { pair, text } of out.existing)
      say(`    ${JSON.stringify(pair.from)} → ${JSON.stringify(pair.to)}   ${text}`);
    say(
      `  pairs the app suggests (${mode === 'label' ? 'Suggest links by label' : 'matchGlyphs edit'}): ${out.suggested.length}`,
    );
    for (const { pair, text } of out.suggested)
      say(`    ${JSON.stringify(pair.from)} → ${JSON.stringify(pair.to)}   ${text}`);
    say(`  leave with the source's outro: ${out.leaves.join(' ') || 'none'}`);
    say(`  arrive with the target's intro: ${out.arrives.join(' ') || 'none'}`);
    say(`  as JSON: ${JSON.stringify(out.suggested.map((s) => s.pair))}`);
    if (flags.write) {
      if (out.issues.length > 0) {
        fail(`not written: the project would have errors:\n  ${out.issues.join('\n  ')}`);
      }
      writeFileSync(paths.project, out.file);
      say(`  written into ${rel(paths.project)}`);
    }
  });
}

// ---- new --------------------------------------------------------------------------------

async function scaffold(positional, flags) {
  const [slug] = positional;
  if (!slug) fail('new needs a slug: new <slug> --formula … --formula …');
  const paths = slugPaths(slug);
  if (existsSync(paths.project)) fail(`${rel(paths.project)} exists already`);
  const formulas = flags.formula ?? [];
  if (formulas.length < 1) fail('new needs at least one --formula');
  const hold = Number(flags.hold ?? 1);
  const window = Number(flags.window ?? 1);
  if (!(hold >= 0) || !(window > 0)) fail('--hold is ≥ 0 seconds and --window > 0 seconds');
  const fontSize = Number(flags['font-size'] ?? 48);
  if (!(fontSize > 0)) fail('--font-size is a number of points (48 is Manim’s)');
  const background = flags.background ?? '#000000';
  if (!/^#[0-9A-Fa-f]{6}$/.test(background)) fail('--background is a colour #RRGGBB');
  const align = flags.align ?? 'center';
  const title = flags.title ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  await withAppPage(`new ${slug}`, async (page) => {
    // The formulas first, rendered, so that the relations get the app's suggested pairs.
    const first = await page.evaluate(
      async ({ title, formulas, fontSize, background }) => {
        const model = await import('/src/model/index.ts');
        const project = model.createEmptyProject(title);
        project.meta.background = background.toUpperCase();
        formulas.forEach((source, i) =>
          project.formulas.push(model.createFormula({ name: `step${i + 1}`, source, fontSize })),
        );
        return model.serializeProject(project);
      },
      { title, formulas, fontSize, background },
    );
    await loadInApp(page, first, 'the formulas');
    const text = await page.evaluate(
      async ({ hold, span, align }) => {
        const mfe = window.__mfe;
        const model = await import('/src/model/index.ts');
        const { suggestPairs } = await import('/src/ui/relations/relationOps.ts');
        const project = structuredClone(mfe.useProjectStore.getState().project);
        const [top, bottom] = project.tracks;
        // Where each step stands: centred (`center`), every step's left edge where the last
        // step's is when it is centred (`left`), or the first glyph of a label (`=`) of every
        // step where the last step's is (a step without one is centred).
        const edges = (formula) => {
          const glyphs = formula.snapshot?.glyphs ?? [];
          const xs = glyphs.flatMap((g) => [
            g.center[0] - g.size[0] / 2,
            g.center[0] + g.size[0] / 2,
          ]);
          return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : { min: 0, max: 0 };
        };
        const glyphX = (formula) => {
          const glyph = formula.snapshot?.glyphs.find((g) => g.label === align);
          return glyph ? glyph.center[0] : null;
        };
        const lastFormula = project.formulas.at(-1);
        const lastEdges = edges(lastFormula);
        const lastShift = -(lastEdges.min + lastEdges.max) / 2;
        const xOf = (formula) => {
          const own = edges(formula);
          const centred = -(own.min + own.max) / 2;
          if (align === 'center') return centred;
          if (align === 'left') return lastEdges.min + lastShift - own.min;
          const mark = glyphX(formula);
          const lastMark = glyphX(lastFormula);
          return mark === null || lastMark === null ? centred : lastMark + lastShift - mark;
        };
        // Step i is on screen from its start; it turns into step i + 1 during a window of
        // `span` seconds after it has held for `hold` seconds. The first writes itself in, the
        // last stays to the end; the steps take turns on the two tracks (they overlap during the
        // window). Glyphs the pairs do not take fade out of the one and into the other.
        let start = 0;
        const clips = project.formulas.map((formula, i) => {
          const last = i === project.formulas.length - 1;
          const intro =
            i === 0
              ? model.defaultIntro('write')
              : { ...model.defaultIntro('fade_in'), duration: span };
          const shown = (i === 0 ? intro.duration : span) + hold;
          const end = start + shown + (last ? 0 : span);
          const clip = model.createClip(formula.id, (i % 2 === 0 ? top : bottom).id, start, end, {
            initial: {
              ...model.defaultClipState(),
              position: [Number(xOf(formula).toFixed(4)), 0],
            },
            intro,
            outro: last
              ? model.defaultOutro('none')
              : { ...model.defaultOutro('fade_out'), duration: span },
          });
          start += shown;
          return clip;
        });
        project.clips = clips;
        project.relations = clips.slice(1).map((clip, i) => {
          const source = project.formulas[i].snapshot;
          const target = project.formulas[i + 1].snapshot;
          return model.createRelation(clips[i].id, clip.id, {
            offset: 0,
            duration: span,
            pairs: source && target ? suggestPairs(source, target, []) : [],
          });
        });
        return model.serializeProject(project);
      },
      { hold, span: window, align },
    );
    writeFileSync(paths.project, text);
    if (!existsSync(paths.about)) {
      writeFileSync(
        paths.about,
        `${JSON.stringify({ description: flags.description ?? 'TODO: one or two sentences.' }, null, 2)}\n`,
      );
    }
    say(`wrote ${rel(paths.project)}${existsSync(paths.about) ? ` and ${rel(paths.about)}` : ''}`);
    say(`  next: glyphs ${slug} --png <dir>, then the pairs and colours, then build ${slug}`);
  });
}

// ---- derive -----------------------------------------------------------------------------

/** The files of `examples/` git tracks (the owner keeps untracked projects of their own there),
 * or null when git cannot say (every file is allowed then). */
function trackedExamples() {
  const run = spawnSync('git', ['ls-files', 'examples'], { cwd: REPO, encoding: 'utf8' });
  if (run.status !== 0) return null;
  return new Set(run.stdout.split('\n').filter(Boolean));
}

/** `--viewport 1280x800` (or the steps file's `viewport`) as { width, height }. */
function readViewport(value, where) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && Number(value.width) > 0 && Number(value.height) > 0)
    return { width: Math.round(value.width), height: Math.round(value.height) };
  const match = /^(\d+)x(\d+)$/.exec(String(value));
  if (!match) fail(`${where}: a viewport is <width>x<height> (1440x900) or { width, height }`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Opens an example in the app, runs the gestures of a steps file on it with the capture kit,
 * and saves the project the app then holds as a new example — then builds it, in the same run. */
async function derive(positional, flags) {
  const [fromSlug, toSlug] = positional;
  if (!fromSlug || !toSlug || typeof flags.steps !== 'string') {
    fail(
      'derive needs two slugs and a steps file: derive <from-slug> <new-slug> --steps <file.mjs>',
    );
  }
  const from = slugPaths(fromSlug);
  const to = slugPaths(toSlug);
  if (!existsSync(from.project)) fail(`no example ${rel(from.project)}`);
  if (fromSlug === toSlug) fail('derive writes a new example: give it another slug');
  if (existsSync(to.project) && !flags.force) {
    fail(`${rel(to.project)} exists already (--force writes over it, after the steps ran)`);
  }
  const stepsFile = resolve(flags.steps);
  if (!existsSync(stepsFile)) fail(`no steps file ${stepsFile}`);
  const title = typeof flags.title === 'string' ? flags.title : null;
  const { Kit, projectReader } = await import('./capture-kit/kit.mjs');
  const { installOverlay, OVERLAY_ASSETS } = await import('./capture-kit/overlay.mjs');

  await withAppPage(`derive ${fromSlug} ${toSlug}`, async (page, errors) => {
    // Imported now that the run has its slot: the file as it is when the run starts, not as it
    // was when the command was typed (a run may wait for a while).
    const module = await import(`${pathToFileURL(stepsFile).href}?run=${Date.now()}`);
    const steps = [module.default ?? module.steps ?? []].flat();
    if (steps.length === 0 || steps.some((step) => typeof step !== 'function')) {
      fail(
        `${flags.steps}: export default async (page, kit) => { … } (or a list of such functions)`,
      );
    }
    const viewport =
      readViewport(flags.viewport, '--viewport') ??
      readViewport(module.viewport, `${flags.steps}: viewport`);
    if (viewport) await page.setViewportSize(viewport);
    const loaded = await loadInApp(page, readFileSync(from.project, 'utf8'), rel(from.project));
    for (const issue of loaded.issues.filter((i) => i.severity === 'error')) {
      say(`  error: ${fromSlug} (${issue.path}): ${issue.message}`);
    }
    const serialized = () =>
      page.evaluate(async () => {
        const model = await import('/src/model/index.ts');
        return model.serializeProject(window.__mfe.useProjectStore.getState().project);
      });
    const before = await serialized();
    await page.evaluate(installOverlay, OVERLAY_ASSETS);
    const kit = new Kit({
      page,
      theme: 'dark',
      recording: false,
      readProject: projectReader(trackedExamples()),
      warn: (message) => say(`  ⚠ ${message}`),
    });
    await kit.settle();
    const seenErrors = errors.length;
    say(`${toSlug}: ${rel(from.project)} open, running ${shownPath(stepsFile)}`);
    try {
      for (const step of steps) await step(page, kit);
    } catch (error) {
      const shot = join(tmpdir(), `mfe-derive-${toSlug}-${Date.now()}.png`);
      await page.screenshot({ path: shot }).catch(() => {});
      fail(
        `${flags.steps} failed: ${error?.message ?? error}\n  the app as the steps left it: ${shot}\n  nothing was written`,
      );
    }
    for (const message of errors.slice(seenErrors))
      say(`  page error during the steps: ${message}`);
    await settleInApp(page, `${toSlug} (after the steps)`);
    const open = await page.evaluate(
      () => document.querySelectorAll('[role="dialog"], [role="menu"]').length,
    );
    if (open > 0) {
      say(
        '  ⚠ a dialog or a menu is still open: what it has not applied is not in the project (close it in the steps)',
      );
    }
    const result = await page.evaluate(async (newTitle) => {
      const model = await import('/src/model/index.ts');
      const current = window.__mfe.useProjectStore.getState().project;
      const project =
        newTitle === null ? current : { ...current, meta: { ...current.meta, name: newTitle } };
      return {
        file: model.serializeProject(project),
        name: project.meta.name,
        issues: model.validateProject(model.visualProject(project)).map((issue) => ({
          severity: issue.severity,
          message: issue.message,
          path: issue.path.join('.'),
        })),
      };
    }, title);
    if (result.file === before && title === null) {
      fail(`the steps changed nothing in the project: ${rel(to.project)} not written`);
    }
    const bad = result.issues.filter((issue) => issue.severity === 'error');
    if (bad.length > 0) {
      printIssues(toSlug, bad);
      fail(`the project the steps left has errors the app reports: ${rel(to.project)} not written`);
    }
    writeFileSync(to.project, result.file);
    say(
      `  wrote ${rel(to.project)} ("${result.name}"${title === null ? ', the title of ' + fromSlug : ''})`,
    );
    if (!existsSync(to.about)) {
      const description = flags.description ?? 'TODO: one or two sentences.';
      writeFileSync(to.about, `${JSON.stringify({ description }, null, 2)}\n`);
      say(`  wrote ${rel(to.about)}${flags.description ? '' : ': write its description'}`);
    }
    if (flags['no-build']) {
      say(`  next: build ${toSlug}`);
      return;
    }
    await buildOne(page, toSlug);
  });
}

// ---- validate ---------------------------------------------------------------------------

async function validate(slugs) {
  const list = slugsOf(slugs);
  let problems = 0;
  await withAppPage(`validate ${list.join(' ')}`, async (page) => {
    for (const slug of list) {
      const paths = slugPaths(slug);
      const opened = await loadInApp(page, readFileSync(paths.project, 'utf8'), rel(paths.project));
      const out = await exportOpen(page);
      // The scene evaluated by the app, and by the player from the data it would be given.
      const check = await page.evaluate(async (player) => {
        const mfe = window.__mfe;
        const { createEvaluator } = await import('/src/scene/index.ts');
        const { visualProject } = await import('/src/model/index.ts');
        const { reviveExample } = await import('/src/embed/engine.ts');
        const project = visualProject(mfe.useProjectStore.getState().project);
        const app = createEvaluator(project, mfe.useRenderStore.getState().resolved);
        const scene = reviveExample('check', {
          meta: {},
          python: { ce: '', gl: '' },
          player: JSON.parse(JSON.stringify(player)),
        }).scene();
        const samples = [];
        let worst = 0;
        let mismatch = null;
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const t = (app.duration * i) / steps;
          const a = app.evaluate(t);
          const b = scene.evaluate(t);
          samples.push(a.length);
          if (a.length !== b.length || a.some((d, k) => d.key !== b[k].key)) {
            mismatch ??= `t = ${t.toFixed(3)}: the app draws ${a.length}, the player ${b.length}`;
            continue;
          }
          a.forEach((d, k) => {
            const p = d.path.contours.flat();
            const q = b[k].path.contours.flat();
            for (let j = 0; j < p.length; j++) worst = Math.max(worst, Math.abs(p[j] - q[j]));
            if ((d.fill?.color ?? '') !== (b[k].fill?.color ?? '')) {
              mismatch ??= `t = ${t.toFixed(3)}: ${d.key} is ${d.fill?.color} in the app, ${b[k].fill?.color} in the player`;
            }
          });
        }
        return { samples, worst, mismatch };
      }, out.player);
      const errors = [...opened.issues, ...out.issues].filter((i) => i.severity === 'error');
      const exportErrors = ['ce', 'gl'].flatMap((t) =>
        out.exportIssues[t].filter((i) => i.severity === 'error'),
      );
      const ok =
        errors.length === 0 && exportErrors.length === 0 && !check.mismatch && check.worst < 2e-3;
      if (!ok) problems += 1;
      say(
        `${ok ? 'ok  ' : 'FAIL'} ${slug}: "${out.meta.name}", ${out.duration.toFixed(2)} s at ${out.meta.fps} fps, ${out.meta.width}×${out.meta.height}, ${out.meta.target}`,
      );
      say(
        `     ${out.formulas.length} objects (${out.formulas.map((f) => `${f.name} ${f.glyphs}`).join(', ')}), ` +
          `${out.counts.tracks} tracks, ${out.counts.clips} clips, ${out.counts.relations} relations, ${out.counts.blocks} blocks`,
      );
      say(
        `     export: ManimCE ${out.python.ce.split('\n').length} lines, ManimGL ${out.python.gl.split('\n').length} lines` +
          `${out.helper.ce || out.helper.gl ? ' (positional glyph helper: the renders are MathJax’s)' : ''}`,
      );
      say(
        `     scene: ${check.samples.length} instants, ${Math.min(...check.samples)}–${Math.max(...check.samples)} drawables;` +
          ` player vs app: ${check.mismatch ?? `same drawables, within ${check.worst.toExponential(1)} units`}`,
      );
      printIssues(slug, [...opened.issues, ...out.issues], { prefix: '     ' });
      for (const t of ['ce', 'gl'])
        printIssues(`${slug} ${t}`, out.exportIssues[t], { prefix: '     ' });
    }
  });
  if (problems > 0) fail(`${problems} example(s) failed`);
}

// ---- render -----------------------------------------------------------------------------

function findVideo(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.mp4')) return join(entry.parentPath, entry.name);
  }
  return null;
}

async function render(positional) {
  const [slug] = positional;
  if (!slug) fail('render needs an example: render <slug>');
  const paths = slugPaths(slug);
  if (!existsSync(paths.project)) fail(`no example ${rel(paths.project)}`);
  const { findManimPython, niced } = await import(
    pathToFileURL(join(APP_DIR, 'build', 'python.ts')).href
  );
  const python = findManimPython(REPO, 'manim_ce');
  if (!existsSync(python))
    fail(`no ManimCE Python at ${python} (the venv manim_ce next to the repository)`);
  // The scene's Python, from the app (one heavy run), then Manim (another).
  const exported = await withAppPage(`render ${slug} (export)`, async (page) => {
    await loadInApp(page, readFileSync(paths.project, 'utf8'), rel(paths.project));
    const out = await exportOpen(page);
    return { code: out.python.ce, sceneName: out.sceneName };
  });
  await withMachineLock(`examples.mjs render ${slug} (ManimCE)`, async () => {
    await waitUntilCool(console.error);
    const dir = mkdtempSync(join(tmpdir(), 'mfe-docs-render-'));
    const file = join(dir, `${exported.sceneName}.py`);
    writeFileSync(file, exported.code);
    const [command, args] = niced(python, [
      '-m',
      'manim',
      'render',
      '-ql',
      '--format',
      'mp4',
      '--media_dir',
      join(dir, 'media'),
      '--disable_caching',
      '--progress_bar',
      'none',
      '-v',
      'WARNING',
      '-o',
      slug,
      file,
      exported.sceneName,
    ]);
    say(`${slug}: rendering with ManimCE (480p15)…`);
    const started = Date.now();
    let child = null;
    const watch = watchTemperature((celsius) => {
      console.error(`CPU at ${celsius} °C: stopping Manim now`);
      if (child) killTree(child.pid);
    });
    try {
      const result = await new Promise((resolve) => {
        child = spawn(command, args, {
          cwd: dir,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let log = '';
        child.stdout.on('data', (chunk) => (log += chunk));
        child.stderr.on('data', (chunk) => (log += chunk));
        child.on('close', (code) => resolve({ code, log }));
      });
      if (result.code !== 0) {
        fail(`ManimCE failed (exit ${result.code}):\n${result.log.slice(-3000)}`);
      }
      const video = findVideo(join(dir, 'media'));
      if (!video) fail(`ManimCE made no video:\n${result.log.slice(-2000)}`);
      writeFileSync(paths.video, readFileSync(video));
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      say(`  wrote ${rel(paths.video)}: ${kib(statSync(paths.video).size)} in ${seconds} s`);
      const probe = spawnSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-count_frames',
          '-show_entries',
          'stream=width,height,r_frame_rate,nb_read_frames:format=duration',
          '-of',
          'json',
          paths.video,
        ],
        { encoding: 'utf8' },
      );
      if (probe.status === 0) {
        const info = JSON.parse(probe.stdout);
        const stream = info.streams?.[0] ?? {};
        say(
          `  ${stream.width}×${stream.height}, ${stream.r_frame_rate} fps, ${stream.nb_read_frames} frames, ` +
            `${Number(info.format?.duration ?? 0).toFixed(2)} s`,
        );
      } else say('  (no ffprobe here: the video was not measured)');
      say(`  build ${slug} again so that its card links the video`);
    } finally {
      watch.stop();
      const highest = watch.highest();
      if (highest !== null)
        console.error(`highest CPU temperature during the render: ${highest} °C`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// ---- check ------------------------------------------------------------------------------

async function check(positional, flags) {
  const pages = (positional.length > 0 ? positional : ['authoring/player.html']).map((name) => {
    const file = join(WEB_DIR, name);
    if (!existsSync(file)) fail(`no ${rel(file)} (pages are named from docs/web/)`);
    return file;
  });
  const shots = typeof flags.shots === 'string' ? flags.shots : null;
  if (shots) mkdirSync(shots, { recursive: true });
  const missingSite = new Set();
  let problems = 0;
  await withChrome(
    'examples.mjs check',
    async ({ browser }) => {
      for (const page of pages) {
        const url = pathToFileURL(page).href;
        const name = rel(page)
          .replace(/^docs\/web\//, '')
          .replace(/\.html$/, '')
          .replaceAll('/', '-');
        say(`${rel(page)}:`);
        const sizes = [
          { name: 'desktop', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
          { name: 'phone', viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 },
        ];
        for (const theme of ['dark', 'light']) {
          for (const size of sizes) {
            const context = await browser.newContext({
              viewport: size.viewport,
              deviceScaleFactor: size.deviceScaleFactor,
              colorScheme: theme,
              reducedMotion: 'no-preference',
            });
            const tab = await context.newPage();
            const errors = [];
            tab.on('pageerror', (error) => errors.push(error.message));
            tab.on('console', (message) => {
              if (message.type() !== 'error') return;
              // The site's own files come from the site's tools: a checkout without them is
              // checked without them (the player needs none of them).
              const where = message.location()?.url ?? '';
              if (SITE_ASSET.test(where)) missingSite.add(where.split('/').pop());
              else errors.push(message.text());
            });
            await tab.goto(url);
            await tab.evaluate((t) => {
              document.documentElement.dataset.theme = t;
            }, theme);
            // A page without players needs no player.js (its screenshots are still taken).
            const ready = await tab
              .waitForFunction(
                () =>
                  window.MFEPlayer !== undefined ||
                  (document.readyState === 'complete' &&
                    !document.querySelector('[data-mfe-player]')),
                null,
                { timeout: 10_000 },
              )
              .then(() => true)
              .catch(() => false);
            if (!ready) {
              problems += 1;
              say(
                `FAIL ${theme} ${size.name}: players on the page, but assets/player.js did not run`,
              );
              await context.close();
              continue;
            }
            await tab.waitForTimeout(300);
            const report = await tab.evaluate(async () => {
              const figures = [...document.querySelectorAll('[data-mfe-player]')];
              const rows = [];
              for (const figure of figures) {
                const expectMissing = figure.dataset.expect === 'missing';
                const mounted = figure.hasAttribute(window.MFEPlayer.mountedAttribute);
                const notice = figure.querySelector('.mfe-player-notice')?.textContent ?? null;
                const row = { slug: figure.dataset.mfePlayer, mounted, notice, expectMissing };
                rows.push(row);
                if (!figure.mfePlayer) continue;
                figure.scrollIntoView({ block: 'center' });
                const canvas = figure.querySelector('canvas');
                const player = figure.mfePlayer;
                const strip = figure.querySelector('[data-testid="mfe-strip-playhead"]');
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const isPlaying = () => figure.dataset.playing === 'true';
                // A player with data-autoplay starts by itself once half of it is on screen:
                // give it the moment, and press Play only on one that is not playing (a press
                // on a playing one pauses it).
                const autoplays = Boolean(player.options?.autoplay);
                if (autoplays) for (let i = 0; i < 30 && !isPlaying(); i += 1) await wait(50);
                row.autoplay = autoplays ? (isPlaying() ? 'started' : 'did not start') : null;
                if (!isPlaying()) {
                  const play = figure.querySelector('[data-action="play"]');
                  if (play) play.click();
                  else figure.querySelector('.mfe-player-stage').click();
                }
                await wait(200);
                const first = {
                  time: Number(figure.dataset.time),
                  head: strip?.getBoundingClientRect().left ?? null,
                };
                // Played: the player's own clock goes 0.1 s forward. Not in a fixed half second:
                // a heavy scene in a Chrome without a GPU takes more than 250 ms a frame, and the
                // clock moves at most 0.1 s a frame (MAX_FRAME_STEP, app/src/embed/clock.ts), so
                // the time is followed until it has moved, in two steps at least (forward steps
                // added up, a loop's jump back skipped), or PLAY_DEADLINE has passed — a player
                // whose clock stands still fails all the same, only later. At the end it is still
                // playing, or stands at the end of its range (a player without loop stops there).
                const PLAY_DEADLINE = 8_000;
                const began = performance.now();
                let last = first.time;
                let advanced = 0;
                let steps = 0;
                while ((advanced < 0.1 || steps < 2) && performance.now() - began < PLAY_DEADLINE) {
                  await wait(50);
                  const now = Number(figure.dataset.time);
                  if (now > last) {
                    advanced += now - last;
                    steps += 1;
                  }
                  last = now;
                }
                const goesOn = () =>
                  isPlaying() || Number(figure.dataset.time) >= player.range.end - 1e-3;
                const wentOn = goesOn();
                // The strip's playhead follows the clock: give it the frame that draws it.
                await wait(100);
                const then = {
                  head: strip?.getBoundingClientRect().left ?? null,
                };
                row.played = advanced >= 0.1 && steps >= 2 && (wentOn || goesOn());
                row.playedIn = Math.round(performance.now() - began);
                row.headMoved = strip ? then.head !== first.head : null;
                // Something is drawn: pixels of the canvas that are not the background.
                const ctx = canvas.getContext('2d');
                const { width, height } = canvas;
                const pixels = ctx.getImageData(0, 0, width, height).data;
                const [r, g, b] = [pixels[0], pixels[1], pixels[2]];
                let ink = 0;
                for (let i = 0; i < pixels.length; i += 4 * 7) {
                  if (
                    Math.abs(pixels[i] - r) +
                      Math.abs(pixels[i + 1] - g) +
                      Math.abs(pixels[i + 2] - b) >
                    60
                  )
                    ink += 1;
                }
                row.ink = ink;
                row.crisp =
                  canvas.width ===
                  Math.round(canvas.getBoundingClientRect().width * devicePixelRatio);
                player.pause();
                player.seek(player.range.start + (player.range.end - player.range.start) * 0.4);
              }
              const overflow =
                document.documentElement.scrollWidth > document.documentElement.clientWidth;
              return { rows, overflow };
            });
            if (shots) {
              const file = join(shots, `${name}-${theme}-${size.name}.png`);
              // Every image decoded first, as a reader scrolling to it gets it: a tour's
              // (decoding="async") is painted blank in a whole-page shot otherwise.
              await tab.evaluate(() =>
                Promise.race([
                  new Promise((done) => setTimeout(done, 3_000)),
                  Promise.all(
                    Array.from(document.images, (img) => {
                      img.loading = 'eager';
                      return img.decode().catch(() => {});
                    }),
                  ),
                ]),
              );
              await tab.screenshot({ path: file, fullPage: true });
              say(`  screenshot ${file}`);
            }
            for (const row of report.rows) {
              const good = row.expectMissing
                ? row.mounted && row.notice
                : row.mounted &&
                  !row.notice &&
                  row.played &&
                  (row.headMoved ?? true) &&
                  row.ink > 0 &&
                  row.crisp;
              if (!good) problems += 1;
              say(
                `${good ? 'ok  ' : 'FAIL'} ${theme} ${size.name} ${row.slug}: ` +
                  (row.expectMissing
                    ? `notice ${row.notice ? 'shown' : 'MISSING'}`
                    : `mounted ${row.mounted}, ${row.autoplay ? `autoplay ${row.autoplay}, ` : ''}played ${row.played}${row.playedIn > 1_000 ? ` (in ${(row.playedIn / 1000).toFixed(1)} s)` : ''}, playhead ${row.headMoved ?? 'no strip'}, ink ${row.ink}, crisp ${row.crisp}${row.notice ? `, notice: ${row.notice}` : ''}`),
              );
            }
            if (report.overflow) {
              problems += 1;
              say(`FAIL ${theme} ${size.name}: the page scrolls sideways`);
            }
            for (const error of errors) {
              problems += 1;
              say(`FAIL ${theme} ${size.name}: ${error}`);
            }
            await context.close();
          }
        }
      }
    },
    { server: false },
  );
  if (missingSite.size > 0) {
    say(
      `note: checked without the site's ${[...missingSite].sort().join(', ')} (not in this checkout)`,
    );
  }
  if (problems > 0) fail(`${problems} problem(s)`);
}

// ---- main -------------------------------------------------------------------------------

const HELP = `Usage: node docs/web/tools/examples.mjs <command> …  (docs/web/tools/EXAMPLES.md)
  new <slug> --formula <tex> [--formula <tex> …] [--title …] [--description …] [--hold s]
      [--window s] [--align center|left|<glyph>] [--font-size pt] [--background #RRGGBB]
  build [slug…]
  glyphs <slug> [--png <dir>] [--json]
  glyphs --latex '<tex>' [--target ce|gl] [--png <dir>] [--json]
  pairs <slug> <relation: index | id | from:to> [--mode label|edit] [--write [--replace]]
  derive <from-slug> <new-slug> --steps <file.mjs> [--title …] [--description …]
      [--viewport 1440x900] [--force] [--no-build]
  validate [slug…]
  render <slug>
  check [page.html…] [--shots <dir>]      (pages from docs/web/; default authoring/player.html)`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (command) {
    case 'new':
      return scaffold(positional, flags);
    case 'build':
      return build(positional);
    case 'glyphs':
      return glyphs(positional, flags);
    case 'pairs':
      return pairs(positional, flags);
    case 'derive':
      return derive(positional, flags);
    case 'validate':
      return validate(positional);
    case 'render':
      return render(positional);
    case 'check':
      return check(positional, flags);
    case undefined:
    case 'help':
    case '--help':
      say(HELP);
      return;
    default:
      fail(`unknown command "${command}"\n${HELP}`);
  }
}

main().catch((error) => {
  if (error instanceof ExampleError) console.error(`examples.mjs: ${error.message}`);
  else console.error(error);
  process.exit(1);
});
