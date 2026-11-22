/* Engine parity: the app's formula engine against the ManimCE / ManimGL dumps.
 *
 * Run by `npm run parity` (after the Python dumps) through app/vitest.parity.config.ts.
 *
 * (a) LaTeX backend through a companion spawned for this run, vs results/ce.json (target ce)
 *     and results/gl.json (target gl): same count, same order, every glyph centre and size
 *     within 1e-3 scene units. Skipped (clearly) when the companion cannot start.
 * (b) MathJax backend vs CE: glyph counts (known exceptions in known-exceptions.json), the
 *     position matcher judged by label agreement with the companion's labels, and the size
 *     calibration (least-squares fit of MATHJAX_SCALE on matched glyph widths and heights).
 *
 * Prints a summary, writes results/engine.json, and fails only on unexpected results. */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  companionTemp,
  stopCompanion,
  type CompanionTemp,
} from '../../app/build/harnessCompanion';
import { pythonCommand } from '../../app/build/python';
import { boxCenter, boxSize } from '../../app/src/geom';
import {
  createCompanionClient,
  createEngine,
  glyphLikes,
  matchGlyphs,
  MATHJAX_SCALE,
  normalizeLabel,
  type Engine,
  type FormulaRender,
  type RenderRequest,
} from '../../app/src/engine';
import type { Target } from '../../app/src/model';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const resultsDir = path.join(here, 'results');
const TOLERANCE = 1e-3;
/** Label agreement of the MathJax→LaTeX matching below which a formula counts as mismatched. */
const LABEL_AGREEMENT_MIN = 1;

interface CorpusEntry {
  latex: string;
  packages: string[];
}
interface DumpGlyph {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface DumpEntry {
  tex: string;
  glyphs?: DumpGlyph[];
  error?: string;
}
interface KnownException {
  latex: string;
  /** What is known to differ: CE vs GL glyph count, MathJax glyph count, MathJax matching. */
  ceGl?: string;
  mathjaxCount?: string;
  mathjaxMatch?: string;
}

const corpus: CorpusEntry[] = (
  JSON.parse(
    readFileSync(process.env.MFE_PARITY_CORPUS ?? path.join(here, 'corpus.json'), 'utf8'),
  ) as (string | CorpusEntry)[]
).map((e) =>
  typeof e === 'string' ? { latex: e, packages: [] } : { ...e, packages: e.packages ?? [] },
);
const known = new Map(
  (
    JSON.parse(readFileSync(path.join(here, 'known-exceptions.json'), 'utf8')) as {
      exceptions: KnownException[];
    }
  ).exceptions.map((k) => [k.latex, k]),
);

function readDump(name: string): DumpEntry[] | null {
  const file = path.join(resultsDir, `${name}.json`);
  if (!existsSync(file)) return null;
  const dump = JSON.parse(readFileSync(file, 'utf8')) as DumpEntry[];
  return dump.length === corpus.length && dump.every((d, i) => d.tex === corpus[i]!.latex)
    ? dump
    : null;
}

const dumps: Record<Target, DumpEntry[] | null> = {
  ce: readDump('ce'),
  gl: readDump('gl'),
};

function request(entry: CorpusEntry, target: Target, prefer: RenderRequest['prefer']) {
  return {
    kind: 'math' as const,
    ...entry,
    preamble: '',
    target,
    fontSize: 48,
    prefer,
  } satisfies RenderRequest;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

let companion: ChildProcess | null = null;
/** Where the companion of this run keeps its temporary files: removed with it. */
let companionFiles: CompanionTemp | null = null;
let engine: Engine | null = null;
let companionNote = '';
const unexpected: string[] = [];
const report: Record<string, unknown> = {};

beforeAll(async () => {
  const script = path.join(repoRoot, 'companion', 'mfe_companion.py');
  if (!existsSync(script)) {
    companionNote = `companion not found at ${script}`;
    return;
  }
  const port = await freePort();
  // A temporary folder of its own: ended by this run, the companion cannot clean up after
  // itself on Windows (`app/build/harnessCompanion.ts`).
  companionFiles = companionTemp();
  companion = spawn(pythonCommand(), [script, 'serve', '--port', String(port)], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: companionFiles.env,
  });
  let stderr = '';
  companion.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  // No Python under that name: said as the reason the comparisons are skipped, not thrown.
  let unstarted = false;
  companion.once('error', (error) => {
    unstarted = true;
    stderr += `${error.message}\n`;
  });
  const client = createCompanionClient({
    baseUrl: `http://127.0.0.1:${port}`,
    autoStart: false,
    texTimeoutMs: 60_000,
  });
  for (let i = 0; i < 40; i++) {
    if ((await client.check()).status === 'online') break;
    if (unstarted || companion.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (client.state().status !== 'online') {
    companionNote = `companion did not start: ${stderr.trim().split('\n').slice(-3).join(' | ')}`;
    await stopCompanion(companion, companionFiles);
    companion = null;
    return;
  }
  engine = createEngine({ companion: client });
}, 30_000);

afterAll(async () => {
  if (companion && companionFiles) await stopCompanion(companion, companionFiles);
  engine?.dispose();
  writeFileSync(
    path.join(resultsDir, 'engine.json'),
    JSON.stringify({ ...report, unexpected }, null, 1),
  );
  console.log(`\nEngine parity results written to ${path.join(resultsDir, 'engine.json')}`);
});

const latexRenders: Record<Target, (FormulaRender | null)[]> = {
  ce: [],
  gl: [],
};

function compareWithDump(render: FormulaRender, dump: DumpEntry): string | null {
  const glyphs = dump.glyphs ?? [];
  if (render.glyphs.length !== glyphs.length)
    return `count ${render.glyphs.length} vs ${glyphs.length}`;
  let worst = 0;
  render.glyphs.forEach((g, i) => {
    const d = glyphs[i]!;
    const [cx, cy] = boxCenter(g.bbox);
    const [w, h] = boxSize(g.bbox);
    worst = Math.max(
      worst,
      Math.abs(cx - d.x),
      Math.abs(cy - d.y),
      Math.abs(w - d.w),
      Math.abs(h - d.h),
    );
  });
  return worst <= TOLERANCE ? null : `max deviation ${worst.toExponential(2)}`;
}

describe('LaTeX backend vs Manim', () => {
  for (const target of ['ce', 'gl'] as const) {
    it(`matches the ${target.toUpperCase()} dump`, async (ctx) => {
      const dump = dumps[target];
      if (!engine || !dump) {
        const why = !engine ? companionNote : `results/${target}.json missing or stale`;
        console.log(`LaTeX vs ${target.toUpperCase()}: SKIPPED (${why})`);
        report[`latexVs${target.toUpperCase()}`] = { skipped: why };
        ctx.skip();
        return;
      }
      const failures: string[] = [];
      let compared = 0;
      for (const [i, entry] of corpus.entries()) {
        const result = await engine.render(request(entry, target, 'latex'));
        const d = dump[i]!;
        if (!result.ok) {
          latexRenders[target][i] = null;
          if (!d.error) failures.push(`${entry.latex}: LaTeX error ${result.error.message}`);
          continue;
        }
        latexRenders[target][i] = result.render;
        if (d.error) {
          failures.push(`${entry.latex}: Manim failed (${d.error}) but the companion did not`);
          continue;
        }
        compared++;
        const problem = compareWithDump(result.render, d);
        if (problem) failures.push(`${entry.latex}: ${problem}`);
      }
      const label = `LaTeX vs ${target.toUpperCase()}`;
      console.log(
        `${label}: ${compared - failures.length}/${compared} identical (count, order, centre and size within ${TOLERANCE})`,
      );
      for (const f of failures) console.log(`  UNEXPECTED ${f}`);
      report[`latexVs${target.toUpperCase()}`] = { compared, failures };
      unexpected.push(...failures.map((f) => `${label}: ${f}`));
      expect(failures).toEqual([]);
    }, 600_000);
  }
});

interface CalibrationSample {
  mj: number;
  ref: number;
  latex: string;
  label: string;
  axis: 'w' | 'h';
}

function fitScale(samples: CalibrationSample[]) {
  // ref ≈ f · mj, least squares: f = Σ mj·ref / Σ mj².
  const num = samples.reduce((s, p) => s + p.mj * p.ref, 0);
  const den = samples.reduce((s, p) => s + p.mj * p.mj, 0);
  const factor = den > 0 ? num / den : 1;
  const rel = samples.map((p) => (factor * p.mj - p.ref) / p.ref);
  const rms = Math.sqrt(rel.reduce((s, r) => s + r * r, 0) / Math.max(1, rel.length));
  const sorted = rel.map(Math.abs).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const worst = samples
    .map((p, i) => ({
      latex: p.latex,
      label: p.label,
      axis: p.axis,
      error: rel[i]!,
    }))
    .sort((x, y) => Math.abs(y.error) - Math.abs(x.error))
    .slice(0, 10)
    .map((w) => ({ ...w, error: +w.error.toFixed(4) }));
  return { factor, rms, median, n: samples.length, worst };
}

describe('MathJax backend vs LaTeX', () => {
  for (const target of ['ce', 'gl'] as const) {
    it(`counts, matching and calibration (${target.toUpperCase()})`, async () => {
      const dump = dumps[target];
      const mjEngine = createEngine({ companion: { fetch: null } });
      const rows: Record<string, unknown>[] = [];
      const failures: string[] = [];
      const samples: CalibrationSample[] = [];
      let equalCount = 0;
      let reordered = 0;
      let labelChecked = 0;
      let labelPerfect = 0;
      let pairs = 0;
      let agreeingPairs = 0;
      for (const [i, entry] of corpus.entries()) {
        const k = known.get(entry.latex);
        const mj = await mjEngine.render(request(entry, target, 'mathjax'));
        const tex = latexRenders[target][i];
        const ref = dump?.[i];
        const refCount = tex ? tex.glyphs.length : (ref?.glyphs?.length ?? null);
        if (!mj.ok) {
          rows.push({ latex: entry.latex, error: mj.error.message });
          failures.push(`${entry.latex}: MathJax error ${mj.error.message}`);
          continue;
        }
        const n = mj.render.glyphs.length;
        const row: Record<string, unknown> = {
          latex: entry.latex,
          mathjax: n,
          latex_: refCount,
        };
        rows.push(row);
        if (refCount === null) continue;
        if (n !== refCount) {
          if (!k?.mathjaxCount) failures.push(`${entry.latex}: count ${n} vs ${refCount}`);
          row.knownCount = k?.mathjaxCount ?? null;
          continue;
        }
        equalCount++;
        // Matching: MathJax → reference; judged by labels when the companion supplied them.
        const refGlyphs = tex
          ? glyphLikes(tex)
          : ref!.glyphs!.map((g) => ({
              label: '?',
              center: [g.x, g.y] as [number, number],
              size: [g.w, g.h] as [number, number],
            }));
        const mjGlyphs = glyphLikes(mj.render);
        const { map, confidence } = matchGlyphs(mjGlyphs, refGlyphs, 'position');
        row.confidence = +confidence.toFixed(3);
        if (map.some((j, idx) => j !== idx)) reordered++;
        let agree = 0;
        let checked = 0;
        map.forEach((j, idx) => {
          if (j === null) return;
          const a = normalizeLabel(mjGlyphs[idx]!.label);
          const b = normalizeLabel(refGlyphs[j]!.label);
          const sizeMj = mjGlyphs[idx]!.size;
          const sizeRef = refGlyphs[j]!.size;
          if (a !== '?' && b !== '?') {
            checked++;
            if (a === b) {
              agree++;
              // Calibration samples: font glyphs, not rules or \cancel strokes (their extent
              // is layout-dependent).
              if (mj.render.glyphs[idx]!.kind === 'char' && a !== '╱') {
                const base = { latex: entry.latex, label: a };
                if (sizeRef[0] > 0.02)
                  samples.push({
                    ...base,
                    axis: 'w',
                    mj: sizeMj[0],
                    ref: sizeRef[0],
                  });
                if (sizeRef[1] > 0.02)
                  samples.push({
                    ...base,
                    axis: 'h',
                    mj: sizeMj[1],
                    ref: sizeRef[1],
                  });
              }
            }
          }
        });
        pairs += checked;
        agreeingPairs += agree;
        if (checked > 0) {
          labelChecked++;
          const rate = agree / checked;
          row.labelAgreement = +rate.toFixed(3);
          if (rate >= LABEL_AGREEMENT_MIN) labelPerfect++;
          else if (!k?.mathjaxMatch)
            failures.push(`${entry.latex}: label agreement ${(rate * 100).toFixed(0)} %`);
          else row.knownMatch = k.mathjaxMatch;
        }
      }
      const fit = fitScale(samples);
      const fitted = MATHJAX_SCALE[target] * fit.factor;
      const label = `MathJax vs LaTeX (${target.toUpperCase()})`;
      console.log(`${label}:`);
      console.log(`  equal glyph count:        ${equalCount}/${corpus.length}`);
      console.log(`  order differs:            ${reordered}/${equalCount}`);
      console.log(
        `  matcher label agreement:  ${labelPerfect}/${labelChecked} formulas perfect, ` +
          `${agreeingPairs}/${pairs} pairs` +
          (tex0(target) ? '' : ' (no companion labels; label checks skipped)'),
      );
      console.log(
        `  size calibration:         MATHJAX_SCALE.${target} = ${MATHJAX_SCALE[target].toExponential(5)}, ` +
          `least-squares fit ${fitted.toExponential(5)} (×${fit.factor.toFixed(5)}), ` +
          `relative error rms ${(fit.rms * 100).toFixed(2)} %, median ${(fit.median * 100).toFixed(2)} %, n = ${fit.n}`,
      );
      for (const f of failures) console.log(`  UNEXPECTED ${f}`);
      report[`mathjax${target.toUpperCase()}`] = {
        equalCount,
        reordered,
        labelPerfect,
        labelChecked,
        pairs,
        agreeingPairs,
        calibration: { current: MATHJAX_SCALE[target], fitted, ...fit },
        failures,
        rows,
      };
      unexpected.push(...failures.map((f) => `${label}: ${f}`));
      expect(failures).toEqual([]);
    }, 600_000);
  }
});

function tex0(target: Target): boolean {
  return latexRenders[target].some((r) => r !== null && r !== undefined);
}
