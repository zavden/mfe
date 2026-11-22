/* An icon for every animation: what the narrow blocks of the vertical timeline, the menus and the
 * panels can show beside (or instead of) the animation's name. The drawings are of the house
 * style of `ui/timeline/icons.tsx` — a 16×16 box, `currentColor`, a 1.6 stroke with round caps
 * and joins, a few solid parts — and picture what the animation does rather than its name: a pen
 * for Write, dots that grow for FadeIn, a burst for Flash. An animation and its reverse share a
 * drawing, mirrored (Write and Unwrite, FadeIn and FadeOut) or with its arrows turned (Create and
 * Uncreate, GrowFromCenter and ShrinkToCenter). `AnimationIcon` draws them. Pure: no import is
 * kept at run time, so that a script can read the drawings with Node alone. */
import type {
  CameraDestination,
  ClipAction,
  EmphasisKind,
  IntroKind,
  OutroKind,
  RelationStyle,
} from '../../model';

export type AnimationIconName =
  // Intros, outros, Appear and Disappear blocks.
  | 'write'
  | 'unwrite'
  | 'fade-in'
  | 'fade-out'
  | 'grow'
  | 'shrink'
  | 'border-fill'
  | 'create'
  | 'uncreate'
  | 'grow-arrow'
  | 'none'
  // Emphasis blocks.
  | 'indicate'
  | 'wiggle'
  | 'circumscribe'
  | 'flash'
  | 'focus-on'
  // Relations and their pairs (the style of a Morph block's pairs too).
  | 'transform'
  | 'transform-copy'
  | 'fade-transform'
  | 'fade-transform-copy'
  // The other blocks.
  | 'tween'
  | 'tween-fit'
  | 'tween-ends'
  | 'part-transform'
  | 'morph'
  | 'group'
  | 'animation'
  // The moves of the scene's camera.
  | 'camera-move'
  | 'camera-back';

/** One path of a drawing: stroked with the house stroke, or filled when `fill` is set. */
export interface IconPart {
  d: string;
  fill?: true;
  opacity?: number;
}

/** What an icon draws: its paths, in the 16×16 box, mirrored left to right when `mirror` is set
 * (the reverse of an animation drawn the other way round). */
export interface IconDrawing {
  parts: readonly IconPart[];
  mirror?: true;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/** A circle as path data, centred on (cx, cy). */
const circle = (cx: number, cy: number, r: number) =>
  `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0`;

/** A rectangle as path data. */
const rect = (x: number, y: number, width: number, height: number) =>
  `M${num(x)} ${num(y)}h${num(width)}v${num(height)}h${num(-width)}z`;

const stroked = (d: string, opacity?: number): IconPart =>
  opacity === undefined ? { d } : { d, opacity };
const solid = (d: string, opacity?: number): IconPart =>
  opacity === undefined ? { d, fill: true } : { d, fill: true, opacity };

// Write: a pen whose tip ends the wavy line it has written. Unwrite is its mirror image: the pen
// goes back over the line the other way.
const PEN = 'M6.3 12.2l.9-3.9 5.6-5.6a1.2 1.2 0 0 1 1.7 0l1.3 1.3a1.2 1.2 0 0 1 0 1.7l-5.6 5.6z';
const WRITTEN = 'M1.5 13.2c.6-2.6 1.8-2.8 2.1-1s1.2 2 2.2.4';

// FadeIn: three dots from faint and small to solid and big, left to right; FadeOut its mirror.
const FADE_DOTS = [
  solid(circle(2.8, 8, 1.3), 0.5),
  solid(circle(7.1, 8, 1.9), 0.75),
  solid(circle(12.3, 8, 2.7)),
];

// GrowFromCenter and ShrinkToCenter: a small square in the middle and four diagonal arrows,
// pointing out of it or into it.
const CENTER_SQUARE = solid(rect(6.3, 6.3, 3.4, 3.4));
const DIAGONALS = 'M2 2l2.8 2.8M14 2l-2.8 2.8M2 14l2.8-2.8M14 14l-2.8-2.8';
const HEADS_OUT = 'M2 5V2h3M11 2h3v3M2 11v3h3M11 14h3v-3';
const HEADS_IN = 'M2 4.8h2.8V2M14 4.8h-2.8V2M2 11.2h2.8V14M14 11.2h-2.8V14';

// Create and Uncreate: three quarters of a circle being traced, the arrow at its end, or at its
// start pointing back.
const TRACED = 'M8.5 3.5a5 5 0 1 1-5 5';

// The relations: a square (the source) becomes a disc (the target). A Transform carries it
// along an arrow; a fade dissolves it along dots that grow; a copy leaves the square where it
// was and sends another, drawn as two squares one over the other.
const SOURCE = stroked(rect(1.8, 1.8, 4.8, 4.8));
const SOURCE_COPY = [stroked('M1.5 6.2V1.5h4.7'), solid(rect(3.6, 3.6, 4, 4))];
const TARGET = solid(circle(11.4, 11.4, 3));
const CARRY = [stroked('M9.6 3.2c2.4 0 3.6 1.4 3.6 4.4'), stroked('M11.4 5.9l1.8 1.8 1.8-1.8')];
const DISSOLVE = [solid(circle(9.9, 3, 0.9), 0.6), solid(circle(12.7, 4.8, 1.2), 0.85)];

export const ANIMATION_ICON_DRAWINGS: Readonly<Record<AnimationIconName, IconDrawing>> = {
  write: { parts: [solid(PEN), stroked(WRITTEN)] },
  unwrite: { parts: [solid(PEN), stroked(WRITTEN)], mirror: true },
  'fade-in': { parts: FADE_DOTS },
  'fade-out': { parts: FADE_DOTS, mirror: true },
  grow: { parts: [CENTER_SQUARE, stroked(DIAGONALS), stroked(HEADS_OUT)] },
  shrink: { parts: [CENTER_SQUARE, stroked(DIAGONALS), stroked(HEADS_IN)] },
  // DrawBorderThenFill: the outline drawn, the fill rising in it.
  'border-fill': {
    parts: [stroked(rect(2.5, 2.5, 11, 11)), solid(rect(2.5, 8.5, 11, 5))],
  },
  create: { parts: [stroked(TRACED), stroked('M1.5 6.6l2 2 2-2')] },
  uncreate: { parts: [stroked(TRACED), stroked('M10.5 1.5l-2 2 2 2')] },
  // GrowArrow: an arrow out of the point it grows from.
  'grow-arrow': {
    parts: [stroked('M4.5 11.5L13 3M7.8 3H13v5.2'), solid(circle(3.6, 12.4, 2))],
  },
  // No animation: the glyphs are just there, or just gone.
  none: { parts: [stroked(circle(8, 8, 5.5)), stroked('M4.1 11.9l7.8-7.8')] },
  // Indicate: the glyph swells within a ring, the pulse it makes.
  indicate: { parts: [solid(circle(8, 8, 3)), stroked(circle(8, 8, 6.2))] },
  // Wiggle: a glyph tilted and rocking between two marks of its motion.
  wiggle: {
    parts: [solid('M7.1 3.6l3.9 1-2.1 7.8-3.9-1z'), stroked('M3 5c-1 2-1 4 0 6M13 5c1 2 1 4 0 6')],
  },
  // Circumscribe: a frame being traced around the glyphs, its pen at the end of the line.
  circumscribe: {
    parts: [
      stroked('M5.5 3.5h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7.5'),
      solid(circle(1.5, 5.2, 1.4)),
      solid(rect(5, 7, 6, 2)),
    ],
  },
  // Flash: lines shooting out of a point.
  flash: {
    parts: [
      stroked(
        'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1',
      ),
      solid(circle(8, 8, 1.3)),
    ],
  },
  // FocusOn: a sight closing on a point.
  'focus-on': {
    parts: [
      stroked(circle(8, 8, 4.5)),
      stroked('M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5'),
      solid(circle(8, 8, 1.5)),
    ],
  },
  transform: { parts: [SOURCE, ...CARRY, TARGET] },
  'transform-copy': { parts: [...SOURCE_COPY, ...CARRY, TARGET] },
  'fade-transform': { parts: [SOURCE, ...DISSOLVE, TARGET] },
  'fade-transform-copy': { parts: [...SOURCE_COPY, ...DISSOLVE, TARGET] },
  // A Transform of the whole object: the square moved, bigger, from where it was.
  tween: {
    parts: [
      stroked(rect(2, 10, 4, 4)),
      stroked('M6.5 9.5l2.8-2.8M6.6 6.7h2.7v2.7'),
      solid(rect(9.5, 2, 4.5, 4.5)),
    ],
  },
  // A Transform that carries a shape around other glyphs: an arrow into the frame they fill.
  'tween-fit': {
    parts: [
      stroked('M1.5 8h3.2M3.2 6.3L4.9 8 3.2 9.7'),
      stroked(rect(7, 3.5, 7.5, 9)),
      solid(rect(9.2, 6.3, 3.1, 3.4)),
    ],
  },
  // A Transform that carries a line's ends: the line, held by its two ends.
  'tween-ends': {
    parts: [stroked('M4.4 11.6l7.2-7.2'), solid(circle(3.6, 12.4, 2)), solid(circle(12.4, 3.6, 2))],
  },
  // A Transform of some glyphs: one of a row of glyphs lifted out of its place.
  'part-transform': {
    parts: [
      solid(rect(1.5, 10.5, 3.4, 3.4)),
      solid(rect(5.9, 10.5, 3.4, 3.4)),
      stroked('M12.3 14V8.2M10.4 10.1l1.9-1.9 1.9 1.9'),
      solid(rect(10.3, 1.8, 4, 4)),
    ],
  },
  // Morph: a glyph of the line hops onto another place of the same line.
  morph: {
    parts: [
      stroked('M1.5 14.5h13'),
      solid(rect(1.8, 8.6, 3.6, 3.6)),
      stroked('M3.6 6.4C4.4 1.8 11.6 1.8 12.4 10.4M10.5 8.6l1.9 1.9 1.9-1.9'),
    ],
  },
  // A folded group: blocks stacked into one.
  group: {
    parts: [
      stroked('M5.5 5.8V3.5h9v5h-2'),
      stroked('M3.5 8.3V6h9v5h-2'),
      solid(rect(1.5, 8.5, 9, 5.5)),
    ],
  },
  // Any other animation: a spark.
  animation: {
    parts: [
      solid(
        'M8 1.5c.6 3.4 2.4 5.6 6.5 6.5-4.1.9-5.9 3.1-6.5 6.5-.6-3.4-2.4-5.6-6.5-6.5 4.1-.9 5.9-3.1 6.5-6.5z',
      ),
    ],
  },
  // A camera move: the corners of the frame it goes to, a viewfinder's, and the arrow on its way
  // there.
  'camera-move': {
    parts: [
      stroked('M7 4V1.5h2.5M12 1.5h2.5V4M14.5 6v2.5H12M9.5 8.5H7V6'),
      stroked('M1.5 14.5l4.2-4.2M2.9 10.3h2.8v2.8'),
    ],
  },
  // A camera move back to the frame of 0 s: the arrow returns to the frame it left, marked with
  // the point where it started.
  'camera-back': {
    parts: [
      stroked('M1.5 10V7.5H4M6.5 7.5H9V10M9 12v2.5H6.5M4 14.5H1.5V12'),
      solid(circle(5.25, 11, 1.2)),
      stroked('M14.5 1.5l-4.2 4.2M13.1 5.7h-2.8V2.9'),
    ],
  },
};

/** Every icon, in the order of the drawings. */
export const ANIMATION_ICON_NAMES = Object.keys(ANIMATION_ICON_DRAWINGS) as AnimationIconName[];

const PHASE_ICON: Readonly<Record<IntroKind | OutroKind, AnimationIconName>> = {
  none: 'none',
  write: 'write',
  unwrite: 'unwrite',
  fade_in: 'fade-in',
  fade_out: 'fade-out',
  grow_from_center: 'grow',
  shrink_to_center: 'shrink',
  draw_border_then_fill: 'border-fill',
  create: 'create',
  uncreate: 'uncreate',
  grow_arrow: 'grow-arrow',
};

const EMPHASIS_ICON: Readonly<Record<EmphasisKind, AnimationIconName>> = {
  indicate: 'indicate',
  wiggle: 'wiggle',
  circumscribe: 'circumscribe',
  flash: 'flash',
  focus_on: 'focus-on',
};

const RELATION_ICON: Readonly<Record<RelationStyle, AnimationIconName>> = {
  transform: 'transform',
  copy: 'transform-copy',
  fade: 'fade-transform',
  fade_copy: 'fade-transform-copy',
};

/** The icon of an intro or an outro of a clip, and of the animation of an Appear or a Disappear
 * block ('none' too: no animation). An unknown kind takes the generic icon. */
export function phaseIcon(kind: IntroKind | OutroKind): AnimationIconName {
  return PHASE_ICON[kind] ?? 'animation';
}

/** The icon of an Emphasis effect. */
export function emphasisIcon(effect: EmphasisKind): AnimationIconName {
  return EMPHASIS_ICON[effect] ?? 'animation';
}

/** The icon of a relation's style, or of a pair's own style. */
export function relationIcon(style: RelationStyle): AnimationIconName {
  return RELATION_ICON[style] ?? 'animation';
}

/** The icon of an animation block: its animation for an Appear, a Disappear or an Emphasis block;
 * for a Transform of the whole object, whether it carries a shape around other glyphs, a line's
 * ends, or neither; its own for a Transform of some glyphs and for a Morph. */
export function blockIcon(action: ClipAction): AnimationIconName {
  switch (action.kind) {
    case 'appear':
    case 'disappear':
      return phaseIcon(action.anim);
    case 'emphasis':
      return emphasisIcon(action.effect);
    case 'tween':
      return action.fit ? 'tween-fit' : action.ends ? 'tween-ends' : 'tween';
    case 'transform':
      return 'part-transform';
    case 'morph':
      return 'morph';
    default:
      return 'animation';
  }
}

/** The icon of a folded group of blocks: its members' when they all take the same one (a group
 * that writes three parts is a Write), the group's otherwise. */
export function groupIcon(members: readonly ClipAction[]): AnimationIconName {
  const icons = new Set(members.map(blockIcon));
  return icons.size === 1 ? [...icons][0]! : 'group';
}

/** The icon of a camera move, by where it goes: back to the frame of 0 s, or to another frame (its
 * own, or a target camera's). */
export function cameraMoveIcon(to: CameraDestination['kind']): AnimationIconName {
  return to === 'start' ? 'camera-back' : 'camera-move';
}
