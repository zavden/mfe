/* Objects attached to glyphs of another clip (`clip.attach`, R4; ARCHITECTURE §5 "Attached
 * objects", §8): the Python places the mobject beside the target glyphs in the instant step where
 * its clip starts — `f2.next_to(f1[0][2:5], DOWN, buff=0.25)` —, builds a brace on them there,
 * `b1 = Brace(f1[0][2:5], DOWN, buff=0.2)` (D66), puts a label at a brace's tip,
 * `b1.put_at_tip(f2, buff=0.25)` (D69), or fits a shape to them there, `s1 =
 * SurroundingRectangle(f1[0][2:5], buff=0.1, color="#FFFF00")` (D71): exact by construction,
 * since Manim measures the real glyphs at that instant, as the evaluator did to place the
 * preview. A brace or a shape over glyphs of several clips (`attach.also`, D117) is built on a
 * group of them, `b1 = Brace(VGroup(f1[0][2:5], f2[0][0]), DOWN, buff=0.2)`. The clip's setup
 * leaves a placed mobject where its constructor put it (no `move_to`), and writes nothing for a
 * brace or a shape built here. */
import { sameColor } from '../../geom';
import {
  attachTargets,
  diagonalOf,
  DEFAULT_BRACE_SHARPNESS,
  DEFAULT_COLOR,
  isFittedRule,
  isGlyphEnd,
  KINDS,
  labelBuff,
  placementUses,
  type AttachSide,
  type BraceAttach,
  type Clip,
  type ClipAttach,
  type ClipId,
  type EndsAttach,
  type GlyphTarget,
  type LineAnchor,
  type LineEnd,
  type NextToAttach,
  type Project,
  type ShapeAttach,
  type ShapeFormula,
  type TipAttach,
  type TweenFit,
} from '../../model';
import type { Codegen, ClipCtx, Op } from './context';
import { emitterOf, lineConstruct, shapeStyleArgs, strokeArgs } from './emitters';
import { glyphGroup, glyphSetupLines, isAll } from './glyphs';
import { fillColourCall, opacityChain, paintedShape, repainted } from './paint';
import { num, point, quoted } from './python';

const SIDE_NAMES: Record<AttachSide, string> = {
  down: 'DOWN',
  up: 'UP',
  left: 'LEFT',
  right: 'RIGHT',
};

export interface AttachmentPlan {
  /** Targets whose initial geometry must exist before their visibility/placement time. */
  initialTargets: ReadonlySet<ClipId>;
  /** Every use of these fitted objects uses the same settled formula dimensions. */
  sharedFits: ReadonlySet<string>;
}

/** Construction, placement and visibility have different readiness times. An early consumer
 * reads its target's settled future initial state; a shared fit belongs to the first attached
 * clip in project order, regardless of which clip appears first. A consumer is a clip attached
 * to the target, or a tween that carries its shape to it (`fit`), early when it starts before
 * the target's clip. Of a fit's targets only the attached ones count: any other clip is built
 * and placed by its setup already, and a scene with none of these needs no settled geometry. */
export function attachmentPlan(project: Project): AttachmentPlan {
  const initialTargets = new Set<ClipId>();
  const counts = new Map<string, number>();
  const fitted = new Set<string>();
  const byId = new Map(project.clips.map((c) => [c.id, c]));
  for (const clip of project.clips) {
    counts.set(clip.formulaId, (counts.get(clip.formulaId) ?? 0) + 1);
    // A target that starts after what measures it — the attached clip, the tween — is early.
    for (const use of placementUses(clip)) {
      for (const spot of use.spots) {
        const target = byId.get(spot.target.clipId);
        if (!target || (use.owner.kind !== 'attach' && !target.attach)) continue;
        if (use.at < target.start - 1e-9) initialTargets.add(target.id);
      }
    }
    const attach = clip.attach;
    if (!attach) continue;
    const kind = project.formulas.find((f) => f.id === clip.formulaId)?.kind;
    if (kind && KINDS[kind].fitted === attach.rule) fitted.add(clip.formulaId);
  }
  return {
    initialTargets,
    sharedFits: new Set([...fitted].filter((id) => counts.get(id)! > 1)),
  };
}

/** The glyphs of a target that an attachment names, among those Manim has. */
function targetGlyphs(glyphs: GlyphTarget, count: number): number[] {
  return glyphs === 'all'
    ? Array.from({ length: count }, (_, g) => g)
    : glyphs.filter((g) => g < count);
}

/** Whether the chain of attachments from `clip` comes back to a clip it went through, by any of
 * the targets of each. */
function goesRound(clip: Clip, byId: ReadonlyMap<ClipId, Clip>): boolean {
  const ending = new Set<ClipId>();
  const walk = (at: Clip, chain: ReadonlySet<ClipId>): boolean => {
    if (chain.has(at.id)) return true;
    if (ending.has(at.id)) return false;
    const next = new Set(chain).add(at.id);
    // The chain is the attachments': what a tween's fit goes to is measured when the tween
    // starts, not when its clip is built.
    for (const use of placementUses(at)) {
      if (use.owner.kind !== 'attach') continue;
      for (const spot of use.spots) {
        const target = byId.get(spot.target.clipId);
        if (target && walk(target, next)) return true;
      }
    }
    ending.add(at.id);
    return false;
  };
  return walk(clip, new Set());
}

/** An attachment the Python can place: its target is another clip that is exported, with at
 * least one of the glyphs named — each of its targets, when a brace or a shape spans several
 * clips —, the chain of attachments ends somewhere, a brace rule hangs a brace and a shape rule a
 * shape, and a tip label hangs on a brace. Early targets are prepared invisibly in their settled
 * future initial state; they need not be on screen to be measured. Otherwise the clip is placed
 * like any other, by the position the project holds. */
export function placeableAttachment(gen: Codegen, clip: Clip): ClipAttach | null {
  const attach = clip.attach;
  if (!attach) return null;
  const kind = gen.project.formulas.find((f) => f.id === clip.formulaId)?.kind;
  const fitted = kind === undefined ? null : KINDS[kind].fitted;
  if (fitted ? attach.rule !== fitted : isFittedRule(attach.rule)) return null;
  const byId = new Map(gen.project.clips.map((c) => [c.id, c]));
  if (goesRound(clip, byId)) return null;
  for (const spot of attachTargets(attach)) {
    const target = byId.get(spot.clipId);
    const formula = target && gen.formulaCtx.get(target.formulaId);
    if (!target || target === clip || !formula) return null;
    if (attach.rule === 'tip' && formula.formula.kind !== 'brace') return null;
    if (targetGlyphs(spot.glyphs, formula.count).length === 0) return null;
  }
  return attach;
}

/** The glyphs of one target as the Python names them: the whole mobject, a glyph, a slice or a
 * group. */
function glyphsOf(target: ClipCtx, named: GlyphTarget): string {
  const count = target.formula.count;
  const glyphs = targetGlyphs(named, count);
  return glyphGroup(target.naming, glyphs, { whole: isAll(glyphs, count), bare: true });
}

/** The target of an attachment as the Python names it: the glyphs of the clip it hangs on, or —
 * for a brace or a shape that spans several clips — a `VGroup` of those of each, which Manim
 * measures as one group. */
function targetGroup(gen: Codegen, attach: ClipAttach | TweenFit): string {
  const groups = attachTargets(attach).flatMap((spot) => {
    const target = gen.clipCtx.get(spot.clipId);
    return target ? [glyphsOf(target, spot.glyphs)] : [];
  });
  return groups.length === 1 ? groups[0]! : `VGroup(${groups.join(', ')})`;
}

/** `f2.next_to(f1[0][2:5], DOWN, buff=0.25)`. */
export function placementLine(ctx: ClipCtx, target: ClipCtx, attach: NextToAttach): string {
  return `${ctx.naming.name}.next_to(${glyphsOf(target, attach.glyphs)}, ${SIDE_NAMES[attach.side]}, buff=${num(attach.buff)})`;
}

/** `b1.put_at_tip(f2, buff=0.25)`: the label beside the brace's tip, at its own gap or at the one
 * `Brace.get_tex` leaves in the target library — always written, since ManimGL's `put_at_tip`
 * alone would leave `next_to`'s. */
export function tipLine(gen: Codegen, ctx: ClipCtx, target: ClipCtx, attach: TipAttach): string {
  return `${target.naming.name}.put_at_tip(${ctx.naming.name}, buff=${num(labelBuff(attach, gen.target))})`;
}

/** A brace's direction as Manim takes it: a side's constant, else DOWN turned by the degrees. */
export function braceDirection(degrees: number): string {
  const turn = ((degrees % 360) + 360) % 360;
  for (const [at, name] of [
    [0, 'DOWN'],
    [90, 'RIGHT'],
    [180, 'UP'],
    [270, 'LEFT'],
  ] as const) {
    if (Math.abs(turn - at) < 1e-9) return name;
  }
  return `rotate_vector(DOWN, ${num(degrees)} * DEGREES)`;
}

/** The lines that build a brace on its target where its clip starts — `b1 = Brace(f1[0][2:5],
 * DOWN, buff=0.2)`, with ManimCE's sharpness when it is not Manim's — and what the clip's setup
 * writes for any other mobject (prepare.ts): its colour (ManimCE's constructor takes it, ManimGL's
 * `Tex` ignores it, so `set_color` after), its opacity and its layer. */
export function braceLines(gen: Codegen, ctx: ClipCtx, attach: BraceAttach): string[] {
  const f = ctx.formula.formula;
  if (f.kind !== 'brace') return [];
  if (gen.attachments.sharedFits.has(f.id)) return sharedFitLines(gen, ctx, attach);
  const { name } = ctx.naming;
  const args = [targetGroup(gen, attach), braceDirection(attach.direction)];
  args.push(`buff=${num(attach.buff)}`);
  if (gen.target === 'ce' && Math.abs(f.sharpness - DEFAULT_BRACE_SHARPNESS) > 1e-9) {
    args.push(`sharpness=${num(f.sharpness)}`);
  }
  const base = ctx.clip.initial.color ?? f.color;
  const tinted = !sameColor(base, DEFAULT_COLOR);
  if (tinted && gen.target === 'ce') args.push(`color=${quoted(base)}`);
  const lines = [`${name} = Brace(${args.join(', ')})`];
  if (tinted && gen.target === 'gl') lines.push(`${name}.set_color(${quoted(base)})`);
  lines.push(...glyphSetupLines(gen, ctx, true));
  if (ctx.clip.initial.opacity !== 1) {
    lines.push(`${name}.set_opacity(${num(ctx.clip.initial.opacity)})`);
  }
  if (ctx.z !== 0) lines.push(`${name}.set_z_index(${ctx.z})`);
  return [...lines, ...fittedPoseLines(gen, ctx)];
}

/** The lines that build a line on its ends where its clip starts — `l1 = Arrow(f1[0][0:2],
 * f2[0])`, `l1 = Line([-1, 2, 0], f2[0][3].get_left(), buff=0.1)` —: each end is the glyphs it is
 * on, which Manim finds the edge of towards the other end, the point of their box its anchor
 * names (`ANCHOR_CALLS`), or its own point (`lineConstruct`). Then what the
 * clip's setup writes for any other mobject: its opacity and its layer. A line object with
 * several clips is built where the project has each of them instead, between two points: the
 * clips share one vector, which only the first of them is fitted to. */
export function lineLines(gen: Codegen, ctx: ClipCtx, attach: EndsAttach): string[] {
  const f = ctx.formula.formula;
  if (f.kind !== 'line') return [];
  const { name } = ctx.naming;
  const base = ctx.clip.initial.color ?? f.color;
  const side = (end: LineEnd): string => lineEndArg(gen, end) ?? point(endPoint(end));
  const lines = gen.attachments.sharedFits.has(f.id)
    ? emitterOf(f).construct(gen, ctx, base, f)
    : lineConstruct(gen, name, f, side(attach.start), side(attach.end), attach.buff, base);
  lines.push(...glyphSetupLines(gen, ctx, true));
  if (ctx.clip.initial.opacity !== 1) {
    lines.push(`${name}${opacityChain(f, ctx.clip.initial.opacity, gen.target)}`);
  }
  if (ctx.z !== 0) lines.push(`${name}.set_z_index(${ctx.z})`);
  return lines;
}

/** An end of a line as Manim's `Line` is given it: its point, or the glyphs it is on — which
 * Manim finds the edge of towards the other end — or the point of their box its anchor names.
 * Null for an end on glyphs the Python has no mobject for (a clip that is not exported, none of
 * the glyphs named). */
export function lineEndArg(gen: Codegen, end: LineEnd): string | null {
  if (!isGlyphEnd(end)) return point(end.point);
  const host = gen.clipCtx.get(end.clipId);
  if (!host || targetGlyphs(end.glyphs, host.formula.count).length === 0) return null;
  const glyphs = glyphsOf(host, end.glyphs);
  return end.anchor === 'auto' ? glyphs : `${glyphs}.${ANCHOR_CALLS[end.anchor]}`;
}

/** What reads each anchor of an end off the glyphs it is on (D140): a corner of their box, the
 * middle of a side, their centre — the same names in both libraries. */
const ANCHOR_CALLS: Record<Exclude<LineAnchor, 'auto'>, string> = {
  ul: 'get_corner(UL)',
  up: 'get_top()',
  ur: 'get_corner(UR)',
  left: 'get_left()',
  center: 'get_center()',
  right: 'get_right()',
  dl: 'get_corner(DL)',
  down: 'get_bottom()',
  dr: 'get_corner(DR)',
};

/** The point of a free end; the origin for one that is on glyphs (never asked: see above). */
const endPoint = (end: LineEnd): [number, number] => ('point' in end ? end.point : [0, 0]);

/** The lines that fit a shape to its target where its clip starts, each shape by its Manim class
 * with the colour always written (Manim's defaults differ per class and per library) and the
 * style and the clip's opacity folded into the constructor (`shapeStyleArgs`): a box,
 * `SurroundingRectangle(f1[0][2:5], buff=0.1, color=…)`, rounded by `corner_radius=` in ManimCE
 * and `.round_corners()` in ManimGL, which has no such argument; a circle, the `_circle_around`
 * helper (through the corners of the box, `buff` further out: each library's own
 * `Circle.surround` means something else); an underline, `Underline(…, buff=…)`, told in ManimGL
 * to keep a plain stroke and not to stretch (its defaults taper the stroke and stretch by 1.2);
 * a cross, `Cross(…, stroke_color=…)`, with its stroke width always written in ManimGL (its
 * default is tapered). Then the layer, as the clip's setup writes it for any mobject. */
export function shapeLines(gen: Codegen, ctx: ClipCtx, attach: ShapeAttach): string[] {
  const object = ctx.formula.formula;
  if (object.kind !== 'shape') return [];
  if (gen.attachments.sharedFits.has(object.id)) return sharedFitLines(gen, ctx, attach);
  // A shape its clip repaints is built with the paint of the clip's first state, and with the
  // colour of its fill said (paint.ts).
  const apart = repainted(ctx.clip, object);
  const f = apart ? paintedShape(object, ctx.clip.initial) : object;
  const { name } = ctx.naming;
  let call = fittedShapeCall(
    gen,
    f,
    ctx.clip.initial.color ?? f.color,
    ctx.clip.initial.opacity,
    targetGroup(gen, attach),
    attach.buff,
  );
  if (apart) call += fillColourCall(f, ctx.clip.initial);
  const lines = [`${name} = ${call}`];
  lines.push(...glyphSetupLines(gen, ctx, true));
  if (ctx.z !== 0) lines.push(`${name}.set_z_index(${ctx.z})`);
  return [...lines, ...fittedPoseLines(gen, ctx)];
}

/** The constructor of the shape `f` fitted to `group` (a target as the Python names it), `gap`
 * away, in the colour `base` and at the clip opacity `opacity`: what `shapeLines` says of each
 * shape. */
export function fittedShapeCall(
  gen: Codegen,
  f: ShapeFormula,
  base: string,
  opacity: number,
  group: string,
  gap: number,
): string {
  const colour = quoted(base);
  const style = shapeStyleArgs(f, opacity, gen.target);
  const buff = `buff=${num(gap)}`;
  let call: string;
  switch (f.shape) {
    case 'box': {
      const args = [group, buff, `color=${colour}`];
      const round = f.cornerRadius > 0;
      if (round && gen.target === 'ce') args.push(`corner_radius=${num(f.cornerRadius)}`);
      call = `SurroundingRectangle(${[...args, ...style].join(', ')})`;
      if (round && gen.target === 'gl') call += `.round_corners(${num(f.cornerRadius)})`;
      break;
    }
    case 'circle':
      gen.helpers.add('circle');
      call = `_circle_around(${[group, buff, `color=${colour}`, ...style].join(', ')})`;
      break;
    case 'underline': {
      const args =
        gen.target === 'ce'
          ? [group, buff, `color=${colour}`, ...style]
          : [
              group,
              buff,
              `stroke_color=${colour}`,
              `stroke_width=${num(f.style.strokeWidth)}`,
              'stretch_factor=1',
              ...style.filter((a) => !a.startsWith('stroke_width=')),
            ];
      call = `Underline(${args.join(', ')})`;
      break;
    }
    case 'cross': {
      // Its lines take the stroke it names; an opacity goes to them afterwards.
      const args = [group, `stroke_color=${colour}`];
      const width = style.find((a) => a.startsWith('stroke_width='));
      if (width) args.push(width);
      const faded = style.find((a) => a.startsWith('stroke_opacity='));
      call = `Cross(${args.join(', ')})${faded ? `.set_stroke(opacity=${faded.slice('stroke_opacity='.length)})` : ''}`;
      break;
    }
    case 'cross_line': {
      // One of the lines Manim's `Cross` lays over the target, from the corner its diagonal
      // starts at (`_cross_line`); it has no gap, as a cross has none.
      gen.helpers.add('cross-line');
      const args = [group];
      if (diagonalOf(f) === 'ul_dr') args.push('rising=False');
      call = `_cross_line(${[...args, `color=${colour}`, ...strokeArgs(style)].join(', ')})`;
      break;
    }
  }
  return call;
}

/** The target of a tween's fit as the Python names it (`targetGroup`), or null when one of its
 * clips is not exported or has none of the glyphs named: the new shape is then built at the size
 * the editor fitted it to. */
export function fitTargetGroup(gen: Codegen, fit: TweenFit): string | null {
  for (const spot of attachTargets(fit)) {
    const target = gen.clipCtx.get(spot.clipId);
    if (!target || targetGlyphs(spot.glyphs, target.formula.count).length === 0) return null;
  }
  return targetGroup(gen, fit);
}

/** Build a fresh clip from the shared model dimensions, then place it against its own target.
 * Copying the owner's mobject would also copy its clip transforms and paint. */
function sharedFitLines(gen: Codegen, ctx: ClipCtx, attach: BraceAttach | ShapeAttach): string[] {
  const f = ctx.formula.formula;
  const { name } = ctx.naming;
  const lines = emitterOf(f).construct(gen, ctx, ctx.clip.initial.color ?? f.color, f);
  lines.push(...glyphSetupLines(gen, ctx, true));
  const group = targetGroup(gen, attach);
  let pivot: string | undefined;
  if (f.kind === 'brace' && attach.rule === 'brace') {
    const measured = gen.names.take(`${name}_target`);
    const turn = attach.direction;
    lines.push(`${measured} = ${group}.copy()`);
    if (turn !== 0) lines.push(`${measured}.rotate(${num(-turn)} * DEGREES, about_point=ORIGIN)`);
    lines.push(
      `${name}.shift(${measured}.get_corner(LEFT + DOWN) - ${name}.get_corner(LEFT + UP) + ${num(attach.buff)} * DOWN)`,
    );
    if (ctx.clip.initial.scale !== 1 || ctx.clip.initial.flipX || ctx.clip.initial.flipY) {
      // The local producer centres the unturned brace's all-point box. Rotating that centre
      // is different from asking for the rotated brace's new critical-box centre.
      pivot = gen.names.take(`${name}_center`);
      const center = gen.target === 'ce' ? `Group(${name}).get_center()` : `${name}.get_center()`;
      lines.push(
        `${pivot} = ${turn === 0 ? center : `rotate_vector(${center}, ${num(turn)} * DEGREES)`}`,
      );
    }
    if (turn !== 0) lines.push(`${name}.rotate(${num(turn)} * DEGREES, about_point=ORIGIN)`);
    if (ctx.clip.initial.opacity !== 1)
      lines.push(`${name}.set_opacity(${num(ctx.clip.initial.opacity)})`);
  } else if (f.kind === 'shape') {
    if (f.shape === 'underline')
      lines.push(`${name}.next_to(${group}, DOWN, buff=${num(attach.buff)})`);
    else {
      // CE SurroundingRectangle centres the plain Group's all-point box, not a VGroup's anchors.
      const center = f.shape === 'box' && gen.target === 'ce' ? `Group(${group})` : group;
      lines.push(`${name}.move_to(${center})`);
    }
  }
  if (ctx.z !== 0) lines.push(`${name}.set_z_index(${ctx.z})`);
  return [...lines, ...fittedPoseLines(gen, ctx, pivot)];
}

/** Scale/flips belong to this clip, independently of the object's shared dimensions. A brace
 * is already turned along its attachment: reflect in its local axes, then turn back. */
function fittedPoseLines(gen: Codegen, ctx: ClipCtx, pivot?: string): string[] {
  const s = ctx.clip.initial;
  if (s.scale === 1 && !s.flipX && !s.flipY) return [];
  const lines: string[] = [];
  if (!pivot && ctx.formula.formula.kind === 'brace') {
    pivot = gen.names.take(`${ctx.naming.name}_center`);
    const straight = `${ctx.naming.name}.copy()${s.rotation !== 0 ? `.rotate(${num(-s.rotation)} * DEGREES, about_point=ORIGIN)` : ''}`;
    const center =
      gen.target === 'ce' ? `Group(${straight}).get_center()` : `${straight}.get_center()`;
    lines.push(
      `${pivot} = ${s.rotation === 0 ? center : `rotate_vector(${center}, ${num(s.rotation)} * DEGREES)`}`,
    );
  }
  const chain: string[] = [];
  const turn = (s.flipX || s.flipY) && s.rotation !== 0;
  const about = pivot ? `, about_point=${pivot}` : '';
  if (turn) chain.push(`.rotate(${num(-s.rotation)} * DEGREES${about})`);
  if (s.scale !== 1) chain.push(`.scale(${num(s.scale)}${about})`);
  if (s.flipX) chain.push(`.stretch(-1, 0${about})`);
  if (s.flipY) chain.push(`.stretch(-1, 1${about})`);
  if (turn) chain.push(`.rotate(${num(s.rotation)} * DEGREES${about})`);
  return [...lines, `${ctx.naming.name}${chain.join('')}`];
}

/** One instant op per attached clip the Python can place, at the clip's start — targets before
 * what hangs on them (each of them, for an object that spans several clips), so that a chain
 * placed in one instant goes link by link. */
export function placeOps(gen: Codegen): Op[] {
  const out: Op[] = [];
  const done = new Set<ClipId>();
  const visit = (ctx: ClipCtx): void => {
    if (done.has(ctx.clip.id)) return;
    done.add(ctx.clip.id);
    const attach = placeableAttachment(gen, ctx.clip);
    if (!attach) return;
    const targets: ClipCtx[] = [];
    for (const spot of attachTargets(attach)) {
      const target = gen.clipCtx.get(spot.clipId);
      if (!target) return;
      targets.push(target);
    }
    for (const target of targets) visit(target);
    const start = ctx.clip.start;
    out.push({
      kind: 'place',
      event: { start, end: start },
      clip: ctx,
      target: targets[0]!,
      attach,
    });
  };
  for (const ctx of gen.clipCtx.values()) visit(ctx);
  return out;
}
