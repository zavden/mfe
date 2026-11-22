/* Timing of the generated scene (docs/ARCHITECTURE.md §8, "Timing: frame grid, then slices").
 *
 * 1. Every event boundary is snapped to the frame grid (`round(t · fps)`), and an event that
 *    takes time lasts at least one frame. Snapping is monotone, so it never reorders events.
 * 2. The timeline is cut at every boundary. Each piece is a `wait` (nothing runs), or a `play`
 *    of the events running over it: an event whose whole interval is the piece is played as
 *    is, one that spans several pieces is played in parts (`_Part(anim, a0, a1)`).
 * 3. Instantaneous events (`none` intros / outros) become `instant` steps at their frame, before
 *    the piece that starts there. Nothing happens at or after the last frame.
 * 4. The marks of the Slides mode go between the steps at their frame (`placeMarks`), splitting a
 *    wait they fall in.
 *
 * Pure and Manim-agnostic: the generator decides which events are worth playing. */

export interface Timed<E> {
  event: E;
  /** Snapped frames, [f0, f1); f0 === f1 for instantaneous events. */
  f0: number;
  f1: number;
}

export interface PartRef<E> {
  item: Timed<E>;
  /** The stretch of the event inside the piece, as fractions (numerator / item length). */
  from: number;
  to: number;
  /** from === 0 && to === length: the event runs exactly over this piece. */
  whole: boolean;
  /** First / last piece of the event. */
  first: boolean;
  last: boolean;
}

export type Step<E> =
  | { kind: 'instant'; frame: number; items: Timed<E>[] }
  | { kind: 'wait'; f0: number; f1: number }
  | { kind: 'play'; f0: number; f1: number; parts: PartRef<E>[] };

/** Frame of time `t` on the grid (ties to the next frame; float noise below 1e-6 frames is
 * ignored). */
export function snapFrame(t: number, fps: number): number {
  return Math.round(Math.round(t * fps * 1e6) / 1e6);
}

export interface SnapResult<E> {
  items: Timed<E>[];
  /** Largest boundary shift in seconds (stretching to one frame and pushing included). */
  maxShift: number;
  /** Events whose start or end moved by more than a quarter frame. */
  moved: E[];
  /** Events pushed later because an earlier event of the same clip was stretched into them. */
  pushed: E[];
}

/** Snap events to the frame grid. `instant(e)` tells events that take no time; `groups(e)` names
 * what an event animates (its clips): two events of a group that did not overlap before snapping
 * never overlap after it (stretching an event to one frame may push the next one later). */
export function snapEvents<E extends { start: number; end: number }>(
  events: readonly E[],
  fps: number,
  instant: (event: E) => boolean,
  groups: (event: E) => readonly string[] = () => [],
): SnapResult<E> {
  const items = events.map((event) => {
    // No event starts before the scene does. A project in error can hold one — a relation window
    // left out of place before 0 s —: it is taken from frame 0, and counted among the moved ones,
    // so that every animation has a first frame to be written at (`planSteps`).
    const f0 = Math.max(0, snapFrame(event.start, fps));
    let f1 = instant(event) ? f0 : Math.max(0, snapFrame(event.end, fps));
    if (!instant(event) && f1 <= f0) f1 = f0 + 1;
    return { event, f0, f1 };
  });

  // In start order, each event starts no earlier than the snapped end of every earlier event of
  // its groups that ended before it began. Snapping is monotone, so only a stretch can break that.
  const pushed: E[] = [];
  const order = [...items].sort((a, b) => a.event.start - b.event.start || a.f0 - b.f0);
  const done: Timed<E>[] = [];
  for (const item of order) {
    const mine = new Set(groups(item.event));
    let earliest = item.f0;
    if (mine.size > 0) {
      for (const before of done) {
        if (before.event.end > item.event.start + 1e-9) continue;
        if (!groups(before.event).some((g) => mine.has(g))) continue;
        earliest = Math.max(earliest, before.f1);
      }
    }
    if (earliest > item.f0) {
      const length = item.f1 - item.f0;
      item.f0 = earliest;
      item.f1 = earliest + length;
      pushed.push(item.event);
    }
    done.push(item);
  }

  let maxShift = 0;
  const moved: E[] = [];
  for (const { event, f0, f1 } of items) {
    const shift = Math.max(Math.abs(f0 / fps - event.start), Math.abs(f1 / fps - event.end));
    maxShift = Math.max(maxShift, shift);
    if (shift > 0.25 / fps + 1e-9) moved.push(event);
  }
  return { items, maxShift, moved, pushed };
}

/** Cut [0, total) at every boundary. Events are clipped to the scene end; instantaneous events at
 * or after `total` are dropped (nothing is rendered after the last frame). */
export function planSteps<E>(items: readonly Timed<E>[], total: number): Step<E>[] {
  const timed = items.filter((i) => i.f1 > i.f0 && i.f0 < total);
  const instants = items.filter((i) => i.f1 === i.f0 && i.f0 < total);
  const cuts = new Set<number>([0, total]);
  for (const i of timed) {
    cuts.add(i.f0);
    cuts.add(Math.min(i.f1, total));
  }
  for (const i of instants) cuts.add(i.f0);
  const bounds = [...cuts].filter((b) => b >= 0 && b <= total).sort((a, b) => a - b);

  const steps: Step<E>[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const b0 = bounds[k]!;
    const b1 = bounds[k + 1]!;
    const here = instants.filter((i) => i.f0 === b0);
    if (here.length > 0) steps.push({ kind: 'instant', frame: b0, items: here });
    const parts: PartRef<E>[] = timed
      .filter((i) => i.f0 <= b0 && i.f1 >= b1)
      .map((item) => {
        const length = item.f1 - item.f0;
        const from = b0 - item.f0;
        const to = b1 - item.f0;
        return {
          item,
          from,
          to,
          whole: from === 0 && to === length,
          first: from === 0,
          last: to === length,
        };
      });
    steps.push(
      parts.length === 0
        ? { kind: 'wait', f0: b0, f1: b1 }
        : { kind: 'play', f0: b0, f1: b1, parts },
    );
  }
  return steps;
}

/** A mark of the Slides mode among the steps (`placeMarks`): written where it stands, between the
 * step before it and the one after. */
export interface PlacedMark<E, M> {
  kind: 'mark';
  mark: M;
  /** The frame it is written at. */
  frame: number;
  /** The play its own frame fell inside of, when it was taken to the nearer edge of that play:
   * the frame grid put an animation where the mark stands. */
  movedOutOf?: Extract<Step<E>, { kind: 'play' }>;
}

export type Placed<E, M> = Step<E> | PlacedMark<E, M>;

/** The steps with the marks of the Slides mode among them (`marks`: in order, each at its time in
 * seconds). A mark is written at its frame on the grid (`snapFrame`), as a pause there shows the
 * scene: after what happens on that frame without an animation (the `instant` steps), before what
 * starts there. A mark inside a wait splits it into two waits that add up to its frames; one inside
 * a play — where the grid moved an animation over it — goes to the nearer edge of that play, the
 * start on a tie, and says so (`movedOutOf`). A mark at or after the last frame comes after the
 * last step: the scene keeps its length. The order of `marks` is kept. */
export function placeMarks<E, M>(
  steps: readonly Step<E>[],
  marks: readonly { mark: M; time: number }[],
  fps: number,
): Placed<E, M>[] {
  const queue = marks.map(({ mark, time }) => ({
    mark,
    /** Where the mark is, in frames, off the grid: what decides the nearer edge of a play. */
    at: time * fps,
    frame: Math.max(0, snapFrame(time, fps)),
    movedOutOf: undefined as Extract<Step<E>, { kind: 'play' }> | undefined,
  }));
  const out: Placed<E, M>[] = [];
  let next = 0;
  const write = () => {
    const { mark, frame, movedOutOf } = queue[next++]!;
    out.push(
      movedOutOf ? { kind: 'mark', mark, frame, movedOutOf } : { kind: 'mark', mark, frame },
    );
  };
  /** Write the marks before `frame` — and at it, with `at` — that are still to be written. */
  const writeUpTo = (frame: number, at: boolean) => {
    while (next < queue.length) {
      const queued = queue[next]!.frame;
      if (queued > frame || (queued === frame && !at)) break;
      write();
    }
  };
  for (const step of steps) {
    if (step.kind === 'instant') {
      writeUpTo(step.frame, false);
      out.push(step);
      continue;
    }
    writeUpTo(step.f0, true);
    if (step.kind === 'wait') {
      let f0 = step.f0;
      while (next < queue.length && queue[next]!.frame < step.f1) {
        const frame = queue[next]!.frame;
        if (frame > f0) {
          out.push({ kind: 'wait', f0, f1: frame });
          f0 = frame;
        }
        write();
      }
      out.push(f0 === step.f0 ? step : { kind: 'wait', f0, f1: step.f1 });
      continue;
    }
    for (let k = next; k < queue.length && queue[k]!.frame < step.f1; k++) {
      const queued = queue[k]!;
      queued.frame = queued.at - step.f0 <= step.f1 - queued.at ? step.f0 : step.f1;
      queued.movedOutOf = step;
    }
    writeUpTo(step.f0, true);
    out.push(step);
  }
  writeUpTo(Infinity, true);
  return out;
}
