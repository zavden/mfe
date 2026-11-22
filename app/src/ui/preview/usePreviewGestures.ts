/* The preview's pointer gestures, out of `PreviewPanel.tsx`: click and modifier-click to select,
 * a drag on empty space for the selection rectangle, a drag to move the selected clips (snapping
 * to the other clips, the frame and the grid, with guide lines; Alt pressed once it runs holds it
 * to one axis, `axisLock.ts`, and Ctrl/⌘ frees it of the snapping, both at the key's press and
 * release, in any order), the transform handles (scale,
 * rotate, a group as one), align by symbol (a click picks a glyph within the halo), the glyph
 * pick (Alt + click on a glyph, Alt + drag from a formula for a rectangle, over one formula or
 * several; D74, D117), colours in order (a click copies a glyph's colour, or pastes the next one;
 * D129), pan with the
 * middle button or Alt on empty space (on a Mac, with a scroll too), Ctrl/⌘ + wheel to zoom, Escape
 * to cancel a gesture or
 * clear the pick, and Shift to show the handles. The layers over the canvas while a line is drawn
 * or shaped (`LineLayer.tsx`) pass their middle button and their right-click on (`panFrom`,
 * `onContextMenu`), and the wheel is heard on the frame, over them too. The panel gives it what the gestures hit and edit — the drawables, the boxes, the
 * handles' geometry, the camera — and gets back the gesture state its overlay and its markup
 * show, and the handlers of its canvas. Where the objects do not answer the pointer (`reach`,
 * `pointerReach.ts`) only the pan and the zoom are left of all this, and the scene's own menu. */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { isFittedRule, type ClipId, type Project, type Vec2 } from '../../model';
import {
  panByPixels,
  toScene,
  zoomAbout,
  type Camera,
  type Renderer,
  type Surface,
  toPixel,
} from '../../render';
import type { Drawable } from '../../scene';
import {
  history,
  onProjectLoaded,
  useProjectStore,
  useRenderStore,
  useUiStore,
  type ProjectGesture,
  type Selection,
} from '../../store';
import { contoursBox, type Box } from '../../geom';
import { partEditOf } from '../animations/transformEdit';
import { isDrag, isMainClick, screenPoint } from '../pointer';
import { turnSymbolReach, usePreferences } from '../preferences';
import { OWN_WHEEL, scrollPans, zoomFactor } from '../pinch';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';
import { highlightedClipIds } from '../selection';
import { round6 } from '../time';
import { SNAP_DISTANCE } from '../timeline/layout';
import { reportSkipped } from './alignActions';
import { clickColourGlyph, useColourOrder } from './colourOrder';
import type { DragAxis } from './axisLock';
import { dragSnapOf, dragTravel } from './dragSnap';
import { snapSize } from './snap';
import {
  applyEdit,
  startGroupTransform,
  startTransform,
  writeTravel,
  type Drag,
  type EditPatch,
  type Gesture,
  type HandlePress,
  type Transform,
} from './gesture';
import { cursorRows, glyphCentre, isCursorKey, stepCursor, type GlyphRef } from './glyphCursor';
import {
  drawsSnapshot,
  glyphsTouching,
  pickable,
  pickableClip,
  pickByClick,
  pickByRect,
  pickClipIds,
  pickHas,
  PICK_REACH,
  type GlyphPick,
  type PickRevision,
} from './glyphPick';
import { currentPickRevision, pickRevision, useGlyphPick } from './glyphPickStore';
import { minGroupFactor, rotatedPlacements, scaledPlacements } from './groupTransform';
import {
  MIN_SCALE,
  advanceRotation,
  handleCursor,
  hitHandle,
  rotationFromDrag,
  rotationReadout,
  scaleFromDrag,
  scaleReadout,
  snappedScale,
  type HandleGeometry,
  type HandleId,
  type OrientedBox,
} from './handles';
import {
  clickSelection,
  draggedPosition,
  marqueeSelection,
  pickClip,
  pickGlyph,
  sameSelection,
  STROKE_SLACK,
} from './interaction';
import { clipsTouching, marqueeRect, mergeMarquee } from './marquee';
import { previewEditableClips } from './previewLock';
import type { SnapGuide } from './snap';
import { keyIsTaken, modeOwnsKey } from './modeKeys';
import type { PointerReach } from './pointerReach';
import { isPreviewCovered } from './previewCover';
import {
  carriedNow,
  editContext,
  planMove,
  warnAttached,
  warnCarried,
  warnRefusal,
} from './selectionMove';
import { useSymbolAlign, type SymbolAlignPhase } from './symbolAlign';
import type { ViewState } from './viewStore';

export type Cursor = 'default' | 'pointer' | 'move' | 'grab' | 'grabbing' | 'crosshair';

/** What the gestures hit and edit, as the panel has it this render. */
export interface PreviewGestureContext {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The frame element: readouts and the compass are placed relative to it. */
  frameRef: RefObject<HTMLDivElement | null>;
  renderer: Renderer;
  camera: Camera;
  surface: Surface;
  setView: (update: ViewState | ((current: ViewState) => ViewState)) => void;
  project: Project;
  resolved: ReturnType<typeof useRenderStore.getState>['resolved'];
  /** What of the scene answers the pointer (`pointerReach.ts`). Unless it is the objects, these
   * gestures take none of them: no hover, no press on one, no handles, no selection rectangle,
   * no glyph picked with Alt, no menu of an object — the view is still panned and zoomed. */
  reach: PointerReach;
  /** What the pointer can hit: the drawables of the clips that are not locked in the preview
   * (`previewLock.ts`). */
  drawables: readonly Drawable[];
  /** The frame the scene is seen through now (`sceneFrameBox`): a dragged formula snaps to its
   * edges and its centre lines. */
  frame: Box;
  /** The whole formula's box of every clip on screen (`geometry.ts`), the locked ones too: a
   * dragged formula snaps to them. */
  fullBoxes: ReadonlyMap<ClipId, Box>;
  /** The clips locked in the preview: a selection rectangle does not take them. */
  lockedIds: ReadonlySet<ClipId>;
  /** The drawables of those clips: what the reference click of align by symbol can hit in its
   * Shift+Alt+G form, and nothing else can. */
  lockedDrawables: readonly Drawable[];
  /** The transform handles: their geometry and box, when a clip or a group can be edited. */
  geometry: HandleGeometry | null;
  handleBox: OrientedBox | null;
  /** The handles are of a clip locked after its transformations: shown, not usable. */
  transformBlocked: boolean;
  /** A block's end state of the single selected clip is being edited: the handles stay. */
  editingHere: boolean;
  /** The single selected clip, or null; the selected clips on screen when there are several. */
  transformClipId: ClipId | null;
  groupIds: ClipId[];
  /** Scene units per CSS pixel. */
  unit: number;
  /** The step the handles' scale snaps to. */
  scaleStep: number;
}

export interface PreviewGestures {
  hover: Drawable | null;
  cursor: Cursor;
  shiftHeld: boolean;
  /** Alt is held: a press picks glyphs on a formula, pans elsewhere (the hint says so). */
  altHeld: boolean;
  /** The handle being dragged, or null. */
  transforming: HandleId | null;
  /** The axis a drag of the selection is held to while Alt is held (`axisLock.ts`), or null. */
  axisLock: DragAxis | null;
  hoverHandle: HandleId | null;
  /** The hovered handle while the handles show. */
  hoveredHandle: HandleId | null;
  handlesVisible: boolean;
  /** The canvas cursor: the handle's, or the gesture's. */
  handleStyle: string;
  readout: { text: string; x: number; y: number } | null;
  guides: SnapGuide[];
  /** The selection rectangle being drawn, scene units. */
  marquee: Box | null;
  /** That rectangle picks glyphs (Alt) instead of selecting clips. */
  glyphMarquee: boolean;
  /** The halo's centre while a symbol is being picked, scene units. */
  haloAt: Vec2 | null;
  /** The glyph the keyboard's cursor is on while a symbol is being picked (arrows; Enter picks). */
  keyGlyph: Drawable | null;
  /** The right-click menu: where it opens and the clip under the pointer; `pick` when it opened
   * on a picked glyph (the menu of the picked glyphs, not the clip's). */
  menu: { x: number; y: number; clipId: ClipId; pick: boolean } | null;
  closeMenu(): void;
  /** The right-click menu of the empty space of the scene: where it opens. */
  spaceMenu: { x: number; y: number } | null;
  closeSpaceMenu(): void;
  /** Whether a gesture of these (a pan, a drag) is running. */
  gestureActive(): boolean;
  onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerLeave(): void;
  /** The right-click menu at the pointer — of the canvas, or of a layer over it. */
  onContextMenu(event: ReactMouseEvent<Element>): void;
  /** A press of the middle button on a layer over the canvas: the view pans, as from the canvas,
   * which takes the pointer. */
  panFrom(event: ReactPointerEvent<Element>): void;
}

/** Whether two guide lists say the same (the overlay repaints only when they differ). */
function sameGuides(a: readonly SnapGuide[], b: readonly SnapGuide[]): boolean {
  const key = (g: SnapGuide): string =>
    g.kind === 'span'
      ? `${g.axis}=${g.spans.map((s) => `${s.from},${s.to},${s.at}`).join(';')}`
      : `${g.axis}@${g.at}:${g.from},${g.to}`;
  return a.length === b.length && a.every((g, i) => key(g) === key(b[i]!));
}

export function usePreviewGestures(ctx: PreviewGestureContext): PreviewGestures {
  const {
    canvasRef,
    frameRef,
    renderer,
    camera,
    surface,
    setView,
    project,
    resolved,
    reach,
    drawables,
    fullBoxes,
    lockedIds,
    lockedDrawables,
    geometry,
    handleBox,
    transformBlocked,
    editingHere,
    transformClipId,
    groupIds,
    unit,
    scaleStep,
  } = ctx;
  /** How far from a stroke a click still hits it, in scene units. */
  const slack = STROKE_SLACK * unit;
  const snapObjects = usePreferences((state) => state.snapObjects);
  const keepHandles = usePreferences((state) => state.keepHandles);
  const grid = usePreferences((state) => state.grid);
  const gridStep = usePreferences((state) => state.gridStep);
  const gridAnchor = usePreferences((state) => state.gridAnchor);
  const symbolRadius = usePreferences((state) => state.symbolRadius);
  /** The circle selector (a preference, the toolbar's switch): its reach in scene units while
   * it is on. A click, a hover and the context menu then take the symbol nearest to the pointer
   * within it, as align by symbol does, instead of only what is under the pointer. */
  const circle = usePreferences((state) => state.circleSelect) ? symbolRadius * unit : undefined;
  const symbolPhase = useSymbolAlign((state) => state.phase);
  const symbolSource = useSymbolAlign((state) => state.source);
  /** The glyphs a click of align by symbol can take (`symbolAlign.ts`): the symbol to align,
   * first, among the formulas that are not locked (it is the one that moves), and then the
   * reference among the formulas of the mode's form — the locked ones for Shift+Alt+G. */
  const symbolGlyphs =
    symbolPhase?.step === 'reference' && symbolSource === 'locked' ? lockedDrawables : drawables;
  /** Colours in order is on (`colourOrder.ts`): a click copies the colour of the glyph under it,
   * or gives it the next one; nothing else answers the pointer but the pan. */
  const ordering = useColourOrder((state) => state.phase !== null);
  /** The glyphs such a click can take: those of the objects whose glyphs have colours of their
   * own, as an Alt pick takes them. */
  const colourGlyphs = (): Drawable[] => {
    const takes = new Map<ClipId, boolean>();
    return drawables.filter((d) => {
      if (!pickable(d)) return false;
      let ok = takes.get(d.clipId);
      if (ok === undefined) takes.set(d.clipId, (ok = pickableClip(project, d.clipId)));
      return ok;
    });
  };

  const gesture = useRef<Gesture | null>(null);
  const historyOwner = useRef<ProjectGesture | null>(null);
  const initialCanvasRef = useRef(canvasRef);
  const pointerId = useRef<number | null>(null);
  const [hover, setHover] = useState<Drawable | null>(null);
  const [cursor, setCursor] = useState<Cursor>('default');
  const [shiftHeld, setShiftHeld] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  // The clip under the pointer (its glyph or its box), for the cursor Alt shows.
  const [overClip, setOverClip] = useState<ClipId | null>(null);
  const [transforming, setTransforming] = useState<HandleId | null>(null);
  const [axisLock, setAxisLock] = useState<DragAxis | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleId | null>(null);
  const [readout, setReadout] = useState<{ text: string; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [glyphMarquee, setGlyphMarquee] = useState(false);
  const [haloAt, setHaloAt] = useState<Vec2 | null>(null);
  // The keyboard's cursor of align by symbol, tied to the phase it was set in: a pick, Escape or
  // the toggle make a new phase, and the cursor goes with the old one.
  const [cursorState, setCursorState] = useState<{
    phase: SymbolAlignPhase;
    glyph: GlyphRef;
  } | null>(null);
  const keyCursor = cursorState && cursorState.phase === symbolPhase ? cursorState.glyph : null;
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    clipId: ClipId;
    pick: boolean;
  } | null>(null);
  const [spaceMenu, setSpaceMenu] = useState<{ x: number; y: number } | null>(null);
  const lastPointer = useRef<{ clientX: number; clientY: number } | null>(null);
  // What the wheel has turned of the reach and is not a whole pixel yet (`turnSymbolReach`).
  const reachKept = useRef<number | null>(null);
  /** The objects do not answer the pointer (`pointerReach.ts`). */
  const off = reach !== 'objects';
  // What the pointer was over goes with them: it is not there when they answer again.
  const [wasOff, setWasOff] = useState(off);
  if (off !== wasOff) {
    setWasOff(off);
    if (off) {
      setHover(null);
      setHoverHandle(null);
      setOverClip(null);
      setHaloAt(null);
      if (cursor === 'move') setCursor('default');
    }
  }

  const beginHistory = () => {
    historyOwner.current = history.beginGesture(() => {
      const active = gesture.current;
      if (active?.kind === 'drag' || active?.kind === 'transform') active.cancelled = true;
      gesture.current = null;
      pointerId.current = null;
      setTransforming(null);
      setAxisLock(null);
      setReadout(null);
      setGuides([]);
      setCursor('default');
    });
  };

  useEffect(() => {
    const canvas = initialCanvasRef.current.current;
    const dispose = () => {
      historyOwner.current?.cancel();
      historyOwner.current = null;
      gesture.current = null;
      pointerId.current = null;
      setMarquee(null);
      setAxisLock(null);
    };
    const lost = (event: PointerEvent) => {
      if (event.pointerId === pointerId.current) dispose();
    };
    const offLoad = onProjectLoaded(dispose);
    canvas?.addEventListener('lostpointercapture', lost);
    return () => {
      offLoad();
      canvas?.removeEventListener('lostpointercapture', lost);
      dispose();
    };
  }, []);

  // The handles are the objects': they go with them, but for a drag of one that still runs.
  const handlesVisible =
    geometry !== null &&
    !transformBlocked &&
    (!off || transforming !== null) &&
    (shiftHeld || keepHandles || transforming !== null || editingHere);
  const hoveredHandle = handlesVisible ? hoverHandle : null;
  const activeHandle = transforming ?? hoveredHandle;
  const handleStyle =
    handleBox && activeHandle ? handleCursor(activeHandle, handleBox.rotation) : cursor;
  // Alt held while nothing is dragged (the cursor is the hover's): a glyph pick over a formula,
  // a pan anywhere else.
  const altStyle: Cursor | null =
    altHeld && transforming === null && (cursor === 'default' || cursor === 'move')
      ? overClip && pickableClip(project, overClip)
        ? 'crosshair'
        : 'grab'
      : null;

  // --- Pointer helpers.
  const pixelOf = (event: { clientX: number; clientY: number }): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? surface.width / rect.width : 1;
    const sy = rect.height > 0 ? surface.height / rect.height : 1;
    return [(event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy];
  };
  const sceneOf = (event: { clientX: number; clientY: number }): Vec2 =>
    toScene(pixelOf(event), camera, surface);
  /** CSS px of a scene point from the preview frame's corner (where a compass opens). */
  const frameCssOf = (point: Vec2): { x: number; y: number } => {
    const canvas = canvasRef.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!canvas || !frame) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const [px, py] = toPixel(point, camera, surface);
    const sx = surface.width > 0 ? rect.width / surface.width : 1;
    const sy = surface.height > 0 ? rect.height / surface.height : 1;
    return { x: rect.left - frame.left + px * sx, y: rect.top - frame.top + py * sy };
  };
  /** A glyph as align by symbol and colours in order take it: with its label, for the hint and
   * the compass. */
  const pickedGlyph = (glyph: Drawable) => {
    const clip = project.clips.find((c) => c.id === glyph.clipId);
    const entry = clip && resolved.get(clip.formulaId);
    const renderIndex = entry?.canonToRender[glyph.glyph];
    const label =
      (renderIndex != null ? entry?.render.glyphs[renderIndex]?.label : undefined) ?? '?';
    return { clipId: glyph.clipId, glyph: glyph.glyph, key: glyph.key, label };
  };

  /** The render of the formula of clip `clipId` that this render of the panel draws: the index
   * space of the glyphs the pointer hits. Null when the stores already have another one, or
   * when what is drawn is not of the formula's snapshot yet — the snapshot is amended a moment
   * before its render is published, for a text above all, and after an undo. */
  const shownRevision = (clipId: ClipId): PickRevision | null => {
    const revision = pickRevision(clipId);
    const clip = project.clips.find((c) => c.id === clipId);
    const formula = project.formulas.find((f) => f.id === clip?.formulaId);
    return revision &&
      revision.formulaId === formula?.id &&
      revision.key === (formula.snapshot?.key ?? null) &&
      drawsSnapshot(formula, resolved.get(formula.id))
      ? revision
      : null;
  };
  /** Leave `next` picked by a gesture on clip `clipId`. The pick is parts of the selected
   * formulas: its clips become the selection — that clip alone when nothing is picked. The parts
   * the gesture touched are of the renders it read them in (`revisions`). */
  const takePick = (
    next: GlyphPick | null,
    clipId: ClipId,
    revisions: ReadonlyMap<ClipId, PickRevision>,
  ) => {
    const ui = useUiStore.getState();
    const selection: Selection = { kind: 'clips', ids: next ? pickClipIds(next) : [clipId] };
    if (!sameSelection(ui.selection, selection)) ui.select(selection);
    useGlyphPick.getState().set(
      next && {
        parts: next.parts.map((part) => ({
          ...part,
          revision: revisions.get(part.clipId) ?? part.revision,
        })),
      },
    );
  };

  /** Pan the view from a press: the canvas takes the pointer, wherever the press was. */
  const beginPan = (event: ReactPointerEvent<Element>) => {
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    gesture.current = { kind: 'pan', start: pixelOf(event), camera };
    setCursor('grabbing');
  };
  const panFrom = (event: ReactPointerEvent<Element>) => {
    historyOwner.current?.cancel();
    pointerId.current = event.pointerId;
    beginPan(event);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    historyOwner.current?.cancel();
    pointerId.current = event.pointerId;
    const canvas = event.currentTarget;
    if (off) {
      // The objects are left alone: the view is panned as ever, and — where the camera's
      // rectangles answer — a click beside them clears the selection, as one on empty space does.
      if (event.button === 1 || (isMainClick(event) && event.altKey)) {
        beginPan(event);
        return;
      }
      if (!isMainClick(event) || reach === 'none') return;
      canvas.setPointerCapture(event.pointerId);
      gesture.current = {
        kind: 'marquee-press',
        startPixel: screenPoint(event),
        startScene: sceneOf(event),
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        restore: useUiStore.getState().selection,
        still: true,
      };
      return;
    }
    if (isMainClick(event) && event.altKey && !ordering) {
      // Alt on a formula picks its glyphs (D74): the one under the pointer on release, or those
      // a rectangle touches. Alt on empty space pans, as the middle button does.
      const point = sceneOf(event);
      const hit = pickClip(renderer, drawables, point, { slack, reach: circle });
      if (hit && pickableClip(project, hit.clipId)) {
        const revision = shownRevision(hit.clipId);
        if (!revision) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        const own = drawables.filter((d) => d.clipId === hit.clipId && pickable(d));
        const glyph = pickGlyph(renderer, own, point, circle ?? PICK_REACH * unit, slack);
        // Nothing changes until the release or the drag: the glyphs picked in other formulas
        // stay, and this one joins them (D117).
        gesture.current = {
          kind: 'glyph-press',
          clipId: hit.clipId,
          startPixel: screenPoint(event),
          startScene: point,
          glyph: glyph?.glyph ?? null,
          additive: event.shiftKey,
          revision,
          selection: useUiStore.getState().selection,
        };
        return;
      }
    }
    if (event.button === 1 || (isMainClick(event) && event.altKey)) {
      beginPan(event);
      return;
    }
    if (!isMainClick(event)) return;
    const point = sceneOf(event);
    if (ordering) {
      // Colours in order: a click takes the glyph under it — the nearest within the circle, with
      // the circle selector —, of the render its object has now; a click on nothing is ignored.
      const hit = pickGlyph(renderer, colourGlyphs(), point, circle ?? PICK_REACH * unit, slack);
      if (!hit || !shownRevision(hit.clipId)) return;
      const { clipId, glyph, label } = pickedGlyph(hit);
      clickColourGlyph({ clipId, glyph, label });
      return;
    }
    if (symbolPhase && symbolPhase.step !== 'direction') {
      // Align by symbol: a click picks a glyph (the one to align, then the reference); a click
      // on nothing is ignored, Esc leaves the mode.
      const glyph = pickGlyph(renderer, symbolGlyphs, point, symbolRadius * unit, slack);
      if (!glyph) return;
      // Of the render its formula has now: on an older one the index would be another glyph's.
      const revision = shownRevision(glyph.clipId);
      if (!revision) return;
      // No mouse default action: it would move the focus away from the compass that opens.
      event.preventDefault();
      const frame = frameRef.current?.getBoundingClientRect();
      useSymbolAlign
        .getState()
        .pick(
          { ...pickedGlyph(glyph), revision },
          { x: event.clientX - (frame?.left ?? 0), y: event.clientY - (frame?.top ?? 0) },
        );
      return;
    }
    // Handles come first: they sit on and around the formula, on top of glyph picking.
    const handle = handlesVisible && geometry ? hitHandle(geometry, point, unit) : null;
    const handleClipId = transformClipId ?? groupIds[0];
    if (handle && handleBox && handleClipId) {
      canvas.setPointerCapture(event.pointerId);
      gesture.current = {
        kind: 'handle-press',
        handle,
        clipId: handleClipId,
        startPixel: screenPoint(event),
        startScene: point,
        center: handleBox.center,
        ...(groupIds.length > 0 ? { group: groupIds } : {}),
      };
      return;
    }
    const hit = pickClip(renderer, drawables, point, { slack, reach: circle });
    const ui = useUiStore.getState();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!hit) {
      // Empty space: a selection rectangle if the pointer moves, else a click that clears the
      // selection on release (a modifier click leaves it alone).
      canvas.setPointerCapture(event.pointerId);
      gesture.current = {
        kind: 'marquee-press',
        startPixel: screenPoint(event),
        startScene: point,
        additive,
        restore: ui.selection,
      };
      return;
    }
    const current = ui.selection;
    const next = clickSelection(current, hit.clipId, additive);
    if (next !== current) ui.select(next);
    // A modifier click only changes the selection: no drag follows it.
    if (additive) return;
    const clip = project.clips.find((c) => c.id === hit.clipId);
    const track = clip && project.tracks.find((t) => t.id === clip.trackId);
    const highlighted = highlightedClipIds(current);
    canvas.setPointerCapture(event.pointerId);
    gesture.current = {
      kind: 'press',
      clipId: hit.clipId,
      startPixel: screenPoint(event),
      startScene: point,
      locked: !clip || !!track?.locked,
      collapseTo:
        highlighted.length > 1 && highlighted.includes(hit.clipId) ? hit.clipId : undefined,
    };
  };

  /** Right-click on a clip: select it (unless it is among the selected clips) and open the
   * align menu — on a picked glyph, the menu of the picked glyphs (D74). On empty space only the
   * browser's own menu is suppressed. */
  const onContextMenu = (event: ReactMouseEvent<Element>) => {
    event.preventDefault();
    // With the objects left alone, the scene's own menu opens wherever the click was.
    const hit = off
      ? null
      : pickClip(renderer, drawables, sceneOf(event), { slack, reach: circle });
    if (!hit) {
      setSpaceMenu({ x: event.clientX, y: event.clientY });
      return;
    }
    const ui = useUiStore.getState();
    const next = clickSelection(ui.selection, hit.clipId, false);
    if (next !== ui.selection) ui.select(next);
    const onPick =
      hit.drawable !== null &&
      pickHas(useGlyphPick.getState().pick, hit.clipId, hit.drawable.glyph);
    setMenu({ x: event.clientX, y: event.clientY, clipId: hit.clipId, pick: onPick });
  };

  /** Start editing the keyframe in effect at the playhead — or the part transform under edit —
   * with the handles (one undo step for the whole drag). */
  const beginTransform = (press: HandlePress) => {
    const current = useProjectStore.getState().project;
    let next: Transform | 'blocked' | undefined;
    if (press.group) {
      // The members on unlocked tracks whose keyframe can be edited take part; the others stay,
      // and are named once.
      const group = press.group;
      // An attached brace or shape keeps the turn and size its target gives it; so does a shape
      // a Transform carried to other glyphs.
      // Nor does a line take a size or a turn: its two ends say where it is.
      const lines = new Set(current.formulas.filter((f) => f.kind === 'line').map((f) => f.id));
      const members = previewEditableClips(current, group).filter(
        (c) =>
          !(c.attach && isFittedRule(c.attach.rule)) && !carriedNow(c) && !lines.has(c.formulaId),
      );
      next = startGroupTransform(press, members, editContext());
      if (next !== 'blocked') {
        const moving = new Set(next.members?.map((m) => m.clipId));
        reportSkipped(current.clips.filter((c) => group.includes(c.id) && !moving.has(c.id)));
      }
    } else {
      const clip = current.clips.find((c) => c.id === press.clipId);
      // What places it now says why it does not move by hand: the Transform that carried it to
      // other glyphs (D123), else what it hangs on.
      const carried = clip && carriedNow(clip);
      if (clip && carried) {
        warnCarried(current, clip, carried);
        gesture.current = null;
        return;
      }
      if (clip?.attach && isFittedRule(clip.attach.rule)) {
        warnAttached(current, clip);
        gesture.current = null;
        return;
      }
      next = clip && startTransform(press, clip, editContext());
    }
    if (!next || next === 'blocked') {
      gesture.current = null;
      return;
    }
    // What a corner drag's size snaps with: the box of the clip (or of the group) as it began
    // and the other clips' boxes; a part's end state has no size of its own to match.
    if (!next.part) {
      const ids = next.members ? next.members.map((m) => m.clipId) : [next.clipId];
      const snap = dragSnapOf(fullBoxes, ids, null);
      next.size = snap ? { box: snap.moving, targets: snap.targets.boxes } : null;
    }
    beginHistory();
    gesture.current = next;
    setTransforming(press.handle);
    setHover(null);
  };

  const applyTransform = (drag: Transform, event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = sceneOf(event);
    const free = event.ctrlKey || event.metaKey; // no scale / 15° steps, no size guides
    let text: string;
    let nextGuides: SnapGuide[] = [];
    // The factor at which the box's width or height equals another clip's, within the snap
    // distance: it comes before the scale step, with the two sizes as guides.
    const sized = (factor: number) =>
      !free && drag.size
        ? snapSize(drag.size.box, drag.center, factor, drag.size.targets, SNAP_DISTANCE * unit)
        : null;
    if (drag.members) {
      // The group: every member scaled by the same factor, or turned by the same angle, about
      // the centre of the group's box, so that it keeps its shape.
      const members = drag.members;
      let placements: ({ clipId: ClipId } & EditPatch)[];
      if (drag.handle === 'rotate') {
        drag.tracker = advanceRotation(drag.tracker, drag.center, point);
        const degrees = rotationFromDrag(0, drag.tracker, !free);
        placements = rotatedPlacements(members, drag.center, degrees);
        text = rotationReadout(degrees);
      } else {
        const min = minGroupFactor(members);
        const raw = scaleFromDrag(1, drag.center, drag.startScene, point, min);
        const size = sized(raw);
        const factor =
          size && size.factor >= min
            ? round6(size.factor)
            : snappedScale(raw, free, min, scaleStep);
        if (size && factor === round6(size.factor)) nextGuides = size.guides;
        placements = scaledPlacements(members, drag.center, factor);
        text = scaleReadout(factor);
      }
      historyOwner.current?.update((draft) => {
        placements.forEach((placement, i) => {
          const clip = draft.clips.find((c) => c.id === placement.clipId);
          if (clip) applyEdit(clip, members[i]!, placement);
        });
      });
    } else {
      let patch: { scale: number } | { rotation: number };
      if (drag.handle === 'rotate') {
        drag.tracker = advanceRotation(drag.tracker, drag.center, point);
        const rotation = rotationFromDrag(drag.startValue, drag.tracker, !free);
        patch = { rotation };
        text = rotationReadout(rotation);
      } else {
        const raw = scaleFromDrag(drag.startValue, drag.center, drag.startScene, point);
        const size = drag.startValue > 0 ? sized(raw / drag.startValue) : null;
        const matched = size ? round6(size.factor * drag.startValue) : null;
        const scale =
          matched !== null && matched >= MIN_SCALE
            ? matched
            : snappedScale(raw, free, undefined, scaleStep);
        if (size && scale === matched) nextGuides = size.guides;
        patch = { scale };
        text = scaleReadout(scale);
      }
      historyOwner.current?.update((draft) => {
        const clip = draft.clips.find((c) => c.id === drag.clipId);
        if (clip) applyEdit(clip, drag, patch);
      });
    }
    setGuides((current) => (sameGuides(current, nextGuides) ? current : nextGuides));
    const frame = frameRef.current?.getBoundingClientRect();
    setReadout({
      text,
      x: event.clientX - (frame?.left ?? 0) + 16,
      y: event.clientY - (frame?.top ?? 0) + 18,
    });
  };

  /** Place the dragged clips for the pointer at `pointer` and the modifier keys `keys` held now:
   * Alt holds the drag to one axis, from where it began (`dragTravel`); Ctrl/⌘ suspends the
   * snapping to the objects and the grid (the magnet button turns the first off), with the axis
   * held or not. A pointer move calls it, and so does the press or release of one of those keys,
   * which moves no pointer. */
  const moveDrag = (
    drag: Drag,
    pointer: { clientX: number; clientY: number },
    keys: { altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    const position = draggedPosition(drag.startPosition, drag.startScene, sceneOf(pointer));
    const pointed: Vec2 = [
      position[0] - drag.startPosition[0],
      position[1] - drag.startPosition[1],
    ];
    const free = keys.ctrlKey || keys.metaKey;
    const placed = dragTravel(pointed, {
      snap: drag.snap ?? null,
      objects: snapObjects && !free,
      threshold: SNAP_DISTANCE * unit,
      grid: grid && !free ? { step: gridStep, anchor: gridAnchor } : null,
      lock: keys.altKey,
    });
    setGuides((current) => (sameGuides(current, placed.guides) ? current : placed.guides));
    setAxisLock(placed.axis);
    historyOwner.current?.update((draft) => writeTravel(draft, drag, placed.travel));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gesture.current && event.pointerId !== pointerId.current) return;
    const active = gesture.current;
    lastPointer.current = { clientX: event.clientX, clientY: event.clientY };
    // Keep the Shift and Alt states true to the keyboard even if a key event was missed.
    if (!active && event.shiftKey !== shiftHeld) setShiftHeld(event.shiftKey);
    if (!active && event.altKey !== altHeld) setAltHeld(event.altKey);
    // The circle of the selector goes while something is dragged, and comes back with the hover.
    if (active && active.kind !== 'press' && active.kind !== 'marquee-press') setHaloAt(null);
    if (active?.kind === 'pan') {
      const [px, py] = pixelOf(event);
      const next = panByPixels(active.camera, surface, px - active.start[0], py - active.start[1]);
      setView({ center: next.center, zoom: next.zoom });
      return;
    }
    // A formula rendered again under a glyph gesture: its glyphs are not the ones it read.
    if (
      (active?.kind === 'glyph-press' && !currentPickRevision(active.clipId, active.revision)) ||
      (active?.kind === 'glyph-marquee' &&
        [...active.revisions].some(([clipId, revision]) => !currentPickRevision(clipId, revision)))
    ) {
      gesture.current = null;
      setMarquee(null);
      setCursor('default');
      return;
    }
    if (active?.kind === 'glyph-press') {
      if (!isDrag(event, active.startPixel)) return;
      gesture.current = {
        kind: 'glyph-marquee',
        clipId: active.clipId,
        startScene: active.startScene,
        additive: active.additive,
        restore: useGlyphPick.getState().current(),
        restoreSelection: active.selection,
        revisions: new Map([[active.clipId, active.revision]]),
        cancelled: false,
      };
      setHover(null);
      setHoverHandle(null);
      setCursor('crosshair');
    }
    const glyphBox = gesture.current;
    if (glyphBox?.kind === 'glyph-marquee') {
      if (glyphBox.cancelled) return;
      // The glyphs whose box the rectangle touches are picked as it grows, of every formula
      // whose glyphs can be picked (D117).
      const rect = marqueeRect(glyphBox.startScene, sceneOf(event));
      setMarquee(rect);
      setGlyphMarquee(true);
      const { revisions } = glyphBox;
      const canPick = (clipId: ClipId) => {
        if (!pickableClip(project, clipId)) return false;
        const revision = revisions.get(clipId) ?? shownRevision(clipId);
        if (revision) revisions.set(clipId, revision);
        return revision !== null;
      };
      const touched = glyphsTouching(drawables, rect, canPick, glyphBox.clipId);
      takePick(
        pickByRect(glyphBox.restore, touched, glyphBox.additive),
        glyphBox.clipId,
        revisions,
      );
      return;
    }
    if (active?.kind === 'marquee-press') {
      if (active.still || !isDrag(event, active.startPixel)) return;
      gesture.current = {
        kind: 'marquee',
        startScene: active.startScene,
        additive: active.additive,
        restore: active.restore,
        initial: highlightedClipIds(active.restore),
        cancelled: false,
      };
      setHover(null);
      setHoverHandle(null);
      setCursor('crosshair');
    }
    const box = gesture.current;
    if (box?.kind === 'marquee') {
      if (box.cancelled) return;
      // The clips whose full box the rectangle touches are selected as it grows.
      const rect = marqueeRect(box.startScene, sceneOf(event));
      setMarquee(rect);
      setGlyphMarquee(false);
      const touched = clipsTouching(fullBoxes, rect).filter((id) => !lockedIds.has(id));
      const ids = mergeMarquee(box.initial, touched, box.additive);
      const ui = useUiStore.getState();
      const next = marqueeSelection(box.restore, ids);
      if (!sameSelection(ui.selection, next)) ui.select(next);
      return;
    }
    if (active?.kind === 'handle-press') {
      if (!isDrag(event, active.startPixel)) return;
      beginTransform(active);
    }
    const transform = gesture.current;
    if (transform?.kind === 'transform') {
      if (!transform.cancelled) applyTransform(transform, event);
      return;
    }
    if (active?.kind === 'press' && !active.locked) {
      if (!isDrag(event, active.startPixel)) return;
      const current = useProjectStore.getState().project;
      const clip = current.clips.find((c) => c.id === active.clipId);
      if (!clip) return;
      // The pressed clip and the selected clips that go along, by the rules the arrow keys move
      // the selection by too (`selectionMove.ts`); or why the pressed clip stays, told once.
      const next = planMove(current, clip, active, useUiStore.getState().selection, editContext());
      if ('refused' in next) {
        if (!active.warned) {
          active.warned = true;
          warnRefusal(current, next);
        }
        return;
      }
      // What the drag snaps with: the moving boxes (or the part's glyphs as drawn) against the
      // other clips on screen and the frame, as they are now.
      const part = next.part && partEditOf(clip, editContext().editing);
      const partBox = part
        ? contoursBox(
            drawables
              .filter((d) => d.clipId === clip.id && part.glyphs.includes(d.glyph))
              .flatMap((d) => d.path.contours),
          )
        : null;
      next.snap = dragSnapOf(
        fullBoxes,
        [clip.id, ...next.companions.map((c) => c.clipId)],
        ctx.frame,
        partBox,
      );
      beginHistory();
      gesture.current = next;
      setCursor('grabbing');
      setHover(null);
    }
    const drag = gesture.current;
    if (drag?.kind === 'drag') {
      if (!drag.cancelled) moveDrag(drag, event, event);
      return;
    }
    if (active) return; // pressing on a locked clip, or panning
    if (off) {
      // Nothing of the objects is under the pointer, wherever it is.
      setHaloAt(null);
      setHover(null);
      setHoverHandle(null);
      setOverClip(null);
      setCursor('default');
      return;
    }
    // Plain hover.
    const point = sceneOf(event);
    if (ordering) {
      // Colours in order: the glyph a click would take is outlined.
      setHaloAt(circle === undefined ? null : point);
      const near = pickGlyph(renderer, colourGlyphs(), point, circle ?? PICK_REACH * unit, slack);
      setHover((current) => (current?.key === near?.key ? current : near));
      setHoverHandle(null);
      setOverClip(null);
      return;
    }
    if (symbolPhase && symbolPhase.step !== 'direction') {
      // Align by symbol: the nearest symbol within the halo is the one a click would take.
      setHaloAt(point);
      const near = pickGlyph(renderer, symbolGlyphs, point, symbolRadius * unit, slack);
      setHover((current) => (current?.key === near?.key ? current : near));
      setHoverHandle(null);
      return;
    }
    // The circle selector: its circle follows the pointer, and what it would take is outlined.
    setHaloAt(circle === undefined ? null : point);
    const overHandle = handlesVisible && geometry ? hitHandle(geometry, point, unit) : null;
    setHoverHandle(overHandle);
    if (overHandle) {
      setHover(null);
      return;
    }
    const hit = pickClip(renderer, drawables, point, { slack, reach: circle });
    setHover((current) => {
      const next = hit?.drawable ?? null;
      return current?.key === next?.key ? current : next;
    });
    setOverClip(hit?.clipId ?? null);
    setCursor(hit ? 'move' : 'default');
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== pointerId.current) return;
    pointerId.current = null;
    const active = gesture.current;
    gesture.current = null;
    const owner = historyOwner.current;
    historyOwner.current = null;
    if (event.type === 'pointercancel') owner?.cancel();
    else owner?.end();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A click (no drag) on one clip of a multi-selection selects that clip alone.
    if (active?.kind === 'press' && active.collapseTo) {
      useUiStore.getState().select({ kind: 'clips', ids: [active.collapseTo] });
    }
    // A click (no drag) on empty space clears the selection; a modifier click keeps it.
    if (
      active?.kind === 'marquee-press' &&
      !active.additive &&
      event.type === 'pointerup' &&
      !(active.still && isDrag(event, active.startPixel))
    ) {
      useUiStore.getState().select({ kind: 'none' });
    }
    // An Alt+click (no drag) on a formula picks the glyph under it, or clears the pick.
    if (
      active?.kind === 'glyph-press' &&
      event.type === 'pointerup' &&
      currentPickRevision(active.clipId, active.revision)
    ) {
      const current = useGlyphPick.getState().current();
      takePick(
        pickByClick(current, active.clipId, active.glyph, active.additive),
        active.clipId,
        new Map([[active.clipId, active.revision]]),
      );
    }
    if (active?.kind === 'marquee' || active?.kind === 'glyph-marquee') setMarquee(null);
    if (active?.kind === 'drag') {
      setGuides([]);
      setAxisLock(null);
    }
    if (active?.kind === 'transform') {
      setTransforming(null);
      setReadout(null);
      setGuides([]);
    }
    setCursor('default');
  };

  const onPointerLeave = () => {
    setHaloAt(null);
    if (!gesture.current) {
      lastPointer.current = null;
      setHover(null);
      setHoverHandle(null);
      setOverClip(null);
      setCursor('default');
    }
  };

  // Escape leaves align by symbol, cancels a drag (move, scale or rotate) in progress and lets
  // the glyphs picked with Alt go. Not while something covers the Preview (`previewCover.ts`):
  // the key is its. A drag holds the pointer and takes its Escape wherever the focus is; the
  // mode and the pick leave it to whose it is (`modeKeys.ts`): a dialog, a field, an open menu.
  // The mode takes a plain Escape only — held with Ctrl, ⌘ or Alt it is a shortcut's, and what
  // was chosen stays —; the pick goes with Alt held too, the key it was made with.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = gesture.current;
      if (event.key !== 'Escape' || isPreviewCovered()) return;
      if (useSymbolAlign.getState().phase) {
        if (modeOwnsKey(event)) useSymbolAlign.getState().cancel();
        return;
      }
      if (active?.kind === 'marquee' && !active.cancelled) {
        // Back to the selection from before the rectangle; the pointer keeps nothing.
        active.cancelled = true;
        useUiStore.getState().select(active.restore);
        setMarquee(null);
        setCursor('default');
      }
      if (active?.kind === 'glyph-marquee' && !active.cancelled) {
        // Back to the pick from before the rectangle, and to the selection it was a part of.
        active.cancelled = true;
        useUiStore.getState().select(active.restoreSelection);
        useGlyphPick.getState().set(active.restore);
        setMarquee(null);
        setCursor('default');
      }
      // Escape with nothing running clears the glyph pick.
      if (!active && useGlyphPick.getState().pick) {
        if (keyIsTaken(event)) return;
        useGlyphPick.getState().clear();
      }
      if ((active?.kind === 'drag' || active?.kind === 'transform') && !active.cancelled) {
        historyOwner.current?.cancel();
        active.cancelled = true;
        setCursor('default');
        setReadout(null);
        setGuides([]);
        setAxisLock(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Align by symbol from the keyboard: while a symbol is being chosen, the arrows walk the glyphs
  // on screen (`glyphCursor.ts`) and Enter picks the one under the cursor, as a click would. G,
  // once the symbol to move is chosen, keeps it as it is at the playhead (or lets it go), for a
  // reference picked at another time. The mode takes these keys before what has the focus hears
  // them — a clip of the timeline would move the selection with the same arrow, the menu bar
  // would go on to its next menu — unless they are somebody else's (`modeKeys.ts`).
  const picking = symbolPhase !== null && symbolPhase.step !== 'direction';
  const keyGlyph = keyCursor ? (symbolGlyphs.find((d) => d.key === keyCursor.key) ?? null) : null;
  const latestKeys = useRef<{ step(key: string): boolean }>({ step: () => false });
  useEffect(() => {
    latestKeys.current = {
      step: (key) => {
        const phase = useSymbolAlign.getState().phase;
        if (!phase || phase.step === 'direction') return false;
        if (key === 'g' || key === 'G') {
          if (phase.step !== 'reference') return false;
          useSymbolAlign.getState().hold();
          return true;
        }
        if (isCursorKey(key)) {
          const except = phase.step === 'reference' ? phase.target.clipId : null;
          const glyph = stepCursor(cursorRows(symbolGlyphs, fullBoxes, except), keyCursor, key);
          setCursorState(glyph ? { phase, glyph } : null);
          return true;
        }
        if (key !== 'Enter' || !keyGlyph) return false;
        const revision = shownRevision(keyGlyph.clipId);
        if (!revision) return true;
        useSymbolAlign
          .getState()
          .pick({ ...pickedGlyph(keyGlyph), revision }, frameCssOf(glyphCentre(keyGlyph)));
        return true;
      },
    };
  });
  useEffect(() => {
    if (!picking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!modeOwnsKey(event)) return;
      if (!latestKeys.current.step(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [picking]);

  // Shift shows the transform handles. Releasing it (or leaving the window) hides them, unless
  // a drag is running: the drag keeps going and the handles go when it ends.
  const latestHandles = useRef<{
    hit(client: { clientX: number; clientY: number }): HandleId | null;
  }>({ hit: () => null });
  useEffect(() => {
    latestHandles.current = {
      hit: (client) => (geometry ? hitHandle(geometry, sceneOf(client), unit) : null),
    };
  });
  // Alt and Ctrl/⌘ change where a move drag goes — held to one axis, freed of the snapping — and
  // a key pressed or let go moves no pointer: the drag is placed again for the keys held, at the
  // pointer where it was last. Whether a move drag was running to be placed.
  const latestDrag = useRef<{
    placeAgain(keys: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean;
  }>({ placeAgain: () => false });
  useEffect(() => {
    latestDrag.current = {
      placeAgain: (keys) => {
        const drag = gesture.current;
        const pointer = lastPointer.current;
        if (drag?.kind !== 'drag' || drag.cancelled || !pointer) return false;
        moveDrag(drag, pointer, keys);
        return true;
      },
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.key === 'Alt' || event.key === 'Control' || event.key === 'Meta') &&
        latestDrag.current.placeAgain(event) &&
        event.key === 'Alt'
      ) {
        // While a move drag runs Alt is the drag's: on Windows, Alt pressed and let go alone
        // would give the browser's menu the focus.
        event.preventDefault();
      }
      if (event.key === 'Alt') {
        // Alt shows what a press would do (the cursor, the hint) while it is held.
        if (event.type !== 'keydown') setAltHeld(false);
        else if (!isModalOpen() && !isTextEntryTarget(event.target)) setAltHeld(true);
        return;
      }
      if (event.key !== 'Shift') return;
      if (event.type === 'keydown') {
        if (isModalOpen() || isTextEntryTarget(event.target)) return;
        setShiftHeld(true);
        const pointer = lastPointer.current;
        setHoverHandle(pointer ? latestHandles.current.hit(pointer) : null);
      } else {
        setShiftHeld(false);
      }
    };
    const onBlur = () => {
      setShiftHeld(false);
      setAltHeld(false);
      // The keys let go in another window send nothing here: a drag held to an axis, or freed
      // of the snapping, is let go as if they had been; the next pointer move says again.
      latestDrag.current.placeAgain({ altKey: false, ctrlKey: false, metaKey: false });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms about the cursor; on a Mac a wheel alone moves the
  // view. Needs a non-passive listener to keep the browser from zooming the page. Heard on the frame: over the layers on the canvas too
  // — the surface of a mode, its bars —, as over the scene itself.
  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const onWheel = (event: WheelEvent) => {
      const reaching =
        useSymbolAlign.getState().phase !== null || usePreferences.getState().circleSelect;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && reaching) {
        // Align by symbol, the circle selector: Shift + wheel grows or shrinks the reach (a
        // preference). The small events of a slow scroll add up.
        event.preventDefault();
        turnSymbolReach(reachKept, event.deltaY || event.deltaX);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (!event.ctrlKey && !event.metaKey) {
        // On a Mac a wheel alone is a scroll — two fingers on the trackpad, the wheel of a mouse
        // —, and moves the view as it moves any view there: the scene follows the fingers. Taken,
        // it is not the browser's "back" either. Elsewhere it is left alone (pinch.ts).
        const own = event.target instanceof Element && event.target.closest(OWN_WHEEL) !== null;
        if (!scrollPans(event, own)) return;
        event.preventDefault();
        const dx = event.deltaX * (surface.width / Math.max(1, rect.width));
        const dy = event.deltaY * (surface.height / Math.max(1, rect.height));
        setView((current) => {
          const next = panByPixels({ ...camera, ...current }, surface, -dx, -dy);
          return { center: next.center, zoom: next.zoom };
        });
        return;
      }
      event.preventDefault();
      const pixel: Vec2 = [
        (event.clientX - rect.left) * (surface.width / Math.max(1, rect.width)),
        (event.clientY - rect.top) * (surface.height / Math.max(1, rect.height)),
      ];
      // A pinch at the rate of the gesture (pinch.ts).
      const factor = zoomFactor(event, 0.002);
      setView((current) => {
        const next = zoomAbout({ ...camera, ...current }, surface, pixel, factor);
        return { center: next.center, zoom: next.zoom };
      });
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [camera, surface, canvasRef, frameRef, setView]);

  return {
    hover,
    cursor,
    shiftHeld,
    altHeld,
    transforming,
    axisLock,
    hoverHandle,
    hoveredHandle,
    handlesVisible,
    handleStyle: altStyle ?? handleStyle,
    readout,
    guides,
    marquee,
    glyphMarquee,
    haloAt,
    keyGlyph,
    menu,
    closeMenu: () => setMenu(null),
    spaceMenu,
    closeSpaceMenu: () => setSpaceMenu(null),
    /** Whether a gesture of these (a pan, a drag) is running. */
    gestureActive: () => gesture.current !== null,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onContextMenu,
    panFrom,
  };
}
