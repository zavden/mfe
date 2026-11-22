/* The Python animation of each operation (ARCHITECTURE §8): statements before the play it starts
 * in, the animation(s) themselves — one, or one per transfer pair — and statements after the play
 * it ends in. */
import {
  arcUndrawn,
  invert,
  isStraightSpline,
  multiply,
  sameColor,
  type Mat2D,
  type Vec2,
} from '../../geom';
import {
  DEFAULT_COLOR,
  EMPHASIS_DEFAULTS,
  glyphEnds,
  hasTips,
  pairRoutes,
  routePath,
  sourceStyle,
  tracesAsArrow,
  type ClipState,
  type Easing,
  type LineFormula,
  type TweenEnds,
  type Target,
  type PathSpline,
  type ShapeFormula,
  type TweenFit,
} from '../../model';
import {
  fitGap,
  glyphColor,
  endsAtStart,
  lineCurveBefore,
  measuredCurve,
  rebuildsLine,
  overridesEndedBy,
  placementLinear,
  type AppearEvent,
  type DisappearEvent,
  type EmphasisEvent,
  type IntroEvent,
  type OutroEvent,
  type PartTransformEvent,
  type TransferEvent,
  type ResolvedPair,
  type TweenEvent,
} from '../../scene';
import { colorLines, glyphArgs, glyphGroup, glyphRef, glyphsHolder, isAll } from './glyphs';
import { animateExpr, lagKw, num, point, quoted, vector } from './python';
import type { Codegen, ClipCtx, Op, Generated } from './context';
import { isWhole, mayUseWhole, stateAt } from './membership';
import { detachedShapeCall, lineConstruct } from './emitters';
import {
  fillColourCall,
  opacityChain,
  paintChain,
  paintedShape,
  repainted,
  tweenOpacityKw,
  tweenPaintKw,
} from './paint';
import { fitTargetGroup, fittedShapeCall, lineEndArg } from './attach';
import { cameraMove, reportFocusOn } from './camera';

const DEFAULT_RATE: Record<string, Easing> = {
  Write: 'linear',
  DrawBorderThenFill: 'double_smooth',
  Indicate: 'there_and_back',
};

/** 2×2 rows [[a, c], [b, d]] of a Mat2D's linear part, for `apply_matrix`. */
function matrixLiteral(m: Mat2D): string {
  return `[[${num(m[0])}, ${num(m[2])}], [${num(m[1])}, ${num(m[3])}]]`;
}

function placementTuple(s: ClipState): string {
  return `(${num(s.position[0])}, ${num(s.position[1])}, ${num(s.scale)}, ${num(s.rotation)}, ${
    s.flipX ? -1 : 1
  }, ${s.flipY ? -1 : 1})`;
}

export function generate(gen: Codegen, op: Op, sliced: boolean): Generated {
  switch (op.kind) {
    case 'intro':
    case 'appear':
      return intro(gen, op.event, op.clip, op.glyphs);
    case 'outro':
      return outro(gen, op.event, op.clip, op.glyphs, sliced);
    case 'disappear':
      return outro(gen, op.event, op.clip, op.glyphs, sliced, op.back);
    case 'leave':
    case 'place':
      return { pre: [], anims: [], post: [] };
    case 'tween':
      return tween(gen, op.event, op.clip, sliced);
    case 'transform':
      return partTransform(gen, op.event, op.clip, op.glyphs, sliced);
    case 'emphasis':
      return emphasis(gen, op.event, op.clip, op.glyphs);
    case 'transfer':
      return transfer(gen, op.event, op.from, op.to, op.pairs);
    case 'camera':
      return cameraMove(gen, op.leg, sliced);
  }
}

/** `rate_func=…` when it differs from the class default (smooth unless listed). */
/** The nodes of a custom path as the `_spline_path` helper reads them: `((u, v), in, out)` per
 * node, a handle `None` when it sits on its anchor. */
function splineLiteral(path: PathSpline): string {
  const pt = (p: readonly [number, number]): string => `(${num(p[0])}, ${num(p[1])})`;
  const handle = (p: readonly [number, number] | null): string => (p ? pt(p) : 'None');
  return `[${path.nodes.map((n) => `(${pt(n.at)}, ${handle(n.in)}, ${handle(n.out)})`).join(', ')}]`;
}

function rateKw(cls: string, easing: Easing): string[] {
  return easing === (DEFAULT_RATE[cls] ?? 'smooth') ? [] : [`rate_func=${easing}`];
}

function groupColor(ctx: ClipCtx, state: ClipState): string {
  return state.color ?? ctx.formula.formula.color;
}

/** An intro, or an appear block: the same animation on the glyphs it brings in. */
function intro(
  gen: Codegen,
  event: IntroEvent | AppearEvent,
  ctx: ClipCtx,
  all: number[],
): Generated {
  const glyphs = all.filter((g) => !ctx.present.has(g));
  if (glyphs.length === 0) return { pre: [], anims: [], post: [] };
  const whole = isWhole(ctx, glyphs, 'intro') && mayUseWhole(ctx, event.anim, event.lagRatio);
  // GL counts the group as stagger slot 0: a bare glyph would lose it, so always group.
  const group = glyphGroup(ctx.naming, glyphs, { whole, bare: gen.dialect.bareGlyph });
  for (const g of glyphs) ctx.present.add(g);
  const lag = lagKw(event.lagRatio);
  const state = stateAt(gen, ctx, event.start);
  let anim: string;
  switch (event.anim) {
    case 'write': {
      const kw = [...rateKw('Write', event.easing), ...lag];
      // ManimGL's Write traces every outline in `vmobject.get_color()` of the group it is
      // given, which is not the formula colour for a Tex or a fresh VGroup: say it.
      if (gen.target === 'gl') kw.unshift(`stroke_color=${quoted(groupColor(ctx, state))}`);
      anim = `Write(${[group, ...kw].join(', ')})`;
      break;
    }
    case 'draw_border_then_fill':
      anim = `DrawBorderThenFill(${[group, ...rateKw('DrawBorderThenFill', event.easing), ...lag].join(', ')})`;
      break;
    case 'create':
      anim = `${gen.dialect.create}(${[group, ...rateKw('Create', event.easing), ...lag].join(', ')})`;
      break;
    case 'fade_in':
      anim = `FadeIn(${[group, ...fadeKw(event), ...rateKw('FadeIn', event.easing), ...lag].join(', ')})`;
      break;
    case 'grow_from_center':
      anim = `GrowFromCenter(${[group, ...rateKw('GrowFromCenter', event.easing), ...lag].join(', ')})`;
      break;
    case 'grow_arrow': {
      // The arrow itself: ManimCE's GrowArrow scales it with its tips, which only an Arrow takes.
      // A bent arrow is drawn along its own way instead, its tip leading the stroke (D149): an
      // animation neither library has, written as a helper. A lag ratio staggers the members of
      // either, the shaft and then the tips, as the preview does (audit A5-03).
      const traced = tracesAsArrow(ctx.formula.formula);
      if (traced) gen.helpers.add('trace-arrow');
      const cls = traced ? '_TraceArrow' : 'GrowArrow';
      anim = `${cls}(${[ctx.naming.name, ...rateKw('GrowArrow', event.easing), ...lag].join(', ')})`;
      break;
    }
    case 'none':
      anim = '';
      break;
  }
  return { pre: [], anims: [anim], post: [] };
}

function fadeKw(event: IntroEvent | OutroEvent | AppearEvent | DisappearEvent): string[] {
  const kw: string[] = [];
  if (event.shift[0] !== 0 || event.shift[1] !== 0) kw.push(`shift=${vector(event.shift)}`);
  if (event.scale !== 1) kw.push(`scale=${num(event.scale)}`);
  return kw;
}

/** An outro, or a disappear block: the same animation on the glyphs it takes out. When some of
 * them come `back` later, a remover that would leave them degenerate is replaced by its
 * restoring subclass (helpers.ts). */
function outro(
  gen: Codegen,
  event: OutroEvent | DisappearEvent,
  ctx: ClipCtx,
  all: number[],
  sliced: boolean,
  back: ReadonlySet<number> = new Set(),
): Generated {
  // Only what is on screen: a glyph that never arrived must not flash in while fading out.
  const glyphs = all.filter((g) => ctx.present.has(g));
  if (glyphs.length === 0) return { pre: [], anims: [], post: [] };
  const restore = glyphs.some((g) => back.has(g));
  const whole = isWhole(ctx, glyphs, 'present') && mayUseWhole(ctx, event.anim, event.lagRatio);
  const group = (opts: { whole: boolean; bare: boolean }, list = glyphs) =>
    glyphGroup(ctx.naming, list, opts);
  const lag = lagKw(event.lagRatio);
  const bare = gen.dialect.bareGlyph;
  let anim: string;
  switch (event.anim) {
    case 'unwrite':
      if (gen.target === 'ce') {
        // Write(reverse=True) inverts the submobject order of the group it animates until it
        // finishes; a formula played in parts keeps its own order through a separate group.
        const g = whole && sliced ? glyphsHolder(ctx.naming, true) : group({ whole, bare });
        if (restore) {
          gen.helpers.add('restore-unwrite');
          anim = `_Unwrite(${[g, ...rateKw('Write', event.easing), ...lag].join(', ')})`;
        } else {
          anim =
            event.easing === 'linear'
              ? `Unwrite(${[g, ...lag].join(', ')})`
              : `Write(${[g, 'reverse=True', 'reverse_rate_function=True', `rate_func=${event.easing}`, ...lag, 'remover=True'].join(', ')})`;
        }
      } else {
        // ManimGL has no Unwrite: the helper plays Write backwards over the reversed glyphs.
        gen.helpers.add('unwrite');
        if (restore) gen.helpers.add('restore-unwrite');
        const color = groupColor(ctx, stateAt(gen, ctx, event.start));
        anim = `_Unwrite(${[group({ whole, bare: false }), `stroke_color=${quoted(color)}`, ...rateKw('Write', event.easing), ...lag].join(', ')})`;
      }
      break;
    case 'fade_out':
      anim = `FadeOut(${[group({ whole, bare }), ...fadeKw(event), ...rateKw('FadeOut', event.easing), ...lag].join(', ')})`;
      break;
    case 'shrink_to_center':
      if (restore) gen.helpers.add('restore-shrink');
      anim = `${restore ? '_' : ''}ShrinkToCenter(${[group({ whole, bare }), ...rateKw('ShrinkToCenter', event.easing), ...lag, 'remover=True'].join(', ')})`;
      break;
    case 'uncreate': {
      const rate =
        event.easing === 'smooth'
          ? []
          : gen.target === 'ce'
            ? [`rate_func=${event.easing}`]
            : [
                `rate_func=${event.easing === 'linear' ? 'lambda t: 1 - t' : `lambda t: ${event.easing}(1 - t)`}`,
              ];
      if (restore) gen.helpers.add('restore-uncreate');
      anim = `${restore ? '_' : ''}Uncreate(${[group({ whole, bare }), ...rate, ...lag].join(', ')})`;
      break;
    }
    case 'none':
      anim = '';
      break;
  }
  return { pre: [], anims: [anim], post: [] };
}

/** A tween that carries its shape to other glyphs (`TweenFit`, D123), as Manim does it: the new
 * shape is built on the target — by the constructor of the shape's kind, with the shape's gap, in
 * the colours and the paint the tween arrives with — in the statements before the play the tween
 * starts in, when Manim measures the target as the editor did, and `Transform` carries the one to
 * the other. A target the Python has no mobject for gets the new shape at the size and the place
 * the editor fitted it to. */
function fitTween(
  gen: Codegen,
  event: TweenEvent,
  ctx: ClipCtx,
  object: ShapeFormula,
  fit: TweenFit,
  size: { width: number; height: number },
): Generated {
  const { to } = event;
  const apart = repainted(ctx.clip, object);
  const f = apart ? paintedShape(object, to) : object;
  const colour = glyphColor(0, to, object);
  const group = fitTargetGroup(gen, fit);
  let call = group
    ? fittedShapeCall(gen, f, colour, to.opacity, group, fitGap(ctx.clip, object))
    : `${detachedShapeCall(gen.target, { ...f, ...size }, colour, to.opacity)}.move_to(${point(to.position)})`;
  if (apart) call += fillColourCall(f, to);
  const next = gen.names.take(`${ctx.naming.name}_to`);
  const rate = rateKw('Transform', event.easing);
  return {
    pre: [`${next} = ${call}`],
    anims: [`Transform(${[ctx.naming.name, next, ...rate].join(', ')})`],
    post: [],
  };
}

/** A tween that carries the ends of a line (`TweenEnds`, D144), as Manim does it
 * (`scene/lineStates.ts`). An arrow, a double arrow, and a line whose arc takes other degrees,
 * are built anew between the new ends — by the constructor the export always writes, on the
 * glyphs an end is on, in the colour and with the stroke width and the opacity the tween arrives
 * with — in the statements before the play the tween starts in, when Manim measures those glyphs
 * as the editor did, and `Transform` carries the one to the other. A line and a dashed line keep
 * their points: `line.animate.put_start_and_end_on(a, b)`, with `.set_stroke(width=…)`,
 * `.set_color(…)` and the opacity along; with an end on glyphs the two points are read off a
 * plain `Line` built on them in those statements, at the line's gap and arc. The dashes of a
 * spline have no ends for Manim to read: the `_carried` helper makes the copy, and `Transform`
 * plays it. An end on glyphs the Python has no mobject for is the point the editor measured. A
 * line away from the screen takes the line the tween leaves at once, with no animation — none at
 * all for an easing that comes back, which leaves it as it was (audit A5-05). */
function endsTween(
  gen: Codegen,
  event: TweenEvent,
  ctx: ClipCtx,
  line: LineFormula,
  ends: TweenEnds,
  sliced: boolean,
): Generated {
  const present = ctx.present.size > 0;
  if (!present && endsAtStart(event.easing)) return { pre: [], anims: [], post: [] };
  const { from, to } = event;
  const drawn = ends.drawn!;
  const { name } = ctx.naming;
  const rate = rateKw('Transform', event.easing);
  const state = { curve: lineCurveBefore(line, ctx.clip, event.actionId) };
  const measured = measuredCurve(state, ends);
  const width = to.strokeWidth ?? line.strokeWidth;
  const colour = glyphColor(0, to, line);
  const startArg = lineEndArg(gen, ends.start);
  const endArg = lineEndArg(gen, ends.end);
  // Manim measures the ends itself when one is on glyphs it has; else they are two points.
  const onGlyphs = startArg !== null && endArg !== null && glyphEnds(ends).length > 0;

  if (rebuildsLine(line, state, ends)) {
    const curve = measured?.shape === 'arc' ? { ...measured, trim: drawn.trim } : measured;
    const next = gen.names.take(`${name}_to`);
    const look: LineFormula = {
      ...line,
      vector: [drawn.end[0] - drawn.start[0], drawn.end[1] - drawn.start[1]],
      curve,
      strokeWidth: width,
    };
    // Between two points, an arc whose gap took a part of it is written from the points that
    // arc was built from, at that gap.
    const free =
      curve?.shape === 'arc'
        ? arcUndrawn(gen.target, drawn.start, drawn.end, curve.degrees, curve.trim)
        : { ...drawn, buff: 0 };
    const pre = onGlyphs
      ? lineConstruct(gen, next, look, startArg, endArg, ends.buff, colour)
      : lineConstruct(gen, next, look, point(free.start), point(free.end), free.buff, colour);
    if (to.opacity !== 1) pre.push(`${next}${opacityChain(look, to.opacity, gen.target)}`);
    // ManimCE's `Arrow` sets its stroke again from the width it was first asked whenever it is
    // scaled — a FadeOut scales it, by 1 —: it is told the width it has now.
    const post =
      gen.target === 'ce' &&
      hasTips(line.line) &&
      !endsAtStart(event.easing) &&
      width !== (from.strokeWidth ?? line.strokeWidth)
        ? [`${name}.initial_stroke_width = ${num(width)}`]
        : [];
    if (!present) return { pre: [...pre, `${name}.become(${next})`, ...post], anims: [], post: [] };
    return { pre, anims: [`Transform(${[name, next, ...rate].join(', ')})`], post };
  }

  // Carried: the two points, read off a plain line on the glyphs when an end is on some.
  // ManimGL's `put_start_and_end_on` subtracts the two points: arrays, not lists.
  const pre: string[] = [];
  let a = `np.array(${point(drawn.start)})`;
  let b = `np.array(${point(drawn.end)})`;
  if (onGlyphs) {
    const at = gen.names.take(`${name}_at`);
    const aux: LineFormula = {
      ...line,
      line: 'line',
      curve: measured?.shape === 'arc' ? measured : null,
    };
    const made = lineConstruct(gen, at, aux, startArg, endArg, ends.buff, DEFAULT_COLOR);
    pre.push(...made);
    a = `${at}.get_start()`;
    b = `${at}.get_end()`;
  }
  const chain: string[] = [];
  if (width !== (from.strokeWidth ?? line.strokeWidth)) {
    chain.push(`.set_stroke(width=${num(width)})`);
  }
  if (!sameColor(glyphColor(0, from, line), colour)) chain.push(`.set_color(${quoted(colour)})`);
  if (from.opacity !== to.opacity) chain.push(opacityChain(line, to.opacity, gen.target));
  if (line.line === 'dashed' && line.curve?.shape === 'spline') {
    gen.helpers.add('carried');
    const next = gen.names.take(`${name}_to`);
    pre.push(`${next} = _carried(${name}, ${a}, ${b})${chain.join('')}`);
    if (!present) return { pre: [...pre, `${name}.become(${next})`], anims: [], post: [] };
    return { pre, anims: [`Transform(${[name, next, ...rate].join(', ')})`], post: [] };
  }
  chain.unshift(`.put_start_and_end_on(${a}, ${b})`);
  if (!present) return { pre: [...pre, `${name}${chain.join('')}`], anims: [], post: [] };
  return { pre, anims: [animateExpr(name, rate, chain, sliced)], post: [] };
}

function tween(gen: Codegen, event: TweenEvent, ctx: ClipCtx, sliced: boolean): Generated {
  const { from, to } = event;
  const f = ctx.formula.formula;
  if (event.ends?.drawn && f.kind === 'line') {
    return endsTween(gen, event, ctx, f, event.ends, sliced);
  }
  if (event.fit?.to && f.kind === 'shape' && ctx.present.size > 0) {
    const action = ctx.clip.actions.find((a) => a.id === event.actionId);
    if (action?.kind === 'tween' && action.fit) {
      return fitTween(gen, event, ctx, f, action.fit, event.fit.to);
    }
  }
  const count = ctx.formula.count;
  const present = Array.from({ length: count }, (_, g) => g).filter((g) => ctx.present.has(g));
  const future = Array.from({ length: count }, (_, g) => g).filter(
    (g) => !ctx.present.has(g) && !ctx.gone.has(g),
  );
  const whole = isWhole(ctx, present, 'present');
  const rigid = from.rotation === to.rotation && from.flipX === to.flipX && from.flipY === to.flipY;
  const k = to.scale / from.scale;
  const d: Vec2 = [to.position[0] - from.position[0], to.position[1] - from.position[1]];
  const moved = d[0] !== 0 || d[1] !== 0;
  const colors = (glyphs: number[]) =>
    glyphs.map((g) => [glyphColor(g, from, f), glyphColor(g, to, f)] as const);
  const presentColors = colors(present);
  const changed = presentColors.filter(([a, b]) => !sameColor(a, b));
  const targets = new Set(presentColors.map(([, b]) => b.toUpperCase()));
  const uniformColor = changed.length > 0 && targets.size === 1 ? presentColors[0]![1] : null;
  const opacity = from.opacity !== to.opacity;
  const pre: string[] = [];
  const post: string[] = [];
  const rate = rateKw('Transform', event.easing);

  // Glyphs that arrive later through a relation follow the clip without being on screen.
  if (future.length > 0) {
    pre.push(...jump(gen.target, ctx, future, from, to, endsAtStart(event.easing) ? from : to));
  }
  if (present.length === 0) return { pre, anims: [], post };

  // Glyphs a part transform recoloured or faded: a tween that changes their colour or the clip
  // opacity takes over from its start (scene/anim/part.ts), so they first take the clip's own
  // colour / opacity; one left alone by the tween keeps its override.
  let overrideKept = false;
  for (const g of present) {
    const ended = overridesEndedBy(from, to, g, f);
    const over = ctx.partColor.get(g);
    const a = glyphColor(g, from, f);
    if (over !== undefined) {
      if (!ended.color) overrideKept = true;
      else if (!sameColor(over, a)) pre.push(`${glyphRef(ctx.naming, g)}.set_color(${quoted(a)})`);
    }
    const o = ctx.partOpacity.get(g);
    if (o !== undefined && ended.opacity && o !== from.opacity) {
      const paint = opacityChain(f, from.opacity, gen.target);
      if (paint) pre.push(`${glyphRef(ctx.naming, g)}${paint}`);
    }
  }
  // `.set_color` on the formula would recolour a kept override too: colour glyph by glyph then.
  const uniform = overrideKept ? null : uniformColor;
  // A shape its clip repaints: its paint goes from the one state's to the other's (paint.ts).
  const shape = repainted(ctx.clip, f) ? f : null;

  let anim: string;
  const literalTarget = ctx.naming.indexing === 'literal';
  if (rigid && (shape || changed.length === 0 || uniform || (whole && literalTarget))) {
    const chain: string[] = [];
    // `move_to` puts the centre the export's library reads where the project's library read it.
    // A line exported to the other library is moved by the vector between the two places instead:
    // each reads the centre of an arc, or of a dot tip, elsewhere (audit A4-05).
    const centred = f.kind !== 'line' || gen.target === gen.project.meta.target;
    if (whole && from.rotation === 0 && !ctx.partsMoved && centred) {
      if (k !== 1) chain.push(`.scale(${num(k)})`);
      if (moved) chain.push(`.move_to(${point(to.position)})`);
    } else {
      if (k !== 1) chain.push(`.scale(${num(k)}, about_point=${point(from.position)})`);
      if (moved) chain.push(`.shift(${vector(d)})`);
    }
    if (shape) chain.push(...paintChain(shape, from, to));
    else {
      if (uniform) chain.push(`.set_color(${quoted(uniform)})`);
      const fade = opacity ? opacityChain(f, to.opacity, gen.target) : '';
      if (fade) chain.push(fade);
    }
    if (!shape && changed.length > 0 && !uniform) {
      // Per-glyph colours on the whole formula: MoveToTarget, with the colours on the target.
      const name = ctx.naming.name;
      pre.push(`${name}.generate_target()`);
      if (chain.length > 0) pre.push(`${name}.target${chain.join('')}`);
      const recolour: [number, string][] = [];
      present.forEach((g, i) => {
        const [a, b] = presentColors[i]!;
        if (!sameColor(a, b)) recolour.push([g, b]);
      });
      pre.push(...colorLines({ ...ctx.naming, name: `${name}.target` }, recolour));
      anim = `MoveToTarget(${[name, ...rate].join(', ')})`;
    } else {
      const group = glyphGroup(ctx.naming, present, { whole, bare: true });
      // `.animate` makes a builder; `_Part` needs the animation itself.
      anim = animateExpr(group, rate, chain, sliced);
    }
  } else {
    gen.helpers.add('tween');
    // _Tween takes the submobjects of its group as the glyphs, in this order (colours follow
    // it), placeholders of unmatched glyphs included.
    const group =
      whole && literalTarget
        ? glyphsHolder(ctx.naming)
        : `VGroup(${glyphArgs(ctx.naming, present).join(', ')})`;
    const kw: string[] = [];
    if (changed.length > 0) {
      if (f.kind === 'shape' && (!opacity || f.style.strokeOpacity === 0))
        gen.helpers.add('tween-paint');
      kw.push(
        `colors=[${presentColors.map(([a, b]) => (sameColor(a, b) ? 'None' : `(${quoted(a)}, ${quoted(b)})`)).join(', ')}]`,
      );
    }
    if (shape) {
      gen.helpers.add('tween-style');
      kw.push(...tweenPaintKw(shape, from, to));
    } else if (opacity) kw.push(...tweenOpacityKw(f, from.opacity, to.opacity));
    anim = `_Tween(${[group, placementTuple(from), placementTuple(to), ...kw, ...rate].join(', ')})`;
  }
  return { pre, anims: [anim], post };
}

/** Statements that move `glyphs` from placement `from` to `to` at once (no animation). */
function jump(
  target: Target,
  ctx: ClipCtx,
  glyphs: number[],
  from: ClipState,
  requested: ClipState,
  to: ClipState,
): string[] {
  const f = ctx.formula.formula;
  const lines: string[] = [];
  // Moving the formula itself is fine here: nothing is animated, so nothing joins the scene.
  const whole = isAll(glyphs, ctx.formula.count) && ctx.gone.size === 0;
  const group = glyphGroup(ctx.naming, glyphs, { whole, bare: true });
  const m = multiply(placementLinear(to), invert(placementLinear(from)));
  const d: Vec2 = [to.position[0] - from.position[0], to.position[1] - from.position[1]];
  const chain: string[] = [];
  const isScale = Math.abs(m[1]) < 1e-12 && Math.abs(m[2]) < 1e-12 && Math.abs(m[0] - m[3]) < 1e-12;
  if (isScale) {
    if (Math.abs(m[0] - 1) > 1e-12)
      chain.push(`.scale(${num(m[0])}, about_point=${point(from.position)})`);
  } else {
    chain.push(`.apply_matrix(${matrixLiteral(m)}, about_point=${point(from.position)})`);
  }
  if (d[0] !== 0 || d[1] !== 0) chain.push(`.shift(${vector(d)})`);
  // A returning easing leaves the starting pose, but still expires earlier part paint on the
  // channels it touches. Match the visible tween's takeover without retaining its target pose.
  if (from.opacity !== requested.opacity) chain.push(opacityChain(f, to.opacity, target));
  if (chain.length > 0) lines.push(`${group}${chain.join('')}`);
  const recolour: [number, string][] = [];
  for (const g of glyphs) {
    const b = glyphColor(g, to, f);
    if (overridesEndedBy(from, requested, g, f).color) recolour.push([g, b]);
  }
  lines.push(...colorLines(ctx.naming, recolour));
  return lines;
}

/** A part transform (ARCHITECTURE §5): its glyphs on screen move as one `.animate` chain — scale
 * about the part's centre, then the shift, with the colour and opacity — or, when the block
 * rotates, as a `_Tween` about that centre (a true rotation, as the preview draws it). Glyphs
 * off screen take the end state at once, so that they come back in place. The pivot is the
 * centre of the part as Manim finds it when the block starts, off-screen glyphs included. */
function partTransform(
  gen: Codegen,
  event: PartTransformEvent,
  ctx: ClipCtx,
  all: number[],
  sliced: boolean,
): Generated {
  const live = all.filter((g) => !ctx.gone.has(g));
  const present = live.filter((g) => ctx.present.has(g));
  const absent = live.filter((g) => !ctx.present.has(g));
  const pre: string[] = [];
  const none: Generated = { pre, anims: [], post: [] };
  if (live.length === 0) return none;
  const f = ctx.formula.formula;
  const state = stateAt(gen, ctx, event.start);
  const colorOf = (g: number) => ctx.partColor.get(g) ?? glyphColor(g, state, f);
  const opacityOf = (g: number) => ctx.partOpacity.get(g) ?? state.opacity;
  const moves = event.shift[0] !== 0 || event.shift[1] !== 0;
  const scales = event.scale !== 1;
  const turns = event.rotation !== 0;
  const color =
    event.color !== null && live.some((g) => !sameColor(colorOf(g), event.color!))
      ? event.color
      : null;
  const opacity =
    event.opacity !== null && live.some((g) => opacityOf(g) !== event.opacity)
      ? event.opacity
      : null;
  if (!moves && !scales && !turns && color === null && opacity === null) return none;

  let pivot = '';
  if (scales || turns) {
    pivot = gen.names.take(`${ctx.naming.name}_pivot`);
    pre.push(
      `${pivot} = ${glyphGroup(ctx.naming, live, { whole: false, bare: true })}.get_center()`,
    );
  }
  const chain: string[] = [];
  if (scales) chain.push(`.scale(${num(event.scale)}, about_point=${pivot})`);
  if (turns) chain.push(`.rotate(${num(event.rotation)} * DEGREES, about_point=${pivot})`);
  if (moves) chain.push(`.shift(${vector(event.shift)})`);
  if (color !== null) chain.push(`.set_color(${quoted(color)})`);
  const fade = opacity === null ? '' : opacityChain(f, opacity, gen.target);
  if (fade) chain.push(fade);
  // Off screen, the end state at once — unless the block comes back to where it started.
  if (absent.length > 0 && !endsAtStart(event.easing)) {
    pre.push(`${glyphGroup(ctx.naming, absent, { whole: false, bare: true })}${chain.join('')}`);
  }
  if (present.length === 0) return none;

  const rate = rateKw('Transform', event.easing);
  if (!turns) {
    const group = glyphGroup(ctx.naming, present, { whole: false, bare: true });
    return { pre, anims: [animateExpr(group, rate, chain, sliced)], post: [] };
  }
  // A rotation: _Tween about the pivot, the colours and opacity along (see TWEEN_HELPER).
  gen.helpers.add('tween');
  const group = `VGroup(${glyphArgs(ctx.naming, present).join(', ')})`;
  const kw: string[] = [];
  if (color !== null) {
    if (f.kind === 'shape' && (opacity === null || f.style.strokeOpacity === 0))
      gen.helpers.add('tween-paint');
    kw.push(
      `colors=[${present
        .map((g) =>
          sameColor(colorOf(g), color) ? 'None' : `(${quoted(colorOf(g))}, ${quoted(color)})`,
        )
        .join(', ')}]`,
    );
  }
  if (opacity !== null) {
    // Each canonical glyph starts from its own paint, including independently faded Cross lines.
    const starts = present.map(opacityOf);
    // A pair per glyph, for the stroke too: the helper that reads lists of stroke pairs.
    if (!starts.every((o) => o === starts[0])) gen.helpers.add('tween-paint');
    kw.push(...tweenOpacityKw(f, starts, opacity));
  }
  const plus = (axis: 0 | 1) => {
    const v = event.shift[axis];
    return v === 0 ? '' : ` ${v < 0 ? '-' : '+'} ${num(Math.abs(v))}`;
  };
  const start = `(${pivot}[0], ${pivot}[1], 1, 0, 1, 1)`;
  const end = `(${pivot}[0]${plus(0)}, ${pivot}[1]${plus(1)}, ${num(event.scale)}, ${num(event.rotation)}, 1, 1)`;
  return { pre, anims: [`_Tween(${[group, start, end, ...kw, ...rate].join(', ')})`], post: [] };
}

/** An Emphasis block (D73) on the glyphs of the block on screen, as a group: `Indicate` and the
 * `_Wiggle` helper animate them; the `_Circumscribe` helper (both libraries: ManimGL has none,
 * and the frame takes the clip's layer), each library's own `Flash` and `FocusOn` are aimed at
 * the centre of the group as it is when the play starts — a point, so that neither follows the
 * glyphs afterwards, as the preview measures them once — with the Flash's lines on the clip's
 * layer and the FocusOn's disc over every track, so both are made in `pre` under a name. Manim's
 * defaults are left unwritten. Nothing is restored afterwards: every effect leaves the glyphs as
 * they were. */
function emphasis(gen: Codegen, event: EmphasisEvent, ctx: ClipCtx, all: number[]): Generated {
  const present = all.filter((g) => ctx.present.has(g));
  const none: Generated = { pre: [], anims: [], post: [] };
  if (present.length === 0) return none;
  const whole = isWhole(ctx, present, 'present');
  const group = glyphGroup(ctx.naming, present, { whole, bare: true });
  const defaults = EMPHASIS_DEFAULTS[event.effect];
  const colour = sameColor(event.color, defaults.color) ? [] : [`color=${quoted(event.color)}`];
  const unless = (value: number, standard: number, arg: string) =>
    value === standard ? [] : [`${arg}=${num(value)}`];
  switch (event.effect) {
    case 'indicate': {
      const kw = [
        ...unless(event.scale, defaults.scale, 'scale_factor'),
        ...colour,
        ...rateKw('Indicate', event.easing),
      ];
      return { pre: [], anims: [`Indicate(${[group, ...kw].join(', ')})`], post: [] };
    }
    case 'wiggle': {
      gen.helpers.add('wiggle');
      const kw = [
        ...unless(event.scale, defaults.scale, 'scale_value'),
        ...(event.angle === defaults.angle ? [] : [`rotation_angle=${num(event.angle)} * DEGREES`]),
        ...(event.wiggles === defaults.wiggles ? [] : [`n_wiggles=${event.wiggles}`]),
        ...rateKw('Wiggle', event.easing),
      ];
      return { pre: [], anims: [`_Wiggle(${[group, ...kw].join(', ')})`], post: [] };
    }
    case 'circumscribe': {
      gen.helpers.add('circumscribe');
      const kw = [
        ...unless(event.buff, defaults.buff, 'buff'),
        ...colour,
        ...unless(event.strokeWidth, defaults.strokeWidth, 'stroke_width'),
        ...unless(event.timeWidth, defaults.timeWidth, 'time_width'),
        ...(ctx.z === 0 ? [] : [`z_index=${ctx.z}`]),
        ...rateKw('Circumscribe', event.easing),
      ];
      return { pre: [], anims: [`_Circumscribe(${[group, ...kw].join(', ')})`], post: [] };
    }
    case 'flash': {
      // Each library's own tempo: no rate function (ManimGL would hand it to the group).
      const anim = `Flash(${[`${group}.get_center()`, ...colour].join(', ')})`;
      if (ctx.z === 0) return { pre: [], anims: [anim], post: [] };
      const name = gen.names.take(`${ctx.naming.name}_flash`);
      return {
        pre: [`${name} = ${anim}`, `${name}.lines.set_z_index(${ctx.z})`],
        anims: [name],
        post: [],
        variable: name,
      };
    }
    case 'focus_on': {
      const kw = [
        ...colour,
        ...unless(event.opacity, defaults.opacity, 'opacity'),
        ...rateKw('FocusOn', event.easing),
      ];
      const name = gen.names.take(`${ctx.naming.name}_focus`);
      // With the camera away from Manim's own frame, the disc is still sized for that frame.
      reportFocusOn(gen, event.start, [
        'clips',
        gen.project.clips.indexOf(ctx.clip),
        'actions',
        ctx.clip.actions.findIndex((action) => action.id === event.actionId),
      ]);
      return {
        pre: [
          `${name} = FocusOn(${[`${group}.get_center()`, ...kw].join(', ')})`,
          `${name}.mobject.set_z_index(${gen.project.tracks.length})`,
        ],
        anims: [name],
        post: [],
        variable: name,
      };
    }
  }
}

/** How a call of a transfer follows its path: with keywords of the animation, or, where its
 * pieces follow different paths, wrapped in the `_route_paths` helper with the list of them. */
interface CallPath {
  kw: string[];
  pieces: string | null;
}

function transfer(
  gen: Codegen,
  event: TransferEvent,
  from: ClipCtx,
  to: ClipCtx,
  pairs: ResolvedPair[],
): Generated {
  const pre: string[] = [];
  const anims: string[] = [];
  const rate = rateKw('Transform', event.easing);
  const arc = event.pathArc !== 0 ? [`path_arc=${num(event.pathArc)} * DEGREES`] : [];
  // A custom path (D48) is followed through the `_spline_path` helper instead of the arc; the
  // chord itself (two nodes without handles) is a straight path.
  const pathKw = (path: PathSpline | null): string[] => {
    if (!path) return arc;
    if (isStraightSpline(path)) return [];
    gen.helpers.add('spline');
    return [`path_func=_spline_path(${splineLiteral(path)})`];
  };
  /** A path as a function for the `_route_paths` helper: `None` plays straight. */
  const pathFn = (path: PathSpline | null): string => {
    if (!path) {
      return event.pathArc !== 0 ? `path_along_arc(${num(event.pathArc)} * DEGREES)` : 'None';
    }
    if (isStraightSpline(path)) return 'None';
    gen.helpers.add('spline');
    return `_spline_path(${splineLiteral(path)})`;
  };
  // The path of one call: the pair's, unless routes it plays have a path of their own (D167).
  // A call of one route follows that route's path, as a keyword (`kw`). A call that moves
  // several glyphs along different paths is wrapped instead (`pieces`): the `_route_paths` helper
  // gives each piece of the animation its path. Its list is the call's routes, which are its
  // pieces in the order Manim animates them — the two groups aligned (`pairRoutes`: one route for
  // each entry of the longer group) —, since a piece is told by its place and not by its points,
  // which two glyphs drawn on one spot share (D212).
  const callPath = (
    pair: ResolvedPair,
    style: ResolvedPair['style'],
    fromGlyphs: number[],
    toGlyphs: number[],
  ): CallPath => {
    const routes = pairRoutes({ from: fromGlyphs, to: toGlyphs, extras: 'merge' }, style);
    const paths = routes.map((r) => routePath(pair, r.from, r.to));
    if (paths.every((p) => p === pair.path)) return { kw: pathKw(pair.path), pieces: null };
    if (paths.every((p) => p === paths[0])) return { kw: pathKw(paths[0]!), pieces: null };
    gen.helpers.add('route-paths');
    const entries = routes.map(
      (r, i) =>
        `(${glyphRef(from.naming, r.from)}, ${glyphRef(to.naming, r.to)}, ${pathFn(paths[i]!)})`,
    );
    return { kw: [], pieces: `[${entries.join(', ')}]` };
  };
  // The preview draws a morph on the front-most of the two tracks.
  const raise = to.z > from.z ? to.z : null;
  // `extra`: a source beyond the first of a pair of several onto one target. In CE it plays as
  // a Transform that removes itself at the end (the target arrives through the first source):
  // a second Scene.replace onto one target would take the target out of the source formula's
  // submobject list and shift the indices of the glyphs after it. GL's add deduplicates.
  const emit = (
    style: ResolvedPair['style'],
    fromGlyphs: number[],
    toGlyphs: number[],
    path: CallPath,
    extra = false,
  ) => {
    const wrap = fromGlyphs.length > 1 || toGlyphs.length > 1;
    const src = glyphGroup(from.naming, fromGlyphs, { whole: false, bare: !wrap });
    const dst = glyphGroup(to.naming, toGlyphs, { whole: false, bare: !wrap });
    const args = (s: string, ...more: string[]) =>
      [s, dst, ...path.kw, ...rate, ...more].join(', ');
    const play = (anim: string) =>
      anims.push(path.pieces === null ? anim : `_route_paths(${anim}, ${path.pieces})`);
    const ceExtra = extra && gen.target === 'ce';
    if (style === 'fade_copy') {
      // A copy of the sources cross-fades into the targets, and the sources stay: the copy is
      // the animation's own, which removes it when it ends.
      const copy = raise !== null ? `${src}.copy().set_z_index(${raise})` : `${src}.copy()`;
      play(`FadeTransform(${args(copy)})`);
    } else if (style === 'copy') {
      const copy = raise !== null ? `${src}.copy().set_z_index(${raise})` : `${src}.copy()`;
      if (ceExtra) play(`Transform(${args(copy, 'remover=True')})`);
      else if (raise !== null) play(`ReplacementTransform(${args(copy)})`);
      else if (gen.target === 'gl') play(`TransformFromCopy(${args(src)})`);
      else play(`ReplacementTransform(${args(copy)})`);
    } else {
      if (raise !== null) pre.push(`${src}.set_z_index(${raise})`);
      if (style === 'fade') play(`FadeTransform(${args(src)})`);
      else if (ceExtra) play(`Transform(${args(src, 'remover=True')})`);
      else play(`ReplacementTransform(${args(src)})`);
    }
  };
  // Pairs that bring the same targets (D167): the first brings them, and the others arrive onto
  // them as the extra sources of one pair do.
  const brought = new Set<string>();
  for (const pair of pairs) {
    const targets = [...new Set(pair.to)].sort((a, b) => a - b).join(',');
    const again = brought.has(targets);
    brought.add(targets);
    // Several sources onto one target play as one call per source, lowest index first, unless
    // they merge (Manim's own alignment of the two groups): with `separate` every source
    // arrives, with `copies` every source but the principal sends a copy (D54; `sourceStyle`).
    if (pair.extras === 'merge') {
      emit(pair.style, pair.from, pair.to, callPath(pair, pair.style, pair.from, pair.to), again);
      continue;
    }
    [...new Set(pair.from)]
      .sort((a, b) => a - b)
      .forEach((g, i) => {
        const style = sourceStyle(pair, pair.style, g);
        emit(style, [g], pair.to, callPath(pair, style, [g], pair.to), again || i > 0);
      });
  }
  return { pre, anims, post: [] };
}
