/* The timeline strip under a finger (jsdom, synthetic pointer events): the page scrolls from it
 * (`touch-action: pan-y`), so a touch does not seek when it lands — it seeks when it lifts where
 * it landed, or scrubs once it moves sideways, and a swipe up or down that the browser takes for
 * the page (`pointercancel`) leaves the time alone. The mouse seeks at once, as before. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../model';
import { layoutStrip, xToTime } from '../strip';
import { createStripView, TOUCH_SLOP, type StripView } from '../stripView';
import { mockExampleData } from './mockExample';

const WIDTH = 576;
const RANGE = { start: 0, end: 5 };
let project: Project;

beforeAll(async () => {
  project = (await mockExampleData('hello')).player.project;
});

let seeks: [number | null, string][] = [];
let strip: StripView;

beforeEach(() => {
  // A laid-out page: the strip is WIDTH pixels wide, its left edge at 0.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  seeks = [];
  strip = createStripView(project, RANGE, (time, phase) => seeks.push([time, phase]));
  document.body.append(strip.element);
  strip.layout();
});

afterEach(() => {
  strip.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** The time at `x` pixels from the strip's left edge. */
const at = (x: number) => {
  const layout = layoutStrip(project, RANGE, WIDTH);
  return xToTime(layout, x - layout.header);
};

/** A pointer event on the strip, as the browser sends it. */
function pointer(
  type: string,
  x: number,
  y: number,
  pointerType: 'mouse' | 'pen' | 'touch',
  pointerId = pointerType === 'mouse' ? 1 : 7,
): PointerEvent {
  const event = new PointerEvent(type, {
    pointerId,
    pointerType,
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  strip.element.dispatchEvent(event);
  return event;
}

describe('the strip under a finger', () => {
  it('seeks when a touch lifts where it landed, not when it lands', () => {
    const down = pointer('pointerdown', 200, 40, 'touch');
    expect(seeks).toEqual([]);
    // The page may still scroll from it.
    expect(down.defaultPrevented).toBe(false);
    pointer('pointermove', 202, 41, 'touch');
    expect(seeks).toEqual([]);
    pointer('pointerup', 202, 41, 'touch');
    expect(seeks).toEqual([
      [at(202), 'start'],
      [null, 'end'],
    ]);
  });

  it('leaves the time alone when a swipe up or down scrolls the page', () => {
    pointer('pointerdown', 200, 40, 'touch');
    pointer('pointermove', 203, 40 + TOUCH_SLOP + 20, 'touch');
    // The browser takes the gesture for the page and cancels the pointer.
    pointer('pointercancel', 0, 0, 'touch');
    pointer('pointerup', 203, 90, 'touch');
    expect(seeks).toEqual([]);
  });

  it('scrubs once a touch moves sideways, and a cancel ends it where it is', () => {
    pointer('pointerdown', 200, 40, 'touch');
    pointer('pointermove', 200 + TOUCH_SLOP - 2, 42, 'touch');
    expect(seeks).toEqual([]);
    pointer('pointermove', 240, 46, 'touch');
    pointer('pointermove', 300, 50, 'touch');
    pointer('pointerup', 310, 50, 'touch');
    expect(seeks).toEqual([
      [at(240), 'start'],
      [at(300), 'move'],
      [at(310), 'end'],
    ]);
    seeks = [];
    pointer('pointerdown', 300, 40, 'touch');
    pointer('pointermove', 260, 41, 'touch');
    pointer('pointercancel', 0, 0, 'touch');
    expect(seeks).toEqual([
      [at(260), 'start'],
      [null, 'end'],
    ]);
  });

  it('leaves a Mac’s click with Ctrl to the menu it opens, and seeks nothing', () => {
    /** The press of a click with Ctrl, as a browser sends it. */
    const ctrlPress = (x: number) => {
      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: x,
        clientY: 40,
        button: 0,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      strip.element.dispatchEvent(event);
      return event;
    };
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(ctrlPress(150).defaultPrevented).toBe(false);
    pointer('pointermove', 180, 40, 'mouse');
    pointer('pointerup', 190, 40, 'mouse');
    expect(seeks).toEqual([]);
    // Elsewhere Ctrl is a key held with the press, which seeks as any press.
    platform.mockReturnValue('Win32');
    expect(ctrlPress(150).defaultPrevented).toBe(true);
    expect(seeks).toEqual([[at(150), 'start']]);
  });

  it('seeks at once under a mouse or a pen, and a cancel does not seek', () => {
    for (const kind of ['mouse', 'pen'] as const) {
      seeks = [];
      const down = pointer('pointerdown', 150, 40, kind);
      expect(down.defaultPrevented).toBe(true);
      pointer('pointermove', 180, 90, kind);
      pointer('pointerup', 190, 90, kind);
      pointer('pointerdown', 250, 40, kind);
      pointer('pointercancel', 0, 0, kind);
      expect(seeks, kind).toEqual([
        [at(150), 'start'],
        [at(180), 'move'],
        [at(190), 'end'],
        [at(250), 'start'],
        [null, 'end'],
      ]);
    }
  });
});

describe('the stylesheet of the strip', () => {
  // Read from the disk: Vitest gives a stylesheet's import as an empty text. (jsdom's URL is not
  // Node's: the path is made of the module's own address, a string.)
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../player.css'), 'utf8');
  /** The declarations of the rule whose selector is exactly `selector`. */
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = new RegExp(`(?:^|[}/])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!found) throw new Error(`no rule for ${selector}`);
    return found[1]!;
  };

  it('lets a swipe up or down on the strip scroll the page; the time bar keeps a finger', () => {
    expect(rule('.mfe-player-strip')).toMatch(/touch-action:\s*pan-y;/);
    expect(rule('.mfe-player-scrub')).toMatch(/touch-action:\s*none;/);
  });
});
