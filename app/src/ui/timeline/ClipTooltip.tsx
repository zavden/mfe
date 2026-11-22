/* The tooltip of a clip the pointer rests on: the formula's thumbnail, its name and the clip's
 * times, next to the pointer and kept inside the window. The Timeline shows it through the hover
 * intent of `hoverTip.ts`. */
import type { ClipId } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { FormulaThumb } from '../creator/FormulaThumb';

const WIDTH = 240;
const HEIGHT = 88;
const OFFSET = 14;

interface ClipTooltipProps {
  clipId: ClipId;
  /** Where the pointer rested, in viewport coordinates. */
  x: number;
  y: number;
}

export function ClipTooltip({ clipId, x, y }: ClipTooltipProps) {
  const project = useProjectStore((state) => state.project);
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip ? project.formulas.find((f) => f.id === clip.formulaId) : undefined;
  const entry = useRenderStore((state) => (formula ? state.entries[formula.id] : undefined));
  if (!clip || !formula) return null;
  const left = x + OFFSET + WIDTH > window.innerWidth ? x - OFFSET - WIDTH : x + OFFSET;
  const top = y + OFFSET + HEIGHT > window.innerHeight ? y - OFFSET - HEIGHT : y + OFFSET;
  return (
    <div className="tl-tip" role="tooltip" data-testid="clip-tooltip" style={{ left, top }}>
      <FormulaThumb
        formula={formula}
        resolved={entry?.resolved ?? null}
        background={project.meta.background}
      />
      <div className="tl-tip-caption">
        <span className="tl-tip-name">{formula.name}</span>
        <span>
          {clip.start.toFixed(2)}–{clip.end.toFixed(2)} s
        </span>
      </div>
    </div>
  );
}
