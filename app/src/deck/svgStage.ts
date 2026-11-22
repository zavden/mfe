/* The stage of an exported page: the scene as SVG, each glyph a `<path>` and each clip a group
 * with its name. It draws what the canvas renderer draws (`render/canvasRenderer.ts`: the same
 * outlines, the non-zero fill rule, mitred joins, butt caps, a stroke width of 0.01 scene units
 * per unit of Manim's, fill under stroke, the same order) as elements of the document, so that
 * whoever extends the page can reach them with a selector, give them a class, a transform or a
 * CSS animation.
 *
 *   <svg class="mfe-stage" viewBox="…">        the frame the scene is filmed through
 *     <g class="mfe-below"></g>                free: under the scene
 *     <g class="mfe-scene">
 *       <g class="mfe-clip" data-clip="eq1">   a clip, by its name (`names.ts`)
 *         <path class="mfe-glyph" data-glyph="0" d="…" fill="…"/>
 *       </g>
 *       <g class="mfe-flight" data-from="eq1" data-to="eq2"></g>   glyphs on their way
 *       <g class="mfe-effects"></g>            what an emphasis draws for a moment
 *     </g>
 *     <g class="mfe-above"></g>                free: over the scene
 *   </svg>
 *
 * The division of the work is the contract: the attributes of the paths are the stage's, written
 * again in every frame; the groups are their reader's. No element has an `id` — two scenes share
 * a page.
 *
 * The units are the scene's (Manim's: a frame 8 tall about the origin) with **y down**, as every
 * SVG has it: a point of Manim's `[x, y]` is at `x, −y`. So what is added to a layer is upright.
 *
 * Order. The canvas draws by depth (the top track in front), and at one depth the clips' own
 * glyphs first, in the project's order, then the pieces in flight of each transfer, then the
 * temporary drawings of the effects. The groups are made once, in that same order, so the order
 * of the document is the order the canvas paints in, by construction (`__tests__/svgStage.test.ts`
 * holds it to the canvas's on every example). */
import type { Box } from '../geom';
import type { ClipId } from '../model';
import { visualTracks } from '../model';
import type { Drawable } from '../scene';
import type { Scene } from '../embed/engine';
import { pathData, written } from './pathData';

const SVG = 'http://www.w3.org/2000/svg';

/** One Manim stroke-width unit in scene units, and the miter limit: the canvas renderer's. */
const STROKE_UNIT = 0.01;
const MITER_LIMIT = 10;

export type LayerName = 'below' | 'above';

/** A group of glyphs on their way from a clip to another (a relation), or within one (a Morph
 * block: `from` and `to` are then the same clip). */
export interface Flight {
  from: ClipId;
  to: ClipId;
  element: SVGGElement;
}

export interface SvgStage {
  readonly element: SVGSVGElement;
  /** Draws the drawables of an instant, filmed through `frame` (scene units, y up). */
  draw(drawables: readonly Drawable[], frame: Box): void;
  /** The group of a clip; null for one the scene has not. */
  clip(clipId: ClipId): SVGGElement | null;
  /** The groups of the transfers, in the order they are drawn. */
  flights(): Flight[];
  /** A free group under or over the scene. */
  layer(name: LayerName): SVGGElement;
}

interface Node {
  element: SVGPathElement;
  contours: unknown;
  glyph: number | null;
  temp: boolean;
  fill: string | null;
  fillOpacity: number | null;
  stroke: string | null;
  strokeOpacity: number | null;
  strokeWidth: number | null;
  seen: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Drawables in ascending depth; the order of the list breaks ties (the canvas's rule). */
function inDrawOrder(drawables: readonly Drawable[]): readonly Drawable[] {
  for (let i = 1; i < drawables.length; i++) {
    if (drawables[i - 1]!.z > drawables[i]!.z) return [...drawables].sort((a, b) => a.z - b.z);
  }
  return drawables;
}

/** The stage of `scene`, in `doc`; `names` gives each clip its name (`clipNames`). */
export function createSvgStage(
  doc: Document,
  scene: Scene,
  names: ReadonlyMap<ClipId, string>,
): SvgStage {
  const make = <K extends 'svg' | 'g' | 'path'>(tag: K, className: string) => {
    const element = doc.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
    element.setAttribute('class', className);
    return element;
  };
  const svg = make('svg', 'mfe-stage');
  const below = make('g', 'mfe-below');
  const root = make('g', 'mfe-scene');
  const above = make('g', 'mfe-above');
  root.setAttribute('fill-rule', 'nonzero');
  root.setAttribute('stroke-linejoin', 'miter');
  root.setAttribute('stroke-miterlimit', String(MITER_LIMIT));
  root.setAttribute('stroke-linecap', 'butt');
  svg.append(below, root, above);

  // The groups, once, in the order the canvas paints in.
  const { project } = scene;
  const tracks = visualTracks(project);
  const depthOf = new Map(tracks.map((track, index) => [track.id, tracks.length - 1 - index]));
  const clipDepth = new Map<ClipId, number>();
  for (const clip of project.clips) clipDepth.set(clip.id, depthOf.get(clip.trackId) ?? 0);
  const transfers = scene.evaluator.events.flatMap((event) =>
    event.kind === 'transfer' ? [event] : [],
  );
  const clips = new Map<ClipId, SVGGElement>();
  const flightOf = new Map<string, SVGGElement>();
  const flights: Flight[] = [];
  const effects = new Map<number, SVGGElement>();
  // One depth more than there are tracks: a FocusOn's disc is drawn over every track.
  for (let depth = 0; depth <= tracks.length; depth++) {
    for (const clip of project.clips) {
      const name = names.get(clip.id);
      if (clipDepth.get(clip.id) !== depth || name === undefined) continue;
      const group = make('g', 'mfe-clip');
      group.setAttribute('data-clip', name);
      clips.set(clip.id, group);
      root.append(group);
    }
    for (const transfer of transfers) {
      const from = clipDepth.get(transfer.fromClipId);
      const to = clipDepth.get(transfer.toClipId);
      if (from === undefined || to === undefined || Math.max(from, to) !== depth) continue;
      const group = make('g', 'mfe-flight');
      group.setAttribute('data-from', names.get(transfer.fromClipId) ?? transfer.fromClipId);
      group.setAttribute('data-to', names.get(transfer.toClipId) ?? transfer.toClipId);
      flightOf.set(transfer.key, group);
      flights.push({ from: transfer.fromClipId, to: transfer.toClipId, element: group });
      root.append(group);
    }
    const group = make('g', 'mfe-effects');
    effects.set(depth, group);
    root.append(group);
  }
  const topEffects = effects.get(tracks.length)!;

  const groupOf = (drawable: Drawable): SVGGElement => {
    const fallback = effects.get(drawable.z) ?? topEffects;
    if (drawable.role === 'temp') return fallback;
    if (drawable.transfer !== undefined) return flightOf.get(drawable.transfer) ?? fallback;
    return clips.get(drawable.clipId) ?? fallback;
  };

  const nodes = new Map<string, Node>();
  // The evaluator hands the same list of contours for a glyph that did not move: its path data
  // is written once.
  const written_d = new WeakMap<object, string>();
  const cursors = new Map<SVGGElement, Element | null>();
  let stamp = 0;
  let viewBox = '';

  const set = (element: Element, name: string, value: string | null) => {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  };

  return {
    element: svg,
    draw(drawables, frame) {
      const box = `${written(frame.minX)} ${written(-frame.maxY)} ${written(
        frame.maxX - frame.minX,
      )} ${written(frame.maxY - frame.minY)}`;
      if (box !== viewBox) {
        svg.setAttribute('viewBox', box);
        viewBox = box;
      }
      stamp++;
      cursors.clear();
      for (const drawable of inDrawOrder(drawables)) {
        const fillOpacity = drawable.fill ? clamp01(drawable.fill.opacity) : 0;
        const strokeOpacity = drawable.stroke ? clamp01(drawable.stroke.opacity) : 0;
        const stroked = strokeOpacity > 0 && drawable.stroke!.width > 0;
        if (fillOpacity === 0 && !stroked) continue; // as the canvas: nothing to paint

        let node = nodes.get(drawable.key);
        if (!node) {
          node = {
            element: make('path', 'mfe-glyph'),
            contours: null,
            glyph: null,
            temp: false,
            fill: null,
            fillOpacity: null,
            stroke: null,
            strokeOpacity: null,
            strokeWidth: null,
            seen: 0,
          };
          nodes.set(drawable.key, node);
        }
        node.seen = stamp;
        const { element } = node;

        // Its place: after what was drawn before it in its group.
        const group = groupOf(drawable);
        const last = cursors.get(group);
        const wanted = last ? last.nextSibling : group.firstChild;
        if (element !== wanted) group.insertBefore(element, wanted);
        cursors.set(group, element);

        const temp = drawable.role === 'temp';
        if (node.temp !== temp) {
          element.setAttribute('class', temp ? 'mfe-effect' : 'mfe-glyph');
          node.temp = temp;
        }
        const glyph = drawable.glyph >= 0 ? drawable.glyph : null;
        if (node.glyph !== glyph) {
          set(element, 'data-glyph', glyph === null ? null : String(glyph));
          node.glyph = glyph;
        }
        const { contours } = drawable.path;
        if (node.contours !== contours) {
          let d = written_d.get(contours);
          if (d === undefined) {
            d = pathData(contours);
            written_d.set(contours, d);
          }
          element.setAttribute('d', d);
          node.contours = contours;
        }
        const fill = fillOpacity > 0 ? drawable.fill!.color : 'none';
        if (node.fill !== fill) {
          element.setAttribute('fill', fill);
          node.fill = fill;
        }
        const fillAlpha = fillOpacity > 0 && fillOpacity < 1 ? fillOpacity : null;
        if (node.fillOpacity !== fillAlpha) {
          set(element, 'fill-opacity', fillAlpha === null ? null : String(fillAlpha));
          node.fillOpacity = fillAlpha;
        }
        const stroke = stroked ? drawable.stroke!.color : null;
        if (node.stroke !== stroke) {
          set(element, 'stroke', stroke);
          node.stroke = stroke;
        }
        const strokeAlpha = stroked && strokeOpacity < 1 ? strokeOpacity : null;
        if (node.strokeOpacity !== strokeAlpha) {
          set(element, 'stroke-opacity', strokeAlpha === null ? null : String(strokeAlpha));
          node.strokeOpacity = strokeAlpha;
        }
        const strokeWidth = stroked ? written(drawable.stroke!.width * STROKE_UNIT) : null;
        if (node.strokeWidth !== strokeWidth) {
          set(element, 'stroke-width', strokeWidth === null ? null : String(strokeWidth));
          node.strokeWidth = strokeWidth;
        }
      }
      for (const [key, node] of nodes) {
        if (node.seen === stamp) continue;
        node.element.remove();
        nodes.delete(key);
      }
    },
    clip: (clipId) => clips.get(clipId) ?? null,
    flights: () => [...flights],
    layer: (name) => (name === 'below' ? below : above),
  };
}
