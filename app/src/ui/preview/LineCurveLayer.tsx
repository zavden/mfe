/* What the preview adds to a bent line (D145; `lineCurve.ts`), over the canvas as the handles of
 * its ends are (`LineLayer.tsx`): for an arc, a stem along the arc where it leaves its start, with
 * a handle at its tip that is dragged to turn it — the degrees follow, read beside it —; and in
 * the mode «Edit curve», the points of a spline and their handles and the curve itself to click a
 * new point onto, while the line is on screen, and the mode's Done wherever the playhead is (its
 * keys are `useLineCurveKeys.ts`'s). Each drag is one undo step. The middle button and the
 * right-click (a Mac's Ctrl+click) are the scene's there too: they pan the view and open the
 * preview's menu. */
import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { applyToPoint, invert, nearestPoint, type Mat2D } from '../../geom';
import type { Clip, LineFormula, SplineNode, Vec2 } from '../../model';
import { history, type ProjectGesture } from '../../store';
import { isMainClick } from '../pointer';
import {
  arcFromPointer,
  arcTangent,
  curveFrame,
  explicitNodes,
  LINE_CURVE_HINT,
  setLineArc,
  setLineNodes,
  useLineCurveEdit,
} from './lineCurve';
import {
  addNode,
  moveAnchor,
  handleLink,
  moveHandle,
  samplePath,
  toggleSmooth,
  type PathSelection,
} from './pathEdit';
import { keysText } from '../platform';

/** How long the stem of an arc's handle is, in CSS px. */
const ARC_STEM = 64;

interface Shared {
  formula: LineFormula;
  /** Where the line is drawn from and to, in the scene. */
  ends: { start: Vec2; end: Vec2 };
  /** A point of the scene in CSS px from the frame's corner. */
  css(point: Vec2): Vec2;
  /** Where a pointer is, in the scene. */
  sceneOf(event: { clientX: number; clientY: number }): Vec2;
}

/** A drag that is one undo step: `step` runs each change inside it. */
function useDragStep() {
  const gesture = useRef<ProjectGesture | null>(null);
  return {
    begin() {
      gesture.current = history.beginGesture(() => {
        gesture.current = null;
      });
    },
    step(change: () => void) {
      gesture.current?.run(change);
    },
    end(cancel = false) {
      if (cancel) gesture.current?.cancel();
      else gesture.current?.end();
      gesture.current = null;
    },
    get on() {
      return gesture.current !== null;
    },
  };
}

/** The handle of an arc: its stem leaves the start of the line along the arc. */
export function ArcHandle({
  formula,
  ends,
  css,
  sceneOf,
  locked,
}: Shared & { locked: string | null }) {
  const drag = useDragStep();
  const curve = formula.curve;
  if (curve?.shape !== 'arc') return null;
  const [sx, sy] = css(ends.start);
  const [tx, ty] = arcTangent(ends.start, ends.end, curve.degrees, curve.trim);
  // The scene's y runs up, the frame's down.
  const x = sx + ARC_STEM * tx;
  const y = sy - ARC_STEM * ty;
  const turn = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const degrees = arcFromPointer(
      ends.start,
      ends.end,
      sceneOf(event),
      curve.trim,
      event.shiftKey,
    );
    if (degrees !== null) drag.step(() => setLineArc(formula.id, degrees));
  };
  return (
    <>
      <svg className="line-rubber line-arc-stem" aria-hidden="true">
        <line x1={sx} y1={sy} x2={x} y2={y} />
      </svg>
      <button
        type="button"
        className="line-arc-handle"
        data-testid="line-arc-handle"
        data-degrees={curve.degrees}
        data-locked={locked ? 'true' : 'false'}
        aria-label={`The arc of the line, ${curve.degrees} degrees: drag it to bend the line more or less`}
        title={
          locked ??
          keysText(
            `Arc: ${curve.degrees}°. Drag to bend the line more, less or the other way · Shift: every 15°`,
          )
        }
        style={{ left: x, top: y }}
        onPointerDown={(event) => {
          if (!isMainClick(event) || locked) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.begin();
        }}
        onPointerMove={(event) => {
          if (drag.on) turn(event);
        }}
        onPointerUp={() => drag.end()}
        onPointerCancel={() => drag.end(true)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !drag.on) return;
          event.preventDefault();
          event.stopPropagation();
          drag.end(true);
        }}
      />
      <span
        className="preview-readout line-arc-reading"
        data-testid="line-arc-reading"
        style={{ left: x + 12, top: y - 10 }}
      >
        {curve.degrees}°
      </span>
    </>
  );
}

/** «Done» of the mode «Edit curve», whatever the playhead shows: it keeps the curve, as Enter
 * does. */
export function CurveDone() {
  return (
    <button
      type="button"
      className="btn btn-small btn-primary preview-path-done"
      data-testid="line-curve-done"
      title={keysText('Keep the curve as it is (Enter)')}
      onClick={() => useLineCurveEdit.getState().close()}
    >
      Done
    </button>
  );
}

/** The mode «Edit curve» for the spline of `clip`'s line, on screen at the playhead. */
export function CurveEditor({
  clip,
  formula,
  ends,
  css,
  sceneOf,
  onMenu,
  onPan,
}: Shared & {
  clip: Clip;
  /** The preview's menu at the pointer, for a right-click. */
  onMenu(event: ReactMouseEvent<Element>): void;
  /** A pan of the view, for the middle button. */
  onPan(event: ReactPointerEvent<Element>): void;
}) {
  const selected = useLineCurveEdit((state) => state.selected);
  const drag = useDragStep();
  const held = useRef<{ selection: PathSelection; from: Vec2 } | null>(null);
  const curve = formula.curve;
  const nodes = curve?.shape === 'spline' ? explicitNodes(curve.nodes) : null;
  const frame = curveFrame(ends.start, ends.end);

  if (!nodes || !frame) {
    return (
      <div className="preview-hint" data-testid="line-curve-hint">
        {keysText(
          'Edit curve: the two ends of the line are at one place · Enter: done · Esc: as it was',
        )}
      </div>
    );
  }
  const toFrame: Mat2D = invert(frame);
  const framed = (event: { clientX: number; clientY: number }): Vec2 =>
    applyToPoint(toFrame, sceneOf(event));
  const at = (point: Vec2): Vec2 => css(applyToPoint(frame, point));
  const write = (next: SplineNode[]) => setLineNodes(clip.id, next);
  const select = (selection: PathSelection | null) => useLineCurveEdit.getState().select(selection);
  /** Whether a press is the mode's — a click of the main button —; the middle button pans the
   * view, and the secondary click is left to the menu its own event opens. */
  const ownPress = (event: ReactPointerEvent<Element>): boolean => {
    if (event.button === 1) onPan(event);
    return isMainClick(event);
  };

  const grab = (selection: PathSelection) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!ownPress(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    select(selection);
    held.current = { selection, from: framed(event) };
    drag.begin();
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const hold = held.current;
    if (!hold || !drag.on) return;
    const to = framed(event);
    const { node, part } = hold.selection;
    const spline = { nodes };
    // A smooth point's other handle mirrors the dragged one, as in the Edit-path mode (D176):
    // Shift keeps its own length, Ctrl/⌘ moves this one alone; the keys are read at each move.
    const next =
      part === 'at'
        ? moveAnchor(spline, node, [to[0] - hold.from[0], to[1] - hold.from[1]])
        : moveHandle(spline, node, part, to, handleLink(event));
    hold.from = to;
    drag.step(() => write(next.nodes));
  };
  const drop = (cancel: boolean) => () => {
    held.current = null;
    drag.end(cancel);
  };

  const curvePoints = samplePath({ nodes }, frame)
    .map((point) => css(point).join(','))
    .join(' ');
  const last = nodes.length - 1;
  return (
    <>
      <div
        className="line-draw-surface line-curve-surface"
        data-testid="line-curve-surface"
        onPointerDown={(event) => {
          if (ownPress(event)) select(null);
        }}
        onContextMenu={onMenu}
      />
      <svg className="line-rubber line-curve-lines">
        <polyline
          className="line-curve-hit"
          data-testid="line-curve-hit"
          points={curvePoints}
          onContextMenu={onMenu}
          onPointerDown={(event) => {
            if (!ownPress(event)) return;
            event.preventDefault();
            event.stopPropagation();
            const place = nearestPoint({ nodes }, framed(event));
            write(addNode({ nodes }, place).nodes);
            select({ node: place.segment + 1, part: 'at' });
          }}
        />
        {nodes.flatMap((node, index) =>
          (['in', 'out'] as const).flatMap((part) => {
            const handle = node[part];
            if (!handle) return [];
            const [x1, y1] = at(node.at);
            const [x2, y2] = at(handle);
            return [<line key={`${index}-${part}`} x1={x1} y1={y1} x2={x2} y2={y2} />];
          }),
        )}
      </svg>
      {nodes.flatMap((node, index) =>
        (['in', 'out'] as const).flatMap((part) => {
          const handle = node[part];
          if (!handle) return [];
          const [x, y] = at(handle);
          return [
            <button
              key={`${index}-${part}`}
              type="button"
              className="line-curve-handle"
              data-testid={`line-curve-handle-${index}-${part}`}
              data-selected={selected?.node === index && selected.part === part}
              aria-label={`Handle ${part === 'in' ? 'before' : 'after'} point ${index + 1} of the curve`}
              title={keysText(
                'Drag to bend the curve here · Ctrl/⌘: this handle alone (the point becomes a corner)',
              )}
              style={{ left: x, top: y }}
              onPointerDown={grab({ node: index, part })}
              onPointerMove={move}
              onPointerUp={drop(false)}
              onPointerCancel={drop(true)}
              onContextMenu={onMenu}
            />,
          ];
        }),
      )}
      {nodes.map((node, index) => {
        const [x, y] = at(node.at);
        const end = index === 0 || index === last;
        return (
          <button
            key={index}
            type="button"
            className="line-curve-node"
            data-testid={`line-curve-node-${index}`}
            data-end={end}
            data-smooth={node.smooth}
            data-selected={selected?.node === index && selected.part === 'at'}
            aria-label={
              end
                ? `${index === 0 ? 'Start' : 'End'} of the line`
                : `Point ${index + 1} of the curve`
            }
            title={
              end
                ? 'An end of the line: leave the mode to move it'
                : 'Drag to move this point · double-click: smooth or corner · Delete removes it'
            }
            style={{ left: x, top: y }}
            onPointerDown={
              end ? (event) => void ownPress(event) : grab({ node: index, part: 'at' })
            }
            onPointerMove={move}
            onPointerUp={drop(false)}
            onPointerCancel={drop(true)}
            onContextMenu={onMenu}
            onDoubleClick={() => {
              if (!end) write(toggleSmooth({ nodes }, index).nodes);
            }}
          />
        );
      })}
      <div className="preview-hint" data-testid="line-curve-hint" data-clip={clip.id}>
        {keysText(LINE_CURVE_HINT)}
      </div>
    </>
  );
}
