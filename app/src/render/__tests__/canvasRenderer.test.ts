// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { rectContour, type Box } from '../../geom';
import type { Drawable } from '../../scene';
import { createCanvasRenderer, traceContours, type Camera, type FrameStyle } from '..';

const camera: Camera = { frameWidth: 16, frameHeight: 8, center: [0, 0], zoom: 1 };
const surface = { width: 1600, height: 800 };
const style: FrameStyle = { background: '#000000', outside: '#202020' };

function rect(minX: number, minY: number, maxX: number, maxY: number): Box {
  return { minX, minY, maxX, maxY };
}

function drawable(
  key: string,
  box: Box,
  z = 0,
  color = '#FFFFFF',
  extra: Partial<Drawable> = {},
): Drawable {
  return {
    key,
    clipId: key.split(':')[0]!,
    glyph: 0,
    path: { contours: [rectContour(box)] },
    fill: { color, opacity: 1 },
    stroke: null,
    z,
    role: 'object',
    partial: false,
    ...extra,
  };
}

/** A recording 2D context: every call and property write, in order. */
function recordingContext() {
  const log: string[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop in state) return state[prop];
        return (...args: unknown[]) => {
          log.push(
            `${prop}(${args.map((a) => (typeof a === 'number' ? +a.toFixed(3) : String(a))).join(',')})`,
          );
        };
      },
      set(_target, prop: string, value) {
        state[prop] = value;
        log.push(`${prop}=${String(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

describe('traceContours', () => {
  it('emits one moveTo per subpath, a cubic per segment and closes equal end points', () => {
    const sink = { moveTo: vi.fn(), bezierCurveTo: vi.fn(), closePath: vi.fn() };
    traceContours(sink, [rectContour(rect(0, 0, 1, 1)), [0, 0, 1, 1, 2, 2, 3, 3]]);
    expect(sink.moveTo).toHaveBeenCalledTimes(2);
    expect(sink.bezierCurveTo).toHaveBeenCalledTimes(5);
    expect(sink.closePath).toHaveBeenCalledTimes(1);
  });

  it('skips degenerate contours', () => {
    const sink = { moveTo: vi.fn(), bezierCurveTo: vi.fn(), closePath: vi.fn() };
    traceContours(sink, [[1, 2], []]);
    expect(sink.moveTo).not.toHaveBeenCalled();
  });
});

describe('createCanvasRenderer', () => {
  const renderer = createCanvasRenderer();

  it('paints the outside colour, the frame background, then the drawables in z order', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(
      ctx,
      [
        drawable('b:0', rect(0, 0, 1, 1), 1, '#FF0000'),
        drawable('a:0', rect(0, 0, 1, 1), 0, '#00FF00'),
      ],
      camera,
      surface,
      style,
    );
    const fills = log.filter((l) => l.startsWith('fillStyle='));
    expect(fills).toEqual([
      'fillStyle=#202020',
      'fillStyle=#000000',
      'fillStyle=#00FF00', // z 0 first
      'fillStyle=#FF0000',
    ]);
    // The scene is drawn y-up: a = s, d = -s with s = 100 px / unit.
    expect(log).toContain('setTransform(100,0,0,-100,800,400)');
  });

  it('draws the underlay over the frame background, inside the clip, before the drawables', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(ctx, [drawable('a:0', rect(0, 0, 1, 1), 0, '#00FF00')], camera, surface, {
      ...style,
      underlay: (c) => c.fillRect(1, 2, 3, 4),
    });
    const at = (entry: string) => log.indexOf(entry);
    expect(at('clip()')).toBeGreaterThan(at('fillStyle=#000000'));
    expect(at('fillRect(1,2,3,4)')).toBeGreaterThan(at('clip()'));
    expect(at('fillRect(1,2,3,4)')).toBeLessThan(at('fillStyle=#00FF00'));
    // Without one, nothing extra is drawn.
    const plain = recordingContext();
    renderer.draw(plain.ctx, [], camera, surface, style);
    expect(plain.log.filter((l) => l.startsWith('fillRect('))).toHaveLength(2);
  });

  it('cuts at the frame where a scene camera has it', () => {
    const { ctx, log } = recordingContext();
    // The view sees twice the frame; the frame is three units right of the origin and one up.
    renderer.draw(ctx, [], { ...camera, zoom: 0.5, frameCenter: [3, 1] }, surface, style);
    expect(log).toContain('fillRect(550,150,800,400)');
    expect(log).toContain('rect(550,150,800,400)');
    expect(log.indexOf('clip()')).toBeGreaterThan(log.indexOf('rect(550,150,800,400)'));
  });

  it('draws the world around the frame when it is not clipped: the background everywhere, no cut', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(
      ctx,
      [drawable('a:0', rect(20, 20, 21, 21), 0, '#00FF00')],
      { ...camera, zoom: 0.5 },
      surface,
      { ...style, unclipped: true, underlay: (c) => c.fillRect(1, 2, 3, 4) },
    );
    expect(log).not.toContain('clip()');
    // One fill of the whole surface, in the scene's background: the letterbox colour paints nothing.
    expect(log.filter((l) => l.startsWith('fillStyle=')).slice(0, 2)).toEqual([
      'fillStyle=#000000',
      'fillStyle=#00FF00',
    ]);
    expect(log).not.toContain('fillStyle=#202020');
    expect(log).toContain('fillRect(0,0,1600,800)');
    // The underlay is still drawn before the drawables, and what is outside the frame is drawn.
    expect(log.indexOf('fillRect(1,2,3,4)')).toBeLessThan(log.indexOf('fillStyle=#00FF00'));
    expect(log.some((l) => l.startsWith('fill('))).toBe(true);
  });

  it('keeps array order among equal z and applies opacity', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(
      ctx,
      [
        drawable('a:0', rect(0, 0, 1, 1), 0, '#111111'),
        drawable('b:0', rect(0, 0, 1, 1), 0, '#222222', {
          fill: { color: '#222222', opacity: 0.5 },
        }),
      ],
      camera,
      surface,
      style,
    );
    expect(log.indexOf('fillStyle=#111111')).toBeLessThan(log.indexOf('fillStyle=#222222'));
    expect(log).toContain('globalAlpha=0.5');
  });

  it('strokes in Manim units (0.01 scene units, mitre joins, butt caps)', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(
      ctx,
      [
        drawable('a:0', rect(0, 0, 1, 1), 0, '#FFFFFF', {
          fill: null,
          stroke: { color: '#FF0000', opacity: 1, width: 4 },
        }),
      ],
      camera,
      surface,
      style,
    );
    expect(log).toContain('lineWidth=0.04');
    expect(log).toContain('lineJoin=miter');
    expect(log).toContain('lineCap=butt');
    expect(log).toContain('miterLimit=10');
    expect(log.some((l) => l.startsWith('stroke('))).toBe(true);
  });

  it('skips invisible drawables', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(
      ctx,
      [drawable('a:0', rect(0, 0, 1, 1), 0, '#FFFFFF', { fill: { color: '#FFFFFF', opacity: 0 } })],
      camera,
      surface,
      style,
    );
    expect(log.filter((l) => l.startsWith('fill(')).length).toBe(0);
    expect(log.some((l) => l === 'fillStyle=#FFFFFF')).toBe(false);
  });

  it('uses the background everywhere when there is no letterbox colour', () => {
    const { ctx, log } = recordingContext();
    renderer.draw(ctx, [], camera, surface, { background: '#123456', outside: null });
    expect(log.filter((l) => l.startsWith('fillStyle='))).toEqual([
      'fillStyle=#123456',
      'fillStyle=#123456',
    ]);
  });

  describe('pick', () => {
    const back = drawable('a:0', rect(-2, -1, 2, 1), 0);
    const front = drawable('b:0', rect(-1, -0.5, 1, 0.5), 1);

    it('returns the topmost drawable containing the point', () => {
      expect(renderer.pick([back, front], [0, 0])?.key).toBe('b:0');
      expect(renderer.pick([front, back], [0, 0])?.key).toBe('b:0'); // z decides, not array order
      expect(renderer.pick([back, front], [1.5, 0])?.key).toBe('a:0');
    });

    it('returns null on empty space and ignores invisible drawables', () => {
      expect(renderer.pick([back, front], [5, 5])).toBeNull();
      const ghost = drawable('c:0', rect(-3, -3, 3, 3), 5, '#FFFFFF', {
        fill: { color: '#FFFFFF', opacity: 0 },
      });
      expect(renderer.pick([back, ghost], [0, 0])?.key).toBe('a:0');
    });

    it('later drawables win among equal z', () => {
      const first = drawable('a:0', rect(0, 0, 1, 1), 0);
      const second = drawable('b:0', rect(0, 0, 1, 1), 0);
      expect(renderer.pick([first, second], [0.5, 0.5])?.key).toBe('b:0');
    });

    it('hits a stroke along its line, within half its width plus the slack, never inside', () => {
      // A hollow box of stroke width 4 (0.04 scene units) in front of a filled glyph inside it.
      const inner = drawable('a:0', rect(-0.5, -0.5, 0.5, 0.5), 0);
      const hollow = drawable('b:0', rect(-2, -1, 2, 1), 1, '#FFFF00', {
        fill: null,
        stroke: { color: '#FFFF00', opacity: 1, width: 4 },
      });
      expect(renderer.pick([inner, hollow], [0, 0])?.key).toBe('a:0');
      expect(renderer.pick([inner, hollow], [1, 0])).toBeNull();
      expect(renderer.pick([inner, hollow], [2.015, 0])?.key).toBe('b:0');
      expect(renderer.pick([inner, hollow], [2.03, 0])).toBeNull();
      expect(renderer.pick([inner, hollow], [2.03, 0], 0.02)?.key).toBe('b:0');
      expect(renderer.pick([inner, hollow], [1.9, 0.9], 0.02)).toBeNull();
      // A stroke with no width or no opacity is not there.
      const faint = drawable('c:0', rect(-2, -1, 2, 1), 2, '#FFFFFF', {
        fill: null,
        stroke: { color: '#FFFFFF', opacity: 0, width: 4 },
      });
      expect(renderer.pick([faint], [2, 0], 0.1)).toBeNull();
    });

    it('never picks a temporary drawable', () => {
      const object = drawable('a:0', rect(-1, -1, 1, 1), 0);
      const flash = drawable('fx:0', rect(-2, -2, 2, 2), 5, '#FFFF00', { role: 'temp' });
      expect(renderer.pick([object, flash], [0, 0])?.key).toBe('a:0');
      expect(renderer.pick([object, flash], [1.5, 1.5])).toBeNull();
    });
  });

  it('toScene inverts the draw transform', () => {
    expect(renderer.toScene([800, 400], camera, surface)).toEqual([0, 0]);
    const p = renderer.toScene([900, 300], camera, surface);
    expect(p[0]).toBeCloseTo(1);
    expect(p[1]).toBeCloseTo(1);
  });
});
