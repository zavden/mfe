/* Pointer and keyboard commands for the owned path session. Each drag owns one pair, the path it
 * edits (the common one, or a route's own) and a revision; cancellation restores only its own
 * field, retaining newer locks and amendments. On a pair with routes (D167) shown — «Path per
 * glyph» on, the other routes not locked (D175, the frame's `choosable`) — a press that is no
 * drag — a click — on another route's curve, or on the ink of a glyph that is the glyph of one
 * route only, chooses that route; the edited curve comes first. */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { applyToPoint, invert, type Mat2D, type Vec2 } from '../../geom';
import type { PathSpline, RouteRef } from '../../model';
import { toScene, type Camera, type Surface } from '../../render';
import type { Drawable } from '../../scene';
import { history, onProjectLoaded, type ProjectGesture } from '../../store';
import { modeOwnsKey, pressesModeBar } from './modeKeys';
import {
  addNode,
  changePath,
  currentPath,
  finishPathGesture,
  handleLink,
  handlePosition,
  hitPath,
  moveAnchor,
  moveHandle,
  onFixedEnd,
  removeNode,
  restoreGesturePath,
  toggleSmooth,
  usePathEdit,
  type PairRef,
  type PathFrame,
  type PathSelection,
} from './pathEdit';
import { ghostGlyph, hitRoute, routeOfGlyph, sameRoute } from './pathRoutes';
import { isMainClick } from '../pointer';

export const PATH_REACH = 7;
/** How far (CSS px) a press may travel and still be a click that chooses a route. */
const CLICK_SLOP = 4;

export interface PathGestureContext {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  camera: Camera;
  surface: Surface;
  unit: number;
  target: PairRef | null;
  frame: PathFrame | null;
  /** The pair's glyph whose ink is under a scene point, among those the mode draws faintly
   * (`pairGhosts`): what a click on a glyph chooses a route by. Absent: no glyph is picked. */
  pickGhost?: (point: Vec2) => Drawable | null;
}

interface PathDrag {
  owner: ProjectGesture | null;
  pointerId: number;
  target: PairRef;
  /** The path it edits: a route's own, or (null) the common one. */
  route: RouteRef | null;
  session: number;
  revision: number;
  selection: PathSelection;
  spline: PathSpline;
  expected: PathSpline;
  original: PathSpline | undefined;
  written: PathSpline | undefined;
  matrix: Mat2D;
  start: Vec2;
  cancelled: boolean;
}

/** A press on another route or on a route's glyph: it chooses that route when it is let go
 * where it was pressed. */
interface RoutePress {
  pointerId: number;
  route: RouteRef;
  x: number;
  y: number;
  moved: boolean;
}

function validDrag(drag: PathDrag): boolean {
  if (!drag.owner?.active) return false;
  const current = currentPath(drag.target, drag.expected);
  return (
    !!current &&
    current.session === drag.session &&
    current.revision === drag.revision &&
    sameRoute(current.route, drag.route)
  );
}

function cancelDrag(drag: PathDrag): void {
  if (drag.cancelled) return;
  drag.cancelled = true;
  const restore = () => {
    const back = restoreGesturePath(drag.session, drag.written, drag.original, drag.route);
    if (drag.owner) finishPathGesture(drag.owner, back ? 'rollback' : 'cancel');
  };
  if (drag.owner?.active) drag.owner.run(restore);
  else restore();
  usePathEdit.getState().select(null);
}

export function usePathGestures(ctx: PathGestureContext) {
  const { canvasRef, camera, surface, unit, target, frame, pickGhost } = ctx;
  const drag = useRef<PathDrag | null>(null);
  const press = useRef<RoutePress | null>(null);
  const initialCanvasRef = useRef(canvasRef);
  const [hover, setHover] = useState<PathSelection | null>(null);
  const [hoverRoute, setHoverRoute] = useState<RouteRef | null>(null);
  const [dragging, setDragging] = useState(false);
  const matrix = frame?.matrix ?? null;
  // A frame of a pair without routes may leave them out (one made by hand: what the mode edits).
  const editing = frame?.route ?? null;
  const choices = frame?.choices ?? [];
  const routes = frame?.routes ?? [];
  // Routes are chosen on the canvas only while they are shown and not locked (D175).
  const choosable = frame?.choosable ?? false;
  // The edited curve takes presses; so do the other routes of a pair that has them, even when
  // the edited one cannot be drawn (its glyph does not move).
  const active = target !== null && frame !== null && (matrix !== null || routes.length > 0);
  const reach = PATH_REACH * unit;

  const sceneOf = (event: { clientX: number; clientY: number }): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? surface.width / rect.width : 1;
    const sy = rect.height > 0 ? surface.height / rect.height : 1;
    return toScene(
      [(event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy],
      camera,
      surface,
    );
  };
  const localOf = (point: Vec2, m: Mat2D): Vec2 => applyToPoint(invert(m), point);

  /** The route a click at `point` would choose: another route's curve, else the glyph of one
   * route only — never the edited curve's (nor what lies under its fixed ends); none while the
   * routes are not choosable. */
  const routeAt = (spline: PathSpline, point: Vec2): RouteRef | null => {
    if (!choosable || choices.length === 0) return null;
    if (
      matrix &&
      (hitPath(spline, matrix, point, reach) || onFixedEnd(spline, matrix, point, reach))
    )
      return null;
    const curve = hitRoute(routes, point, reach, editing);
    if (curve) return curve;
    const ghost = pickGhost?.(point);
    const glyph = ghost && ghostGlyph(ghost);
    const route = glyph && routeOfGlyph(choices, glyph.side, glyph.glyph);
    return route && !sameRoute(route, editing) ? route : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): boolean => {
    if (!active || !frame || !target) return false;
    if (!isMainClick(event) || event.altKey) return false;
    const now = currentPath(target, frame.spline);
    if (!now || !sameRoute(now.route, editing)) return true;
    const point = sceneOf(event);
    const hit = matrix ? hitPath(now.spline, matrix, point, reach) : null;
    const store = usePathEdit.getState();
    if (!hit || !matrix) {
      store.select(null);
      const route = routeAt(now.spline, point);
      if (route) {
        event.preventDefault();
        press.current = {
          pointerId: event.pointerId,
          route,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return true;
    }
    event.preventDefault();
    const spline = hit.kind === 'curve' ? addNode(now.spline, hit.place) : now.spline;
    const selection: PathSelection =
      hit.kind === 'curve' ? { node: hit.place.segment + 1, part: 'at' } : hit.selection;
    const current: PathDrag = {
      owner: null,
      pointerId: event.pointerId,
      target,
      route: now.route,
      session: now.session,
      revision: now.revision,
      selection,
      spline,
      expected: now.spline,
      original: now.own,
      written: now.own,
      matrix,
      start: localOf(point, matrix),
      cancelled: false,
    };
    current.owner = history.beginGesture(() => {
      cancelDrag(current);
      setDragging(false);
    });
    drag.current = current;
    if (hit.kind === 'curve') {
      if (!current.owner.run(() => changePath(target, current.expected, spline, current.route))) {
        cancelDrag(current);
        return true;
      }
      current.expected = spline;
      current.written = spline;
    }
    store.select(selection);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    return true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): boolean => {
    const held = press.current;
    if (held) {
      if (event.pointerId === held.pointerId && !held.moved)
        held.moved = Math.hypot(event.clientX - held.x, event.clientY - held.y) > CLICK_SLOP;
      return true;
    }
    const current = drag.current;
    if (current) {
      if (event.pointerId !== current.pointerId) return true;
      if (current.cancelled) return true;
      if (!validDrag(current)) {
        cancelDrag(current);
        setDragging(false);
        return true;
      }
      const local = localOf(sceneOf(event), current.matrix);
      const { selection, spline, start } = current;
      // The keys are read at each move (D176): pressed or let go mid-drag, they change the next.
      const next =
        selection.part === 'at'
          ? moveAnchor(spline, selection.node, [local[0] - start[0], local[1] - start[1]])
          : moveHandle(spline, selection.node, selection.part, local, handleLink(event));
      if (
        !current.owner?.run(() => changePath(current.target, current.expected, next, current.route))
      ) {
        cancelDrag(current);
        setDragging(false);
        return true;
      }
      current.expected = next;
      current.written = next;
      return true;
    }
    if (!active || !frame || !target || !currentPath(target, frame.spline)) return false;
    const point = sceneOf(event);
    const hit = matrix ? hitPath(frame.spline, matrix, point, reach) : null;
    const next = hit?.kind === 'node' ? hit.selection : null;
    setHover((old) => (old?.node === next?.node && old?.part === next?.part ? old : next));
    const route = routeAt(frame.spline, point);
    setHoverRoute((old) => (sameRoute(old, route) ? old : route));
    return true;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>): boolean => {
    const held = press.current;
    if (held) {
      if (event.pointerId !== held.pointerId) return true;
      press.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      const still =
        !held.moved && Math.hypot(event.clientX - held.x, event.clientY - held.y) <= CLICK_SLOP;
      // Locked (or hidden) since the press: the click chooses nothing.
      if (event.type !== 'pointercancel' && still && choosable) {
        usePathEdit.getState().chooseRoute(held.route);
        setHoverRoute(null);
      }
      return true;
    }
    const current = drag.current;
    if (!current) return false;
    if (event.pointerId !== current.pointerId) return true;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.cancelled) {
      if (event.type === 'pointercancel' || !validDrag(current)) cancelDrag(current);
      else if (current.owner) finishPathGesture(current.owner);
    }
    setDragging(false);
    return true;
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>): boolean => {
    if (!active || !frame || !target) return false;
    if (!matrix || !currentPath(target, frame.spline)) return true;
    const hit = hitPath(frame.spline, matrix, sceneOf(event), reach);
    if (hit?.kind === 'node' && hit.selection.part === 'at') {
      changePath(target, frame.spline, toggleSmooth(frame.spline, hit.selection.node), editing);
    }
    return true;
  };

  const latest = useRef({ frame, target, unit });
  useEffect(() => {
    latest.current = { frame, target, unit };
  });
  useEffect(() => {
    const dispose = () => {
      if (drag.current && !drag.current.cancelled) cancelDrag(drag.current);
      drag.current = null;
      press.current = null;
      setDragging(false);
    };
    const canvas = initialCanvasRef.current.current;
    const lost = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId) dispose();
      if (event.pointerId === press.current?.pointerId) press.current = null;
    };
    const offLoad = onProjectLoaded(dispose);
    canvas?.addEventListener('lostpointercapture', lost);
    return () => {
      offLoad();
      canvas?.removeEventListener('lostpointercapture', lost);
      dispose();
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!modeOwnsKey(event)) return;
      // Enter on a button of the route bar presses it, unless a drag is held (`modeKeys.ts`).
      if (pressesModeBar(event) && !drag.current) return;
      const store = usePathEdit.getState();
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (event.key === 'Escape') {
        take();
        press.current = null;
        if (drag.current && !drag.current.cancelled) {
          cancelDrag(drag.current);
          setDragging(false);
          return;
        }
        store.close();
        return;
      }
      if (event.key === 'Enter') {
        take();
        press.current = null;
        if (drag.current && !drag.current.cancelled) {
          if (validDrag(drag.current) && drag.current.owner) finishPathGesture(drag.current.owner);
          else cancelDrag(drag.current);
          drag.current = null;
          setDragging(false);
        }
        store.close();
        return;
      }
      const { frame: now, target: ref, unit: px } = latest.current;
      const deleting = event.key === 'Delete' || event.key === 'Backspace';
      const step = (event.shiftKey ? 10 : 1) * px;
      const arrows: Record<string, Vec2> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const delta = arrows[event.key];
      if (deleting || delta) take();
      if (!now?.matrix || !ref || drag.current || !currentPath(ref, now.spline)) return;
      const selected = usePathEdit.getState().selected;
      if (!selected || !now.spline.nodes[selected.node]) {
        store.select(null);
        return;
      }
      const write = (next: PathSpline) => changePath(ref, now.spline, next, now.route);
      if (deleting) {
        write(
          selected.part === 'at'
            ? removeNode(now.spline, selected.node)
            : moveHandle(
                now.spline,
                selected.node,
                selected.part,
                now.spline.nodes[selected.node]!.at,
                'free',
              ),
        );
        store.select(null);
        return;
      }
      if (!delta) return;
      const local = (p: Vec2) => applyToPoint(invert(now.matrix!), p);
      const origin = local([0, 0]);
      const moved = local(delta);
      const shift: Vec2 = [moved[0] - origin[0], moved[1] - origin[1]];
      if (selected.part === 'at') write(moveAnchor(now.spline, selected.node, shift));
      else {
        // A handle nudged mirrors its partner, as a plain drag does (D176); Shift is the long step.
        const from = handlePosition(now.spline, selected);
        if (from)
          write(
            moveHandle(now.spline, selected.node, selected.part, [
              from[0] + shift[0],
              from[1] + shift[1],
            ]),
          );
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [target]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    hover,
    /** The route a click would choose where the pointer is (D167), drawn brighter. */
    hoverRoute: active && choosable ? hoverRoute : null,
    dragging,
  };
}
