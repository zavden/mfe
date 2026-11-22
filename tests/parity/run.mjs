#!/usr/bin/env node
// Glyph-parity harness: ManimCE vs ManimGL, then the app's formula engine against both.
//
//   node run.mjs [--corpus path/to/corpus.json]      (npm run parity, from app/)
//
// 1. Dumps every corpus formula with ManimCE and ManimGL (Python, see dump_*.py).
// 2. Compares CE with GL: glyph count and order (known exceptions in known-exceptions.json).
// 3. Runs the engine checks (engine.parity.ts, Vitest): LaTeX backend through a companion
//    spawned for the run vs both dumps, and the MathJax backend vs LaTeX.
//
// Env: MFE_CE_PYTHON / MFE_GL_PYTHON (interpreters with manim / manimgl installed; without them,
// those of the virtualenvs next to the repository, `app/build/python.ts`). A missing
// interpreter skips its dump with a message, a companion that does not start skips the LaTeX
// comparisons, and either makes the run INCOMPLETE (exit 0, or 1 with MFE_PARITY_STRICT=1); an
// interpreter that fails to dump makes it FAILED (exit 1); otherwise the run exits non-zero
// only on unexpected results (verdict.mjs).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findManimPython } from '../../app/build/python.ts';
import { engineSkips, verdict } from './verdict.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const appDir = path.join(repoRoot, 'app');
const resultsDir = path.join(here, 'results');
const workDir = path.join(resultsDir, '.work');

/** Max per-glyph distance (normalised by formula height) for CE and GL to count as same order. */
const SAME_ORDER_TOL = 0.01;

const argv = process.argv.slice(2);
const corpusArg = argv.indexOf('--corpus');
const corpusPath = path.resolve(
  corpusArg >= 0 ? argv[corpusArg + 1] : path.join(here, 'corpus.json'),
);

mkdirSync(workDir, { recursive: true });

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')).map((e) =>
  typeof e === 'string' ? { latex: e, packages: [] } : { packages: [], ...e },
);
const known = new Map(
  JSON.parse(readFileSync(path.join(here, 'known-exceptions.json'), 'utf8')).exceptions.map((k) => [
    k.latex,
    k,
  ]),
);

function run(label, command, args, cwd) {
  const started = Date.now();
  const res = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (res.error || res.status !== 0) {
    const detail = res.error
      ? String(res.error)
      : (res.stderr || res.stdout || '').trim().split('\n').slice(-8).join('\n');
    console.error(`  ${label}: FAILED after ${seconds}s\n${detail.replace(/^/gm, '    ')}`);
    return false;
  }
  console.log(`  ${label}: ok (${seconds}s)`);
  return true;
}

/** `{ status, data }`: the interpreter was not found ('absent', no data), was found but failed
 * ('failed', no data), or dumped ('ok'). The verdict tells the first two apart. */
function dumpWithPython(name, envVar, script) {
  const python = process.env[envVar] || findManimPython(repoRoot, `manim_${name}`);
  const out = path.join(resultsDir, `${name}.json`);
  rmSync(out, { force: true }); // this run's results only: no earlier dump for the engine checks
  if (!existsSync(python)) {
    console.log(
      `  ${name.toUpperCase()}: SKIPPED — interpreter not found at ${python} (set ${envVar})`,
    );
    return { status: 'absent', data: null };
  }
  const ok = run(name.toUpperCase(), python, [path.join(here, script), corpusPath, out], workDir);
  return ok
    ? { status: 'ok', data: JSON.parse(readFileSync(out, 'utf8')) }
    : { status: 'failed', data: null };
}

console.log(`Corpus: ${corpusPath} (${corpus.length} formulas)`);
console.log('Dumping:');
const ceDump = dumpWithPython('ce', 'MFE_CE_PYTHON', 'dump_ce.py');
const glDump = dumpWithPython('gl', 'MFE_GL_PYTHON', 'dump_gl.py');
const ce = ceDump.data;
const gl = glDump.data;

/** Glyph centres normalised by the formula's total height, origin at the bbox's bottom-left. */
function normalise(entry) {
  const g = entry?.glyphs;
  if (!g || g.length === 0) return null;
  const x0 = Math.min(...g.map((p) => p.x - p.w / 2));
  const y0 = Math.min(...g.map((p) => p.y - p.h / 2));
  const y1 = Math.max(...g.map((p) => p.y + p.h / 2));
  const height = y1 - y0 || 1;
  return g.map((p) => [(p.x - x0) / height, (p.y - y0) / height]);
}

function sameOrder(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  const worst = Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
  return { same: worst < SAME_ORDER_TOL, worst };
}

const rows = corpus.map((entry, i) => {
  const c = ce?.[i];
  const g = gl?.[i];
  const nCe = c?.glyphs?.length ?? null;
  const nGl = g?.glyphs?.length ?? null;
  const order = sameOrder(normalise(c), normalise(g));
  const k = known.get(entry.latex);
  const notes = [];
  const mismatch = nCe !== null && nGl !== null && nCe !== nGl;
  if (mismatch) notes.push(k?.ceGl ? `known: ${k.ceGl}` : 'UNEXPECTED count mismatch');
  if (order && !order.same) notes.push('UNEXPECTED order mismatch');
  if (c?.error) notes.push(`CE error: ${c.error}`);
  if (g?.error) notes.push(`GL error: ${g.error}`);
  return {
    tex: entry.latex,
    packages: entry.packages,
    nCe,
    nGl,
    ceGlSame: order ? order.same : null,
    ceGlWorst: order ? order.worst : null,
    knownException: mismatch && !!k?.ceGl,
    unexpected: (mismatch && !k?.ceGl) || (order !== null && !order.same),
    notes,
  };
});

// ---- table ----
const yn = (v) => (v === null ? '—' : v ? 'yes' : 'no');
const num = (v) => (v === null ? '—' : String(v));
const headers = ['formula', 'packages', 'CE n', 'GL n', 'CE=GL order', 'notes'];
const table = rows.map((r) => [
  r.tex.replace(/\n/g, ' '),
  r.packages.join(','),
  num(r.nCe),
  num(r.nGl),
  yn(r.ceGlSame),
  r.notes.join('; '),
]);
const widths = headers.map((h, c) => Math.max(h.length, ...table.map((row) => [...row[c]].length)));
const fmt = (row) =>
  row
    .map((cell, c) => cell + ' '.repeat(widths[c] - [...cell].length))
    .join('  ')
    .trimEnd();
console.log('');
console.log(fmt(headers));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of table) console.log(fmt(row));

// ---- CE vs GL summary ----
const count = (pred) => rows.filter(pred).length;
const summary = {
  corpusSize: rows.length,
  ceGlSameOrder: ce && gl ? count((r) => r.ceGlSame === true) : null,
  knownExceptions: count((r) => r.knownException),
  unexpected: count((r) => r.unexpected),
};
console.log('');
console.log('CE vs GL');
if (ce && gl) {
  console.log(`  same glyph count and order:  ${summary.ceGlSameOrder}/${rows.length}`);
  console.log(
    `  known exceptions:            ${summary.knownExceptions} (see known-exceptions.json)`,
  );
  if (summary.unexpected) console.log(`  UNEXPECTED:                  ${summary.unexpected}`);
} else {
  console.log('  n/a (needs both CE and GL)');
}
writeFileSync(path.join(resultsDir, 'report.json'), JSON.stringify({ summary, rows }, null, 1));

// ---- engine checks ----
console.log('\nEngine (Vitest, engine.parity.ts):');
const vitest = path.join(appDir, 'node_modules', 'vitest', 'vitest.mjs');
const engineReport = path.join(resultsDir, 'engine.json');
rmSync(engineReport, { force: true }); // this run's report only
const engineRun = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', 'vitest.parity.config.ts', '--reporter', 'dot'],
  {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, MFE_PARITY_CORPUS: corpusPath },
  },
);
/** results/engine.json as the engine checks wrote it; null when it is missing or unreadable. */
function readEngineReport() {
  try {
    return JSON.parse(readFileSync(engineReport, 'utf8'));
  } catch {
    return null;
  }
}
const engineResults = readEngineReport();
const engineOk = engineRun.status === 0 && engineResults !== null;

console.log(`\nResults written to ${path.relative(process.cwd(), resultsDir) || resultsDir}/`);
const result = verdict({
  dumps: { ce: ceDump.status, gl: glDump.status },
  unexpected: summary.unexpected,
  engineOk,
  engineSkipped: engineResults ? engineSkips(engineResults) : [],
  strict: process.env.MFE_PARITY_STRICT === '1',
});
console.log(result.label);
process.exit(result.exit);
