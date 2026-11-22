/* SVG drawing of one FormulaRender for the engine inspector: glyph outlines, their boxes and
 * render indices. Scene units are y-up, so glyphs are drawn inside a y-flipped group while the
 * index numbers stay upright. Hovering a glyph (or its row in the table) highlights both. */
import { boxSize, contoursToSvgPath, type Box } from '../../geom';
import type { FormulaRender } from '../../engine';

interface GlyphViewProps {
  render: FormulaRender;
  /** Render indices to highlight. */
  highlighted: ReadonlySet<number>;
  onHover: (index: number | null) => void;
  testId: string;
}

function padded(b: Box): Box {
  const [w, h] = boxSize(b);
  const pad = Math.max(w, h, 0.2) * 0.08;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

export function GlyphView({ render, highlighted, onHover, testId }: GlyphViewProps) {
  const view = padded(render.bbox);
  const [vw, vh] = boxSize(view);
  const fontSize = Math.max(vh, vw / 4) * 0.055;
  return (
    <div className="inspector-view">
      <svg
        className="inspector-svg"
        data-testid={testId}
        viewBox={`${view.minX} ${-view.maxY} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${render.glyphs.length} glyphs`}
      >
        <g transform="scale(1,-1)">
          {render.glyphs.map((g) => {
            const on = highlighted.has(g.index);
            const [w, h] = boxSize(g.bbox);
            return (
              <g
                key={g.index}
                data-testid={`${testId}-glyph-${g.index}`}
                className={on ? 'glyph glyph-active' : 'glyph'}
                onMouseEnter={() => onHover(g.index)}
                onMouseLeave={() => onHover(null)}
              >
                <rect
                  className="glyph-box"
                  x={g.bbox.minX}
                  y={g.bbox.minY}
                  width={Math.max(w, 1e-4)}
                  height={Math.max(h, 1e-4)}
                  vectorEffect="non-scaling-stroke"
                />
                <path className="glyph-shape" d={contoursToSvgPath(g.contours, 5)} />
              </g>
            );
          })}
        </g>
        {render.glyphs.map((g) => (
          <text
            key={g.index}
            className={highlighted.has(g.index) ? 'glyph-index glyph-index-active' : 'glyph-index'}
            x={g.bbox.minX}
            y={-g.bbox.maxY - fontSize * 0.2}
            fontSize={fontSize}
          >
            {g.index}
          </text>
        ))}
      </svg>
      <ol className="inspector-glyph-list" data-testid={`${testId}-labels`}>
        {render.glyphs.map((g) => (
          <li
            key={g.index}
            className={highlighted.has(g.index) ? 'active' : undefined}
            data-testid={`${testId}-label-${g.index}`}
            data-label={g.label}
            onMouseEnter={() => onHover(g.index)}
            onMouseLeave={() => onHover(null)}
          >
            <span className="glyph-list-index">{g.index}</span>
            <span className="glyph-list-label">{g.label}</span>
            {g.kind === 'rule' && <span className="glyph-list-kind">rule</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
