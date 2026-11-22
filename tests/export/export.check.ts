/* Export validation (docs/ARCHITECTURE.md §8 "Validation"): every example project and the
 * synthetic projects of projects.ts are exported for ManimCE and ManimGL, rendered in
 * manim_ce/venv and manim_gl/venv, and checked against the editor:
 *
 *   - frames:  the video (ffprobe) and the probe both have round(duration · fps) frames;
 *   - probe:   every frame's drawn glyphs (box, length, area, fill, stroke; probe.py) match the
 *              evaluator's drawables at that frame's time as multisets, within compare.ts
 *              TOLERANCE;
 *   - camera:  every frame was filmed through the frame the scene's camera has at that frame's
 *              time (`cameraAt`; Manim's own still frame for a project without a camera), within
 *              compare.ts CAMERA_TOLERANCE;
 *   - pixels:  the mid-transform frame of hello.mfe.json matches the web renderer's frame
 *              (foreground IoU and 1-px coverage, thresholds below).
 *
 * Formulas are rendered exactly through a companion started for the run, so literal indices
 * are exercised. The examples also run with MathJax snapshots (the canonical glyph order is
 * MathJax's, so the export uses the positional helper `_glyphs`); their evaluator keeps the exact
 * LaTeX geometry, resolved through the MathJax snapshot, so the comparison is as strict.
 *
 * Run from app/: `npm run export-check`. Skips itself (with a message) when a venv, LaTeX,
 * ffmpeg/ffprobe or the companion is missing; a missing Chrome only skips the pixel check. Off
 * Linux a case that needs its font texts shaped skips itself too, with what the companion says:
 * its text workers run on Linux only, for now.
 * Env: MFE_CE_PYTHON / MFE_GL_PYTHON, MFE_EXPORT_ONLY=<substring of case names>. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  companionTemp,
  stopCompanion,
  type CompanionTemp,
} from "../../app/build/harnessCompanion";
import {
  findManimPython,
  niced,
  pythonCommand,
} from "../../app/build/python";
import {
  createCompanionClient,
  createEngine,
  producerOf,
  refreshLocalRenders,
  renderRequestFor,
  resolveFormula,
  textArtifactRender,
  textBoxesKey,
  toSnapshot,
  type Engine,
  type ResolvedFormula,
} from "../../app/src/engine";
import { generatePython } from "../../app/src/export";
import { readEmbeddedTextGeometry } from "../../app/src/media/embeddedGeometry";
import {
  parseProject,
  sceneDuration,
  type EmbeddedTextGeometry,
  type Project,
  type Target,
} from "../../app/src/model";
import { cameraAt, exportEvaluator, settleScene } from "../../app/src/scene";
import {
  CAMERA_TOLERANCE,
  cameraDeviation,
  compareFrame,
  NO_DEVIATION,
  TOLERANCE,
  type Channel,
  type ProbeFile,
} from "./compare";
import {
  comparePixels,
  decodeRgb,
  startWebRenderer,
  type WebRenderer,
} from "./pixels";
import { syntheticCases, type ExportCase } from "./projects";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const appDir = path.join(repoRoot, "app");
const resultsDir = path.join(here, "results");
/** The interpreters of the two Manims: those of the virtualenvs next to the repository unless
 * the variables name others (`app/build/python.ts` knows where a virtualenv keeps its Python on
 * each system). */
const PYTHON: Record<Target, string> = {
  ce: process.env.MFE_CE_PYTHON ?? findManimPython(repoRoot, "manim_ce"),
  gl: process.env.MFE_GL_PYTHON ?? findManimPython(repoRoot, "manim_gl"),
};
/** Pixel check thresholds for the mid-transform frame of hello.mfe.json (960×540). IoU of the
 * foreground masks (any channel > 64 away from the background); ManimGL antialiases glyph edges
 * about half a pixel wider than the canvas, which costs it some IoU, so the 1-px coverage is the
 * stricter check. Measured: CE IoU 0.94, GL 0.80; coverage 1.00 for both. */
const PIXELS = { iou: 0.75, coverage: 0.97 };
const ONLY = process.env.MFE_EXPORT_ONLY;
/** Pause before each Manim render (the suite is CPU-heavy; see the README of this folder). */
const PAUSE_MS = 3000;

interface Variant {
  name: string;
  project: Project;
  /** Library the project is made for (preview semantics) and the one it is exported to. */
  projectTarget: Target;
  exportTarget: Target;
  snapshot: "latex" | "mathjax";
  probe: boolean;
  pixels?: { t: number };
  /** Changes the generated scene before it runs: what another machine would make of it. */
  rewrite?: (code: string) => string;
  /** The font texts the scene must say, on stderr, that Manim drew differently from the editor
   * (none when absent: a text shaped here is drawn here as it was). */
  textWarnings?: string[];
  /** What its stderr must say besides. */
  says?: RegExp;
  /** The geometry the project's file carries for its font texts. Those texts are then drawn
   * from it, as when the file is opened, and keep the snapshot they were saved with; the
   * companion is only asked whether this machine still shapes them the same. */
  embedded?: EmbeddedTextGeometry;
  /** Nothing has shaped the font texts of the project: they are drawn as their placeholder
   * boxes and their glyphs counted by them, as where no companion runs. The scene must say
   * which ones Manim builds with another number of glyphs. */
  unshaped?: boolean;
  /** The case needs the companion to shape the font texts of its project for the project's
   * library: what it checks (outlines, number of glyphs, fingerprints) comes from there. It is
   * skipped where the companion does not shape font text for that library. */
  shaping?: boolean;
  /** The dialog's «Always use the positional helper» ticked: every formula is matched by
   * position when the scene runs. */
  positional?: boolean;
}

function readExampleFile(file: string, width = 480) {
  const parsed = parseProject(
    readFileSync(path.join(repoRoot, "examples", file), "utf8"),
  );
  if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
  // Low resolution keeps the renders quick (16:9 kept); the frame rate stays the project's.
  parsed.project.meta.width = width;
  parsed.project.meta.height = (width * 9) / 16;
  return parsed;
}

function readExample(file: string, width = 480): Project {
  return readExampleFile(file, width).project;
}

function variants(target: Target): Variant[] {
  const out: Variant[] = [];
  // Name, file, and the snapshots to run with: a text with a width is broken into lines by LaTeX
  // itself, maybe not where MathJax broke them, so a MathJax snapshot cannot pair its glyphs by
  // position (the export says so); the companion is the way to export it.
  const examples: [string, string, readonly ("latex" | "mathjax")[]][] = [
    ["hello", "hello.mfe.json", ["latex", "mathjax"]],
    ["one-to-many", "one-to-many.mfe.json", ["latex", "mathjax"]],
    ["animation-blocks", "animation-blocks.mfe.json", ["latex", "mathjax"]],
    // Not "multiline": that is a synthetic case too, and both have a MathJax variant.
    ["example-multiline", "multiline.mfe.json", ["latex", "mathjax"]],
    ["completing-the-square", "completing-the-square.mfe.json", ["latex", "mathjax"]],
    ["text-title", "text-title.mfe.json", ["latex"]],
    ["braces", "braces.mfe.json", ["latex", "mathjax"]],
    ["emphasis", "emphasis.mfe.json", ["latex", "mathjax"]],
    ["shapes", "shapes.mfe.json", ["latex", "mathjax"]],
    ["lines", "lines.mfe.json", ["latex", "mathjax"]],
    ["camera", "camera.mfe.json", ["latex", "mathjax"]],
  ];
  for (const [name, file, snapshots] of examples) {
    for (const snapshot of snapshots) {
      const pixels = name === "hello" && snapshot === "latex";
      out.push({
        name: `${name}-${snapshot}`,
        // The pixel check needs glyphs a few dozen pixels tall.
        project: readExample(file, pixels ? 960 : 480),
        projectTarget: target,
        exportTarget: target,
        snapshot,
        probe: true,
        pixels: pixels ? { t: 2.5 } : undefined,
      });
    }
  }
  for (const c of syntheticCases() as ExportCase[]) {
    const snapshots = c.mathjax ? (["latex", "mathjax"] as const) : (["latex"] as const);
    for (const snapshot of snapshots) {
      out.push({
        name: snapshot === "latex" ? c.name : `${c.name}-mathjax`,
        project: c.project,
        projectTarget: target,
        exportTarget: target,
        snapshot,
        probe: c.probe,
        pixels: snapshot === "latex" ? c.pixels : undefined,
        shaping: c.project.formulas.some((f) => f.kind === "text"),
      });
    }
  }
  // A font text that Manim draws differently from the editor (other fonts, other versions): the
  // scene says so and renders all the same (D82). Here the saved fingerprint of the first text is
  // changed; the second one keeps its own and is not mentioned.
  const pango = (syntheticCases() as ExportCase[]).find((c) => c.name === "pango-text");
  if (pango) {
    out.push({
      name: "pango-text-changed",
      project: pango.project,
      projectTarget: target,
      exportTarget: target,
      snapshot: "latex",
      probe: pango.probe,
      rewrite: (code) =>
        code.replace(
          /(_mfe_verify_text\(p1, r"p1", "\w+", \d+, ")[0-9a-f]{64}/,
          `$1${"0".repeat(64)}`,
        ),
      textWarnings: ["p1"],
      shaping: true,
    });
    // The same text coming out with fewer glyphs than the scene names (another font, with or
    // without a ligature): here the first text is cut down to two letters, while the scene still
    // colours its fourth glyph, transforms it, and writes and unwrites the whole. The scene must
    // say how many glyphs it found and run to its last frame.
    out.push({
      name: "pango-text-fewer-glyphs",
      project: pango.project,
      projectTarget: target,
      exportTarget: target,
      snapshot: "latex",
      probe: false,
      rewrite: (code) => code.replace(/p1 = Text\(r"""AV office\né"""/, 'p1 = Text(r"AV"'),
      textWarnings: ["p1"],
      says: /It has 2 glyphs here and \d+ there/,
    });
    // The same texts where nothing has shaped them (no companion when they were written):
    // their glyphs are counted by their placeholder boxes, one per character, and the paint
    // and the part transform of the project address those. The scene must build the real
    // texts and run to its last frame; where Manim joins letters into one glyph it must say
    // that the count differs. Which texts those are, only a companion that shapes them tells.
    out.push({
      name: "pango-text-never-shaped",
      project: pango.project,
      projectTarget: target,
      exportTarget: target,
      snapshot: "latex",
      probe: false,
      unshaped: true,
      shaping: true,
    });
  }
  // Font texts the other library shaped: the same glyphs in the same order, at a converted size.
  // A text of one line must come out as the preview shows it. The libraries space the lines of a
  // text each its own way, so the texts of several lines must only run and keep their length.
  for (const [name, probe] of [
    ["pango-line", true],
    ["pango-text", false],
  ] as const) {
    const shaped = (syntheticCases() as ExportCase[]).find((c) => c.name === name);
    if (!shaped) continue;
    out.push({
      name: `${name}-from-other-target`,
      project: shaped.project,
      projectTarget: target === "ce" ? "gl" : "ce",
      exportTarget: target,
      snapshot: "latex",
      probe,
      shaping: true,
    });
  }
  // A project whose file carries the geometry of its font texts (examples/text-pango.mfe.json,
  // shaped for ManimCE). The scene is written from what the file holds, with no shaping: for
  // ManimCE it must draw every frame as the editor does, and for ManimGL, which did not shape
  // the texts and spaces their lines its own way, it must run and keep its length.
  const carried = readExampleFile("text-pango.mfe.json");
  out.push({
    name: "text-pango-from-file",
    project: carried.project,
    projectTarget: carried.project.meta.target,
    exportTarget: target,
    snapshot: "latex",
    probe: target === carried.project.meta.target,
    embedded: carried.textGeometry,
  });
  // A project made for the other library: it must run and keep its length.
  out.push({
    name: "hello-from-other-target",
    project: readExample("hello.mfe.json"),
    projectTarget: target === "ce" ? "gl" : "ce",
    exportTarget: target,
    snapshot: "latex",
    probe: false,
  });
  // The same for the lines example. Its lines are not LaTeX's: their glyphs are the members of
  // the mobject Manim builds, in both libraries, and none is matched by position — `_glyphs`
  // measures by the height of the mobject, and a horizontal line has none (audit A4-04).
  out.push({
    name: "lines-from-other-target",
    project: readExample("lines.mfe.json"),
    projectTarget: target === "ce" ? "gl" : "ce",
    exportTarget: target,
    snapshot: "latex",
    probe: false,
  });
  // Loose bent lines and arrows made for the other library, frame by frame (audit A4-05): a clip of
  // a line is placed by the centre its project's library reads, which on an arc is not where the
  // other library reads it, and the export lays the line between the ends the project's gives.
  const arcs = (syntheticCases() as ExportCase[]).find((c) => c.name === "loose-arcs");
  if (arcs) {
    out.push({
      name: "loose-arcs-from-other-target",
      project: arcs.project,
      projectTarget: target === "ce" ? "gl" : "ce",
      exportTarget: target,
      snapshot: "latex",
      probe: true,
    });
  }
  // With the positional helper asked for: the formulas are matched by position, the lines are
  // not, and every frame is still the preview's.
  out.push({
    name: "lines-positional",
    project: readExample("lines.mfe.json"),
    projectTarget: target,
    exportTarget: target,
    snapshot: "latex",
    probe: true,
    positional: true,
  });
  // What a render leaves (its scene, its log, its frames) goes in a folder of its library and its
  // name, cleared when the render starts: two cases of one name would share it, the second
  // clearing what the first left. Said here, before anything is rendered or filtered.
  const names = new Set<string>();
  for (const v of out) {
    if (names.has(v.name))
      throw new Error(
        `export-check: two cases for ${target} are named "${v.name}"; each needs a name of its own`,
      );
    names.add(v.name);
  }
  return ONLY ? out.filter((v) => v.name.includes(ONLY)) : out;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function hasTool(command: string): boolean {
  const res = spawnSync(command, ["-version"], { encoding: "utf8" });
  return !res.error && res.status === 0;
}

function findVideo(dir: string, scene: string): string | null {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "partial_movie_files") continue;
    if (statSync(full).isDirectory()) {
      const found = findVideo(full, scene);
      if (found) return found;
    } else if (entry === `${scene}.mp4`) return full;
  }
  return null;
}

function countFrames(video: string): number {
  const res = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      video,
    ],
    { encoding: "utf8" },
  );
  return Number(res.stdout.trim());
}

let companion: ChildProcess | null = null;
/** Where the companion of this run keeps its temporary files: removed with it. */
let companionFiles: CompanionTemp | null = null;
let engine: Engine | null = null;
let web: WebRenderer | null = null;
const skipReason: Partial<Record<Target, string>> = {};
/** Why the companion does not shape font text for a library, by library (none where it does). */
const textSkipReason: Partial<Record<Target, string>> = {};
let globalSkip = "";
const summary: Record<string, unknown>[] = [];

beforeAll(async () => {
  mkdirSync(resultsDir, { recursive: true });
  if (!hasTool("ffmpeg") || !hasTool("ffprobe")) {
    globalSkip = "ffmpeg / ffprobe not found";
    return;
  }
  for (const target of ["ce", "gl"] as const) {
    if (!existsSync(PYTHON[target]))
      skipReason[target] = `no interpreter at ${PYTHON[target]}`;
  }
  const script = path.join(repoRoot, "companion", "mfe_companion.py");
  const port = await freePort();
  // The companion measures Pango text with the Manim it is told about, and looks nowhere by
  // itself: it gets the interpreters this run renders with.
  const interpreters = (["ce", "gl"] as const).flatMap((target) =>
    skipReason[target] ? [] : [`--${target}-python`, PYTHON[target]],
  );
  // A temporary folder of its own: ended by this run, the companion cannot clean up after
  // itself on Windows (`app/build/harnessCompanion.ts`).
  companionFiles = companionTemp();
  companion = spawn(
    pythonCommand(),
    [script, "serve", "--port", String(port), ...interpreters],
    { stdio: ["ignore", "ignore", "pipe"], env: companionFiles.env },
  );
  let stderr = "";
  companion.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  // No Python under that name: the reason the suite skips itself, not an uncaught error.
  companion.once("error", (error) => (stderr += `${error.message}\n`));
  const client = createCompanionClient({
    baseUrl: `http://127.0.0.1:${port}`,
    autoStart: false,
    texTimeoutMs: 60_000,
  });
  for (let i = 0; i < 40; i++) {
    const checked = await client.check();
    if (checked.status === "online" && !checked.health.capabilities.manimProbing)
      break;
    if (companion.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  // The companion starts nothing of font text by itself: asking for the fonts of a library
  // starts its text worker, and the answer comes when it is ready.
  for (const target of ["ce", "gl"] as const) {
    if (skipReason[target] || client.state().status !== "online") continue;
    await client.fonts!(target).catch(() => undefined);
  }
  await client.check();
  // The companion shapes font text on Linux only, for now: elsewhere the start of a text worker
  // ends in a refusal, which /health then states. A start that outlasts the client's wait for
  // the fonts is still preparing, so it is awaited (a start has a time limit of its own, 30 s).
  const shapesHere = process.platform === "linux";
  for (let i = 0; !shapesHere && i < 160; i++) {
    const checked = client.state();
    if (checked.status !== "online") break;
    const text = Object.values(checked.health.capabilities.pango ?? {});
    if (!text.some((worker) => worker?.state === "preparing")) break;
    await new Promise((r) => setTimeout(r, 250));
    await client.check();
  }
  const state = client.state();
  if (state.status !== "online") {
    globalSkip = `companion did not start: ${stderr.trim().split("\n").slice(-2).join(" | ")}`;
    return;
  }
  if (!state.health.capabilities.latex || !state.health.capabilities.dvisvgm) {
    globalSkip = "LaTeX / dvisvgm not found (companion /health)";
    return;
  }
  // Where the companion does not shape font text for a library, its texts are drawn as their
  // placeholder boxes, and what the cases that need them shaped check is not known: they skip,
  // with the companion's word. On Linux, where it shapes, a text worker that is not ready is a
  // fault: nothing is skipped for it, and those cases fail as they always did.
  for (const target of shapesHere ? [] : (["ce", "gl"] as const)) {
    const text = state.health.capabilities.pango?.[target];
    if (text?.state === "ready") continue;
    const library = target === "ce" ? "ManimCE" : "ManimGL";
    const said =
      text?.state === "failed" && text.message
        ? text.message
        : `its text worker is ${text?.state ?? "missing"}`;
    textSkipReason[target] =
      `the companion does not shape font text for ${library}: ${said}`;
  }
  engine = createEngine({ companion: client });
  web = await startWebRenderer(appDir, await freePort());
}, 120_000);

afterAll(async () => {
  if (companion && companionFiles)
    await stopCompanion(companion, companionFiles);
  engine?.dispose();
  await web?.close();
  writeFileSync(
    path.join(resultsDir, "summary.json"),
    JSON.stringify(summary, null, 1),
  );
  if (summary.length > 0) {
    console.log("\nExport check summary");
    for (const row of summary) console.log(`  ${JSON.stringify(row)}`);
    console.log(
      `Tolerances: ${JSON.stringify(TOLERANCE)}; pixels: ${JSON.stringify(PIXELS)}`,
    );
  }
});

async function prepare(v: Variant) {
  const project = structuredClone(v.project);
  project.meta.target = v.projectTarget;
  const resolved = new Map<string, ResolvedFormula>();
  /** The texts drawn from their file's geometry that this machine shapes differently now. */
  const reshaped: string[] = [];
  /** The texts counted by their boxes that Manim builds with another number of glyphs. */
  const miscounted: string[] = [];
  for (const formula of project.formulas) {
    const request = renderRequestFor(formula, project.meta, "latex");
    const exact = await engine!.render(request);
    if (!exact.ok) throw new Error(`${formula.name}: ${exact.error.message}`);
    if (formula.kind === "text" && request.kind === "text" && v.unshaped) {
      // As the render sync leaves a text nothing shaped: its boxes, and their snapshot.
      const boxes = producerOf("text").free(request, textBoxesKey(request));
      if (!boxes.ok) throw new Error(`${formula.name}: ${boxes.error.message}`);
      formula.snapshot = toSnapshot(boxes.render);
      formula.geometry = null;
      resolved.set(formula.id, resolveFormula(formula, boxes.render));
      if (exact.render.glyphs.length !== boxes.render.glyphs.length)
        miscounted.push(formula.name);
      continue;
    }
    const hash =
      formula.kind === "text" ? formula.geometry?.contentHash : undefined;
    if (formula.kind === "text" && hash && v.embedded && hash in v.embedded) {
      // The file's geometry, checked as Open checks it; the saved snapshot stays as it is.
      const artifact = await readEmbeddedTextGeometry(
        v.embedded[hash],
        formula.geometry!,
      );
      resolved.set(
        formula.id,
        resolveFormula(formula, textArtifactRender(artifact)),
      );
      const saved = artifact.provenance.geometrySignature;
      if (!saved || exact.render.text?.provenance.geometrySignature !== saved)
        reshaped.push(formula.name);
      continue;
    }
    let snapshotRender = exact.render;
    if (v.snapshot === "mathjax") {
      const mj = await engine!.render({ ...request, prefer: "mathjax" });
      if (!mj.ok)
        throw new Error(`${formula.name} (MathJax): ${mj.error.message}`);
      snapshotRender = mj.render;
    }
    formula.snapshot = toSnapshot(snapshotRender);
    resolved.set(formula.id, resolveFormula(formula, exact.render));
  }
  // Attached objects sit where the app's attach sync would have put them, braces fitted and
  // rendered at the width they were fitted to.
  const settled = settleScene(project, resolved, refreshLocalRenders);
  return {
    project: settled.project,
    resolved: settled.formulas,
    reshaped,
    miscounted,
  };
}

for (const target of ["ce", "gl"] as const) {
  describe(`export to ${target === "ce" ? "ManimCE" : "ManimGL"}`, () => {
    for (const v of variants(target)) {
      it(
        v.name,
        async (ctx) => {
          const why =
            globalSkip ||
            skipReason[target] ||
            (v.shaping ? textSkipReason[v.projectTarget] : undefined);
          if (why) {
            console.log(`${target} ${v.name}: SKIPPED (${why})`);
            // The summary keeps it: a run without failures prints nothing of a skipped case.
            summary.push({ target, case: v.name, skipped: why });
            ctx.skip();
            return;
          }
          const { project, resolved, reshaped, miscounted } =
            await prepare(v);
          // Other fonts or versions than the ones a carried geometry was shaped with: the scene
          // must say which texts, and its frames are then not the editor's.
          const drifted =
            reshaped.length > 0 && v.exportTarget === v.projectTarget;
          if (drifted)
            console.log(
              `${target} ${v.name}: this machine shapes ${reshaped.join(", ")} differently from the file; frames not compared`,
            );
          const sceneName = "ExportCheck";
          const result = generatePython(project, resolved, {
            target: v.exportTarget,
            sceneName,
            indexing: v.positional ? "positional" : "auto",
            comments: true,
          });
          const dir = path.join(resultsDir, target, v.name);
          rmSync(dir, { recursive: true, force: true });
          mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `${sceneName}.py`);
          const code = v.rewrite ? v.rewrite(result.code) : result.code;
          if (v.rewrite) expect(code, "the rewritten scene").not.toBe(result.code);
          writeFileSync(file, code);
          const { width, height, fps } = project.meta;
          const started = Date.now();
          // Keep the machine cool: renders run one at a time, niced, with a pause in between.
          await new Promise((r) => setTimeout(r, PAUSE_MS));
          const run = spawnSync(
            ...niced(PYTHON[target], [
              path.join(here, "probe.py"),
              target,
              file,
              sceneName,
              path.join(dir, "probe.json"),
              String(width),
              String(height),
              String(fps),
              path.join(dir, "video"),
            ]),
            {
              cwd: dir,
              encoding: "utf8",
              timeout: 10 * 60 * 1000,
              maxBuffer: 64 * 1024 * 1024,
            },
          );
          const seconds = (Date.now() - started) / 1000;
          writeFileSync(
            path.join(dir, "run.log"),
            `${run.stdout}\n${run.stderr}`,
          );
          expect(
            run.status,
            `${target} ${v.name} failed:\n${run.stderr.slice(-3000)}`,
          ).toBe(0);
          const warned = [
            ...run.stderr.matchAll(
              /^Warning: the text '([^']*)' is not drawn here/gm,
            ),
          ].map((match) => match[1]);
          expect(
            warned,
            "font texts the scene says Manim drew differently",
          ).toEqual(v.textWarnings ?? (drifted ? reshaped : miscounted));
          if (v.says) expect(run.stderr).toMatch(v.says);

          const expected = Math.round(sceneDuration(project) * fps);
          const video = findVideo(path.join(dir, "video"), sceneName);
          expect(video, "video file").not.toBeNull();
          const videoFrames = countFrames(video!);
          const probe = JSON.parse(
            readFileSync(path.join(dir, "probe.json"), "utf8"),
          ) as ProbeFile;
          const row: Record<string, unknown> = {
            target,
            case: v.name,
            seconds: Math.round(seconds * 10) / 10,
            frames: `${videoFrames}/${expected}`,
            helper: result.usedPositionalHelper,
          };
          summary.push(row);

          // The frame every frame was filmed through: the scene camera's of that instant, or
          // Manim's own for a project without a camera. The frame times are the probe's, below.
          {
            let off = 0;
            let worst = { deviation: 0, frame: -1 };
            probe.cameras.forEach((filmed, j) => {
              const t = target === "ce" ? j / fps : (j + 1) / fps - 1e-5;
              const deviation = cameraDeviation(
                filmed,
                cameraAt(project.camera, t, v.exportTarget),
              );
              if (deviation > worst.deviation) worst = { deviation, frame: j };
              if (deviation > CAMERA_TOLERANCE) off++;
            });
            if (project.camera)
              row.camera = `${probe.cameras.length - off}/${probe.cameras.length} frames, worst ${worst.deviation.toExponential(1)} @${worst.frame}`;
            expect(probe.cameras.length, "a filmed frame per frame").toBe(
              probe.frames.length,
            );
            expect(
              off,
              `${target} ${v.name}: ${off} frames were not filmed through the camera's frame (worst ${worst.deviation} at frame ${worst.frame})`,
            ).toBe(0);
          }

          if (v.probe && !drifted) {
            const evaluator = exportEvaluator(project, resolved);
            let failing = 0;
            let tracing = 0;
            let worst = { cost: 0, channel: "box" as string, frame: -1 };
            const channels: Record<Channel, number> = { ...NO_DEVIATION };
            const failures: unknown[] = [];
            probe.frames.forEach((items, j) => {
              // CE renders the start of every frame interval, GL its end (see probe.py): a GL
              // frame on an event boundary still shows the play that ends there, i.e. the
              // left limit of the preview's half-open intervals.
              const t = target === "ce" ? j / fps : (j + 1) / fps - 1e-5;
              const res = compareFrame(items, evaluator.evaluate(t), target);
              tracing += res.tracing;
              for (const [channel, value] of Object.entries(res.channels)) {
                const key = channel as Channel;
                if (value > channels[key]) channels[key] = value;
              }
              if (res.worst.cost > worst.cost)
                worst = { ...res.worst, frame: j };
              if (!res.ok) {
                failing++;
                if (failures.length < 5) {
                  failures.push({ frame: j, t, ...res });
                }
              }
            });
            writeFileSync(
              path.join(dir, "failures.json"),
              JSON.stringify(failures, null, 1),
            );
            row.probe = `${probe.frames.length - failing}/${probe.frames.length} frames match`;
            if (tracing > 0)
              row.tracing = `${tracing} short traced outlines unmatched`;
            row.worst = `${worst.channel} ${Math.round(worst.cost * 100) / 100}× tol @${worst.frame}`;
            row.channels = Object.fromEntries(
              Object.entries(channels).map(([channel, value]) => [
                channel,
                Math.round(value * 100) / 100,
              ]),
            );
            expect(
              failing,
              `${target} ${v.name}: ${failing} frames differ, see ${dir}/failures.json`,
            ).toBe(0);
          }

          if (v.pixels && web) {
            const index =
              Math.round(v.pixels.t * fps) - (target === "ce" ? 0 : 1);
            const png = await web.frame(project, resolved, v.pixels.t);
            writeFileSync(path.join(dir, "web.png"), png);
            const webRgb = decodeRgb(path.join(dir, "web.png"), width, height);
            const manimRgb = decodeRgb(video!, width, height, index);
            spawnSync("ffmpeg", [
              "-v",
              "error",
              "-y",
              "-i",
              video!,
              "-vf",
              `select=eq(n\\,${index})`,
              "-vframes",
              "1",
              path.join(dir, "manim.png"),
            ]);
            const bg = project.meta.background;
            const px = comparePixels(webRgb, manimRgb, width, height, [
              parseInt(bg.slice(1, 3), 16),
              parseInt(bg.slice(3, 5), 16),
              parseInt(bg.slice(5, 7), 16),
            ]);
            row.pixels = `IoU ${px.iou.toFixed(3)}, coverage ${px.coverage.toFixed(3)} (${px.foreground.join(" vs ")} px)`;
            expect(px.iou).toBeGreaterThanOrEqual(PIXELS.iou);
            expect(px.coverage).toBeGreaterThanOrEqual(PIXELS.coverage);
          }
          expect(probe.frames.length).toBe(expected);
          expect(videoFrames).toBe(expected);
        },
        15 * 60 * 1000,
      );
    }
  });
}
