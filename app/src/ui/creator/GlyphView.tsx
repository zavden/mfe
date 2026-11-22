/* The glyphs of a formula as an SVG: each glyph in its colour (grey when hidden at the start)
 * inside its frame, the selected ones highlighted, and the hovered one's index in a badge under
 * its lower left. A frame is the glyph's box, at least FRAME_MIN_PX each way on screen, drawn
 * under every glyph: the bar of a fraction or a minus sign shows its states like a letter, and no
 * frame covers a neighbour's ink. It reports clicks, right-clicks and hovers; the caller keeps the
 * selection. With `marquee`, a rectangle dragged over it selects glyphs too (see useMarquee);
 * without, a container may run one over several views, through the glyphs' `data-marquee` keys.
 * Pressing it focuses it, so that Ctrl/⌘+Z reaches the project rather than the field that had
 * the focus. */
import { useRef, type CSSProperties, type MouseEvent } from 'react';
import { boxSize } from '../../geom';
import type { ResolvedFormula } from '../../engine';
import { defaultClipState, type Formula } from '../../model';
import { glyphColor } from '../../scene';
import { useContentSize } from '../useContentSize';
import { useMarquee } from '../useMarquee';
import { atLeastSize, drawnGlyphs, meetScale, viewBoxRect } from './glyphPaths';

const NO_STYLE = defaultClipState();
/** A glyph hidden at the start is drawn in this grey, whatever its colour. */
const HIDDEN_FILL = '#8A8A99';
const HIDDEN_OPACITY = 0.45;
/** A dimmed glyph (not on screen at some moment) is drawn this faint. */
const DIMMED_OPACITY = 0.22;
const NO_MARQUEE = { onStart: () => {}, onChange: () => {} };
/** The least a glyph's frame measures each way, in CSS pixels, at any size of the view. Around a
 * thinner glyph the frame takes clicks too, where no glyph's own box is. */
export const FRAME_MIN_PX = 10;

/** How many tints the marks of a view have (creator.css, `.gv-mark-<n>`): they repeat after. */
export const GLYPH_MARK_TINTS = 5;

export interface GlyphViewProps {
  formula: Formula;
  resolved: ResolvedFormula;
  background: string;
  selected: ReadonlySet<number>;
  /** The glyph whose index the badge shows (hovered here or in a list next to the view). */
  hovered: number | null;
  onHover(index: number | null): void;
  onGlyphClick(index: number, event: MouseEvent): void;
  onBackgroundClick(): void;
  /** A right-click on a glyph, or on the background (null). The browser's menu is prevented. */
  onContextMenu(index: number | null, event: MouseEvent): void;
  /** Rectangle selection inside this view: keys are glyph indices. */
  marquee?: {
    onStart(cancel: () => void): void;
    onChange(keys: string[], additive: boolean): void;
    onEnd?(cancelled: boolean): void;
  };
  /** Glyphs drawn faint, e.g. the ones that are not on screen when an animation block starts. */
  dimmed?: ReadonlySet<number>;
  /** A mark for some glyphs (0, 1, 2…): those with the same one are tinted alike, to tell sets of
   * glyphs apart (the parts a block is split into). A selected glyph shows as selected. */
  marks?: ReadonlyMap<number, number>;
  /** Prefix of the glyphs' `data-marquee` keys (`<prefix><index>`). */
  marqueePrefix?: string;
  /** Prefix of the test ids: `<p>-<index>`, `<p>-index`, `<p>-marquee`. */
  testIdPrefix?: string;
  className?: string;
}

export function GlyphView({
  formula,
  resolved,
  background,
  selected,
  hovered,
  onHover,
  onGlyphClick,
  onBackgroundClick,
  onContextMenu,
  marquee: marqueeHandlers,
  dimmed,
  marks,
  marqueePrefix = '',
  testIdPrefix = 'glyph',
  className = 'glyph-svg',
}: GlyphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const marquee = useMarquee({
    containerRef: svgRef,
    ...(marqueeHandlers ?? NO_MARQUEE),
  });

  const glyphs = drawnGlyphs(resolved);
  const [vw, vh] = boxSize(resolved.render.bbox);
  // The badge (1.35 label sizes tall, under the glyph) fits in the view's 12% margin.
  const labelSize = Math.max(vh, vw / 4, 0.2) * 0.08;
  const colorOf = (index: number) => glyphColor(index, NO_STYLE, formula);
  const hidden = new Set(formula.hiddenGlyphs);

  const viewBox = viewBoxRect(resolved.render.bbox, 0.12);
  const size = useContentSize(svgRef);
  const scale = size && meetScale(size[0], size[1], viewBox[2], viewBox[3]);
  const least = scale ? FRAME_MIN_PX / scale : 0;
  const frames = glyphs.map((glyph) => atLeastSize(glyph.bbox, least, least));
  // One CSS pixel in the drawing's units, for the stylesheet: the lengths of a filter on an SVG
  // element (the glow of a selected frame) are in those units.
  const style: CSSProperties = scale
    ? { background, ['--gv-px' as string]: `${1 / scale}px` }
    : { background };

  /** The classes of a glyph's states, on the glyph and on its frame (creator.css). */
  const stateClasses = (index: number) => {
    const mark = marks?.get(index);
    return `${selected.has(index) ? ' gv-selected' : ''}${hidden.has(index) ? ' gv-hidden' : ''}${dimmed?.has(index) ? ' gv-dimmed' : ''}${mark === undefined ? '' : ` gv-marked gv-mark-${mark % GLYPH_MARK_TINTS}`}`;
  };

  const handlers = (index: number) => ({
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      onGlyphClick(index, event);
    },
    onContextMenu: (event: MouseEvent) => {
      event.stopPropagation();
      onContextMenu(index, event);
    },
    onMouseEnter: () => onHover(index),
    onMouseLeave: () => onHover(null),
  });

  /** The index of the hovered glyph, in a badge just under its frame's lower left (as in the
   * relation editor): indices of every glyph at once overlap in dense formulas. */
  const indexBadge = () => {
    const at = hovered === null ? -1 : glyphs.findIndex((g) => g.canonical === hovered);
    const glyph = glyphs[at];
    if (!glyph) return null;
    const frame = frames[at]!;
    const text = String(glyph.canonical);
    const width = labelSize * (0.62 * text.length + 0.6);
    const height = labelSize * 1.35;
    const x = frame.minX;
    const y = -frame.minY + labelSize * 0.12;
    return (
      <g className="gv-index" data-testid={`${testIdPrefix}-index`} data-index={glyph.canonical}>
        <rect x={x} y={y} width={width} height={height} rx={labelSize * 0.3} />
        <text x={x + width / 2} y={y + height * 0.74} fontSize={labelSize} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };

  return (
    <svg
      className={className}
      ref={svgRef}
      viewBox={viewBox.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      onClick={onBackgroundClick}
      tabIndex={-1}
      onPointerDown={(event) => {
        svgRef.current?.focus({ preventScroll: true });
        if (marqueeHandlers) marquee.onPointerDown(event);
      }}
      onContextMenu={(event) => onContextMenu(null, event)}
      role="group"
      aria-label={`Glyphs of ${formula.name}`}
    >
      <g transform="scale(1,-1)">
        {/* The frames first, under every glyph: one's tint, stroke and glow never cover the ink
            of a neighbour, and around a thin glyph its frame takes the clicks that no glyph's own
            box above takes. */}
        <g className="gv-frames">
          {glyphs.map((glyph, at) => {
            const frame = frames[at]!;
            return (
              <rect
                key={glyph.canonical}
                className={`gv-frame${stateClasses(glyph.canonical)}${hovered === glyph.canonical ? ' gv-hovered' : ''}`}
                data-testid={`${testIdPrefix}-${glyph.canonical}-frame`}
                x={frame.minX}
                y={frame.minY}
                width={Math.max(frame.maxX - frame.minX, 1e-3)}
                height={Math.max(frame.maxY - frame.minY, 1e-3)}
                vectorEffect="non-scaling-stroke"
                {...handlers(glyph.canonical)}
              />
            );
          })}
        </g>
        {glyphs.map((glyph) => {
          const on = selected.has(glyph.canonical);
          const off = hidden.has(glyph.canonical);
          const faint = dimmed?.has(glyph.canonical) ?? false;
          const mark = marks?.get(glyph.canonical);
          const w = glyph.bbox.maxX - glyph.bbox.minX;
          const h = glyph.bbox.maxY - glyph.bbox.minY;
          return (
            <g
              key={glyph.canonical}
              className={`gv-glyph${stateClasses(glyph.canonical)}`}
              data-testid={`${testIdPrefix}-${glyph.canonical}`}
              data-mark={mark}
              data-selected={on}
              data-hidden={off}
              data-dimmed={faint}
              data-color={colorOf(glyph.canonical)}
              {...handlers(glyph.canonical)}
            >
              <title>{`${glyph.canonical}: ${glyph.label}${off ? ' (hidden at the start)' : ''}${faint ? ' (not on screen)' : ''}`}</title>
              {/* The glyph's own box, unpainted: what a click on it and a marquee touch. */}
              <rect
                className="gv-box"
                data-marquee={`${marqueePrefix}${glyph.canonical}`}
                x={glyph.bbox.minX}
                y={glyph.bbox.minY}
                width={Math.max(w, 1e-3)}
                height={Math.max(h, 1e-3)}
              />
              <path
                d={glyph.d}
                fill={off ? HIDDEN_FILL : colorOf(glyph.canonical)}
                fillOpacity={faint ? DIMMED_OPACITY : off ? HIDDEN_OPACITY : undefined}
              />
            </g>
          );
        })}
      </g>
      {indexBadge()}
      {marquee.rect && (
        <rect
          className="marquee-rect"
          data-testid={`${testIdPrefix}-marquee`}
          {...marquee.rect}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
