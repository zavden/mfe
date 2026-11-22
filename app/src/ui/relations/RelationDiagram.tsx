/* A relation block diagram (images/gui-3x.png; layouts in diagramLayout.ts): coloured blocks for
 * the clips, a chip per glyph that takes part, an arrow per pair. Clicking an arrow selects its
 * relation. */
import type { ResolvedFormulas } from '../../engine';
import { copiesSources, type RelationId } from '../../model';
import { drawnGlyphs } from '../creator/glyphPaths';
import type { Diagram, DiagramBlock, DiagramChip } from './diagramLayout';

const GLYPH_BOX = 16;

function MiniGlyph({
  chip,
  block,
  resolved,
}: {
  chip: DiagramChip;
  block: DiagramBlock;
  resolved: ResolvedFormulas;
}) {
  const formulaResolved = resolved.get(block.formulaId);
  const glyph = formulaResolved
    ? drawnGlyphs(formulaResolved).find((g) => g.canonical === chip.glyph)
    : undefined;
  if (!glyph) return null;
  const w = glyph.bbox.maxX - glyph.bbox.minX;
  const h = glyph.bbox.maxY - glyph.bbox.minY;
  const s = GLYPH_BOX / Math.max(w, h, 1e-6);
  // Fit the glyph into a GLYPH_BOX square at the chip's left, y flipped (glyphs are y-up).
  const tx = chip.x + 4 + (GLYPH_BOX - w * s) / 2 - glyph.bbox.minX * s;
  const ty = chip.y + (chip.h - GLYPH_BOX) / 2 + (GLYPH_BOX + h * s) / 2 + glyph.bbox.minY * s;
  return (
    <path
      d={glyph.d}
      transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)} ${(-s).toFixed(4)})`}
      fill="currentColor"
    />
  );
}

/** Scale of the diagram at its natural size (and the most it grows to fit a panel). */
const NATURAL_SCALE = 1.4;

export interface RelationDiagramProps {
  diagram: Diagram;
  resolved: ResolvedFormulas;
  selectedRelationId: RelationId | null;
  onSelectRelation(id: RelationId): void;
  /** What the diagram shows, for assistive technology. */
  label: string;
  /** `fit`: as wide as the container (up to the natural size); `natural`: its natural size, for
   * a container that scrolls. */
  size?: 'fit' | 'natural';
  testId?: string;
  /** One pair's link drawn as picked (the path picker's hover). */
  pickedPair?: { relationId: RelationId; pairIndex: number } | null;
  /** A click on a link, by pair (besides `onSelectRelation`). */
  onPickPair?(relationId: RelationId, pairIndex: number): void;
  /** The pointer over a link, or over none (null). */
  onHoverPair?(relationId: RelationId, pairIndex: number | null): void;
}

export function RelationDiagram({
  diagram,
  resolved,
  selectedRelationId,
  onSelectRelation,
  label,
  size = 'fit',
  testId = 'relation-diagram',
  pickedPair = null,
  onPickPair,
  onHoverPair,
}: RelationDiagramProps) {
  if (diagram.blocks.length === 0) return null;

  return (
    <svg
      className="rd"
      data-testid={testId}
      data-blocks={diagram.blocks.length}
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
      width={size === 'fit' ? '100%' : diagram.width * NATURAL_SCALE}
      height={size === 'fit' ? undefined : diagram.height * NATURAL_SCALE}
      style={size === 'fit' ? { maxWidth: diagram.width * NATURAL_SCALE } : undefined}
      role="img"
      aria-label={label}
    >
      {diagram.blocks.map((block) => (
        <g
          key={block.clipId}
          data-testid={`rd-block-${block.clipId}`}
          data-current={block.current}
          style={{ ['--block-color' as string]: block.color }}
        >
          <rect
            x={block.x}
            y={block.y}
            width={block.w}
            height={block.h}
            rx={8}
            fill={block.color}
            fillOpacity={block.current ? 0.32 : 0.2}
            stroke={block.color}
            strokeWidth={block.current ? 2 : 1}
          />
          <text x={block.x + 8} y={block.y + 14} fontSize={11} fontWeight={600} fill="currentColor">
            {block.icon ? `${block.icon} ` : ''}
            {block.name.length > 12 ? `${block.name.slice(0, 11)}…` : block.name}
          </text>
          {block.chips.map((chip) => (
            <g key={chip.key} data-testid={`rd-chip-${chip.key}`} data-label={chip.label}>
              <rect
                x={chip.x}
                y={chip.y}
                width={chip.w}
                height={chip.h}
                rx={6}
                fill="var(--panel)"
                stroke={block.color}
                strokeWidth={1}
              />
              <MiniGlyph chip={chip} block={block} resolved={resolved} />
              <text
                x={chip.x + 4 + GLYPH_BOX + 6}
                y={chip.y + chip.h / 2 + 4}
                fontSize={12}
                fontFamily="'JetBrains Mono', ui-monospace, monospace"
                fill="currentColor"
              >
                {chip.label.length > 6 ? `${chip.label.slice(0, 5)}…` : chip.label}
              </text>
              <text
                x={chip.x + chip.w - 4}
                y={chip.y + chip.h / 2 + 3}
                fontSize={9}
                textAnchor="end"
                fill="var(--text-dim)"
              >
                {chip.glyph}
              </text>
            </g>
          ))}
        </g>
      ))}
      {diagram.edges.map((edge) => {
        const selected = edge.relationId === selectedRelationId;
        const picked =
          pickedPair !== null &&
          pickedPair.relationId === edge.relationId &&
          pickedPair.pairIndex === edge.pairIndex;
        return (
          <g
            key={`${edge.relationId}:${edge.pairIndex}`}
            className={`rd-edge-group${selected ? ' is-selected' : ''}${picked ? ' is-picked' : ''}`}
            data-testid={`rd-edge-${edge.relationId}-${edge.pairIndex}`}
            data-style={edge.style}
            onClick={() => {
              onSelectRelation(edge.relationId);
              onPickPair?.(edge.relationId, edge.pairIndex);
            }}
            onMouseEnter={onHoverPair && (() => onHoverPair(edge.relationId, edge.pairIndex))}
            onMouseLeave={onHoverPair && (() => onHoverPair(edge.relationId, null))}
          >
            {edge.paths.map((d, i) => (
              <g key={i}>
                <path className={`rd-edge${copiesSources(edge.style) ? ' is-copy' : ''}`} d={d} />
                <path className="rd-edge-hit" d={d} />
              </g>
            ))}
            {edge.node && (
              <circle className="rd-node" cx={edge.node[0]} cy={edge.node[1]} r={3.2} />
            )}
            {edge.heads.map(([x, y], i) => (
              <path
                key={`h${i}`}
                className="rd-arrow"
                d={`M${x - 6} ${y - 4} L${x} ${y} L${x - 6} ${y + 4}`}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
