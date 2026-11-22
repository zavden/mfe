/* The preview's layer for lines (D137, D140; `lineDraw.ts`): while «Add line» is on, a surface
 * over the scene that takes the clicks — and steps aside while Alt is held, so that the preview
 * picks symbols as always, which become the end when the button is let go; its middle button pans
 * the view and its right-click (a Mac's Ctrl+click) opens the preview's menu, as on the scene —,
 * with the mode's hint; for an end put on glyphs, the compass that asks where on them it is; and,
 * for the one selected line, a handle at each of its ends, the start's in one colour and the end's
 * in another.
 * A handle dragged leaves its end free where it is dropped; with Alt held the end goes on the
 * symbol under the pointer, with Alt and Shift on the whole formula there; with Ctrl/⌘ held it
 * stays on the line's own axis, so that the line only grows or shrinks (D142). Its own menu frees the
 * end («Detach») or asks its point again. What an end would go on is marked in the preview
 * (`aim`). Real elements over the canvas: they take the pointer before the preview's own gestures
 * do. */
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { ResolvedFormulas } from '../../engine';
import { contoursBox } from '../../geom';
import type { ClipId, Project, Vec2 } from '../../model';
import { toPixel, toScene, type Camera, type Renderer, type Surface } from '../../render';
import { keyframeAt, type Drawable } from '../../scene';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { isMainClick } from '../pointer';
import { pickClip, pickGlyph, STROKE_SLACK } from './interaction';
import {
  alongLine,
  anchorLabel,
  anchorOf,
  anchorPendingEnd,
  askLineAnchor,
  AUTO_ANCHOR_HINT,
  directionOf,
  endAt,
  endFromPick,
  endName,
  freeLineEnd,
  freePoint,
  lineDrawHint,
  lineEndsHeld,
  lineEndsLock,
  lineEndsNow,
  offerLineEnd,
  takesLineEnd,
  useLineDraw,
  type EndPlace,
  type LineSide,
  type PendingEnd,
} from './lineDraw';
import { ArcHandle, CurveDone, CurveEditor } from './LineCurveLayer';
import { curveShownAt, useLineCurveEdit } from './lineCurve';
import { modeOwnsKey } from './modeKeys';
import { SymbolCompass } from './SymbolCompass';
import { keysText } from '../platform';

/** Pixels the pointer may move between press and release and still be a click. */
const CLICK_SLOP = 4;
/** Scene units around the pointer within which Alt takes the nearest symbol. */
const SYMBOL_REACH = 0.15;

/** What an end takes under the pointer: the whole object there, the symbol there, or nothing —
 * the point itself. */
type Reach = 'formula' | 'symbol' | 'free';

/** What a dragged end takes: nothing by itself; the symbol under the pointer with Alt held, the
 * whole formula there with Alt and Shift. */
const reachOf = (event: { altKey: boolean; shiftKey: boolean }): Reach =>
  event.altKey ? (event.shiftKey ? 'formula' : 'symbol') : 'free';

const SIDE_NAMES: Record<LineSide, string> = { start: 'Start', end: 'End' };

const cancelPending = () => useLineDraw.getState().ask(null);

interface Props {
  /** The preview's canvas: where a pointer is, in the scene, is read off its box. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  renderer: Renderer;
  camera: Camera;
  surface: Surface;
  /** Device pixels per CSS pixel of the canvas. */
  dpr: number;
  /** The preview frame's size, in CSS px: the compass stays inside it. */
  frame: { width: number; height: number };
  project: Project;
  resolved: ResolvedFormulas;
  /** What the preview can hit now. */
  drawables: readonly Drawable[];
  time: number;
  /** The clips selected, on unlocked tracks. */
  selected: readonly ClipId[];
  altHeld: boolean;
  /** Another mode has the preview: no handles, no surface. */
  busy: boolean;
  /** What a right-click — on a Mac, a Ctrl+click too — on the surface of a mode does: the
   * preview's menu at the pointer, as on the scene. */
  onMenu(event: ReactMouseEvent<Element>): void;
  /** What the middle button pressed on the surface of a mode does: it pans the view. */
  onPan(event: ReactPointerEvent<Element>): void;
}

interface EndDrag {
  side: LineSide;
  /** Where the pointer puts the end, in the scene. */
  at: Vec2;
  /** Ctrl/⌘ is held: the end is kept on the line's own axis. */
  along?: boolean;
}

export function LineLayer({
  canvasRef,
  renderer,
  camera,
  surface,
  dpr,
  frame,
  project,
  resolved,
  drawables,
  time,
  selected,
  altHeld,
  busy,
  onMenu,
  onPan,
}: Props) {
  const request = useLineDraw((state) => state.request);
  const pending = useLineDraw((state) => state.pending);
  const shaping = useLineCurveEdit((state) => state.clipId);
  const [drag, setDrag] = useState<EndDrag | null>(null);
  const [endMenu, setEndMenu] = useState<{ side: LineSide; x: number; y: number } | null>(null);
  const press = useRef<Vec2 | null>(null);
  const unit = dpr / (toPixel([1, 0], camera, surface)[0] - toPixel([0, 0], camera, surface)[0]);

  const css = (point: Vec2): Vec2 => {
    const [x, y] = toPixel(point, camera, surface);
    return [x / dpr, y / dpr];
  };
  /** Where a pointer is, in CSS px from the frame's corner. */
  const inFrame = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const sceneOf = (event: { clientX: number; clientY: number }): Vec2 => {
    const { x, y } = inFrame(event);
    return toScene([x * dpr, y * dpr], camera, surface);
  };
  /** The place for an end at `point`: the whole object under it (`formula`) or the symbol under
   * or nearest it (`symbol`), of an object that takes an end and is not the line's own; the
   * point itself when nothing is there, and always for `free`. */
  const placeUnder = (point: Vec2, reach: Reach, own?: ClipId): EndPlace => {
    if (reach === 'free') return freePoint(point);
    const others = own ? drawables.filter((d) => d.clipId !== own) : drawables;
    const slack = STROKE_SLACK * unit;
    if (reach === 'symbol') {
      const symbols = others.filter((d) => d.glyph >= 0 && takesLineEnd(project, d.clipId));
      const glyph = pickGlyph(renderer, symbols, point, SYMBOL_REACH, slack);
      return glyph ? { clipId: glyph.clipId, glyphs: [glyph.glyph] } : freePoint(point);
    }
    return endAt(project, pickClip(renderer, others, point, { slack })?.clipId ?? null, point, own);
  };
  const aimAt = (place: EndPlace | null) =>
    useLineDraw.getState().setAim(place && 'clipId' in place ? place : null);

  // While the mode is on: Escape gives up the end that waits for its point, then the mode — a
  // plain Escape: held with Ctrl, ⌘ or Alt it is a shortcut's (`modeKeys.ts`) —; and an Alt pick
  // that ends becomes the end.
  const drawing = request !== null && !busy;
  useEffect(() => {
    if (!drawing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !modeOwnsKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const state = useLineDraw.getState();
      if (state.pending) state.ask(null);
      else state.cancel();
    };
    const onPointerUp = (event: PointerEvent) => {
      const place = endFromPick();
      if (!place) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      offerLineEnd({ kind: 'draw' }, place, {
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drawing, canvasRef]);

  // With Alt held the preview shows the symbol under the pointer itself.
  useEffect(() => {
    if (drawing && altHeld) useLineDraw.getState().setAim(null);
  }, [drawing, altHeld]);

  // The one selected line that is on screen, and where its ends are drawn.
  const lineClip =
    !busy && request === null && selected.length === 1
      ? project.clips.find(
          (c) => c.id === selected[0] && time >= c.start - 1e-9 && time < c.end - 1e-9,
        )
      : undefined;
  const ends = lineClip ? lineEndsNow(project, resolved, lineClip, time) : null;
  const locked = lineClip ? lineEndsLock(project, lineClip.id) : null;

  // Escape gives a drag of an end up.
  useEffect(() => {
    if (!drag) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setDrag(null);
      useLineDraw.getState().setAim(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [drag]);

  /** What an end of the selected line is on at the playhead — as its clip has it, or the
   * Transform in effect there (D144) —: its glyphs, or null for a free one. */
  const heldBy = (side: LineSide) => {
    const end = lineClip ? lineEndsHeld(lineClip, 'playhead')[side] : null;
    return end && 'clipId' in end ? end : null;
  };
  // The handle of the arc turns the object's own arc: the line as its clip starts with it.
  const own = lineClip ? keyframeAt(lineClip, time).ref.kind === 'initial' : false;

  const startName = request?.start ? endName(project, request.start) : '';
  const startDot = request?.start && 'point' in request.start ? css(request.start.point) : null;
  const handle = (side: LineSide) => {
    if (!lineClip || !ends) return null;
    const [x, y] = css(drag?.side === side ? drag.at : ends[side]);
    const held = heldBy(side);
    const on = held
      ? `${endName(project, held)}, ${anchorLabel(held.anchor).toLowerCase()}`
      : 'a free point';
    const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
      // The secondary click opens the end's menu: on a Mac, Ctrl and a click is one.
      if (!isMainClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ side, at: sceneOf(event) });
    };
    /** Where the pointer puts the end: where it is, or — with Ctrl/⌘ held — the point of the
     * line's own axis nearest to it, on this end's side of the other one. */
    const pointOf = (event: ReactPointerEvent<HTMLButtonElement>): Vec2 => {
      const at = sceneOf(event);
      if (!(event.ctrlKey || event.metaKey)) return at;
      return alongLine(ends[side === 'start' ? 'end' : 'start'], ends[side], at);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (drag?.side !== side) return;
      const at = pointOf(event);
      setDrag({ side, at, along: event.ctrlKey || event.metaKey });
      aimAt(placeUnder(at, reachOf(event), lineClip.id));
    };
    const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (drag?.side !== side) return;
      setDrag(null);
      aimAt(null);
      if (event.type === 'pointercancel') return;
      offerLineEnd(
        { kind: 'move', clipId: lineClip.id, side },
        placeUnder(pointOf(event), reachOf(event), lineClip.id),
        inFrame(event),
      );
    };
    return (
      <button
        key={side}
        type="button"
        className="line-end-handle"
        data-testid={`line-end-${side}`}
        data-side={side}
        data-on={held ? held.clipId : ''}
        data-anchor={held ? held.anchor : ''}
        data-x={ends[side][0].toFixed(4)}
        data-y={ends[side][1].toFixed(4)}
        data-locked={locked ? 'true' : 'false'}
        aria-label={`${SIDE_NAMES[side]} of the line, on ${on}: drag it to move it`}
        title={
          locked ??
          `${SIDE_NAMES[side]}, on ${on}. ${keysText('Drag: free where you drop it · Ctrl/⌘: along the line, longer or shorter · Alt: onto the symbol under the pointer · Alt+Shift: onto the whole formula · right-click: its menu')}`
        }
        style={{ left: x, top: y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setEndMenu({ side, x: event.clientX, y: event.clientY });
        }}
      />
    );
  };
  const rubber =
    drag && ends ? [css(ends[drag.side === 'start' ? 'end' : 'start']), css(drag.at)] : null;

  /** Where the compass of `asked` opens: where the pointer put the end, or by the glyphs. */
  const compassAt = (asked: PendingEnd): { x: number; y: number } => {
    if (asked.at) return asked.at;
    const { clipId, glyphs } = asked.target;
    const marks = drawables.filter(
      (d) => d.clipId === clipId && d.glyph >= 0 && (glyphs === 'all' || glyphs.includes(d.glyph)),
    );
    if (marks.length === 0) return { x: frame.width / 2 - 60, y: frame.height / 2 - 70 };
    const box = contoursBox(marks.flatMap((d) => d.path.contours));
    const [x, y] = css([box.maxX, box.maxY]);
    return { x, y };
  };
  const pendingSide: LineSide | null = !pending
    ? null
    : pending.owner.kind === 'move'
      ? pending.owner.side
      : request?.start
        ? 'end'
        : 'start';
  // The compass of the line being drawn goes with the mode; a moved end's, with its line.
  const asking =
    pending &&
    !busy &&
    (pending.owner.kind === 'draw' ? drawing : lineClip?.id === pending.owner.clipId)
      ? pending
      : null;
  useEffect(() => {
    if (pending && !asking) cancelPending();
  }, [pending, asking]);

  const menuSide = endMenu && lineClip ? endMenu.side : null;
  const menuHeld = menuSide ? heldBy(menuSide) : null;
  const lineFormula = lineClip && project.formulas.find((f) => f.id === lineClip.formulaId);
  const line = lineFormula?.kind === 'line' ? lineFormula : null;

  // «Edit curve»: the points of the spline, in place of the handles of the ends, while the line
  // is on screen; the mode is on all the same when it is not, and its Done is there in both.
  if (shaping !== null && !busy) {
    const clip = project.clips.find((c) => c.id === shaping);
    const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
    const drawn = clip ? lineEndsNow(project, resolved, clip, time) : null;
    return (
      <>
        {clip && formula?.kind === 'line' && drawn && curveShownAt(clip, time) ? (
          <CurveEditor
            clip={clip}
            formula={formula}
            ends={drawn}
            css={css}
            sceneOf={sceneOf}
            onMenu={onMenu}
            onPan={onPan}
          />
        ) : (
          <div className="preview-hint" data-testid="line-curve-hint">
            {keysText(
              'Edit curve: the line is not on screen at the playhead · Enter: done · Esc: as it was',
            )}
          </div>
        )}
        <CurveDone />
      </>
    );
  }

  return (
    <>
      {drawing && (
        <>
          <div
            className="line-draw-surface"
            data-testid="line-draw-surface"
            data-line={request.line}
            data-step={request.start === null ? 'start' : 'end'}
            style={{ pointerEvents: altHeld ? 'none' : 'auto' }}
            onPointerDown={(event) => {
              if (event.button === 1) onPan(event);
              if (!isMainClick(event)) return;
              press.current = [event.clientX, event.clientY];
            }}
            onContextMenu={onMenu}
            onPointerMove={(event) => aimAt(placeUnder(sceneOf(event), 'formula'))}
            onPointerLeave={() => aimAt(null)}
            onPointerUp={(event) => {
              const from = press.current;
              press.current = null;
              if (!from || event.button !== 0) return;
              if (Math.hypot(event.clientX - from[0], event.clientY - from[1]) > CLICK_SLOP) return;
              offerLineEnd({ kind: 'draw' }, placeUnder(sceneOf(event), 'formula'), inFrame(event));
            }}
          />
          {startDot && (
            <span
              className="line-draw-dot"
              data-testid="line-draw-start"
              style={{ left: startDot[0], top: startDot[1] }}
            />
          )}
          <div className="preview-hint" data-testid="line-draw-hint">
            {lineDrawHint(
              request,
              startName,
              asking?.owner.kind === 'draw' ? endName(project, asking.target) : null,
            )}
          </div>
        </>
      )}
      {rubber && (
        <svg
          className="line-rubber"
          data-testid="line-rubber"
          data-along={drag?.along ? 'true' : 'false'}
          aria-hidden="true"
        >
          <line x1={rubber[0]![0]} y1={rubber[0]![1]} x2={rubber[1]![0]} y2={rubber[1]![1]} />
        </svg>
      )}
      {line && ends && !drag && own && (
        <ArcHandle formula={line} ends={ends} css={css} sceneOf={sceneOf} locked={locked} />
      )}
      {handle('start')}
      {handle('end')}
      {asking && pendingSide && (
        <SymbolCompass
          key={`${pendingSide}:${asking.target.clipId}:${String(asking.target.glyphs)}`}
          {...compassAt(asking)}
          width={frame.width}
          height={frame.height}
          testId="line-compass"
          label={`Where on ${endName(project, asking.target)} the line ${pendingSide}s`}
          title={
            <>
              <span className="line-end-dot" data-side={pendingSide} aria-hidden="true" />
              {SIDE_NAMES[pendingSide]}: which point of “{endName(project, asking.target)}”
            </>
          }
          auto={{
            label: 'Auto',
            title: AUTO_ANCHOR_HINT,
            onPick: () => anchorPendingEnd('auto'),
          }}
          current={asking.current === null ? null : (directionOf(asking.current) ?? 'auto')}
          onPick={(direction) => anchorPendingEnd(anchorOf(direction))}
          onCancel={cancelPending}
        />
      )}
      {endMenu && lineClip && menuSide && (
        <ContextMenu
          x={endMenu.x}
          y={endMenu.y}
          label={`${SIDE_NAMES[menuSide]} of the line`}
          testId="line-end-menu"
          onClose={() => setEndMenu(null)}
        >
          <div className="ctx-header" data-testid="line-end-menu-header">
            <span className="line-end-dot" data-side={menuSide} aria-hidden="true" />
            {SIDE_NAMES[menuSide]} ·{' '}
            {menuHeld
              ? `on ${endName(project, menuHeld)}, ${anchorLabel(menuHeld.anchor).toLowerCase()}`
              : 'free'}
          </div>
          <MenuItem
            testId="line-end-menu-detach"
            disabled={!menuHeld || locked !== null}
            onClick={() => {
              setEndMenu(null);
              freeLineEnd(lineClip.id, menuSide);
            }}
          >
            Detach
            {!menuHeld && <span className="ctx-hint">it is free</span>}
          </MenuItem>
          <MenuItem
            testId="line-end-menu-anchor"
            disabled={!menuHeld || locked !== null}
            onClick={() => {
              const rect = canvasRef.current?.getBoundingClientRect();
              setEndMenu(null);
              askLineAnchor(lineClip.id, menuSide, {
                x: endMenu.x - (rect?.left ?? 0),
                y: endMenu.y - (rect?.top ?? 0),
              });
            }}
          >
            Change its point…
          </MenuItem>
          {!menuHeld && (
            <div className="ctx-header ctx-group" data-testid="line-end-menu-how">
              {keysText('Drag it with Alt onto a symbol, with Alt+Shift onto a formula')}
            </div>
          )}
        </ContextMenu>
      )}
    </>
  );
}
