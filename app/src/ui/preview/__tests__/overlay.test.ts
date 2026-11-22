// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { rectContour } from '../../../geom';
import { drawOverlay, haloOf } from '../overlay';

describe('overlay halo', () => {
  it('is dark under light colours and light under dark ones', () => {
    const dark = 'rgba(0, 0, 0, 0.6)';
    const light = 'rgba(255, 255, 255, 0.8)';
    expect(haloOf('#55d6be')).toBe(dark); // the dark theme's accent
    expect(haloOf('#b79cff')).toBe(dark);
    expect(haloOf('#FFFFFF')).toBe(dark);
    expect(haloOf('#087568')).toBe(light); // the light theme's accent
    expect(haloOf('#6a43c9')).toBe(light);
    expect(haloOf('#000000')).toBe(light);
  });
});

describe('snap guides', () => {
  /** A 2D context that only records what is drawn. */
  function recorder() {
    const calls: { name: string; args: unknown[] }[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) => {
        if (name === 'calls') return calls;
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return undefined;
        };
      },
      set: () => true,
    });
    return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
  }
  const camera = { frameWidth: 16, frameHeight: 9, center: [0, 0] as [number, number], zoom: 1 };
  const surface = { width: 1600, height: 900 };
  const colors = { accent: '#55d6be', frame: '#a9b7c6', handleFill: '#181e25', guide: '#ff5c8d' };

  const drawGuides = (guideWidth: number | undefined, dpr = 1) => {
    const ctx = recorder();
    // The recorder's own setter drops assignments: record them too, as `set <property>`.
    const spy = new Proxy(ctx, {
      get: (target, name: string) => (target as unknown as Record<string, unknown>)[name],
      set: (_, name: string, value: unknown) => {
        ctx.calls.push({ name: `set ${name}`, args: [value] });
        return true;
      },
    });
    drawOverlay(
      spy,
      camera,
      { width: 1600 * dpr, height: 900 * dpr },
      {
        hover: null,
        selected: [],
        related: [],
        guides: [
          { axis: 'x', at: 2, from: -1, to: 1 },
          { axis: 'y', at: -0.5, from: 0, to: 3 },
        ],
        ...(guideWidth === undefined ? {} : { guideWidth }),
        colors,
      },
      dpr,
    );
    return ctx.calls;
  };

  it('draws each guide as a line past the boxes it aligns, on the pixel grid', () => {
    const calls = drawGuides(1);
    // 100 px per unit, the frame's centre at (800, 450); a 1 px line sits in a pixel's middle.
    const reach = 12;
    expect(calls.filter((c) => c.name === 'moveTo').map((c) => c.args)).toEqual([
      [1000.5, 350 - reach],
      [800 - reach, 500.5],
    ]);
    expect(calls.filter((c) => c.name === 'lineTo').map((c) => c.args)).toEqual([
      [1000.5, 550 + reach],
      [1100 + reach, 500.5],
    ]);
  });

  it('draws the halo one pixel wider each side, then the guide colour', () => {
    const calls = drawGuides(0.75);
    const style = calls.filter((c) => c.name === 'set strokeStyle').map((c) => c.args[0]);
    const width = calls.filter((c) => c.name === 'set lineWidth').map((c) => c.args[0] as number);
    const strokes = calls.filter((c) => c.name === 'stroke').length;
    expect(strokes).toBe(2);
    expect(style).toEqual(['rgba(0, 0, 0, 0.6)', '#ff5c8d']); // dark under a light colour
    expect(width[0]).toBeCloseTo(3);
    expect(width[1]).toBeCloseTo(1); // 0.75 px rounds up to a whole pixel, never to none
  });

  it('draws the guide width in whole device pixels', () => {
    const widths = (cssWidth: number | undefined, dpr: number) =>
      drawGuides(cssWidth, dpr)
        .filter((c) => c.name === 'set lineWidth')
        .map((c) => Math.round((c.args[0] as number) * 1000) / 1000);
    expect(widths(undefined, 1)).toEqual([3, 1]); // 1 CSS px when the model says nothing
    expect(widths(2.5, 1)).toEqual([5, 3]);
    expect(widths(1.5, 2)).toEqual([5, 3]);
    expect(widths(0.75, 2)).toEqual([4, 2]);
    expect(widths(0.1, 1)).toEqual([3, 1]);
  });

  it('puts an even line on the edge between two pixels', () => {
    const calls = drawGuides(2);
    expect(calls.find((c) => c.name === 'moveTo')?.args[0]).toBe(1000);
  });

  it('draws a span guide as a bar with a tick at each end, on the pixel grid', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: null,
        selected: [],
        related: [],
        guides: [{ kind: 'span', axis: 'x', spans: [{ from: -1, to: 1, at: -0.5 }] }],
        guideWidth: 1,
        colors,
      },
      1,
    );
    // 8 px below the band's bottom (y = -0.5 → 500), ticks 4 px each way.
    expect(ctx.calls.filter((c) => c.name === 'moveTo').map((c) => c.args)).toEqual([
      [700.5, 508.5],
      [700.5, 504.5],
      [900.5, 504.5],
    ]);
    expect(ctx.calls.filter((c) => c.name === 'lineTo').map((c) => c.args)).toEqual([
      [900.5, 508.5],
      [700.5, 512.5],
      [900.5, 512.5],
    ]);
  });

  it('draws nothing for the guides when there are none', () => {
    const ctx = recorder();
    drawOverlay(ctx, camera, surface, { hover: null, selected: [], related: [], colors }, 1);
    expect(ctx.calls.some((c) => c.name === 'moveTo')).toBe(false);
  });
});

describe('halo', () => {
  const camera = { frameWidth: 16, frameHeight: 9, center: [0, 0] as [number, number], zoom: 1 };
  const surface = { width: 1600, height: 900 };
  const colors = { accent: '#55d6be', frame: '#a9b7c6', handleFill: '#181e25', guide: '#ffe74c' };
  const recorder = () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) =>
        name === 'calls'
          ? calls
          : (...args: unknown[]) => {
              calls.push({ name, args });
              return undefined;
            },
      set: (_, name: string, value: unknown) => {
        calls.push({ name: `set ${name}`, args: [value] });
        return true;
      },
    });
    return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
  };

  it('draws the reach of align by symbol as a faint circle in the guide colour', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      { hover: null, selected: [], related: [], halo: { center: [1, -2], radius: 0.14 }, colors },
      1,
    );
    const arcs = ctx.calls.filter((c) => c.name === 'arc').map((c) => c.args);
    expect(arcs).toEqual([[1, -2, 0.14, 0, Math.PI * 2]]);
    const fillAt = ctx.calls.findIndex((c) => c.name === 'fill');
    expect(ctx.calls[fillAt - 1]).toEqual({ name: 'set fillStyle', args: ['#ffe74c'] });
    expect(ctx.calls[fillAt - 2]).toEqual({ name: 'set globalAlpha', args: [0.12] });
    // A whole line.
    const strokeAt = ctx.calls.findIndex((c) => c.name === 'stroke');
    const before = ctx.calls.slice(fillAt, strokeAt);
    expect(before).toContainEqual({ name: 'setLineDash', args: [[]] });
    expect(before).toContainEqual({ name: 'set strokeStyle', args: ['#ffe74c'] });
  });

  it('draws the circle of the circle selector in the accent, dashed: not the one of align', () => {
    const ctx = recorder();
    const halo = { center: [1, -2] as [number, number], radius: 0.14, selector: true };
    drawOverlay(ctx, camera, surface, { hover: null, selected: [], related: [], halo, colors }, 1);
    expect(ctx.calls.filter((c) => c.name === 'arc').map((c) => c.args)).toEqual([
      [1, -2, 0.14, 0, Math.PI * 2],
    ]);
    const fillAt = ctx.calls.findIndex((c) => c.name === 'fill');
    expect(ctx.calls[fillAt - 1]).toEqual({ name: 'set fillStyle', args: ['#55d6be'] });
    // Dashed, and over its contrast (the accent of the light theme is dark; the scene is the
    // author's): two strokes, the accent on top.
    const strokes = ctx.calls.flatMap((c, i) => (c.name === 'stroke' ? [i] : []));
    expect(strokes).toHaveLength(2);
    const before = ctx.calls.slice(fillAt, strokes[0]);
    const dash = before.find((c) => c.name === 'setLineDash')!.args[0] as number[];
    expect(dash).toHaveLength(2);
    expect(dash.every((n) => n > 0)).toBe(true);
    expect(before).toContainEqual({ name: 'set strokeStyle', args: [haloOf('#55d6be')] });
    expect(ctx.calls.slice(strokes[0], strokes[1])).toContainEqual({
      name: 'set strokeStyle',
      args: ['#55d6be'],
    });
    // The dashes do not leak into what is drawn after it.
    expect(ctx.calls.slice(strokes[1]).find((c) => c.name === 'setLineDash')?.args).toEqual([[]]);
  });
});

describe('marquee', () => {
  const camera = { frameWidth: 16, frameHeight: 9, center: [0, 0] as [number, number], zoom: 1 };
  const surface = { width: 1600, height: 900 };
  const colors = { accent: '#55d6be', frame: '#a9b7c6', handleFill: '#181e25', guide: '#ff5c8d' };
  const recorder = () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) =>
        name === 'calls'
          ? calls
          : (...args: unknown[]) => {
              calls.push({ name, args });
              return undefined;
            },
      set: (_, name: string, value: unknown) => {
        calls.push({ name: `set ${name}`, args: [value] });
        return true;
      },
    });
    return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
  };

  it('fills the rectangle faintly in the accent and strokes it dashed over a halo', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: null,
        selected: [],
        related: [],
        marquee: { minX: -1, minY: -0.5, maxX: 2, maxY: 1.5 },
        colors,
      },
      1,
    );
    const rects = ctx.calls.filter((c) => c.name === 'rect').map((c) => c.args);
    expect(rects).toEqual([[-1, -0.5, 3, 2]]);
    const fillAt = ctx.calls.findIndex((c) => c.name === 'fill');
    expect(fillAt).toBeGreaterThan(0);
    expect(ctx.calls[fillAt - 1]).toEqual({ name: 'set fillStyle', args: ['#55d6be'] });
    expect(ctx.calls[fillAt - 2]).toEqual({ name: 'set globalAlpha', args: [0.1] });
    const strokes = ctx.calls.filter((c) => c.name === 'stroke').length;
    expect(strokes).toBe(2); // halo, then the accent
    const dashes = ctx.calls.filter((c) => c.name === 'setLineDash').map((c) => c.args[0]);
    expect(dashes.at(-2)).toEqual([0.04, 0.03]); // 4 and 3 CSS px at 100 px per unit
    expect(dashes.at(-1)).toEqual([]);
  });

  it('draws a rectangle that picks glyphs in the colour of the picks; one of clips keeps the accent', () => {
    const drawn = (glyphMarquee: boolean, pick?: string) => {
      const ctx = recorder();
      drawOverlay(
        ctx,
        camera,
        surface,
        {
          hover: null,
          selected: [],
          related: [],
          marquee: { minX: -1, minY: -0.5, maxX: 2, maxY: 1.5 },
          glyphMarquee,
          colors: { ...colors, pick },
        },
        1,
      );
      const fillAt = ctx.calls.findIndex((c) => c.name === 'fill');
      const strokes = ctx.calls.filter((c) => c.name === 'set strokeStyle').map((c) => c.args[0]);
      return [ctx.calls[fillAt - 1]!.args[0], strokes.at(-1)];
    };
    expect(drawn(true, '#ffe74c')).toEqual(['#ffe74c', '#ffe74c']);
    expect(drawn(false, '#ffe74c')).toEqual(['#55d6be', '#55d6be']);
    // No colour of the picks given: the accent.
    expect(drawn(true)).toEqual(['#55d6be', '#55d6be']);
  });

  it('draws no rectangle without a marquee', () => {
    const ctx = recorder();
    drawOverlay(ctx, camera, surface, { hover: null, selected: [], related: [], colors }, 1);
    expect(ctx.calls.some((c) => c.name === 'rect')).toBe(false);
  });
});

describe('the path under edit', () => {
  function recorder() {
    const calls: { name: string; args: unknown[] }[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) => {
        if (name === 'calls') return calls;
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return undefined;
        };
      },
      set: (_, name: string, value: unknown) => {
        calls.push({ name: `set ${name}`, args: [value] });
        return true;
      },
    });
    return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
  }
  const camera = { frameWidth: 16, frameHeight: 9, center: [0, 0] as [number, number], zoom: 1 };
  const surface = { width: 1600, height: 900 };
  const colors = { accent: '#55d6be', frame: '#a9b7c6', handleFill: '#181e25', guide: '#ff5c8d' };

  it('draws the chord dashed, the curve, a knob per handle and a square or circle per anchor', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: null,
        selected: [],
        related: [],
        colors,
        path: {
          chord: [
            [0, 0],
            [4, 0],
          ],
          curve: [
            [0, 0],
            [2, 1],
            [4, 0],
          ],
          nodes: [
            { at: [0, 0], in: null, out: [1, 1], smooth: false },
            { at: [2, 1], in: [1.5, 1], out: [2.5, 1], smooth: true },
            { at: [4, 0], in: [3, 1], out: null, smooth: false },
          ],
          selected: { node: 1, part: 'at' },
          hover: null,
        },
      },
      1,
    );
    const names = ctx.calls.map((c) => c.name);
    const dashes = ctx.calls.filter((c) => c.name === 'setLineDash').map((c) => c.args[0]);
    expect(dashes.some((d) => Array.isArray(d) && d.length === 2)).toBe(true);
    // Four handle knobs and the smooth anchor are arcs; the two corner anchors are rects.
    expect(names.filter((n) => n === 'arc')).toHaveLength(5);
    expect(names.filter((n) => n === 'rect')).toHaveLength(2);
    // The selected anchor is filled in the accent colour; the fixed ends take the guide colour.
    const fills = ctx.calls.filter((c) => c.name === 'set fillStyle').map((c) => c.args[0]);
    expect(fills).toContain(colors.accent);
    const strokes = ctx.calls.filter((c) => c.name === 'set strokeStyle').map((c) => c.args[0]);
    expect(strokes).toContain(colors.guide);
  });
});

describe('the picked glyphs', () => {
  const camera = { frameWidth: 16, frameHeight: 9, center: [0, 0] as [number, number], zoom: 1 };
  const surface = { width: 1600, height: 900 };
  const colors = { accent: '#55d6be', frame: '#a9b7c6', handleFill: '#181e25', guide: '#ff5c8d' };
  const recorder = () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) =>
        name === 'calls'
          ? calls
          : (...args: unknown[]) => {
              calls.push({ name, args });
              return undefined;
            },
      set: (_, name: string, value: unknown) => {
        calls.push({ name: `set ${name}`, args: [value] });
        return true;
      },
    });
    return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
  };
  const picked = {
    key: 'a:1',
    clipId: 'a',
    glyph: 1,
    path: { contours: [rectContour({ minX: 0, minY: 0, maxX: 1, maxY: 1 })] },
    fill: null,
    stroke: null,
    role: 'object' as const,
    partial: false,
    z: 0,
  };

  it('fills them faintly in the accent and outlines them over a halo', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      { hover: null, selected: [], related: [], picked: [picked], colors },
      1,
    );
    const fillAt = ctx.calls.findIndex((c) => c.name === 'fill');
    expect(ctx.calls[fillAt]).toEqual({ name: 'fill', args: ['nonzero'] });
    expect(ctx.calls[fillAt - 1]).toEqual({ name: 'set fillStyle', args: ['#55d6be'] });
    expect(ctx.calls[fillAt - 2]).toEqual({ name: 'set globalAlpha', args: [0.25] });
    // The glyph's outline is traced once; the fill and the two strokes (halo, accent) share it.
    expect(ctx.calls.filter((c) => c.name === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.name === 'stroke')).toHaveLength(2);
    const alphas = ctx.calls.filter((c) => c.name === 'set globalAlpha').map((c) => c.args[0]);
    expect(alphas.at(-1)).toBe(1);
  });

  it('fills and outlines them in the colour of the picks when there is one, whatever the accent', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: null,
        selected: [],
        related: [],
        picked: [picked],
        colors: { ...colors, pick: '#ffe74c' },
      },
      1,
    );
    const fillAt = ctx.calls.findIndex((c) => c.name === 'fill');
    expect(ctx.calls[fillAt - 1]).toEqual({ name: 'set fillStyle', args: ['#ffe74c'] });
    expect(ctx.calls[fillAt - 2]).toEqual({ name: 'set globalAlpha', args: [0.25] });
    const strokes = ctx.calls.filter((c) => c.name === 'set strokeStyle').map((c) => c.args[0]);
    // Over a dark halo (the colour is light), then the colour itself; never the accent.
    expect(strokes).toEqual(['rgba(0, 0, 0, 0.6)', '#ffe74c']);
  });

  it('frames the glyphs of colours in order with a box clear of their ink, in the guide colour', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: null,
        selected: [],
        related: [],
        framed: [{ minX: 0, minY: 0, maxX: 1, maxY: 2 }],
        colors,
      },
      1,
    );
    // One CSS pixel is 0.01 scene units here: the box stands 3 px off the glyph's.
    const rect = ctx.calls.find((c) => c.name === 'rect')!.args as number[];
    expect(rect.map((v) => Math.round(v * 1000) / 1000)).toEqual([-0.03, -0.03, 1.06, 2.06]);
    // Nothing is filled: the glyph's own colour stays as it is seen.
    expect(ctx.calls.some((c) => c.name === 'fill')).toBe(false);
    const strokes = ctx.calls.filter((c) => c.name === 'set strokeStyle').map((c) => c.args[0]);
    expect(strokes.at(-1)).toBe('#ff5c8d');
  });

  it('draws nothing of them when none is picked', () => {
    const ctx = recorder();
    drawOverlay(
      ctx,
      camera,
      surface,
      { hover: null, selected: [], related: [], picked: [], colors },
      1,
    );
    expect(ctx.calls.some((c) => c.name === 'fill')).toBe(false);
  });
});
