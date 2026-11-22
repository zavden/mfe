/* Lines and arrows whose ends are on glyphs, for the widgets of the web documentation
 * (`MFEPlayer.engine.lines`): the points of the compass an end can be put at (the nine of the
 * glyphs' box, as Manim's `get_corner(UL)` … `get_center()` read it, and `auto`, the edge the
 * library finds towards the other end), where the attach sync puts a line whose ends changed, and
 * the line's glyphs built again for its new length — what the app does when an end of a line is
 * put elsewhere.
 *
 * The geometry is the app's own (`scene/lines.ts`, `geom/lines.ts`). Two pieces live where the
 * player cannot import them, and are copied here: the line's producer (`engine/producers.ts`,
 * which builds its glyphs in the browser from its fields) and the placement of a line clip by the
 * attach sync (`scene/attach.ts`, `fitLineClip`, whose module loads MathJax). The names of the
 * compass are the Preview's (`ui/preview/glyphAlign.ts`, `ui/preview/lineDraw.ts`).
 * `__tests__/lines.test.ts` holds every copy to its original. Pure. */
import {
  boxCenter,
  boxSize,
  buildLine,
  contoursBox,
  lineTo,
  transformContour,
  translate,
  type Contour,
  type LinePart,
  type Vec2,
} from '../geom';
import type { FormulaRender, Glyph } from '../engine';
import {
  isGlyphEnd,
  LINE_ANCHORS,
  type Clip,
  type ClipId,
  type FormulaId,
  type FormulaSnapshot,
  type LineAnchor,
  type LineEnd,
  type LineFormula,
  type LineGlyphEnd,
  type Project,
  type Target,
} from '../model';
import { drawnEnds, lineCentre, lineEndInput, manimLineEnds, withTrim } from '../scene/lines';
import type { SceneEvaluator } from '../scene';

// ---- The compass (ui/preview/glyphAlign.ts, ui/preview/lineDraw.ts) ----

/** The nine points of the compass, row by row from its upper left corner, as the Preview's
 * compass lays them out; `auto` is the choice under them. */
export const COMPASS_ANCHORS = LINE_ANCHORS.filter(
  (anchor): anchor is Exclude<LineAnchor, 'auto'> => anchor !== 'auto',
);

/** What the compass calls each point. */
export const ANCHOR_LABELS: Record<LineAnchor, string> = {
  auto: 'Auto',
  ul: 'Upper left corner',
  up: 'Top edge',
  ur: 'Upper right corner',
  left: 'Left edge',
  center: 'Centre',
  right: 'Right edge',
  dl: 'Lower left corner',
  down: 'Bottom edge',
  dr: 'Lower right corner',
};

/** The arrow the compass shows for each point. */
export const ANCHOR_ARROWS: Record<Exclude<LineAnchor, 'auto'>, string> = {
  ul: '↖',
  up: '↑',
  ur: '↗',
  left: '←',
  center: '•',
  right: '→',
  dl: '↙',
  down: '↓',
  dr: '↘',
};

/** What «Auto» does, for a tooltip. */
export const AUTO_ANCHOR_HINT =
  'Auto: the edge Manim finds towards the line’s other end — Line(a, b)';

// ---- The glyphs of a line (engine/producers.ts, `line`) ----

/** What the glyphs of a line are called: the line or a dash, and a tip. */
const LINE_GLYPH_LABELS: Readonly<Record<LinePart['role'], string>> = {
  line: '—',
  dash: '╌',
  tip: '▸',
};

/** The fields of a line its glyphs are built from, in the order of the producer's identity. */
function identity(formula: LineFormula, target: Target): unknown[] {
  return [
    'line',
    target,
    formula.line,
    formula.vector[0],
    formula.vector[1],
    formula.strokeWidth,
    ...(formula.line === 'arrow' || formula.line === 'double_arrow'
      ? [formula.tipLength, formula.tip]
      : []),
    ...(formula.line === 'double_arrow' ? [formula.startTip] : []),
    ...(formula.line === 'dashed' ? [formula.dashLength] : []),
    formula.curve ? JSON.stringify(formula.curve) : '',
  ];
}

/** Whether two lines are drawn with the same glyphs (for the libraries of `a` and `b`). */
export function sameLineGlyphs(
  a: LineFormula,
  targetA: Target,
  b: LineFormula,
  targetB: Target,
): boolean {
  return JSON.stringify(identity(a, targetA)) === JSON.stringify(identity(b, targetB));
}

/** A line's render, as the app builds it in the browser: Manim's line or arrow along its `vector`
 * — one glyph for a line, one per dash for a dashed one, the shaft and then its tips for an arrow
 * —, each painted as Manim paints that member, and centred as the library centres the line. */
export function lineRender(formula: LineFormula, target: Target): FormulaRender {
  const [vx, vy] = formula.vector;
  const built = buildLine(target, formula.line, [-vx / 2, -vy / 2], [vx / 2, vy / 2], {
    strokeWidth: formula.strokeWidth,
    tipLength: formula.tipLength,
    dashLength: formula.dashLength,
    curve: formula.curve,
    tip: formula.tip,
    startTip: formula.startTip,
  });
  let { parts } = built;
  // ManimGL's dashed line of no length has no dash at all: a render is never without a glyph,
  // so it keeps one, a run of no length, which draws nothing either.
  if (parts.length === 0) {
    const dot: Contour = [0, 0];
    lineTo(dot, 0, 0);
    parts = [
      {
        role: 'dash',
        contour: dot,
        style: { fillOpacity: 0, strokeWidth: formula.strokeWidth, strokeOpacity: 1 },
      },
    ];
  }
  const [cx, cy] = built.centre;
  const glyphs = parts.map((part, index): Glyph => {
    const contour = transformContour(translate(-cx, -cy), part.contour);
    return {
      index,
      label: LINE_GLYPH_LABELS[part.role],
      kind: 'char',
      contours: [contour],
      bbox: contoursBox([contour]),
      style: { ...part.style },
    };
  });
  return {
    key: `line-${JSON.stringify(identity(formula, target))}`,
    backend: 'latex',
    exact: true,
    target,
    fontSize: formula.fontSize,
    glyphs,
    bbox: contoursBox(glyphs.flatMap((glyph) => glyph.contours)),
    warnings: [],
  };
}

/** The snapshot of a render (`engine/key.ts`, `toSnapshot`). */
export function snapshotOf(render: FormulaRender): FormulaSnapshot {
  return {
    backend: render.backend,
    key: render.key,
    glyphs: render.glyphs.map((g) => ({
      label: g.label,
      center: boxCenter(g.bbox),
      size: boxSize(g.bbox),
    })),
  };
}

// ---- Where a line with ends on glyphs goes (scene/attach.ts, `fitLineClip`) ----

/** The two points `Line(start, end)` runs between once the line's clip starts, before its gap
 * (`raw`: an end on glyphs at the anchor's point, or at the edge the library finds towards the
 * other end for `auto`), and the line drawn between them once the gap is left (`drawn`, with the
 * part of an arc the gap took). Null when an end cannot be measured. `evaluator` must see every
 * track, hidden ones too (`Example.scene(project, { includeHidden: true })`). */
export function lineEnds(
  project: Project,
  evaluator: Pick<SceneEvaluator, 'points'>,
  clip: Clip,
): {
  raw: { start: Vec2; end: Vec2 };
  drawn: { start: Vec2; end: Vec2; trim: number };
} | null {
  const attach = clip.attach;
  if (attach?.rule !== 'ends') return null;
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula?.kind !== 'line') return null;
  const lib = project.meta.target;
  const from = lineEndInput(evaluator, lib, attach.start, clip.start);
  const to = lineEndInput(evaluator, lib, attach.end, clip.start);
  const raw = from && to && manimLineEnds(lib, from, to);
  if (!raw) return null;
  return { raw, drawn: drawnEnds(lib, formula.curve, raw, attach.buff) };
}

/** `project` with every line whose ends are on glyphs where the attach sync puts it — the vector
 * of its object (its first such clip fits it, as in the app; another clip of the same object runs
 * along that vector), the part of an arc its gap takes, its clip's position, unturned —, and its
 * snapshot taken from the line built for that vector. A line whose end cannot be measured keeps
 * its place. Only lines move: braces, shapes and labels keep the places the project gives them.
 * `evaluator` measures the glyphs, as `lineEnds` says. */
export function placeLines(project: Project, evaluator: Pick<SceneEvaluator, 'points'>): Project {
  const next = structuredClone(project);
  const lib = next.meta.target;
  const fitted = new Set<FormulaId>();
  const placed = new Map<ClipId, { position: Vec2; vector: Vec2; trim: number }>();
  for (const clip of project.clips) {
    if (clip.attach?.rule !== 'ends') continue;
    const formula = project.formulas.find((f) => f.id === clip.formulaId);
    if (formula?.kind !== 'line') continue;
    const fitsVector = !fitted.has(formula.id);
    fitted.add(formula.id);
    const ends = lineEnds(project, evaluator, clip);
    if (!ends) continue;
    const { drawn } = ends;
    const vector: Vec2 = fitsVector
      ? [drawn.end[0] - drawn.start[0], drawn.end[1] - drawn.start[1]]
      : formula.vector;
    const held = formula.curve?.shape === 'arc' ? formula.curve.trim : 0;
    const trim = fitsVector ? drawn.trim : held;
    const look = { ...formula, curve: withTrim(formula.curve, trim) };
    placed.set(clip.id, { position: lineCentre(lib, look, drawn.start, vector), vector, trim });
  }
  for (const clip of next.clips) {
    const placement = placed.get(clip.id);
    if (!placement) continue;
    clip.initial.position = [placement.position[0], placement.position[1]];
    clip.initial.rotation = 0;
    const formula = next.formulas.find((f) => f.id === clip.formulaId);
    if (formula?.kind !== 'line') continue;
    formula.vector = [placement.vector[0], placement.vector[1]];
    formula.curve = withTrim(formula.curve, placement.trim);
  }
  for (const formula of next.formulas) {
    if (formula.kind === 'line' && fitted.has(formula.id)) {
      formula.snapshot = snapshotOf(lineRender(formula, lib));
    }
  }
  return next;
}

/** Where each point of the compass is on the glyphs an end of a line is put on, at `t`: the
 * point Manim's `get_corner` / `get_left` … `get_center` reads of their box (the anchors' box in
 * ManimCE, every point's in ManimGL). Null when the glyphs cannot be measured. */
export function anchorPoints(
  project: Project,
  evaluator: Pick<SceneEvaluator, 'points'>,
  end: Pick<LineGlyphEnd, 'clipId' | 'glyphs'>,
  t: number,
): Record<Exclude<LineAnchor, 'auto'>, Vec2> | null {
  const out: Partial<Record<Exclude<LineAnchor, 'auto'>, Vec2>> = {};
  for (const anchor of COMPASS_ANCHORS) {
    const input = lineEndInput(evaluator, project.meta.target, { ...end, anchor }, t);
    if (!input || !('point' in input)) return null;
    out[anchor] = input.point;
  }
  return out as Record<Exclude<LineAnchor, 'auto'>, Vec2>;
}

/** Whether an end of a line is on glyphs (and not free at a point). */
export const onGlyphs = (end: LineEnd): end is LineGlyphEnd => isGlyphEnd(end);
