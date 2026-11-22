/* The DOM of the timeline strip (`strip.ts` lays it out): built again when its width changes, its
 * playhead moved at every frame. A press or a drag on it seeks; a finger, only once it is clear
 * that it is not scrolling the page. */
import type { Project } from '../model';
import type { Range } from './clock';
import {
  CLIP_INSET,
  FOOT_HEIGHT,
  LANE_HEIGHT,
  RULER_HEIGHT,
  layoutStrip,
  timeToX,
  xToTime,
  type StripLayout,
} from './strip';
import { isMainPress } from './press';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  style: Partial<Record<string, string>> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) node.style.setProperty(key, value);
  }
  return node;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** How far a finger moves on the strip (CSS pixels) before it is a drag: sideways it seeks, up or
 * down it is the page's, which scrolls. Less than that and it is a tap. */
export const TOUCH_SLOP = 10;

/** What a screen reader hears of the strip: its tracks and their clips. */
export function describeStrip(layout: StripLayout): string {
  const rows = layout.rows
    .filter((row) => row.clips.length > 0)
    .map(
      (row) =>
        `${row.name}: ${row.clips.map((clip) => clip.title.replace(' · ', ', ')).join('; ')}`,
    );
  const relations = layout.relations.map((r) => `relation ${r.title}`);
  return `Timeline. ${[...rows, ...relations].join('. ')}.`;
}

export interface StripView {
  readonly element: HTMLElement;
  /** Lays the strip out again for its current width (call it when it is resized). */
  layout(): void;
  /** Moves the playhead. */
  setTime(time: number): void;
  destroy(): void;
}

/** `onSeek(time, phase)`: a drag on the strip starts (`start`), goes on (`move`) and ends (`end`)
 * at `time`, or ends where it is (`null`: the browser took the pointer back, or a tap that has
 * sought already). */
export function createStripView(
  project: Project,
  range: Range,
  onSeek: (time: number | null, phase: 'start' | 'move' | 'end') => void,
): StripView {
  const element = el('div', 'mfe-player-strip');
  element.setAttribute('role', 'img');
  element.dataset.testid = 'mfe-strip';
  let current: StripLayout | null = null;
  let playhead: HTMLElement | null = null;
  let lanesLeft = 0;
  let time = range.start;

  const placePlayhead = () => {
    if (!current || !playhead) return;
    playhead.style.left = px(lanesLeft + timeToX(current, time));
  };

  const build = (width: number) => {
    const layout = layoutStrip(project, range, width);
    current = layout;
    lanesLeft = layout.header;
    element.replaceChildren();
    element.setAttribute('aria-label', describeStrip(layout));
    element.style.height = px(RULER_HEIGHT + 1 + layout.rowsHeight);

    const ruler = el('div', 'mfe-strip-ruler');
    if (layout.header > 0)
      ruler.append(el('div', 'mfe-strip-corner', { width: px(layout.header) }));
    for (const tick of layout.ticks) {
      const mark = el('div', `mfe-strip-tick${tick.major ? ' is-major' : ''}`, {
        left: px(layout.header + tick.x),
      });
      if (tick.label) {
        const label = el('span', '');
        label.textContent = tick.label;
        mark.append(label);
      }
      ruler.append(mark);
    }
    element.append(ruler);

    const rows = el('div', 'mfe-strip-rows', { position: 'relative' });
    for (const row of layout.rows) {
      const line = el('div', 'mfe-strip-row', { height: px(row.height) });
      line.dataset.track = row.trackId;
      if (layout.header > 0) {
        const name = el('div', 'mfe-strip-name', { width: px(layout.header) });
        name.textContent = row.name;
        name.title = row.name;
        line.append(name);
      }
      const lanes = el('div', 'mfe-strip-lanes', { left: px(layout.header) });
      for (const clip of row.clips) {
        const box = el(
          'div',
          `mfe-strip-clip${clip.cutStart ? ' is-cut-start' : ''}${clip.cutEnd ? ' is-cut-end' : ''}${clip.intro ? ' has-intro' : ''}`,
          {
            left: px(clip.left),
            width: px(clip.width),
            top: px(CLIP_INSET),
            bottom: px(CLIP_INSET),
            '--clip-color': clip.color,
            '--intro-width': clip.intro ? px(clip.intro.left + clip.intro.width) : undefined,
          },
        );
        box.dataset.clip = clip.clipId;
        box.title = clip.title;
        for (const [which, band] of [
          ['intro', clip.intro],
          ['outro', clip.outro],
        ] as const) {
          if (!band) continue;
          const shade = el('div', `mfe-strip-band is-${which}`, {
            left: px(band.left),
            width: px(band.width),
          });
          if (band.label) {
            const label = el('span', '');
            label.textContent = band.label;
            shade.append(label);
          }
          box.append(shade);
        }
        const name = el('div', 'mfe-strip-clip-name');
        name.textContent = clip.name;
        box.append(name);
        for (const block of clip.blocks) {
          const chip = el('div', `mfe-strip-block is-${block.category}`, {
            left: px(block.left),
            width: px(block.width),
            top: px(1 + block.lane * LANE_HEIGHT),
            height: px(LANE_HEIGHT - 2),
          });
          chip.textContent = block.label;
          chip.title = block.title;
          chip.dataset.action = block.actionId;
          box.append(chip);
        }
        lanes.append(box);
      }
      line.append(lanes);
      rows.append(line);
    }
    // Relations over the rows: the windows, then the arrows.
    const over = el('div', 'mfe-strip-over', {
      position: 'absolute',
      top: '0',
      left: px(layout.header),
      right: '0',
      bottom: '0',
    });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'mfe-strip-arrows');
    svg.setAttribute('width', String(Math.max(1, Math.round(layout.lanes))));
    svg.setAttribute('height', String(Math.max(1, Math.round(layout.rowsHeight))));
    svg.setAttribute('aria-hidden', 'true');
    for (const relation of layout.relations) {
      for (const w of relation.windows) {
        const band = el('div', 'mfe-strip-window', {
          left: px(w.left),
          width: px(w.width),
          top: px(w.top),
          height: px(Math.min(w.height, FOOT_HEIGHT)),
        });
        band.title = relation.title;
        band.dataset.relation = relation.relationId;
        over.append(band);
      }
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'mfe-strip-arrow');
      path.setAttribute('d', relation.arrow);
      const head = document.createElementNS(SVG_NS, 'path');
      head.setAttribute('class', 'mfe-strip-head');
      head.setAttribute('d', relation.head);
      svg.append(path, head);
    }
    over.append(svg);
    rows.append(over);
    element.append(rows);

    playhead = el('div', 'mfe-strip-playhead');
    playhead.dataset.testid = 'mfe-strip-playhead';
    element.append(playhead);
    placePlayhead();
  };

  // Seeking: a press anywhere on the strip, and a drag from it. A finger may be scrolling the page
  // (`touch-action: pan-y`), so a touch seeks only when it lifts where it landed (a tap) or once
  // it moves sideways (then it scrubs); one that moves up or down is the page's, and the browser
  // takes it back (`pointercancel`). A cancel never seeks: the time stays where it is.
  const timeAt = (clientX: number): number => {
    if (!current) return time;
    const rect = element.getBoundingClientRect();
    return xToTime(current, clientX - rect.left - lanesLeft);
  };
  let dragging: number | null = null;
  /** A touch that has not moved yet: where it landed. */
  let landed: { id: number; x: number; y: number } | null = null;
  const drag = (event: PointerEvent) => {
    dragging = event.pointerId;
    element.setPointerCapture?.(event.pointerId);
    onSeek(timeAt(event.clientX), 'start');
  };
  const onDown = (event: PointerEvent) => {
    // Not a Mac's click with Ctrl: that one is the menu's (`isMainPress`).
    if (!isMainPress(event) || !current) return;
    if (event.pointerType === 'touch') {
      landed = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    event.preventDefault();
    drag(event);
  };
  const onMove = (event: PointerEvent) => {
    if (landed?.id === event.pointerId) {
      const dx = Math.abs(event.clientX - landed.x);
      const dy = Math.abs(event.clientY - landed.y);
      if (Math.max(dx, dy) < TOUCH_SLOP) return;
      landed = null;
      if (dx > dy) drag(event);
      return;
    }
    if (dragging !== event.pointerId) return;
    onSeek(timeAt(event.clientX), 'move');
  };
  const onUp = (event: PointerEvent) => {
    if (landed?.id === event.pointerId) {
      landed = null;
      onSeek(timeAt(event.clientX), 'start');
      onSeek(null, 'end');
      return;
    }
    if (dragging !== event.pointerId) return;
    dragging = null;
    onSeek(timeAt(event.clientX), 'end');
  };
  const onCancel = (event: PointerEvent) => {
    if (landed?.id === event.pointerId) landed = null;
    if (dragging !== event.pointerId) return;
    dragging = null;
    onSeek(null, 'end');
  };
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onCancel);

  let lastWidth = -1;
  return {
    element,
    layout() {
      const width = element.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      build(width);
    },
    setTime(t) {
      time = t;
      placePlayhead();
    },
    destroy() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      element.remove();
    },
  };
}
