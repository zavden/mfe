/* A separate scene-coordinate canvas, drawing the contours of the render it is given (the
 * shaped glyphs, or the placeholder boxes of a text nothing shaped). It owns draft gestures only;
 * reusing the main Preview's project-mutating gesture hook here would bypass Apply/Cancel. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormulaRender } from '../../engine';
import { transformContour, type Vec2 } from '../../geom';
import {
  FRAME_HEIGHT,
  frameWidth,
  TEXT_STYLE,
  type Placement,
  type ProjectMeta,
} from '../../model';
import {
  createCanvasRenderer,
  panByPixels,
  pixelsPerUnit,
  toScene,
  zoomAbout,
  type Camera,
  type Surface,
} from '../../render';
import { placementMatrix, type Drawable } from '../../scene';
import { frameBox, formulaBoxAt } from '../preview/boxes';
import { gridSnapDelta, GRID_STEPS, type GridStep } from '../preview/grid';
import { drawGrid } from '../preview/gridLayer';
import { drawOverlay } from '../preview/overlay';
import { snapBox, shiftBox, type SnapGuide } from '../preview/snap';
import { usePreferences } from '../preferences';
import { centeredPosition, selectableTextBox } from './textCompositionModel';
import { zoomFactor } from '../pinch';
import { isMainClick } from '../pointer';

interface Props {
  render: FormulaRender | null;
  meta: ProjectMeta;
  placement: Placement;
  color: string;
  glyphColors: Record<string, string>;
  current: boolean;
  movable: boolean;
  positionLabel: string;
  /** «New clips start here», for a stage that places no clip but where the object's new clips
   * start: whether the position is kept. Absent, the stage places a clip and has no such box. */
  keepPosition?: boolean;
  onKeepPosition?(keep: boolean): void;
  onPosition(position: Vec2, record?: boolean): void;
  onRecordPosition(before: Vec2): void;
  onUndo(redo?: boolean): void;
}

const renderer = createCanvasRenderer();
const FIT = { center: [0, 0] as Vec2, zoom: 1 };

/** Re-render when the theme attribute changes (the canvas reads colours from CSS variables), as
 * the Preview does. */
function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setTick((n) => n + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return tick;
}

/** A colour of the theme, as the element sees it; `fallback` (the dark theme's) without one. */
function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

/** Keep intermediate numeric input (a minus sign, empty field) out of placement state without
 * forcing the browser to replace it with the previous number after every key. */
function PositionField({
  axis,
  value,
  disabled,
  onChange,
}: {
  axis: 'x' | 'y';
  value: number;
  disabled: boolean;
  onChange(value: number): void;
}) {
  const display = String(+value.toFixed(6));
  const [text, setText] = useState(display);
  const [seen, setSeen] = useState(display);
  if (display !== seen) {
    setSeen(display);
    setText(display);
  }
  return (
    <label>
      {axis.toUpperCase()}
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Text position ${axis.toUpperCase()}`}
        data-testid={`text-position-${axis}`}
        disabled={disabled}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() !== '' && Number.isFinite(Number(next))) onChange(Number(next));
        }}
        onBlur={() => setText(display)}
      />
    </label>
  );
}

export function TextCompositionStage(props: Props) {
  const { render, meta, placement, current, movable, onPosition, onRecordPosition, onUndo } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [surface, setSurface] = useState<Surface>({ width: 1, height: 1 });
  const [view, setView] = useState(FIT);
  const [grid, setGrid] = useState(true);
  const [step, setStep] = useState<GridStep>(0.5);
  const [snap, setSnap] = useState(true);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const themeTick = useThemeTick();
  // The snap guides in the colour the Preview draws them in (Preferences).
  const guideColor = usePreferences((state) => state.guideColor);
  const drag = useRef<{
    pointer: number;
    start: Vec2;
    position: Vec2;
    camera: Camera;
    kind: 'move' | 'pan';
  } | null>(null);
  const camera: Camera = useMemo(
    () => ({
      frameWidth: frameWidth(meta),
      frameHeight: FRAME_HEIGHT,
      ...view,
    }),
    [meta, view],
  );
  const box = useMemo(
    () =>
      render
        ? formulaBoxAt(
            selectableTextBox(
              render.glyphs.length ? render.bbox : (render.text?.logicalBBox ?? render.bbox),
            ),
            placement,
          )
        : null,
    [render, placement],
  );
  const drawables = useMemo<Drawable[]>(() => {
    if (!render) return [];
    const matrix = placementMatrix(placement);
    return render.glyphs.map((glyph) => {
      // A shaped glyph is filled; a placeholder box brings its own faint fill and outline.
      const style = glyph.style ?? TEXT_STYLE;
      const color = props.glyphColors[String(glyph.index)] ?? props.color;
      return {
        key: `text:${glyph.index}`,
        clipId: 'composition',
        glyph: glyph.index,
        path: { contours: glyph.contours.map((contour) => transformContour(matrix, contour)) },
        fill: style.fillOpacity > 0 ? { color, opacity: style.fillOpacity } : null,
        stroke:
          style.strokeWidth > 0 && style.strokeOpacity > 0
            ? { color, opacity: style.strokeOpacity, width: style.strokeWidth }
            : null,
        z: 0,
        role: 'object',
        partial: false,
      };
    });
  }, [render, placement, props.color, props.glyphColors]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const next = {
        width: Math.max(1, Math.round(rect.width * dpr)),
        height: Math.max(1, Math.round(rect.height * dpr)),
      };
      setSurface((before) =>
        before.width === next.width && before.height === next.height ? before : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = surface.width;
    canvas.height = surface.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The theme's colours around and over the scene (the scene keeps its own background).
    const style = getComputedStyle(canvas);
    renderer.draw(ctx, drawables, camera, surface, {
      background: meta.background,
      outside: cssVar(style, '--bg', '#07121a'),
      ...(grid ? { underlay: (c) => drawGrid(c, camera, surface, frameBox(meta), step) } : {}),
    });
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: null,
        selected: box ? [box] : [],
        related: [],
        guides,
        colors: {
          accent: cssVar(style, '--accent', '#43eeca'),
          frame: cssVar(style, '--text-dim', '#acc3cb'),
          handleFill: cssVar(style, '--panel', '#10212c'),
          guide: guideColor,
        },
      },
      window.devicePixelRatio || 1,
    );
    // themeTick: paint again after a theme switch (the colours come from CSS variables).
  }, [surface, camera, drawables, meta, grid, step, box, guides, guideColor, themeTick]);

  const pixel = (event: { clientX: number; clientY: number }): Vec2 => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * surface.width) / Math.max(1, rect.width),
      ((event.clientY - rect.top) * surface.height) / Math.max(1, rect.height),
    ];
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const at: Vec2 = [
        ((event.clientX - rect.left) * surface.width) / Math.max(1, rect.width),
        ((event.clientY - rect.top) * surface.height) / Math.max(1, rect.height),
      ];
      setView((before) =>
        zoomAbout({ ...camera, ...before }, surface, at, zoomFactor(event, 0.002)),
      );
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [camera, surface]);

  const finish = (cancel = false) => {
    const active = drag.current;
    drag.current = null;
    if (active?.kind === 'move') {
      if (cancel) onPosition(active.position, false);
      else onRecordPosition(active.position);
    }
    setGuides([]);
  };
  const center = (axis: 'x' | 'y') => {
    if (box && current && movable) onPosition(centeredPosition(placement.position, box, axis));
  };

  return (
    <section className="text-stage" aria-label="Text composition stage">
      <div className="text-stage-tools" role="toolbar" aria-label="Composition view">
        <button
          type="button"
          className="btn btn-small"
          data-testid="text-fit"
          onClick={() => setView(FIT)}
        >
          Fit frame
        </button>
        {/* The zoom: −, the readout and + drawn as one control. */}
        <span className="text-zoom-group">
          <button
            type="button"
            data-testid="text-zoom-out"
            aria-label="Zoom out"
            onClick={() =>
              setView(zoomAbout(camera, surface, [surface.width / 2, surface.height / 2], 0.8))
            }
          >
            −
          </button>
          <span data-testid="text-zoom">{Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            data-testid="text-zoom-in"
            aria-label="Zoom in"
            onClick={() =>
              setView(zoomAbout(camera, surface, [surface.width / 2, surface.height / 2], 1.25))
            }
          >
            +
          </button>
        </span>
        <label>
          <input
            type="checkbox"
            data-testid="text-grid"
            checked={grid}
            onChange={(e) => setGrid(e.target.checked)}
          />{' '}
          Grid
        </label>
        <select
          aria-label="Grid spacing"
          data-testid="text-grid-step"
          value={step}
          onChange={(e) => setStep(Number(e.target.value) as GridStep)}
        >
          {GRID_STEPS.map((value) => (
            <option key={value} value={value}>
              {value} units
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            data-testid="text-snap"
            checked={snap}
            onChange={(e) => setSnap(e.target.checked)}
          />{' '}
          Snap
        </label>
      </div>
      {/* The frame is what the canvas is fitted in: as wide as the stage in a dialog of its own
          height, the whole room left in a dialog the author sized or maximized. */}
      <div className="text-stage-frame">
        <canvas
          ref={canvasRef}
          className="text-stage-canvas"
          data-testid="text-stage-canvas"
          aria-label="Rendered text. Drag to position; middle drag pans; Control and wheel zooms."
          tabIndex={0}
          style={{
            aspectRatio: `${meta.width} / ${meta.height}`,
            ['--stage-aspect' as string]: meta.width / meta.height,
            cursor: movable && current ? 'move' : 'default',
          }}
          data-position={placement.position.join(',')}
          data-current={current}
          data-glyph-count={drawables.length}
          onPointerDown={(event) => {
            if (!isMainClick(event) && event.button !== 1) return;
            const p = pixel(event);
            const point = toScene(p, camera, surface);
            const pan = event.button === 1 || event.altKey;
            if (
              !pan &&
              (!current ||
                !movable ||
                !box ||
                point[0] < box.minX ||
                point[0] > box.maxX ||
                point[1] < box.minY ||
                point[1] > box.maxY)
            )
              return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              start: pan ? p : point,
              position: [...placement.position],
              camera,
              kind: pan ? 'pan' : 'move',
            };
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointer !== event.pointerId) return;
            const p = pixel(event);
            if (active.kind === 'pan') {
              setView(
                panByPixels(active.camera, surface, p[0] - active.start[0], p[1] - active.start[1]),
              );
              return;
            }
            const at = toScene(p, active.camera, surface);
            let next: Vec2 = [
              active.position[0] + at[0] - active.start[0],
              active.position[1] + at[1] - active.start[1],
            ];
            let nextGuides: SnapGuide[] = [];
            if (box && !event.ctrlKey && !event.metaKey) {
              const moved = shiftBox(
                box,
                next[0] - placement.position[0],
                next[1] - placement.position[1],
              );
              const result = snap
                ? snapBox(
                    moved,
                    { boxes: [], frame: frameBox(meta) },
                    (8 * (window.devicePixelRatio || 1)) / pixelsPerUnit(camera, surface),
                  )
                : null;
              const gridDelta = grid ? gridSnapDelta(moved, step, 'center') : [0, 0];
              next = [
                next[0] + (result?.guides.some((g) => g.axis === 'x') ? result.dx : gridDelta[0]!),
                next[1] + (result?.guides.some((g) => g.axis === 'y') ? result.dy : gridDelta[1]!),
              ];
              nextGuides = result?.guides ?? [];
            }
            onPosition(next.map((n) => Math.round(n * 1e6) / 1e6) as Vec2, false);
            setGuides(nextGuides);
          }}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => finish(true)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              event.stopPropagation();
              onUndo(event.shiftKey);
            } else if (
              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
              movable
            ) {
              event.preventDefault();
              event.stopPropagation();
              const n = event.shiftKey ? 1 : 0.1;
              onPosition([
                placement.position[0] +
                  (event.key === 'ArrowRight' ? n : event.key === 'ArrowLeft' ? -n : 0),
                placement.position[1] +
                  (event.key === 'ArrowUp' ? n : event.key === 'ArrowDown' ? -n : 0),
              ]);
            }
          }}
        />
      </div>
      <div className="text-position-controls">
        {(['x', 'y'] as const).map((axis, index) => (
          <PositionField
            key={axis}
            axis={axis}
            value={placement.position[index]!}
            disabled={!movable}
            onChange={(value) => {
              const next: Vec2 = [...placement.position];
              next[index] = value;
              onPosition(next);
            }}
          />
        ))}
        <button
          type="button"
          className="btn"
          data-testid="text-center-x"
          disabled={!movable || !current || !box}
          onClick={() => center('x')}
        >
          Center horizontally
        </button>
        <button
          type="button"
          className="btn"
          data-testid="text-center-y"
          disabled={!movable || !current || !box}
          onClick={() => center('y')}
        >
          Center vertically
        </button>
        {props.keepPosition !== undefined && (
          <label
            className="text-keep-position"
            title="On, Apply keeps this position for the text: every new clip of it starts here. Off, the position is not saved."
          >
            <input
              type="checkbox"
              data-testid="text-keep-position"
              checked={props.keepPosition}
              disabled={!movable}
              onChange={(event) => props.onKeepPosition?.(event.target.checked)}
            />
            New clips start here
          </label>
        )}
        <p className="field-hint" data-testid="text-placement-hint">
          {props.positionLabel}
        </p>
      </div>
    </section>
  );
}
