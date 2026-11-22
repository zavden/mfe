/* What each kind of object can do (D61, D63): the table the UI and the validation consult instead
 * of asking for mathematical fields. A new kind adds its row here and its branch in `validate.ts`
 * (then its glyph producer in the engine and its emitter in the codegen). The prefix of the kind
 * to come is settled: `p` Pango text (D63). */
import { DEFAULT_SHAPE_DIAGONAL } from './defaults';
import { EmphasisKindSchema, IntroKindSchema, OutroKindSchema } from './schema';
import type {
  ActionId,
  AttachRule,
  AttachTarget,
  Clip,
  ClipAction,
  ClipAttach,
  ClipId,
  EmphasisAction,
  EmphasisKind,
  EndsAttach,
  Formula,
  FormulaKind,
  GlyphTarget,
  IntroKind,
  IntroSpec,
  LineEnd,
  LineGlyphEnd,
  OutroKind,
  ShapeDiagonal,
  ShapeFormula,
  ShapeKind,
  Target,
  TweenAction,
  TweenEnds,
  TweenFit,
  Vec2,
} from './types';

/** Every intro kind an object takes whatever it is, 'none' first: all but `grow_arrow`, which is
 * an arrow's alone (`introsOf`). */
export const INTRO_KINDS: readonly IntroKind[] = IntroKindSchema.options.filter(
  (kind) => kind !== 'grow_arrow',
);

/** Every outro kind, 'none' first. */
export const OUTRO_KINDS: readonly OutroKind[] = OutroKindSchema.options;

/** The Emphasis effects (D73), in the order the menus list them. */
export const EMPHASIS_KINDS: readonly EmphasisKind[] = EmphasisKindSchema.options;

export interface EmphasisInfo {
  /** Manim's name of the animation. */
  label: string;
  /** Whether the effect animates the glyphs themselves (an Indicate swells and recolours them,
   * a Wiggle rocks them: they are busy, as under a part Transform) or only measures them when it
   * starts and draws something of its own (a Circumscribe's frame, a Flash's lines, a FocusOn's
   * disc), which may run while a tween or another block moves them. */
  animates: boolean;
}

export const EMPHASIS: Readonly<Record<EmphasisKind, EmphasisInfo>> = {
  indicate: { label: 'Indicate', animates: true },
  wiggle: { label: 'Wiggle', animates: true },
  circumscribe: { label: 'Circumscribe', animates: false },
  flash: { label: 'Flash', animates: false },
  focus_on: { label: 'FocusOn', animates: false },
};

/** Whether `action` is an Emphasis block that only measures its glyphs when it starts
 * (`EMPHASIS[effect].animates` false): nothing of the clip is busy during it, and it must not
 * start while something is still drawing those glyphs (`measuringConflicts`). */
export function measuresOnly(action: ClipAction): action is EmphasisAction {
  return action.kind === 'emphasis' && !EMPHASIS[action.effect].animates;
}

export interface KindInfo {
  /** What the Creator calls one ("Formula"). */
  label: string;
  /** One character the Creator's list marks each object of the kind with (the label is its
   * tooltip). */
  mark: string;
  /** Prefix of the default names, numbered per prefix: `f1`, `f2`… (`nextFormulaName`). */
  namePrefix: string;
  /** Its glyphs come from its `source` text, and an empty source draws nothing (`isBlank`). A
   * kind without one draws geometry made of its own fields (a brace), and is never empty. */
  source: boolean;
  /** Its glyphs are coloured and hidden one by one: glyph colours, hidden glyphs, the glyph
   * pickers and Match colors apply. */
  glyphColors: boolean;
  /** Its source is LaTeX: the project preamble applies, and so do the LaTeX patterns of Match
   * colors (packages are a formula's own field, `packagesOf`). */
  latex: boolean;
  /** Its glyphs can be sent and received through relations and Morph blocks. */
  transfers: boolean;
  /** The intros and outros its clips may use. */
  intros: readonly IntroKind[];
  outros: readonly OutroKind[];
  /** Listed in the Creator on its own (an attached object is reached from its host instead). A
   * kind that is not listed lives with its clips: an object of it left without any goes too. */
  listed: boolean;
  /** The attach rule its objects hang by, when the rule fits the object to its target (a brace, a
   * shape, a line by its ends: the sync derives their shape as well as their place, and nothing
   * else attaches with that rule); null for the kinds placed beside their target with any other
   * rule. */
  fitted: AttachRule | null;
}

/** The intros and outros of a line: the ones that draw it or fade it. None that grows or shrinks
 * it about its centre: a line has no scale of its own, and ManimCE's `Arrow` keeps its tip's size
 * when it is scaled, so the two libraries would not grow it alike. */
const LINE_INTROS: readonly IntroKind[] = ['none', 'create', 'write', 'fade_in'];
const LINE_OUTROS: readonly OutroKind[] = ['none', 'uncreate', 'unwrite', 'fade_out'];

export const KINDS: Readonly<Record<FormulaKind, KindInfo>> = {
  math: {
    label: 'Formula',
    mark: '∑',
    namePrefix: 'f',
    source: true,
    glyphColors: true,
    latex: true,
    transfers: true,
    intros: INTRO_KINDS,
    outros: OUTRO_KINDS,
    listed: true,
    fitted: null,
  },
  tex: {
    label: 'Text (LaTeX)',
    mark: 'T',
    namePrefix: 't',
    source: true,
    glyphColors: true,
    latex: true,
    transfers: true,
    intros: INTRO_KINDS,
    outros: OUTRO_KINDS,
    listed: true,
    fitted: null,
  },
  text: {
    label: 'Text (font)',
    mark: 'P',
    namePrefix: 'p',
    source: true,
    glyphColors: true,
    latex: false,
    transfers: true,
    intros: INTRO_KINDS,
    outros: OUTRO_KINDS,
    listed: true,
    fitted: null,
  },
  brace: {
    label: 'Brace',
    mark: '⏟',
    namePrefix: 'b',
    source: false,
    glyphColors: false,
    latex: false,
    transfers: false,
    intros: INTRO_KINDS,
    outros: OUTRO_KINDS,
    listed: false,
    fitted: 'brace',
  },
  shape: {
    label: 'Shape',
    mark: '▢',
    namePrefix: 's',
    source: false,
    glyphColors: false,
    latex: false,
    transfers: false,
    intros: INTRO_KINDS,
    outros: OUTRO_KINDS,
    listed: false,
    fitted: 'shape',
  },
  line: {
    label: 'Line',
    mark: '↗',
    namePrefix: 'l',
    source: false,
    glyphColors: false,
    latex: false,
    transfers: false,
    intros: LINE_INTROS,
    outros: LINE_OUTROS,
    listed: false,
    fitted: 'ends',
  },
};

/** The intros an object takes, and what its Appear blocks can run: its kind's, and for an arrow
 * or a double arrow Manim's `GrowArrow` too, which grows it from its start (D145). A line without
 * a tip has none to grow: ManimCE's `GrowArrow` refuses it. */
export function introsOf(formula: Formula): readonly IntroKind[] {
  const { intros } = KINDS[formula.kind];
  return growsAsArrow(formula) ? [...intros, 'grow_arrow'] : intros;
}

/** Whether the clips of `formula` may come in with `intro` as it is: one of the intros it takes
 * (`introsOf`), and for a line a fade at its own size — a line has no scale of its own, and
 * validation refuses a fade with one (`line-animation`). */
export function takesIntro(formula: Formula, intro: Pick<IntroSpec, 'kind' | 'scale'>): boolean {
  if (!introsOf(formula).includes(intro.kind)) return false;
  return formula.kind !== 'line' || intro.kind !== 'fade_in' || intro.scale === 1;
}

/** Whether `formula` is an arrow or a double arrow, which `GrowArrow` grows. */
export function growsAsArrow(formula: Formula): boolean {
  return formula.kind === 'line' && (formula.line === 'arrow' || formula.line === 'double_arrow');
}

/** Whether the `GrowArrow` of `formula` draws it along its own way, its tip leading the stroke
 * (D149): a bent arrow or double arrow — an arc, a spline. Manim's own `GrowArrow`, which a
 * straight one keeps, scales the arrow about its start: a curve would only swell. */
export function tracesAsArrow(formula: Formula): boolean {
  return growsAsArrow(formula) && formula.kind === 'line' && formula.curve !== null;
}

/** Whether `rule` fits the object to its target (a brace's, a shape's, a line's): the sync derives
 * its shape and its turn as well as its place, so the clip is neither dragged nor turned by hand
 * while attached. */
export function isFittedRule(rule: AttachRule): boolean {
  return rule === 'brace' || rule === 'shape' || rule === 'ends';
}

/** Whether an end of a line is on glyphs of a clip (not free at a point). */
export function isGlyphEnd(end: LineEnd): end is LineGlyphEnd {
  return 'clipId' in end;
}

/** The ends of a line's attachment that are on glyphs, the start first. */
export function glyphEnds(attach: Pick<EndsAttach, 'start' | 'end'>): LineGlyphEnd[] {
  return [attach.start, attach.end].filter(isGlyphEnd);
}

/** Every target of an attachment: the glyphs of the clip it hangs on and, for a brace or a shape
 * that spans several clips (`also`, format 21), those of the others, in their order; for a line,
 * the glyphs each of its ends is on. The same of the fit of a tween (`TweenFit`): the glyphs it
 * carries its shape to. */
export function attachTargets(attach: ClipAttach | TweenFit): AttachTarget[] {
  if ('rule' in attach && attach.rule === 'ends') {
    return glyphEnds(attach).map(({ clipId, glyphs }) => ({ clipId, glyphs }));
  }
  const first = { clipId: attach.clipId, glyphs: attach.glyphs };
  return 'also' in attach && attach.also ? [first, ...attach.also] : [first];
}

/** A tween that carries its shape to surround other glyphs (D123). */
export type FitTween = TweenAction & { fit: TweenFit };

/** The tweens of `clip` that carry its shape to other glyphs, in the clip's order. */
export function fitTweens(clip: Pick<Clip, 'actions'>): FitTween[] {
  return clip.actions.filter(
    (action): action is FitTween => action.kind === 'tween' && action.fit !== undefined,
  );
}

/** A tween that carries the ends of its line elsewhere (D144). */
export type EndsTween = TweenAction & { ends: TweenEnds };

/** The tweens of `clip` that carry the ends of its line, in the clip's order. */
export function endsTweens(clip: Pick<Clip, 'actions'>): EndsTween[] {
  return clip.actions.filter(
    (action): action is EndsTween => action.kind === 'tween' && action.ends !== undefined,
  );
}

/** Where the freed `side` end of the ends the tween `tweenId` of the clip `clipId` carries its line
 * to is given to Manim, for the line to stay drawn where it was, beside an end that stays on
 * glyphs: Manim leaves the gap at a free end too, so the point is the gap further out, from the
 * glyphs of the other end — the scene's to measure (`freedEndPoint`, scene/attach.ts), not the
 * model's. Null when it cannot be worked out. */
export type FreedEndPoint = (
  clipId: ClipId,
  tweenId: ActionId,
  side: 'start' | 'end',
) => Vec2 | null;

/** Free the `side` end of the ends a tween carries its line to (mutates), once the glyphs it was on
 * are gone, the line left drawn where it was (`drawn`): beside an end that stays on glyphs, at the
 * point Manim is given for it to end there (`given`; with none, at the point it was drawn at);
 * beside a free end, at the point it was drawn at, and the other at its own — two free ends are
 * the points the line runs between, with no gap. A tween that was never measured has no such point:
 * it keeps the line as it is (its `ends` go). */
export function freeTweenEnd(
  tween: TweenAction,
  side: 'start' | 'end',
  given: Vec2 | null = null,
): void {
  const { ends } = tween;
  if (!ends) return;
  const { drawn } = ends;
  if (!drawn) {
    delete tween.ends;
    return;
  }
  const other = side === 'start' ? 'end' : 'start';
  const at = ([x, y]: Vec2): LineEnd => ({ point: [x, y] });
  if (isGlyphEnd(ends[other])) {
    ends[side] = at(given ?? drawn[side]);
    return;
  }
  ends[side] = at(drawn[side]);
  ends[other] = at(drawn[other]);
}

/** Every clip `clip` is placed by: the targets of its attachment, of the fits of its tweens and
 * of the ends its tweens carry its line to. */
export function placementTargets(clip: Pick<Clip, 'attach' | 'actions'>): AttachTarget[] {
  return [
    ...(clip.attach ? attachTargets(clip.attach) : []),
    ...fitTweens(clip).flatMap((tween) => attachTargets(tween.fit)),
    ...endsTweens(clip).flatMap((tween) =>
      glyphEnds(tween.ends).map(({ clipId, glyphs }) => ({ clipId, glyphs })),
    ),
  ];
}

/** Whether an attachment has glyphs of several clips for a target — a brace or a shape over
 * several, a line between two —: such an object is freed, not deleted, when one of those clips
 * goes. */
export function spansClips(attach: ClipAttach): boolean {
  if (attach.rule === 'ends') return new Set(glyphEnds(attach).map((end) => end.clipId)).size > 1;
  return 'also' in attach && attach.also !== undefined && attach.also.length > 0;
}

/** How Manim's mobject of an object holds its glyphs: a TeX mobject (`tex`: ManimCE wraps them
 * in one submobject, `f1[0][g]`; ManimGL's are its submobjects, `f1[g]`), the mobject that is its
 * one glyph itself (`self`: ManimCE's brace, a box, a circle, an underline), or a group whose
 * submobjects are the glyphs in both libraries (`submobjects`: a cross's two lines, ManimGL's
 * brace, the dashes of a dashed line), or the mobject and its submobjects after it (`family`: an
 * arrow, whose shaft is the line itself and whose tips are its submobjects). The codegen addresses
 * the glyphs by it, and the evaluator knows that ManimGL's animations stagger the mobject's
 * family, which starts with the mobject itself — a slot before the glyphs — unless it is a
 * glyph. */
export type GlyphMembers = 'tex' | 'self' | 'submobjects' | 'family';

/** Whether a shape is laid over the corners of its target's box, as Manim's `Cross` is — a cross
 * and a cross line: it is as large as the target, and takes no gap. */
export function overCorners(shape: ShapeKind): boolean {
  return shape === 'cross' || shape === 'cross_line';
}

/** The diagonal a cross line runs along: the one it names, else the rising one. */
export function diagonalOf(formula: Pick<ShapeFormula, 'diagonal'>): ShapeDiagonal {
  return formula.diagonal ?? DEFAULT_SHAPE_DIAGONAL;
}

export function glyphMembers(formula: Formula, target: Target): GlyphMembers {
  if (formula.kind === 'text') return 'submobjects';
  if (formula.kind === 'brace') return target === 'ce' ? 'self' : 'submobjects';
  if (formula.kind === 'shape') return formula.shape === 'cross' ? 'submobjects' : 'self';
  if (formula.kind === 'line') {
    if (formula.line === 'dashed') return 'submobjects';
    return formula.line === 'line' ? 'self' : 'family';
  }
  return 'tex';
}

/** Whether a block animates `formula` whole, never a part of it: an arrow or a double arrow, whose
 * mobject is its shaft and holds its tips as its submobjects (`family`), so that the Python has no
 * name for the shaft without its tips (audit A5-07; the owner's decision: the blocks of an arrow
 * take the whole arrow). The editor gives such a block every glyph, and validation refuses one
 * that names a part (`arrow-part`, `namesArrowPart`). */
export function animatedWhole(formula: Formula): boolean {
  return (['ce', 'gl'] as const).some((target) => glyphMembers(formula, target) === 'family');
}

/** Whether `glyphs`, a block's, name a part of `formula` that is animated whole (`animatedWhole`):
 * some of its glyphs, not all of them. Its glyphs are those of its snapshot or, never rendered, its
 * shaft and its tips (two, three for a double arrow); one it does not have does not count
 * (`glyph-range` says it), and a list of none names no part (`action-empty`). */
export function namesArrowPart(formula: Formula, glyphs: GlyphTarget): boolean {
  if (glyphs === 'all' || formula.kind !== 'line' || !animatedWhole(formula)) return false;
  const count = formula.snapshot?.glyphs.length ?? (formula.line === 'double_arrow' ? 3 : 2);
  const named = new Set(glyphs.filter((glyph) => glyph >= 0 && glyph < count));
  return named.size > 0 && named.size < count;
}

/** Whether `formula` draws nothing: an object with a source and none written. The render sync,
 * the exports and the Creator ask this, never the source itself (a brace has none). */
export function isBlank(formula: Pick<Formula, 'kind' | 'source'>): boolean {
  return KINDS[formula.kind].source && formula.source.trim() === '';
}

/** The `\usepackage` names of an object: a formula's packages; a text has none of its own (the
 * project preamble serves it). */
export function packagesOf(formula: Formula): string[] {
  return formula.kind === 'math' ? formula.packages : [];
}

/** What `formula`'s kind can do. */
export function kindOf(formula: Pick<Formula, 'kind'>): KindInfo {
  return KINDS[formula.kind];
}

/** `f1`, `f2`, … the first name with the kind's prefix not in use, counting from the number of
 * objects of that kind plus one (names keep growing as objects come and go). */
export function nextFormulaName(
  kind: FormulaKind,
  formulas: readonly Pick<Formula, 'kind' | 'name'>[],
): string {
  const { namePrefix } = KINDS[kind];
  const used = new Set(formulas.map((f) => f.name));
  const count = formulas.filter((f) => f.kind === kind).length;
  for (let n = count + 1; ; n++) if (!used.has(`${namePrefix}${n}`)) return `${namePrefix}${n}`;
}
