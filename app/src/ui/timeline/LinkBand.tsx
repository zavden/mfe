/* The line from the source port to the pointer while a link is being made. */
import type { LinkState } from './useClipLinking';

export function LinkBand({ link, height }: { link: LinkState; height: number }) {
  const [x0, y0] = link.origin;
  const [x1, y1] = link.pointer;
  const dx = Math.max(24, Math.abs(x1 - x0) / 2);
  const d = `M${x0} ${y0} C${x0 + dx} ${y0} ${x1 - dx} ${y1} ${x1} ${y1}`;
  return (
    <div className="tl-link-layer" data-testid="timeline-link-band" data-mode={link.mode}>
      <svg width="100%" height="100%">
        <path className="tl-link-band" d={d} />
        <circle className="tl-link-band-start" cx={x0} cy={y0} r={4} />
        <circle className="tl-link-band-end" cx={x1} cy={y1} r={3} />
      </svg>
      {/* Below the pointer, or above it near the bottom of the tracks (it would be cut off). */}
      <span
        className="tl-link-hint"
        style={{ left: x1 + 14, top: y1 + 10 + 22 > height ? y1 - 30 : y1 + 10 }}
      >
        {link.mode === 'drag' ? 'Release on the target clip' : 'Click the target clip'} · Esc
        cancels
      </span>
    </div>
  );
}
