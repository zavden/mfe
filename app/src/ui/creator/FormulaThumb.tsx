/* Small SVG rendering of a formula (glyph outlines in the formula's colours) on the project's
 * background, so white formulas stay readable in the light theme too. Each glyph is painted as
 * the Preview paints it (its `GlyphStyle`): a text glyph is filled; the outline of a box, a line
 * and the shaft of an arrow are stroked and empty; a tip is filled. */
import { defaultClipState, isBlank } from '../../model';
import type { Formula } from '../../model';
import type { ResolvedFormula } from '../../engine';
import { MITER_LIMIT, STROKE_UNIT } from '../../render';
import { glyphColor } from '../../scene';
import { drawnGlyphs, viewBoxOf, type DrawnGlyph } from './glyphPaths';

const NO_STYLE = defaultClipState();
/** The least a stroke is wide in a thumbnail, in pixels: a line is a few hundredths of a scene
 * unit wide, less than a pixel in a thumbnail that holds all of it. */
const MIN_STROKE = 1;

interface FormulaThumbProps {
  formula: Formula;
  resolved: ResolvedFormula | null;
  background: string;
}

/** One glyph: its fill, then its stroke at its width in the scene and again as a hairline of
 * `MIN_STROKE` that does not shrink with the thumbnail — what is seen is the wider of the two. */
function ThumbGlyph({ glyph, color, fill }: { glyph: DrawnGlyph; color: string; fill: string }) {
  const { fillOpacity, strokeWidth, strokeOpacity } = glyph.style;
  return (
    <>
      {fillOpacity > 0 && (
        <path d={glyph.d} fill={fill} fillOpacity={fillOpacity < 1 ? fillOpacity : undefined} />
      )}
      {strokeWidth > 0 && strokeOpacity > 0 && (
        <g
          fill="none"
          stroke={color}
          strokeMiterlimit={MITER_LIMIT}
          opacity={strokeOpacity < 1 ? strokeOpacity : undefined}
        >
          <path d={glyph.d} strokeWidth={strokeWidth * STROKE_UNIT} />
          <path d={glyph.d} strokeWidth={MIN_STROKE} vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </>
  );
}

export function FormulaThumb({ formula, resolved, background }: FormulaThumbProps) {
  /** A shape's fill has the colour of its stroke unless it has one of its own. */
  const fillColor = formula.kind === 'shape' ? formula.fillColor : undefined;
  return (
    <div className="formula-thumb" style={{ background }} data-testid="formula-thumb">
      {resolved ? (
        <svg
          viewBox={viewBoxOf(resolved.render.bbox, 0.15)}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${formula.name}: ${formula.source}`}
        >
          <g transform="scale(1,-1)">
            {drawnGlyphs(resolved).map((glyph) => {
              const color = glyphColor(glyph.canonical, NO_STYLE, formula);
              return (
                <ThumbGlyph
                  key={glyph.canonical}
                  glyph={glyph}
                  color={color}
                  fill={fillColor ?? color}
                />
              );
            })}
          </g>
        </svg>
      ) : (
        <span className="formula-thumb-empty">{isBlank(formula) ? 'empty' : '…'}</span>
      )}
    </div>
  );
}
