/* Where a symbol is kept in time: align by symbol can measure the symbol to move at one instant
 * and its reference at another (G, `preview/symbolAlign.ts`), and while it does, the ruler marks
 * the kept instant — the playhead is somewhere else by then. The mark is the mode's, not the
 * project's: it goes when the symbol is let go, aligned, or the mode left. A press on it is a
 * press on the ruler there: the playhead goes back to that instant. */
import { useProjectStore } from '../../store';
import { useSymbolAlign } from '../preview/symbolAlign';
import { seconds } from '../preview/symbolHold';
import { useTimelineStore } from './timelineStore';

export function SymbolHoldMark() {
  const phase = useSymbolAlign((s) => s.phase);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const target = phase && phase.step !== 'target' && phase.held ? phase.target : null;
  const name = useProjectStore((s) => {
    const clip = target && s.project.clips.find((c) => c.id === target.clipId);
    return (clip && s.project.formulas.find((f) => f.id === clip.formulaId)?.name) ?? null;
  });
  if (!phase || phase.step === 'target' || !phase.held || !target) return null;
  const { at } = phase.held;
  const label =
    `“${target.label}” of “${name ?? 'Formula'}” kept as at ${seconds(at)} ` +
    '(align by symbol): G lets it go';
  return (
    <div
      className="tl-hold-mark"
      role="img"
      aria-label={label}
      title={label}
      data-testid="timeline-symbol-hold"
      data-time={at}
      style={{ left: at * px }}
    >
      {/* The playhead's shape, hollow: where it was. */}
      <svg viewBox="0 0 13 26" aria-hidden="true" focusable="false">
        <path className="tl-hold-stem" d="M6.5 0V17" />
        <path d="M1 17.5h11L6.5 25z" />
      </svg>
    </div>
  );
}
