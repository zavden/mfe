/* The two formulas of a relation in one SVG, with their glyphs clickable and the pairs drawn as
 * coloured links between them. Two layouts (`linkLayout.ts`): stacked — the source (base) on top,
 * the target below, the links through the gap between them: sources come down to a junction, from
 * there the links go down on the targets, each pair at its own junction height so the links stay
 * apart —, or side by side, the source at the left, the links as arcs over the two formulas. The
 * drawing opens with the layout that draws what takes part larger (stacked for wide formulas,
 * side by side for tall ones); the first key over its corner changes it. One SVG keeps the links in the glyphs'
 * own coordinates. The pair editor of Morph blocks draws one formula twice with it (its own test
 * ids, its glyphs that cannot take part dimmed, `ineligible`); without those props it is the
 * relation editor's canvas.
 *
 * The pointer takes glyphs with the Preview's circle selector, always on here (D207): the drawing
 * itself hears the pointer and asks which glyph it means (`pairPick.ts`) — the one with ink under
 * it, else the nearest within the circle, whose size is the Preview's preference (`symbolRadius`;
 * Shift + wheel changes it). The circle is drawn, and the glyph it would take is marked as
 * hovered. The elements of the glyphs hear nothing: they are what is drawn, named and tested.
 *
 * The formulas are spaced by the size of their text (`linkLayout.ts`), and what is the screen's is
 * measured in CSS pixels, whatever the formulas and the scale they are drawn at: the mark of a
 * glyph (its box and a little more, never under MARK_MIN_PX), the badges of the pairs, the index
 * of the hovered glyph, the heads of the arrows.
 *
 * The element shows a view of the drawing (`pairView.ts`), with the Preview's gestures: Ctrl/⌘ +
 * wheel zooms about the pointer, the middle button or Alt + drag moves it, and on a Mac a scroll
 * moves it and a pinch zooms; the keys −, + and «Fit» are over its corner. It opens framed on
 * what takes part — the glyphs that can, and those of the pairs made —, and «Fit» shows all of
 * it. The view is the editor's (`usePairStage.ts`), which keeps it while the drawing is put away. */
import {
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { unionBox, type Box, type Vec2 } from '../../geom';
import type { ResolvedFormula } from '../../engine';
import {
  defaultClipState,
  type Formula,
  type GlyphPair,
  type RelationStyle,
  type Severity,
} from '../../model';
import { glyphColor } from '../../scene';
import { graver, issueMark } from '../animations/issues';
import { atLeastSize, drawnGlyphs, type DrawnGlyph } from '../creator/glyphPaths';
import { scrollPans, zoomFactor } from '../pinch';
import { isMac, keyHint, keysText } from '../platform';
import { isDrag, isMainClick, screenPoint, trackPointer } from '../pointer';
import { turnSymbolReach, usePreferences } from '../preferences';
import { Icon } from '../timeline/icons';
import { useContentSize } from '../useContentSize';
import { linkFrame, rendersTextSize, type LinkFrame, type PairLayout } from './linkLayout';
import {
  BADGE_FONT_PX,
  BADGE_HEIGHT_PX,
  badgeWidthPx,
  linkRoutes,
  routePaths,
  type LinkEnds,
} from './linkRoutes';
import { pairColor } from './pairColors';
import type { PairSide, SideGlyph } from './pairGestures';
import { pickPairGlyph, type AimedSide } from './pairPick';
import {
  fitView,
  isFitView,
  MAX_ZOOM,
  MIN_ZOOM,
  openingView,
  pannedView,
  preferredLayout,
  steppedView,
  viewBoxOf,
  viewScale,
  ZOOM_STEP,
  zoomedView,
} from './pairView';
import { consumedNote, consumedSources, pairStyleBadge, STYLE_NAME } from './pairStyle';
import { swallowNextClick, useMarquee } from '../useMarquee';
import { usePairStage, type PairStage } from './usePairStage';

const NO_STYLE = defaultClipState();

interface Side {
  formula: Formula;
  resolved: ResolvedFormula;
  glyphs: readonly DrawnGlyph[];
  box: Box;
  /** Translation of the formula's own coordinates into the shared ones. */
  dx: number;
  dy: number;
}

export interface GlyphLinkCanvasProps {
  from: { formula: Formula; resolved: ResolvedFormula };
  to: { formula: Formula; resolved: ResolvedFormula };
  background: string;
  pairs: readonly GlyphPair[];
  /** Draw the pairs' links and style badges (the glyphs keep their pair colour either way). */
  showLinks: boolean;
  /** The relation's style, which pairs without their own inherit. */
  defaultStyle: RelationStyle;
  /** Pairs to emphasise (hovered in the list, or holding the hovered or a selected glyph); the
   * other links are dimmed while any is. */
  focusPairs: ReadonlySet<number>;
  /** The glyph the pointer aims at changed (null: none). The links themselves take no pointer:
   * they cross each other and are hard to aim at. */
  onHoverGlyph(glyph: { side: 'from' | 'to'; index: number } | null): void;
  /** Pairs whose style badge can be clicked (those holding a selected glyph); the others take
   * no pointer. */
  editablePairs: ReadonlySet<number>;
  /** A style badge was clicked (`anchor`: its box on screen). */
  onBadgeClick(index: number, anchor: DOMRect): void;
  selectedFrom: ReadonlySet<number>;
  selectedTo: ReadonlySet<number>;
  /** Pairs offered by "suggest links", drawn dashed. */
  suggestion: readonly GlyphPair[] | null;
  /** Pairs with issues, by the graver severity of theirs: their glyphs are marked `is-bad` for an
   * error, `is-warned` for warnings only (a glyph of several pairs takes the graver). The outline
   * of a linked glyph keeps its pair's colour, which its own style sets: the mark draws it
   * thicker; the list of pairs is where the colours of the issues show. */
  pairIssues: ReadonlyMap<number, Severity>;
  onGlyph(side: 'from' | 'to', glyph: number, event: MouseEvent): void;
  onBackground(): void;
  /** A rectangle drag (marquee) started: the selection it may add to is the current one. */
  onMarqueeStart(): void;
  /** The source and target glyphs the marquee touches now; `additive`: Ctrl/⌘ or Shift was
   * held at the press. */
  onMarquee(from: number[], to: number[], additive: boolean): void;
  /** A right-click on a glyph, or on the background (null). The browser's menu is prevented. */
  onContextMenu(target: { side: 'from' | 'to'; index: number } | null, event: MouseEvent): void;
  /** The drawing was pressed, anywhere on it and with any button, before what the press does. */
  onPress?(): void;
  /** Prefix of every test id of the canvas (default `rel`: `rel-from-glyph-3`, `rel-link-0`…). */
  testIdPrefix?: string;
  /** Per side, glyphs that cannot take part and why: drawn dimmed (unless selected or linked),
   * with the reason in their tooltip; they stay clickable. Default: none. */
  ineligible?: { from?: ReadonlyMap<number, string>; to?: ReadonlyMap<number, string> };
  /** Per side, a hint about glyphs that can take part, in their tooltip and accessible name
   * (not dimmed; a reason in `ineligible` wins). Default: none. */
  notes?: { from?: ReadonlyMap<number, string>; to?: ReadonlyMap<number, string> };
  /** Source glyphs something else consumes — another relation, a Morph block —, and what: they
   * are outlined in red dashes, as the sources a pair drawn here consumes (D184): a glyph a
   * Transform or a Fade transform takes can only be copied by another pair. Default: none. */
  consumed?: { from?: ReadonlyMap<number, string> };
  /** What holds the pairs, as the badge tooltips name it ("inherited from the relation"). */
  ownerName?: string;
  /** What the accessible name of the drawing calls it and its two sides (the name says where
   * each side is, as the layout has them). Default: the glyphs of the two formulas, the source
   * and the target. */
  label?: { drawing: string; from: string; to: string };
  /** What the editor keeps of the drawing while it is open (`usePairStage`): its layout and its
   * view. Without it the drawing keeps its own, which go with it. */
  stage?: PairStage;
}

/** How much of a dimmed glyph shows. */
const DIM_OPACITY = 0.3;

// What is the screen's, in CSS pixels.
/** What the mark of a glyph leaves around the glyph's box. */
const MARK_PAD_PX = 2;
/** The least a mark measures each way, as the frames of a glyph view (`FRAME_MIN_PX`): a minus
 * sign, a dot and the bar of a fraction show their states like a letter. */
const MARK_MIN_PX = 10;
const MARK_RADIUS_PX = 3;
/** The size of the index of the hovered glyph. */
const INDEX_FONT_PX = 12;
/** The head of an arrow: half its width, and its length. */
const ARROW_HALF_PX = 4;
const ARROW_LENGTH_PX = 6;
/** The dot at the junction of a suggested pair. */
const JUNCTION_DOT_PX = 3;
/** The width a drawing is taken to have until it is measured (and where it never is: jsdom). */
const NOMINAL_WIDTH_PX = 640;
/** What the opening view leaves around what takes part, in units of the drawing's spacing: room
 * for the marks, for the index under a glyph and for the keys over the corner. */
const OPENING_MARGIN = 2;
/** Side by side, what it leaves over what takes part besides: room for some arcs. */
const OPENING_ARCS = 6;
/** The rate of the wheel's zoom, the Preview's. */
const WHEEL_ZOOM_RATE = 0.002;

interface Geometry {
  sides: [Side, Side];
  /** The two formulas as the circle selector reads them. */
  aimed: AimedSide[];
  frame: LinkFrame;
  /** The size of the whole drawing. */
  width: number;
  height: number;
  /** The size of its text. */
  text: number;
}

function layout(
  from: GlyphLinkCanvasProps['from'],
  to: GlyphLinkCanvasProps['to'],
  how: PairLayout,
): Geometry {
  const mk = (src: GlyphLinkCanvasProps['from']) => ({
    formula: src.formula,
    resolved: src.resolved,
    glyphs: drawnGlyphs(src.resolved),
    box: src.resolved.render.bbox,
  });
  const a = mk(from);
  const b = mk(to);
  const text = rendersTextSize(from.resolved.render, to.resolved.render);
  const frame = linkFrame(a.box, b.box, text, how);
  const sides: [Side, Side] = [
    { ...a, ...frame.from },
    { ...b, ...frame.to },
  ];
  const aimed = (side: Side, which: PairSide): AimedSide => ({
    side: which,
    dx: side.dx,
    dy: side.dy,
    glyphs: side.glyphs.map((glyph) => ({
      index: glyph.canonical,
      box: glyph.bbox,
      contours: side.resolved.render.glyphs[glyph.renderIndex]?.contours ?? [],
    })),
  });
  return {
    sides,
    aimed: [aimed(sides[0], 'from'), aimed(sides[1], 'to')],
    frame,
    width: frame.right - frame.left,
    height: frame.top - frame.bottom,
    text,
  };
}

/** The box of what takes part in a drawing, in its coordinates: the glyphs that can be linked
 * (those `ineligible` does not name) and those of the pairs made, on both sides; side by side,
 * with room over them for some arcs. Null when a side has none: there is nothing to link, and the
 * whole drawing says so. */
function takingPart(
  geo: Geometry,
  pairs: readonly GlyphPair[],
  ineligible: GlyphLinkCanvasProps['ineligible'],
): Box | null {
  const boxes: Box[] = [];
  for (const [side, which] of [
    [geo.sides[0], 'from'],
    [geo.sides[1], 'to'],
  ] as const) {
    const out = ineligible?.[which];
    const linked = new Set(pairs.flatMap((pair) => (which === 'from' ? pair.from : pair.to)));
    const part = side.glyphs.filter(
      (glyph) => linked.has(glyph.canonical) || !out?.has(glyph.canonical),
    );
    if (part.length === 0) return null;
    const box = unionBox(part.map((glyph) => glyph.bbox));
    boxes.push({
      minX: box.minX + side.dx,
      maxX: box.maxX + side.dx,
      minY: box.minY + side.dy,
      maxY: box.maxY + side.dy,
    });
  }
  const all = unionBox(boxes);
  return geo.frame.layout === 'side'
    ? { ...all, maxY: all.maxY + geo.frame.unit * OPENING_ARCS }
    : all;
}

const f = (n: number) => +n.toFixed(4);

/** Where the pointer is, as an event says it. */
interface PointerSpot {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

/** Where a point of the screen is on the drawing — in its coordinates (y up) — and what a CSS
 * pixel measures there. Null for a point outside the drawing and while the drawing has no size on
 * screen: an event no pointer made (a script's), a drawing that is not laid out. Such an event
 * means the element it was sent to (`glyphOfElement`). */
function locate(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): { point: Vec2; pixel: number } | null {
  if (!svg || typeof svg.getScreenCTM !== 'function') return null;
  const box = svg.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return null;
  const inside =
    clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
  if (!inside) return null;
  const matrix = svg.getScreenCTM();
  if (!matrix || !(matrix.a > 0)) return null;
  const at = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { point: [at.x, -at.y], pixel: 1 / matrix.a };
}

/** The glyph whose element (or a part of it) an event was sent to. */
function glyphOfElement(target: EventTarget | null): SideGlyph | null {
  const element = target instanceof Element ? target.closest('[data-glyph]') : null;
  const side = element?.getAttribute('data-side');
  if (!element || (side !== 'from' && side !== 'to')) return null;
  return { side, index: Number(element.getAttribute('data-glyph')) };
}

interface GlyphMarkProps {
  testId: string;
  which: PairSide;
  glyph: DrawnGlyph;
  fill: string;
  /** Its mark, in its formula's coordinates: lower left corner, size and corner radius. */
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  selected: boolean;
  /** The colour of its (first) pair, or null when no pair holds it. */
  tint: string | null;
  focus: boolean;
  hover: boolean;
  suggested: boolean;
  /** The class of the graver issue of its pairs, or null. */
  mark: string | null;
  dim: boolean;
  /** Whether it can take part; undefined where the drawing is told of no glyph that cannot. */
  eligible: boolean | undefined;
  /** Why it can only be copied, when something consumes it. */
  consumed: string | undefined;
  /** What its tooltip and its name add: why it cannot take part, who consumes it, a hint. */
  note: string | undefined;
}

/** A glyph of the drawing: its mark, its outline and, over them, the dashes of a consumed
 * source. It hears no pointer (the drawing does) and is drawn again only when what it shows
 * changes: the pointer moving over a formula of many glyphs changes two of them. */
const GlyphMark = memo(function GlyphMark(props: GlyphMarkProps) {
  const { glyph, which, x, y, w, h, rx, selected, tint, note } = props;
  const classes = ['rg-glyph'];
  if (selected) classes.push('is-selected');
  if (tint) classes.push('is-linked');
  if (props.focus) classes.push('is-focus');
  if (props.mark) classes.push(props.mark);
  if (props.suggested) classes.push('is-suggested');
  if (props.hover) classes.push('is-hover');
  if (props.dim) classes.push('is-ineligible');
  if (props.consumed !== undefined) classes.push('is-consumed');
  const name = `${glyph.canonical}: ${glyph.label}`;
  const box = { x: f(x), y: f(y), width: f(w), height: f(h), rx: f(rx) };
  return (
    <g
      className={classes.join(' ')}
      data-testid={props.testId}
      data-side={which}
      data-glyph={glyph.canonical}
      data-selected={selected}
      data-linked={tint !== null}
      data-label={glyph.label}
      data-eligible={props.eligible}
      data-consumed={props.consumed !== undefined}
      role="button"
      aria-label={`Glyph ${name}${note ? ` (${note})` : ''}`}
      aria-pressed={selected}
    >
      <title>{note ? `${name} — ${note}` : name}</title>
      <rect
        className="rg-hit"
        data-marquee={`${which}:${glyph.canonical}`}
        {...box}
        style={tint ? { fill: tint, stroke: tint } : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <path d={glyph.d} fill={props.fill} opacity={props.dim ? DIM_OPACITY : undefined} />
      {props.consumed !== undefined && (
        <rect className="rg-consumed" {...box} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
});

/** The circle of the selector, moved by the drawing as the pointer moves. */
interface ReachHandle {
  /** Draw it about a point of the SVG (its own units, y down) with radius `r`, or not at all. */
  put(circle: { x: number; y: number; r: number } | null): void;
}

/** The circle of the selector. Its place is its own state: the pointer moving draws the circle
 * again and nothing else of the drawing. */
function Reach({ ref, testId }: { ref: Ref<ReachHandle>; testId: string }) {
  const [circle, setCircle] = useState<{ x: number; y: number; r: number } | null>(null);
  useImperativeHandle(ref, () => ({ put: setCircle }), []);
  if (!circle) return null;
  return (
    <g className="rg-reach" data-testid={testId}>
      {['rg-reach-edge', 'rg-reach-ring'].map((part) => (
        <circle
          key={part}
          className={part}
          cx={f(circle.x)}
          cy={f(circle.y)}
          r={f(circle.r)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

/** The accessible name of the drawing: what it is, and where each side is. */
function drawingName(label: GlyphLinkCanvasProps['label'], how: PairLayout): string {
  const { drawing, from, to } = label ?? {
    drawing: 'Glyphs of the two formulas',
    from: 'source',
    to: 'target',
  };
  return how === 'side'
    ? `${drawing}: the ${from} at the left, the ${to} at the right`
    : `${drawing}: the ${from} on top, the ${to} below`;
}

export function GlyphLinkCanvas(props: GlyphLinkCanvasProps) {
  const { from, to, pairs, suggestion } = props;
  const id = props.testIdPrefix ?? 'rel';
  const ownStage = usePairStage();
  const stage = props.stage ?? ownStage;
  /** How the formulas are laid out: until the drawing has chosen, stacked. */
  const how = stage.layout ?? 'stacked';
  const geo = useMemo(() => layout(from, to, how), [from, to, how]);
  const [A, B] = geo.sides;
  const { frame } = geo;
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useContentSize(svgRef);
  const measured = size !== null && size[0] > 0 && size[1] > 0;
  /** The element, in CSS pixels. Until it is measured, as wide as a drawing usually is and as
   * tall as the whole drawing makes it. */
  const surface = useMemo(
    () =>
      measured
        ? { width: size[0], height: size[1] }
        : { width: NOMINAL_WIDTH_PX, height: (NOMINAL_WIDTH_PX * geo.height) / geo.width },
    [measured, size, geo],
  );
  /** What the element shows: until the drawing opens, all of it. */
  const view = stage.view ?? fitView(frame);
  /** One CSS pixel, in the drawing's units. */
  const px = 1 / viewScale(frame, view, surface);
  const viewBox = viewBoxOf(frame, view, surface);

  // The drawing opens once it has a size: with the layout that draws what takes part larger —
  // unless the editor has one —, then framed on what takes part. The size is read from the
  // element, which a layout just chosen has already given its box.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || (stage.layout !== null && stage.view !== null)) return;
    const element = { width: svg.clientWidth, height: svg.clientHeight };
    if (!(element.width > 0 && element.height > 0)) return;
    const candidate = (which: PairLayout) => {
      const drawn = which === how ? geo : layout(from, to, which);
      return {
        frame: drawn.frame,
        focus: takingPart(drawn, pairs, props.ineligible),
        margin: drawn.frame.unit * OPENING_MARGIN,
      };
    };
    if (stage.layout === null) {
      const limit = parseFloat(getComputedStyle(svg).maxHeight);
      stage.setLayout(
        preferredLayout(
          { stacked: candidate('stacked'), side: candidate('side') },
          { ...element, maxHeight: Number.isFinite(limit) ? limit : null },
          geo.text,
        ),
      );
      return;
    }
    const { focus, margin } = candidate(how);
    stage.setView(openingView(frame, focus, element, geo.text, margin));
  });

  /** The mark of a glyph, in its formula's own coordinates: its box and a little more. */
  const markOf = (glyph: DrawnGlyph): Box => {
    const least = MARK_MIN_PX * px;
    const pad = 2 * MARK_PAD_PX * px;
    return atLeastSize(
      glyph.bbox,
      Math.max(glyph.bbox.maxX - glyph.bbox.minX + pad, least),
      Math.max(glyph.bbox.maxY - glyph.bbox.minY + pad, least),
    );
  };
  /** The mark of the glyph `index` of a side, in the drawing's coordinates; none for a glyph
   * the render lacks. */
  const marksOf = (side: Side, index: number): Box[] => {
    const glyph = side.glyphs.find((g) => g.canonical === index);
    if (!glyph) return [];
    const mark = markOf(glyph);
    return [
      {
        minX: mark.minX + side.dx,
        maxX: mark.maxX + side.dx,
        minY: mark.minY + side.dy,
        maxY: mark.maxY + side.dy,
      },
    ];
  };
  const endsOf = (pair: GlyphPair, badgePx: number): LinkEnds => ({
    sources: pair.from.flatMap((g) => marksOf(A, g)),
    targets: pair.to.flatMap((g) => marksOf(B, g)),
    badgePx,
  });
  /** What the badge of a pair says: its number (as in the list of pairs) and its style letter. */
  const badgeText = (pair: GlyphPair, index: number) =>
    `${index + 1} ${pairStyleBadge(pair, props.defaultStyle)}`;
  /** Where the links go (`linkRoutes.ts`): of the pairs, and of the suggested ones. */
  const routes = props.showLinks
    ? linkRoutes(
        frame,
        pairs.map((pair, i) => endsOf(pair, badgeWidthPx(badgeText(pair, i)))),
        px,
      )
    : [];
  const suggestedRoutes = suggestion
    ? linkRoutes(
        frame,
        suggestion.map((pair) => endsOf(pair, 0)),
        px,
      )
    : [];

  /** The glyph the pointer aims at: the one a click would take. */
  const [hovered, setHovered] = useState<SideGlyph | null>(null);
  const hoveredNow = useRef<SideGlyph | null>(null);
  const hover = (glyph: SideGlyph | null) => {
    const now = hoveredNow.current;
    if (now?.side === glyph?.side && now?.index === glyph?.index) return;
    hoveredNow.current = glyph;
    setHovered(glyph);
    props.onHoverGlyph(glyph);
  };
  const reach = useRef<ReachHandle>(null);
  const pointer = useRef<PointerSpot | null>(null);
  // What the wheel has turned of the reach and is not a whole pixel yet (`turnSymbolReach`).
  const reachKept = useRef<number | null>(null);

  /** The glyph an event of the drawing means: what the circle selector takes where the pointer
   * is, or, for an event without a place on the drawing, the glyph it was sent to. */
  const glyphAt = (spot: PointerSpot): SideGlyph | null => {
    const at = locate(svgRef.current, spot.clientX, spot.clientY);
    if (!at) return glyphOfElement(spot.target);
    return pickPairGlyph(geo.aimed, at.point, usePreferences.getState().symbolRadius * at.pixel);
  };
  /** The glyph a click or a right-click is on. Such an event says where it is in whole pixels,
   * and the pointer says it finer: within the pixel, the place is the pointer's, so that what the
   * circle showed as taken is what the click takes, to its very edge. */
  const glyphClicked = (event: PointerSpot): SideGlyph | null => {
    const last = pointer.current;
    const same =
      last !== null &&
      Math.abs(last.clientX - event.clientX) < 1 &&
      Math.abs(last.clientY - event.clientY) < 1;
    return glyphAt(same ? { ...last, target: event.target } : event);
  };
  /** The pointer is at `spot`, or gone (null): the circle goes there, and what it would take is
   * the hovered glyph. */
  const aimAt = (spot: PointerSpot | null) => {
    pointer.current = spot;
    const at = spot && locate(svgRef.current, spot.clientX, spot.clientY);
    reach.current?.put(
      at
        ? {
            x: at.point[0],
            y: -at.point[1],
            r: usePreferences.getState().symbolRadius * at.pixel,
          }
        : null,
    );
    hover(spot && glyphAt(spot));
  };
  /** What the listeners that outlive a render ask of the latest one. */
  const live = useRef({ aimAgain: () => {}, frame, view, surface, setView: stage.setView });
  useLayoutEffect(() => {
    live.current = {
      aimAgain: () => aimAt(pointer.current),
      frame,
      view,
      surface,
      setView: stage.setView,
    };
  });
  // The view changed under a pointer that rests: the circle keeps its size on screen, and what
  // it reaches is another part of the drawing.
  const shown = viewBox.map(f).join(' ');
  useLayoutEffect(() => {
    live.current.aimAgain();
  }, [shown]);

  // The wheel, as in the Preview. With Shift it grows or shrinks the circle (the same
  // preference); with Ctrl/⌘ — and a pinch — it zooms about the pointer; alone it moves the
  // view on a Mac, where a scroll moves any view, and is left to the dialog elsewhere. A listener
  // that is not passive: it keeps the browser from scrolling and from zooming the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        turnSymbolReach(reachKept, event.deltaY || event.deltaX);
        live.current.aimAgain();
        return;
      }
      const { frame, view, surface, setView } = live.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const box = svg.getBoundingClientRect();
        const pixel: Vec2 = [
          event.clientX - box.left - svg.clientLeft,
          event.clientY - box.top - svg.clientTop,
        ];
        setView(zoomedView(frame, view, surface, pixel, zoomFactor(event, WHEEL_ZOOM_RATE)));
        return;
      }
      if (!scrollPans(event, false)) return;
      event.preventDefault();
      setView(pannedView(frame, view, surface, -event.deltaX, -event.deltaY));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // The middle button, or Alt and the main one, moves the view while it is held.
  const [panning, setPanning] = useState(false);
  const endPan = useRef<(() => void) | null>(null);
  useEffect(() => () => endPan.current?.(), []);
  const beginPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    // (The middle button would start the browser's own scroll.)
    event.preventDefault();
    endPan.current?.();
    const press = screenPoint(event);
    // Alt and the main button end in a click, which is the drag's and not a glyph's.
    const clicks = isMainClick(event);
    const from = view;
    let moved = false;
    aimAt(null);
    setPanning(true);
    endPan.current = trackPointer(
      event.pointerId,
      {
        move: (e) => {
          moved ||= isDrag(e, press);
          const { frame, surface, setView } = live.current;
          setView(
            pannedView(frame, from, surface, e.clientX - press.clientX, e.clientY - press.clientY),
          );
        },
        end: (e, cancelled) => {
          endPan.current = null;
          setPanning(false);
          if (cancelled) live.current.setView(from);
          else if (moved && clicks && e?.type === 'pointerup') swallowNextClick();
        },
      },
      { target: svg },
    );
  };

  // Dragging a rectangle selects the glyphs it touches, on either formula.
  const marquee = useMarquee({
    containerRef: svgRef,
    onStart: () => {
      aimAt(null);
      props.onMarqueeStart();
    },
    onChange: (keys, additive) => {
      const side = (which: 'from' | 'to') =>
        keys.filter((k) => k.startsWith(`${which}:`)).map((k) => Number(k.slice(which.length + 1)));
      props.onMarquee(side('from'), side('to'), additive);
    },
  });

  const pairOfGlyph = (side: 'from' | 'to', glyph: number): number[] =>
    pairs.flatMap((p, i) => ((side === 'from' ? p.from : p.to).includes(glyph) ? [i] : []));

  /** The sources the pairs drawn here consume, each with the pair that does. */
  const taken = consumedSources(pairs, props.defaultStyle);
  /** Why a source glyph can only be copied by another pair, or undefined when it can be taken:
   * a pair drawn here consumes it, or something else does (`consumed`). */
  const consumedBy = (glyph: number): string | undefined => {
    const index = taken.get(glyph);
    return index !== undefined
      ? consumedNote(pairs[index]!, index, props.defaultStyle)
      : props.consumed?.from?.get(glyph);
  };

  const renderSide = (side: Side, which: 'from' | 'to', selected: ReadonlySet<number>) => (
    <g transform={`translate(${f(side.dx)} ${f(side.dy)})`} data-testid={`${id}-formula-${which}`}>
      {side.glyphs.map((glyph) => {
        const box = markOf(glyph);
        const linked = pairOfGlyph(which, glyph.canonical);
        const focus = linked.some((i) => props.focusPairs.has(i));
        const mark = issueMark(graver(linked.map((i) => props.pairIssues.get(i))));
        const suggested = suggestion?.some((p) =>
          (which === 'from' ? p.from : p.to).includes(glyph.canonical),
        );
        const tint = linked.length > 0 ? pairColor(linked[0]!) : null;
        const on = selected.has(glyph.canonical);
        const reason = props.ineligible?.[which]?.get(glyph.canonical);
        const consumed = which === 'from' ? consumedBy(glyph.canonical) : undefined;
        const note = reason ?? consumed ?? props.notes?.[which]?.get(glyph.canonical);
        const dim = reason !== undefined && !on && linked.length === 0;
        return (
          <GlyphMark
            key={glyph.canonical}
            testId={`${id}-${which}-glyph-${glyph.canonical}`}
            which={which}
            glyph={glyph}
            fill={glyphColor(glyph.canonical, NO_STYLE, side.formula)}
            x={box.minX}
            y={box.minY}
            w={box.maxX - box.minX}
            h={box.maxY - box.minY}
            rx={MARK_RADIUS_PX * px}
            selected={on}
            tint={tint}
            focus={focus}
            hover={hovered?.side === which && hovered.index === glyph.canonical}
            suggested={suggested ?? false}
            mark={mark ?? null}
            dim={dim}
            eligible={props.ineligible ? reason === undefined : undefined}
            consumed={consumed}
            note={note}
          />
        );
      })}
    </g>
  );

  /** The index of the hovered glyph, in a badge under the lower left of its mark (SVG y down);
   * over the mark where the drawing ends under it. */
  const renderIndex = () => {
    if (!hovered) return null;
    const side = hovered.side === 'from' ? A : B;
    const glyph = side.glyphs.find((g) => g.canonical === hovered.index);
    if (!glyph) return null;
    const mark = markOf(glyph);
    const size = INDEX_FONT_PX * px;
    const text = String(glyph.canonical);
    const width = size * (0.62 * text.length + 0.6);
    const height = size * 1.35;
    const x = mark.minX + side.dx;
    const under = -(mark.minY + side.dy) + size * 0.12;
    const y =
      under + height > viewBox[1] + viewBox[3]
        ? -(mark.maxY + side.dy) - size * 0.12 - height
        : under;
    return (
      <g
        className="rg-index"
        data-testid={`${id}-glyph-index`}
        data-side={hovered.side}
        data-index={glyph.canonical}
      >
        <rect x={f(x)} y={f(y)} width={f(width)} height={f(height)} rx={f(size * 0.3)} />
        <text x={f(x + width / 2)} y={f(y + height * 0.74)} fontSize={f(size)} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };

  const drawLinks = (list: typeof routes, dashed: boolean) =>
    list.map((drawn, i) => {
      if (!drawn) return null;
      const color = dashed ? 'var(--text-dim)' : pairColor(i);
      const focus = !dashed && props.focusPairs.has(i);
      const dim = !dashed && props.focusPairs.size > 0 && !focus;
      return (
        <g
          key={`${dashed ? 's' : 'p'}${i}`}
          className={`rg-link${dashed ? ' is-suggestion' : ''}${focus ? ' is-focus' : ''}${dim ? ' is-dim' : ''}`}
          data-testid={dashed ? `${id}-suggestion-link-${i}` : `${id}-link-${i}`}
          style={{ stroke: color, fill: 'none' }}
        >
          {routePaths(drawn).map((d, k) => (
            <path
              key={k}
              d={d}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={dashed ? '5 4' : undefined}
            />
          ))}
          {dashed && (
            <circle
              cx={f(drawn.junction[0])}
              cy={f(drawn.junction[1])}
              r={f(JUNCTION_DOT_PX * px)}
              style={{ fill: color, stroke: 'none' }}
            />
          )}
          {drawn.ends.map(([x, y], k) => (
            <path
              key={`h${k}`}
              d={`M${f(x - ARROW_HALF_PX * px)} ${f(y + ARROW_LENGTH_PX * px)} L${f(x)} ${f(y)} L${f(x + ARROW_HALF_PX * px)} ${f(y + ARROW_LENGTH_PX * px)}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      );
    });

  /** Style badges at the junctions, drawn over everything in SVG coordinates (y down) so that
   * their text is upright. */
  const renderBadges = () =>
    pairs.map((pair, i) => {
      const drawn = routes[i];
      if (!drawn) return null;
      const text = pairStyleBadge(pair, props.defaultStyle);
      const label = badgeText(pair, i);
      const style = pair.style ?? props.defaultStyle;
      const focus = props.focusPairs.has(i);
      const dim = props.focusPairs.size > 0 && !focus;
      const editable = props.editablePairs.has(i);
      const size = BADGE_FONT_PX * px;
      const width = badgeWidthPx(label) * px;
      const height = BADGE_HEIGHT_PX * px;
      const [x, y] = [drawn.badge[0], -drawn.badge[1]];
      return (
        <g
          key={i}
          className={`rg-badge${focus ? ' is-focus' : ''}${dim ? ' is-dim' : ''}${editable ? ' is-editable' : ''}`}
          data-testid={`${id}-junction-${i}`}
          data-style={text}
          transform={`translate(${f(x)} ${f(y)})${focus ? ' scale(1.15)' : ''}`}
          role={editable ? 'button' : undefined}
          aria-label={editable ? `Change the style of pair ${i + 1}` : undefined}
          onClick={(event) => {
            if (!editable) return;
            event.stopPropagation();
            props.onBadgeClick(i, event.currentTarget.getBoundingClientRect());
          }}
        >
          <title>
            {`Pair ${i + 1}: `}
            {pair.style
              ? STYLE_NAME[style]
              : `${STYLE_NAME[style]} (inherited from the ${props.ownerName ?? 'relation'})`}
          </title>
          <rect
            x={f(-width / 2)}
            y={f(-height / 2)}
            width={f(width)}
            height={f(height)}
            rx={f(height / 2)}
            style={{ fill: pairColor(i) }}
          />
          <text y={f(size * 0.36)} fontSize={f(size)} textAnchor="middle">
            {label}
          </text>
        </g>
      );
    });

  const step = (factor: number) => stage.setView(steppedView(frame, view, surface, factor));
  return (
    <div className="rel-stage" data-testid={`${id}-stage`}>
      <svg
        className={`rel-canvas${hovered ? ' is-aiming' : ''}${panning ? ' is-panning' : ''}`}
        data-testid={`${id}-canvas`}
        data-layout={how}
        data-zoom={+view.zoom.toFixed(4)}
        ref={svgRef}
        viewBox={shown}
        preserveAspectRatio="xMidYMid meet"
        // The element is as the whole drawing is, whatever part of it the view shows.
        style={{ background: props.background, aspectRatio: `${f(geo.width)} / ${f(geo.height)}` }}
        onClick={(event) => {
          const glyph = glyphClicked(event);
          if (glyph) props.onGlyph(glyph.side, glyph.index, event);
          else props.onBackground();
        }}
        onPointerDown={(event) => {
          props.onPress?.();
          if (event.button === 1 || (isMainClick(event) && event.altKey)) {
            beginPan(event);
            return;
          }
          // A press without a move before it (a finger): it aims where it lands.
          aimAt(event);
          marquee.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          // A rectangle being dragged aims at nothing: it takes what it touches. Nor does a view
          // being moved.
          if (!marquee.rect && !panning) aimAt(event);
        }}
        onPointerLeave={() => aimAt(null)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onContextMenu(glyphClicked(event), event);
        }}
        role="group"
        aria-label={drawingName(props.label, how)}
      >
        <g transform="scale(1,-1)">
          {drawLinks(routes, false)}
          {drawLinks(suggestedRoutes, true)}
          {renderSide(A, 'from', props.selectedFrom)}
          {renderSide(B, 'to', props.selectedTo)}
        </g>
        {props.showLinks && renderBadges()}
        {renderIndex()}
        <Reach ref={reach} testId={`${id}-reach`} />
        {marquee.rect && (
          <rect
            className="marquee-rect"
            data-testid={`${id}-marquee`}
            {...marquee.rect}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* The keys of the view, over the corner of the drawing: its layout, then how near it is. */}
      <div className="rel-view-tools" role="group" aria-label="View of the drawing">
        <button
          type="button"
          className="rel-view-tool"
          aria-label="Side by side"
          aria-pressed={how === 'side'}
          title={
            how === 'side'
              ? 'Stack the two again: the first on top, the links through the gap between them'
              : 'Put the two side by side, the links as arcs over them: each line of a tall formula beside its own'
          }
          data-testid={`${id}-toggle-layout`}
          onClick={() => stage.setLayout(how === 'side' ? 'stacked' : 'side')}
        >
          <Icon name="side-by-side" />
        </button>
        <span className="rel-view-sep" aria-hidden="true" />
        <button
          type="button"
          className="rel-view-tool"
          aria-label="Zoom out"
          title={`Zoom out (${keyHint('Mod + wheel')})`}
          data-testid={`${id}-zoom-out`}
          disabled={view.zoom <= MIN_ZOOM}
          onClick={() => step(1 / ZOOM_STEP)}
        >
          <Icon name="minus" />
        </button>
        <span className="rel-view-zoom" data-testid={`${id}-zoom-label`}>
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          type="button"
          className="rel-view-tool"
          aria-label="Zoom in"
          title={`Zoom in (${keyHint('Mod + wheel')})`}
          data-testid={`${id}-zoom-in`}
          disabled={view.zoom >= MAX_ZOOM}
          onClick={() => step(ZOOM_STEP)}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="rel-view-tool rel-view-fit"
          title={keysText(
            `Show the whole drawing (move it with ${isMac() ? 'a scroll, the ' : ''}middle button or Alt + drag)`,
          )}
          data-testid={`${id}-view-fit`}
          disabled={isFitView(frame, view)}
          onClick={() => stage.setView(fitView(frame))}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
