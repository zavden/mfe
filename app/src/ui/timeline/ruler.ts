/* Time ruler geometry: which ticks to draw at a zoom level, their labels, and the matching
 * snapping grid; and the steps of a dt of one's own, which the small ticks follow instead
 * (D181). */

const MAJORS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
const MINOR_OF: Record<number, number> = {
  0.05: 0.01,
  0.1: 0.02,
  0.2: 0.05,
  0.5: 0.1,
  1: 0.2,
  2: 0.5,
  5: 1,
  10: 2,
  15: 5,
  30: 5,
  60: 10,
  120: 30,
  300: 60,
  600: 120,
  1800: 300,
  3600: 600,
};

export const MIN_ZOOM = 8;
export const MAX_ZOOM = 2400;
export const DEFAULT_ZOOM = 80;

export interface RulerScale {
  /** Distance between labelled ticks, seconds. */
  major: number;
  /** Distance between small ticks (and the snapping grid), seconds. */
  minor: number;
}

/** Tick spacing for `pxPerSecond`: labels at least ~90 px apart; ticks on every frame when there
 * is room for them (≥ 6 px). */
export function rulerScale(pxPerSecond: number, fps: number): RulerScale {
  const major = MAJORS.find((m) => m * pxPerSecond >= 90) ?? 3600;
  let minor = MINOR_OF[major]!;
  const frame = 1 / fps;
  if (frame * pxPerSecond >= 6 && frame < minor) minor = frame;
  return { major, minor };
}

/** `t` on the small ticks of the ruler: the nearest multiple of `minor` from 0 to `limit` — the
 * last tick before the end when the end is on none. Where the playhead goes while it is dragged
 * with Ctrl/⌘ held (D174). */
export function nearestTick(t: number, minor: number, limit: number): number {
  const last = Math.floor(limit / minor + 1e-9);
  return Math.min(Math.max(Math.round(t / minor), 0), last) * minor;
}

/** The time between two small ticks (`RulerScale.minor`) as the toolbar says it: in seconds
 * ("0.5 s", "0.02 s"); a tick on every frame as the fraction it is ("1/60 s") when its decimals
 * do not end; in minutes from a minute up ("2 min"). */
export function tickLabel(minor: number, fps: number): string {
  if (minor >= 60) return `${+(minor / 60).toFixed(2)} min`;
  const short = +minor.toFixed(3);
  if (Math.abs(short - minor) > 1e-9 && Math.abs(minor - 1 / fps) < 1e-9) return `1/${fps} s`;
  return `${short} s`;
}

/** The shortest dt of one's own (D181), which the toolbar's − and + step by: a tenth of a second.
 * The zoom's own can be shorter (0.02 s, a frame). */
export const MIN_OWN_DT = 0.1;
/** The longest dt of one's own: an hour, longer than the zoom's own ever is (ten minutes, at the
 * lowest zoom of a long timeline). */
export const MAX_OWN_DT = 3600;

/** The dt the toolbar's − (`direction` −1) or + (1) sets from `dt`, the zoom's own or one's own
 * (D181): the tenth of a second before it or after it — from 0.5 s, 0.4 s and 0.6 s; from 0.02 s,
 * + gives 0.1 s —, within [MIN_OWN_DT, MAX_OWN_DT]; null where there is none, the key having
 * nothing to do. Worked out in whole tenths, so that it is the tenth itself (0.3, never
 * 0.30000000000000004). */
export function steppedDt(dt: number, direction: -1 | 1): number | null {
  const tenths = dt * 10;
  const whole = Math.round(tenths);
  const from = Math.abs(tenths - whole) < 1e-6 ? whole : tenths;
  const next = direction > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1;
  return next < MIN_OWN_DT * 10 || next > MAX_OWN_DT * 10 ? null : next / 10;
}

/** A dt of one's own as the toolbar says it (D181): in seconds, on the tenth it is ("0.3 s",
 * "75.5 s"), which minutes would round away. */
export function ownDtLabel(dt: number): string {
  return `${+dt.toFixed(1)} s`;
}

/** Small ticks closer together than this, CSS px, are not drawn: a dt of one's own (D181) can be
 * far shorter than the zoom's, and a line every pixel or two would only grey the ruler. */
export const MIN_TICK_SPACING = 4;

/** The small ticks of the ruler, `dt` apart at `pxPerSecond`, as the background that draws them:
 * a line a pixel wide at every tick from time 0 — none when they would be closer together than
 * MIN_TICK_SPACING. */
export function smallTicks(dt: number, pxPerSecond: number): string {
  const spacing = dt * pxPerSecond;
  if (spacing < MIN_TICK_SPACING) return 'none';
  return `repeating-linear-gradient(to right, var(--text-dim) 0, var(--text-dim) 1px, transparent 1px, transparent ${spacing}px)`;
}

export function clampZoom(pxPerSecond: number, minimum = MIN_ZOOM): number {
  return Math.min(MAX_ZOOM, Math.max(minimum, pxPerSecond));
}

/** Label of a major tick. */
export function rulerLabel(t: number, major: number): string {
  if (t >= 60) {
    const minutes = Math.floor(t / 60);
    const seconds = t - minutes * 60;
    const text =
      major < 1
        ? seconds.toFixed(2).padStart(5, '0')
        : String(Math.round(seconds)).padStart(2, '0');
    return `${minutes}:${text}`;
  }
  if (major >= 1) return `${Math.round(t)}s`;
  return `${t.toFixed(major < 0.1 ? 2 : 1)}s`;
}

/** The most ticks the ruler labels at once. What a view shows, widened by a viewport on each side
 * (`labelBand`), is a few hundred at most; the limit is for a stretch nobody measured — the whole
 * timeline, which is what is labelled before the view has a width, of a scene hours long or of
 * the length a file made by hand gives it. */
export const MAX_MAJOR_TICKS = 2000;

/** Times of the labelled ticks in [from, to], `MAX_MAJOR_TICKS` steps from the first at most.
 * (Small ticks are drawn with a repeating gradient.) */
export function majorTicks(from: number, to: number, scale: RulerScale): number[] {
  const first = Math.max(0, Math.floor(from / scale.major));
  const steps = Math.min(MAX_MAJOR_TICKS, Math.ceil(to / scale.major) - first);
  const ticks: number[] = [];
  // Counted by the step, not by the tick: past 2^53 a tick plus one is the same tick.
  for (let k = 0; k <= steps; k++) ticks.push((first + k) * scale.major);
  return ticks;
}

/** A stretch of time, seconds. */
export interface Stretch {
  from: number;
  to: number;
}

/** The time a scroll container shows: `scrollLeft` and `clientWidth` are its own (CSS px), and
 * the track header column of `headerWidth` px sits before time 0. */
export function visibleStretch(
  scrollLeft: number,
  clientWidth: number,
  headerWidth: number,
  pxPerSecond: number,
): Stretch {
  const from = (scrollLeft - headerWidth) / pxPerSecond;
  return { from, to: from + clientWidth / pxPerSecond };
}

/** The stretch whose labels are worth drawing for `visible`: itself widened by its own length on
 * each side, within [0, totalSeconds], so that a scroll step seldom needs new labels. */
export function labelBand(visible: Stretch, totalSeconds: number): Stretch {
  const span = visible.to - visible.from;
  return {
    from: Math.max(0, visible.from - span),
    to: Math.min(totalSeconds, visible.to + span),
  };
}

/** Whether `band` still holds everything `visible` shows (within [0, totalSeconds]). */
export function bandCovers(band: Stretch, visible: Stretch, totalSeconds: number): boolean {
  return band.from <= Math.max(0, visible.from) && band.to >= Math.min(totalSeconds, visible.to);
}

/** The seconds the timeline lays out: the scene, or as far as its clips reach, and room after
 * the end to drop a clip or stretch one — never less than a short scene's worth. */
export function timelineExtent(duration: number, lastEnd: number): number {
  return Math.max(12, duration + 6, lastEnd + 6);
}

/** The zoom at which `seconds` of timeline are as wide as a view of `widthPx`: the whole
 * timeline in view, with nothing left to scroll — where the slider's thumb fills its bar, and
 * the lowest zoom that shows anything more. Half a pixel under, so that a width on whole pixels
 * never overflows by one. */
export function wholeZoom(seconds: number, widthPx: number): number {
  if (seconds <= 0 || widthPx <= 0) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(0.001, (widthPx - 0.5) / seconds));
}

/** The lowest zoom of a timeline of `seconds` in a view of `widthPx`: the one of a short scene,
 * which keeps its familiar scale, or the one that shows the whole timeline when that is lower —
 * a long one always fits in the view, and zooming out stops exactly there. */
export function lowestZoom(seconds: number, widthPx: number): number {
  return seconds > 0 && widthPx > 0 ? Math.min(MIN_ZOOM, wholeZoom(seconds, widthPx)) : MIN_ZOOM;
}
