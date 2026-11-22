/* Preview: the scene at the playhead on a Canvas 2D surface.
 *
 * The evaluator (scene/) turns project + renders + time into drawables; the renderer (render/)
 * paints them. This panel adds the editor interaction: click to select a clip (Ctrl/⌘+click or
 * Shift+click adds it to the selection or takes it out; a drag on empty space draws a selection
 * rectangle that selects the clips it touches, adding to the selection with those keys), hover to
 * highlight a glyph, drag to move the selected clips (a keyframe edit at the playhead; the dragged
 * box snaps to the edges and centres of the other clips and of the frame, with guide lines, and
 * to the grid when it is shown — Ctrl/⌘ held suspends both; Alt pressed during the drag holds it
 * to one axis, still snapping along it), and zoom/pan of the view. While Shift is held, the
 * selected clip shows
 * transform handles: drag a corner to scale it uniformly, the circle above it to rotate it (in
 * steps of the preferred scale step, 0.05 by default, and 15°; Ctrl/⌘ held frees them); with
 * several clips selected the handles frame
 * them all and scale or turn them as a group about its centre (the group's factor snaps). Alt +
 * click picks a glyph of a formula and Alt + drag over it a rectangle of glyphs (D74): a part of
 * the formula to colour, or to put a brace or a shape on. Colours in order (Shift+C, D129) turns
 * the clicks into a copy of colours glyph by glyph, then into their paste. A click gives the frame
 * the focus: the arrow keys then move the selected objects by 0.01, with Shift by 0.1
 * (`nudge.ts`). Space is reserved for Play/Pause (Transport). */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { contoursBox, type Box } from '../../geom';
import {
  attachTargets,
  clipLifetimes,
  FRAME_HEIGHT,
  frameWidth,
  transferKey,
  type ClipId,
  type Vec2,
} from '../../model';
import {
  cameraThrough,
  createCanvasRenderer,
  pixelsPerUnit,
  toPixel,
  toScene,
  zoomAbout,
  type Camera,
  type Surface,
} from '../../render';
import { cameraAt, createEvaluator, type Drawable } from '../../scene';
import {
  createVisualProjectSelector,
  onProjectLoaded,
  useProjectStore,
  useRenderStore,
  useUiStore,
} from '../../store';
import { PanelFrame } from '../PanelFrame';
import { Transport } from '../transport/Transport';
import { groupBox, groupOrientedBox } from './groupTransform';
import { CORNERS, handleGeometry, orientedBox, SCALE_SNAP, turnedBox } from './handles';
import { clipBoxes, pickClip, placementAt } from './interaction';
import { openFormulaEditor } from '../creator/formulaEditorStore';
import { useFormulaSearch } from '../creator/search/formulaSearchStore';
import { isCompositionFormula } from '../text/textCompositionModel';
import {
  partEditOf,
  partTurn,
  previewEdit,
  startStateTime,
  useTransformEdit,
} from '../animations/transformEdit';
import { PreviewActions } from './PreviewActions';
import { GlyphPickBar } from './GlyphPickBar';
import { GlyphPickMenu } from './GlyphPickMenu';
import { PreviewMenu } from './PreviewMenu';
import { fadeLocked, previewEditableClips, previewLockedIds, reachable } from './previewLock';
import { drawOverlay } from './overlay';
import { frameBox, sceneFrameBox } from './boxes';
import { formulaBoxes, geometryAt } from './geometry';
import { parseScaleStep } from './scaleStep';
import { alignedFrame, stageAspect, type Rect } from './stageLayout';
import { formatGridStep } from './grid';
import { glyphCentre } from './glyphCursor';
import { describePick, pickable, pickHas, pickKey } from './glyphPick';
import { useGlyphPick } from './glyphPickStore';
import {
  findPair,
  nodesInScene,
  pathEditFrame,
  pathEditHint,
  samplePath,
  usePathEdit,
} from './pathEdit';
import { PathRouteBar } from './PathRouteBar';
import { pairGhosts, routeMark, sameRoute } from './pathRoutes';
import { symbolAlignHint, useSymbolAlign } from './symbolAlign';
import { colourOrderHint, orderGlyphs, useColourOrder } from './colourOrder';
import { useColourOrderKeys } from './useColourOrderKeys';
import { usePathGestures } from './usePathGestures';
import {
  chosenTargets,
  confirmRetarget,
  retargetHint,
  targetNames,
  useShapeRetarget,
} from './shapeRetarget';
import { startLineDraw, useLineDraw } from './lineDraw';
import { useLineCurveEdit } from './lineCurve';
import { LineLayer } from './LineLayer';
import { useLineCurveKeys } from './useLineCurveKeys';
import { useShapeRetargetKeys } from './useShapeRetargetKeys';
import { SymbolCompass } from './SymbolCompass';
import { canvasBox, drawGrid } from './gridLayer';
import {
  nudgeCameraFrame,
  stopIsolating,
  toggleCameraView,
  toggleMulticamera,
} from '../camera/cameraActions';
import { moveFrameOwner, STOP_ISOLATING_TITLE, turnOffBlocker } from '../camera/cameraOps';
import { cameraSceneAt, cameraSceneBoxes } from '../camera/cameraScene';
import { CameraAddItems, CameraPieceMenu, StopIsolatingItem } from './CameraSceneMenu';
import { pieceOfOwner } from './cameraGeometry';
import { describeCameraRects, drawCameraLayer } from './cameraLayer';
import { pointerReach } from './pointerReach';
import {
  cameraHint,
  frameOfPiece,
  OBJECTS_KEY_HINT,
  pieceOfSelection,
  useCameraGestures,
  WORLD_HINT,
} from './useCameraGestures';
import { useObjectsKey } from './useObjectsKey';
import { Icon } from '../timeline/icons';
import { useFlying } from '../timeline/useFlyKey';
import { LineMenuItems } from '../animations/BlockMenus';
import { ContextMenu } from '../ContextMenu';
import { onMenuChoice } from '../focus';
import { isMac, keyHint, keysText } from '../platform';
import { GUIDE_WIDTHS, usePreferences } from '../preferences';
import { usePreviewGestures } from './usePreviewGestures';
import {
  FIT_VIEW,
  isFitView,
  keptView,
  nearView,
  usePreviewView,
  viewFitting,
  viewThrough,
  type ViewState,
} from './viewStore';
import { nudgeSelection, nudgeTravel } from './nudge';
import './preview.css';
import { highlightedClipIds, selectedBlock, selectedFormulaIds } from '../selection';

const renderer = createCanvasRenderer();
const ZOOM_STEP = 1.25;
/** Opacity of the start state drawn beneath a tween whose end state is being edited. */
const GHOST_OPACITY = 0.3;
/** The room «Fit» keeps around everything of the camera in the world view, CSS px: its names sit
 * above their rectangles. */
const WORLD_MARGIN = 28;
const NO_DRAWABLES: readonly Drawable[] = [];
const NO_BOXES: readonly Box[] = [];

/** Re-render when the theme attribute changes (the canvas reads colours from CSS variables). */
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

/** Where the frame goes in a stage, and the device pixel ratio it was laid out for: the largest
 * box of the picture's shape inside the stage's padding or, for the world view, all of it. */
function frameIn(stage: HTMLElement, world: boolean, aspect: number): { frame: Rect; dpr: number } {
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const padding = parseFloat(getComputedStyle(stage).paddingLeft) || 0;
  const frame = alignedFrame(
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    padding,
    // The world view's frame is the stage itself.
    world ? stageAspect(rect, padding) : aspect,
    dpr,
  );
  return { frame, dpr };
}

function cssVar(element: Element, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

interface CanvasSize {
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
}

export function PreviewPanel() {
  // The view's toolbar is the stage's (its zoom, its modes), drawn in the panel's title bar: the
  // stage renders it into this slot.
  const [toolsSlot, setToolsSlot] = useState<HTMLElement | null>(null);
  // The search of formulas comes up over the panel (creator/search/): mounted still, out of reach.
  const covered = useFormulaSearch((state) => state.open);
  return (
    <PanelFrame
      title="Preview"
      icon="play-outline"
      testId="panel-preview"
      bodyClassName="preview-body"
      inert={covered}
      tools={<div className="preview-tools-slot" ref={setToolsSlot} />}
    >
      <PreviewStage toolsSlot={toolsSlot} />
      <Transport />
    </PanelFrame>
  );
}

function PreviewStage({ toolsSlot }: { toolsSlot: HTMLElement | null }) {
  const [selectProject] = useState(() => createVisualProjectSelector(true));
  const project = useProjectStore(selectProject);
  const resolved = useRenderStore((state) => state.resolved);
  const time = useUiStore((state) => state.time);
  const selection = useUiStore((state) => state.selection);
  const pick = useGlyphPick((state) => state.pick);
  const themeTick = useThemeTick();

  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  // Where the frame sits in the stage, on whole device pixels (`stageLayout.ts`).
  const [frameRect, setFrameRect] = useState<Rect>({ left: 0, top: 0, width: 0, height: 0 });
  // The scene's camera (D190), read on its own: it is not part of the visual project, so that a
  // drag of it does not build the evaluator again. While the multicamera is on the Preview shows
  // the world — the canvas takes the whole stage and nothing is cut at Manim's frame — or, in the
  // camera view (V), what the video shows: the picture, through the camera at the playhead.
  const sceneCamera = useProjectStore((state) => state.project.camera);
  const lens = usePreviewView((state) => state.cameraView) && sceneCamera !== undefined;
  const world = sceneCamera !== undefined && !lens;
  const cameraRoute = usePreferences((state) => state.cameraRoute);
  const cameraVeil = usePreferences((state) => state.cameraVeil);
  // The view is the Preview's own, kept in a store of its own (`viewStore.ts`): the scene's, or
  // the picture's in the camera view.
  const keptOfView = usePreviewView((state) => (lens ? state.through : state.view));
  // The frame has the focus, and with it the arrow keys (`nudge.ts`): the hint says so.
  const [keysHere, setKeysHere] = useState(false);
  const snapObjects = usePreferences((state) => state.snapObjects);
  const guideColor = usePreferences((state) => state.guideColor);
  const guideWidth = usePreferences((state) => state.guideWidth);
  const pickColor = usePreferences((state) => state.pickColor);
  const grid = usePreferences((state) => state.grid);
  const gridStep = usePreferences((state) => state.gridStep);
  const gridAnchor = usePreferences((state) => state.gridAnchor);
  // Align by symbol: the mode's step, and the reference symbol to outline.
  const symbolPhase = useSymbolAlign((state) => state.phase);
  const symbolSource = useSymbolAlign((state) => state.source);
  const cancelSymbolAlign = useCallback(() => useSymbolAlign.getState().cancel(), []);
  // Edit path: the pair whose path is being shaped, the route of it whose own path is (D167;
  // null: the common path), whether its routes are shown and whether those not edited are
  // locked (D175), and the part of it taken hold of.
  const pathTarget = usePathEdit((state) => state.target);
  const pathRoute = usePathEdit((state) => state.route);
  const pathPerGlyph = usePathEdit((state) => state.perGlyph);
  const pathLockOthers = usePathEdit((state) => state.lockOthers);
  // «To another formula or glyphs…»: what a shape's Transform goes to is being chosen here.
  const retarget = useShapeRetarget((state) => state.request);
  useShapeRetargetKeys();
  // Colours in order: the step of the mode, whose clicks copy colours or paste them.
  const orderPhase = useColourOrder((state) => state.phase);
  useColourOrderKeys();
  // «Edit curve»: the clip whose line's spline is shaped; its keys and its Done hold wherever
  // the playhead is (`useLineCurveKeys.ts`).
  const curveClipId = useLineCurveEdit((state) => state.clipId);
  useLineCurveKeys();
  // A line drawn or shaped: the mode's hint is the preview's alone (`LineLayer.tsx`), as the
  // other modes' are.
  const drawingLine = useLineDraw((state) => state.request?.line ?? null);
  const lineMode = drawingLine !== null || curveClipId !== null;
  const pathSelected = usePathEdit((state) => state.selected);
  const symbolRadius = usePreferences((state) => state.symbolRadius);
  // The circle selector: the pointer takes the symbol nearest to it within that reach.
  const circleSelect = usePreferences((state) => state.circleSelect);
  // The step the handles' scale snaps to, as typed in the Preferences (for the hint) and as a
  // number (for the drag).
  const scaleStepText = usePreferences((s) => s.scaleStep);
  const keepHandles = usePreferences((s) => s.keepHandles);
  const scaleStep = useMemo(() => parseScaleStep(scaleStepText) ?? SCALE_SNAP, [scaleStepText]);

  const { meta } = project;
  const evaluator = useMemo(() => createEvaluator(project, resolved), [project, resolved]);
  const drawables = useMemo(() => evaluator.evaluate(time), [evaluator, time]);
  // The frame the scene's camera is in at the playhead; the camera view looks through it.
  const cameraNow = useMemo(
    () => (sceneCamera ? cameraAt(sceneCamera, time, meta.target) : null),
    [sceneCamera, time, meta.target],
  );
  const lensFrame = lens ? cameraNow : null;
  // The frame the scene is seen through now, as a box: what a dragged formula snaps to.
  const sceneFrame = useMemo(
    () => sceneFrameBox({ meta, camera: sceneCamera }, time),
    [meta, sceneCamera, time],
  );
  // The view of the scene: the kept one, or — in the camera view — the one it is through the
  // camera's frame (`viewThrough`), which the gestures read and write as any view of the scene.
  const view = useMemo(
    () => (lensFrame ? viewThrough(keptOfView, lensFrame) : keptOfView),
    [keptOfView, lensFrame],
  );
  const lensNow = useRef(lensFrame);
  useLayoutEffect(() => {
    lensNow.current = lensFrame;
  });
  const setView = useCallback((update: ViewState | ((current: ViewState) => ViewState)) => {
    const frame = lensNow.current;
    const store = usePreviewView.getState();
    if (!frame) {
      store.setView(update);
      return;
    }
    store.setView(
      (kept) =>
        keptView(typeof update === 'function' ? update(viewThrough(kept, frame)) : update, frame),
      true,
    );
  }, []);
  // The camera's scene at the playhead (`cameraScene.ts`): what the world view draws of it.
  const cameraScene = useMemo(
    () => (world && sceneCamera ? cameraSceneAt({ camera: sceneCamera, meta }, time) : null),
    [world, sceneCamera, meta, time],
  );
  // The move that is isolated (`viewStore.ts`) and the rectangle of the frame it goes to: the only
  // one that answers the pointer then. It goes with its move — deleted, undone away —, with the
  // target camera it went to, and with the project: another one opened may have a move of the
  // same id (a copy of this one has them all).
  const isolatedMove = usePreviewView((state) => state.isolatedMove);
  const isolatedOwner = useMemo(
    () => (sceneCamera && isolatedMove !== null ? moveFrameOwner(sceneCamera, isolatedMove) : null),
    [sceneCamera, isolatedMove],
  );
  useEffect(() => {
    if (isolatedMove !== null && !isolatedOwner) usePreviewView.getState().isolateMove(null);
  }, [isolatedMove, isolatedOwner]);
  useEffect(() => onProjectLoaded(() => usePreviewView.getState().isolateMove(null)), []);
  const isolated = useMemo(
    () =>
      cameraScene && isolatedMove !== null && isolatedOwner
        ? { move: isolatedMove, piece: pieceOfOwner(cameraScene, isolatedOwner) }
        : null,
    [cameraScene, isolatedMove, isolatedOwner],
  );
  // The rectangle the selection names: the current camera, a target camera, or the frame a
  // selected move goes to on its own — and the isolated one, whatever of the camera is selected,
  // or nothing: its handles are the ones on screen, and the arrows are its. Objects selected
  // (on the timeline, or there with F held) keep the arrows for themselves.
  const selectedPiece = useMemo(() => {
    const named = pieceOfSelection(selection, cameraScene);
    return isolated && (named || selection.kind === 'none') ? isolated.piece : named;
  }, [isolated, selection, cameraScene]);
  // What of the scene answers the pointer (`pointerReach.ts`): the objects, or — in the world
  // view — the camera's rectangles alone, and nothing while the scene plays or the fly key gives
  // the mouse to the timeline (T, Shift+T); a mode that has the canvas reads the objects its way.
  // F held in the world view gives the pointer to the objects there (`useObjectsKey.ts`).
  const playing = useUiStore((state) => state.playing);
  const flying = useFlying((state) => state.mode !== null);
  const objectsKey = useObjectsKey(world);
  const modeOn =
    pathTarget !== null ||
    symbolPhase !== null ||
    orderPhase !== null ||
    retarget !== null ||
    lineMode;
  const reach = pointerReach({ world, mode: modeOn, playing, flying, objectsKey });

  // While a block's end state is edited (its end icon on the timeline), the clip — or the part —
  // as the block starts is drawn faintly beneath, for reference.
  const editing = useTransformEdit((s) => s.editing);
  const ghost = useMemo(() => {
    if (!editing) return null;
    const clip = project.clips.find((c) => c.id === editing.clipId);
    const action = clip?.actions.find((a) => a.id === editing.actionId);
    if (!clip || (action?.kind !== 'tween' && action?.kind !== 'transform')) return null;
    const fade = <P extends { opacity: number }>(paint: P | null) =>
      paint && { ...paint, opacity: paint.opacity * GHOST_OPACITY };
    const part = action.kind === 'transform' ? new Set(action.glyphs) : null;
    return evaluator
      .evaluate(startStateTime(clip, action))
      .filter((d) => d.clipId === clip.id && (!part || part.has(d.glyph)))
      .map((d) => ({
        ...d,
        key: `ghost:${d.key}`,
        z: -1,
        fill: fade(d.fill),
        stroke: fade(d.stroke),
      }));
  }, [editing, project.clips, evaluator]);

  // Edit path: where the pair's chord is (`pathEdit.ts`) — the route's when one is edited, the
  // first route's while «Path per glyph» is off —, and the pair's glyphs as the window starts and
  // as it ends, drawn faintly for reference (with the routes shown and not locked, a click on one
  // chooses its route). The mode ends with the pair.
  const pathFrame = useMemo(
    () =>
      pathTarget
        ? pathEditFrame(project, evaluator, pathTarget, pathRoute, {
            perGlyph: pathPerGlyph,
            lockOthers: pathLockOthers,
          })
        : null,
    [pathTarget, pathRoute, pathPerGlyph, pathLockOthers, project, evaluator],
  );
  useEffect(() => {
    if (pathTarget && !findPair(project, pathTarget)) usePathEdit.getState().close();
  }, [pathTarget, project]);
  const pathGhost = useMemo(
    () => pathFrame && pairGhosts(evaluator, pathFrame.transfer, pathFrame.pair, GHOST_OPACITY),
    [pathFrame, evaluator],
  );

  const camera: Camera = useMemo(
    () => ({
      ...(lensFrame
        ? cameraThrough(lensFrame, meta.width / meta.height)
        : { frameWidth: frameWidth(meta), frameHeight: FRAME_HEIGHT }),
      center: view.center,
      zoom: view.zoom,
    }),
    [meta, view, lensFrame],
  );
  const surface: Surface = useMemo(
    () => ({
      width: Math.max(1, Math.round(size.width * size.dpr)),
      height: Math.max(1, Math.round(size.height * size.dpr)),
    }),
    [size],
  );

  // --- Size: the frame is laid out here, not by CSS, so that it sits on whole device pixels
  // (`alignedFrame`): the largest box of the project's aspect inside the stage's padding. The
  // stage is measured again when it is resized, when the window is resized or scrolled (its
  // position may change without its size) and when the aspect changes.
  const aspect = meta.width / meta.height;
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const { frame: next, dpr } = frameIn(stage, world, aspect);
      setFrameRect((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
      setSize((current) =>
        current.width === next.width && current.height === next.height && current.dpr === dpr
          ? current
          : { width: next.width, height: next.height, dpr },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
    };
  }, [aspect, world]);

  // «Fit» in the world view shows everything of the camera (D190): Manim's frame, the frame of
  // 0 s, the target cameras and the moves' own frames, with room for their names.
  const worldFit = useMemo(
    () =>
      cameraScene && size.width > 0
        ? viewFitting(
            cameraSceneBoxes(cameraScene),
            { width: frameWidth(meta), height: FRAME_HEIGHT },
            surface,
            WORLD_MARGIN * size.dpr,
          )
        : null,
    [cameraScene, meta, surface, size],
  );
  // A camera that comes or goes — turned on or off, undone, another project's — changes what the
  // canvas is: the view of the scene goes back to the fit.
  const hadCamera = useRef(sceneCamera !== undefined);
  useLayoutEffect(() => {
    const has = sceneCamera !== undefined;
    if (has === hadCamera.current) return;
    hadCamera.current = has;
    usePreviewView.getState().fit();
  }, [sceneCamera]);
  // The plain fit is not the world's: a view put back to it (a multicamera just turned on, a
  // view never moved) becomes the fit of the world — once the canvas is the world's, which it is
  // a layout after the camera came.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !worldFit || keptOfView !== FIT_VIEW) return;
    const { frame } = frameIn(stage, true, aspect);
    if (frame.width !== size.width || frame.height !== size.height) return;
    setView(worldFit);
  }, [worldFit, keptOfView, size, aspect, setView]);

  // --- Overlay model: selected clips, and the clips of the formula selected in the Creator.
  const boxes = useMemo(() => clipBoxes(drawables), [drawables]);
  // The symbol to align of align by symbol, the first one clicked: outlined while its reference
  // and the side are chosen.
  const symbolMoving = symbolPhase && symbolPhase.step !== 'target' ? symbolPhase.target : null;
  // The instant that symbol was kept at (G), when it was: it is measured there, not here.
  const symbolHeld = symbolPhase && symbolPhase.step !== 'target' ? symbolPhase.held : null;
  // A kept symbol's formula as it is at that instant, drawn faintly wherever the playhead is —
  // its formula on screen there or not —: what the reference is being picked for stays in view.
  // Nothing of it answers the pointer.
  const heldAt = symbolHeld && Math.abs(symbolHeld.at - time) > 1e-9 ? symbolHeld.at : null;
  const heldGhost = useMemo(() => {
    if (heldAt === null || !symbolMoving) return null;
    const fade = <P extends { opacity: number }>(paint: P | null) =>
      paint && { ...paint, opacity: paint.opacity * GHOST_OPACITY };
    return evaluator
      .evaluate(heldAt)
      .filter((d) => d.clipId === symbolMoving.clipId)
      .map((d) => ({
        ...d,
        key: `ghost:${d.key}`,
        z: -1,
        fill: fade(d.fill),
        stroke: fade(d.stroke),
      }));
  }, [heldAt, symbolMoving, evaluator]);
  // The outline is on the symbol where it is measured: in that ghost when it is kept.
  const marked = useMemo(() => {
    if (!symbolMoving) return [];
    return heldGhost
      ? heldGhost.filter((d) => d.key === `ghost:${symbolMoving.key}`)
      : drawables.filter((d) => d.key === symbolMoving.key);
  }, [symbolMoving, heldGhost, drawables]);
  // Colours in order: the glyphs copied from, or pasted on, are framed while the step lasts —
  // a box around each, which leaves its colour to be seen.
  const orderMarked = useMemo(() => {
    const glyphs = orderGlyphs(orderPhase);
    if (glyphs.length === 0) return NO_BOXES;
    const wanted = new Set(glyphs.map((g) => `${g.clipId}:${g.glyph}`));
    return drawables
      .filter((d) => pickable(d) && wanted.has(`${d.clipId}:${d.glyph}`))
      .map((d) => contoursBox(d.path.contours))
      .filter((box) => Number.isFinite(box.minX));
  }, [orderPhase, drawables]);
  const orderHint = colourOrderHint(orderPhase);
  // The whole formula's box of every clip on screen — every glyph where it is now, drawn or not,
  // part transforms included (`geometry.ts`): what a drag snaps with, the selection rectangle
  // touches and the group handles frame, as Manim's own boxes would be.
  const geometries = useMemo(() => geometryAt(evaluator, time), [evaluator, time]);
  const fullBoxes = useMemo(() => formulaBoxes(geometries), [geometries]);
  // …and what a rectangle of the camera sticks to, when it is dragged.
  const cameraSnapObjects = useMemo(() => [...fullBoxes.values()], [fullBoxes]);
  // What align by symbol tells in each step; it knows whether the symbol to move is still here.
  const symbolHint = symbolAlignHint(
    symbolPhase,
    symbolSource,
    !symbolMoving || (geometries.get(symbolMoving.clipId)?.glyphs.has(symbolMoving.glyph) ?? false),
  );
  // What is chosen so far for the shape that is being given a target (`shapeRetarget.ts`).
  const retargetChosen = useMemo(
    () =>
      retarget
        ? targetNames(
            project,
            chosenTargets(
              project,
              selection,
              pick ? pick.parts.map((part) => ({ clipId: part.clipId, glyphs: [] })) : null,
              retarget.clipId,
            ),
          )
        : '',
    [retarget, project, selection, pick],
  );
  // A selected animation block shows its clip as selected.
  const selectedClipIds = useMemo(() => highlightedClipIds(selection), [selection]);
  // The clips locked in the preview (previewLock.ts): drawn, and left alone. The pointer reaches
  // the others only, and a locked clip that is selected (from the timeline) has no handles.
  const lockedIds = useMemo(() => previewLockedIds(project), [project]);
  const hittable = useMemo(() => reachable(drawables, lockedIds), [drawables, lockedIds]);
  const lockedDrawables = useMemo(
    () => (lockedIds.size === 0 ? NO_DRAWABLES : drawables.filter((d) => lockedIds.has(d.clipId))),
    [drawables, lockedIds],
  );
  // …and are painted faded, so that they are told from the others (a preference says how much).
  const lockedOpacity = usePreferences((state) => state.lockedOpacity);
  const painted = useMemo(
    () => fadeLocked(drawables, lockedIds, lockedOpacity),
    [drawables, lockedIds, lockedOpacity],
  );
  const activeClipIds = useMemo(
    () => selectedClipIds.filter((id) => !lockedIds.has(id)),
    [selectedClipIds, lockedIds],
  );
  // The pick store follows selection and canonical snapshot changes before this render.
  const pickedDrawables = useMemo(
    () => (pick ? drawables.filter((d) => pickable(d) && pickHas(pick, d.clipId, d.glyph)) : []),
    [pick, drawables],
  );
  // What the end of a line would go on — under the pointer, or waiting for its point (D140).
  const lineAim = useLineDraw((state) => state.pending?.target ?? state.aim);
  const aimed = useMemo(
    () =>
      lineAim
        ? drawables.filter(
            (d) =>
              d.clipId === lineAim.clipId &&
              d.glyph >= 0 &&
              (lineAim.glyphs === 'all' || lineAim.glyphs.includes(d.glyph)),
          )
        : [],
    [lineAim, drawables],
  );
  const relatedClipIds = useMemo(() => {
    const formulas = new Set(selectedFormulaIds(selection));
    return project.clips.filter((c) => formulas.has(c.formulaId)).map((c) => c.id);
  }, [selection, project.clips]);
  // A selected appear, disappear or part block outlines the glyphs it animates (as they are
  // drawn now) in its timeline colour; a keyframe of the whole formula has the clip's box.
  const lifetimes = useMemo(() => clipLifetimes(project), [project]);
  const blockOutline = useMemo(() => {
    const block = selectedBlock(selection, project.clips);
    if (!block) return null;
    const { clip, action } = block;
    if (action.kind === 'tween') {
      // A Transform that carries its shape elsewhere outlines what it goes to, as it is now.
      if (!action.fit) return null;
      const targets = attachTargets(action.fit);
      return {
        category: 'transform' as const,
        drawables: drawables.filter(
          (d) =>
            d.role === 'object' &&
            targets.some(
              (t) => t.clipId === d.clipId && (t.glyphs === 'all' || t.glyphs.includes(d.glyph)),
            ),
        ),
      };
    }
    const glyphs = new Set(
      action.kind === 'transform'
        ? action.glyphs
        : (lifetimes.get(clip.id)?.actions.get(action.id)?.glyphs ?? []),
    );
    return {
      category: action.kind,
      drawables: drawables.filter((d) => d.clipId === clip.id && glyphs.has(d.glyph)),
    };
  }, [selection, project.clips, lifetimes, drawables]);

  // --- Transform handles: the oriented box of the single selected clip, when it can be edited
  // (visible now, on an unlocked track). They show while Shift is held and during a drag.
  const unit = size.dpr / pixelsPerUnit(camera, surface); // scene units per CSS pixel
  const transformClipId = activeClipIds.length === 1 ? (activeClipIds[0] ?? null) : null;
  // With several clips selected the handles frame the group: the selected clips on screen, in an
  // upright box around all of them, scaled or turned as one about its centre.
  const groupIds = useMemo(
    () => (activeClipIds.length > 1 ? activeClipIds.filter((id) => fullBoxes.has(id)) : []),
    [activeClipIds, fullBoxes],
  );
  // The part transform under edit (its end icon), whose glyphs the handles frame instead.
  const partEdit = useMemo(() => {
    const clip = transformClipId ? project.clips.find((c) => c.id === transformClipId) : undefined;
    return clip ? partEditOf(clip, editing) : null;
  }, [transformClipId, project.clips, editing]);
  const handleBox = useMemo(() => {
    if (groupIds.length > 0) {
      const union = groupBox(fullBoxes, groupIds);
      return union ? groupOrientedBox(union) : null;
    }
    if (!transformClipId || !boxes.has(transformClipId)) return null;
    const clip = project.clips.find((c) => c.id === transformClipId);
    const track = clip && project.tracks.find((t) => t.id === clip.trackId);
    const render = clip && resolved.get(clip.formulaId)?.render;
    if (!clip || !track || track.locked || !render) return null;
    // A line has no size or turn of its own: its two ends are its handles (`LineLayer.tsx`).
    if (project.formulas.find((f) => f.id === clip.formulaId)?.kind === 'line') return null;
    const placement = placementAt(clip, time, meta.target);
    if (partEdit) {
      // The box of the part's glyphs as drawn now (the end state), turned with them when they all
      // turned alike (else upright).
      const glyphs = new Set(partEdit.glyphs);
      const drawn = drawables.filter((d) => d.clipId === clip.id && glyphs.has(d.glyph));
      if (drawn.length === 0) return null;
      const turn = partTurn(clip, partEdit, [...new Set(drawn.map((d) => d.glyph))]);
      return turnedBox(
        drawn.flatMap((d) => d.path.contours),
        turn === null ? 0 : placement.rotation + turn,
      );
    }
    return orientedBox(render.bbox, placement);
  }, [
    groupIds,
    fullBoxes,
    transformClipId,
    boxes,
    project.clips,
    project.tracks,
    project.formulas,
    resolved,
    time,
    meta.target,
    partEdit,
    drawables,
  ]);
  const geometry = useMemo(
    () => (handleBox ? handleGeometry(handleBox, unit) : null),
    [handleBox, unit],
  );
  const editingHere = editing !== null && editing.clipId === transformClipId;
  const loneLine = useMemo(() => {
    const clip = transformClipId ? project.clips.find((c) => c.id === transformClipId) : undefined;
    return project.formulas.find((f) => f.id === clip?.formulaId)?.kind === 'line';
  }, [transformClipId, project.clips, project.formulas]);
  // A clip locked after its transformations cannot be edited here past the first one.
  const unlocked = useTransformEdit((s) => s.unlocked);
  const transformBlocked = useMemo(() => {
    if (groupIds.length > 0) {
      // A group needs one member at least that can be edited now.
      return !previewEditableClips(project, groupIds).some(
        (clip) =>
          !partEditOf(clip, editing) && !('blocked' in previewEdit(clip, time, editing, unlocked)),
      );
    }
    if (partEdit) return false;
    const clip = transformClipId ? project.clips.find((c) => c.id === transformClipId) : undefined;
    return !!clip && 'blocked' in previewEdit(clip, time, editing, unlocked);
  }, [groupIds, partEdit, transformClipId, project, time, editing, unlocked]);
  // The gestures (usePreviewGestures.ts): what they hit and edit goes in, their state comes out.
  const gestures = usePreviewGestures({
    canvasRef,
    frameRef,
    renderer,
    camera,
    surface,
    setView,
    project,
    resolved,
    reach,
    drawables: hittable,
    frame: sceneFrame,
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
  });
  const {
    hover,
    altHeld,
    transforming,
    axisLock,
    hoveredHandle,
    handlesVisible,
    handleStyle,
    readout,
    guides,
    marquee,
    glyphMarquee,
    haloAt,
    keyGlyph,
    menu,
  } = gestures;
  // The camera's rectangles answer the pointer first (`useCameraGestures.ts`), in the world view
  // and while no mode of the preview has the canvas.
  const cameraGestures = useCameraGestures({
    canvasRef,
    camera,
    surface,
    dpr: size.dpr,
    unit,
    model: reach === 'camera' ? cameraScene : null,
    selected: selectedPiece,
    isolated,
    locked: sceneCamera?.locked === true,
    objects: cameraSnapObjects,
    snapObjects,
    grid: grid ? { step: gridStep, anchor: gridAnchor } : null,
  });
  // What is said of the selected rectangle of the camera, while the camera's rectangles answer
  // the pointer.
  const cameraHintText =
    cameraScene && selectedPiece && reach === 'camera'
      ? cameraHint(cameraScene, selectedPiece, {
          locked: sceneCamera?.locked === true,
          axis: cameraGestures.axis,
          isolated: isolated !== null,
        })
      : null;
  // The keyboard's cursor glyph of align by symbol: outlined like a hovered glyph, with the halo.
  const keyCentre = keyGlyph ? glyphCentre(keyGlyph) : null;
  // While a line is drawn or shaped, or a path edited, a right-click on the scene opens the
  // preview's menu as with no mode on: an entry chosen there ends that mode before it acts — Edit
  // curve keeping its curve, Edit path its path —, and the menu closed with Escape or a press
  // elsewhere leaves it on.
  const menuOpen = menu !== null || gestures.spaceMenu !== null || cameraGestures.menu !== null;
  useEffect(() => {
    if (!menuOpen) return;
    return onMenuChoice(() => {
      if (usePathEdit.getState().target) usePathEdit.getState().close();
      useLineCurveEdit.getState().close();
      const draw = useLineDraw.getState();
      if (draw.request !== null || draw.pending !== null) draw.cancel();
    });
  }, [menuOpen]);
  // Edit path: its own pointer handling takes the canvas while the mode is on (`usePathGestures`);
  // what it leaves (panning) goes to the ordinary gestures.
  const pickGhost = useCallback(
    (point: Vec2) => (pathGhost ? renderer.pick(pathGhost, point) : null),
    [pathGhost],
  );
  const pathGestures = usePathGestures({
    canvasRef,
    camera,
    surface,
    unit,
    target: pathTarget,
    frame: pathFrame,
    pickGhost,
  });
  // The pair's other routes (D167), each laid on its own chord.
  const pathRoutes = useMemo(
    () =>
      (pathFrame?.routes ?? []).flatMap((r) => {
        if (!r.matrix || sameRoute(r.route, pathFrame!.route)) return [];
        const curve = samplePath(r.spline, r.matrix);
        return [
          {
            route: r.route,
            curve,
            own: r.own,
            mark: routeMark(curve),
            hot: sameRoute(r.route, pathGestures.hoverRoute),
          },
        ];
      }),
    [pathFrame, pathGestures.hoverRoute],
  );
  const pathOverlay = useMemo(() => {
    if (!pathFrame || (!pathFrame.matrix && pathRoutes.length === 0)) return null;
    const { spline, matrix, from, to } = pathFrame;
    return {
      chord: matrix ? ([from, to] as [Vec2, Vec2]) : null,
      curve: matrix ? samplePath(spline, matrix) : [],
      nodes: matrix ? nodesInScene(spline, matrix) : [],
      selected: pathSelected,
      hover: pathGestures.hover,
      routes: pathRoutes,
    };
  }, [pathFrame, pathRoutes, pathSelected, pathGestures.hover]);
  // The nodes on screen (CSS px from the canvas corner): for tests and tooling; and the pair's
  // routes, each with its ends and the point of its curve its mark is on.
  const css = useCallback(
    (p: Vec2) => {
      const [x, y] = toPixel(p, camera, surface);
      return [Math.round((x / size.dpr) * 10) / 10, Math.round((y / size.dpr) * 10) / 10];
    },
    [camera, surface, size.dpr],
  );
  const pathNodes = useMemo(() => {
    if (!pathOverlay) return '';
    return JSON.stringify(
      pathOverlay.nodes.map((n) => ({
        at: css(n.at),
        in: n.in && css(n.in),
        out: n.out && css(n.out),
        smooth: n.smooth,
      })),
    );
  }, [pathOverlay, css]);
  const pathRouteList = useMemo(() => {
    if (!pathFrame || pathFrame.routes.length === 0) return '';
    return JSON.stringify(
      pathFrame.routes.map((r) => {
        const curve = r.matrix ? samplePath(r.spline, r.matrix) : [r.from];
        return {
          route: `${r.route.from}>${r.route.to}`,
          own: r.own,
          from: css(r.from),
          to: css(r.to),
          mark: css(routeMark(curve)),
        };
      }),
    );
  }, [pathFrame, css]);
  // Where the camera's rectangles are on screen (CSS px from the canvas corner: left, top,
  // width, height), and whose frame the current camera rests in: for tests and tooling.
  const cameraRects = useMemo(
    () => (cameraScene ? describeCameraRects(cameraScene, camera, surface, size.dpr) : ''),
    [cameraScene, camera, surface, size.dpr],
  );
  // Where the handles are on screen (CSS px from the canvas corner): for tests and tooling.
  const handlePoints = useMemo(() => {
    if (!geometry || !handlesVisible) return '';
    const css = (p: Vec2) => {
      const [x, y] = toPixel(p, camera, surface);
      return [Math.round((x / size.dpr) * 10) / 10, Math.round((y / size.dpr) * 10) / 10];
    };
    return JSON.stringify({
      ...Object.fromEntries(CORNERS.map((id) => [id, css(geometry.corners[id])])),
      rotate: css(geometry.rotate),
      center: css(geometry.center),
    });
  }, [geometry, handlesVisible, camera, surface, size.dpr]);

  // --- Paint.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== surface.width) canvas.width = surface.width;
    if (canvas.height !== surface.height) canvas.height = surface.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // no 2D context (jsdom)
    const ghosts = [...(ghost ?? pathGhost ?? []), ...(heldGhost ?? [])];
    renderer.draw(ctx, ghosts.length > 0 ? [...ghosts, ...painted] : painted, camera, surface, {
      background: meta.background,
      outside: cssVar(canvas, '--bg', '#07121a'),
      // The world around the scene's camera: the background everywhere, nothing cut.
      ...(world ? { unclipped: true } : {}),
      // The grid, under the formulas and never in an export.
      ...(grid
        ? {
            underlay: (c: Parameters<typeof drawGrid>[0]) =>
              // In a scene with a camera the grid is the world's: wherever the view looks.
              drawGrid(
                c,
                camera,
                surface,
                sceneCamera ? canvasBox(camera, surface) : frameBox(meta),
                gridStep,
              ),
          }
        : {}),
    });
    const pick = (ids: readonly ClipId[]) =>
      ids.flatMap((id) => {
        const entry = boxes.get(id);
        return entry ? [entry.box] : [];
      });
    drawOverlay(
      ctx,
      camera,
      surface,
      {
        hover: hover ?? keyGlyph,
        // The oriented box replaces the plain selection box of the clip being transformed.
        // A lone line is marked by the handles at its ends, not by the box around it — where the
        // objects answer the pointer: elsewhere its ends are not shown, and it has the box.
        selected: pick(handlesVisible || (loneLine && reach === 'objects') ? [] : selectedClipIds),
        related: pick(relatedClipIds),
        transform:
          handlesVisible && geometry && !pathOverlay
            ? { geometry, active: transforming ?? hoveredHandle }
            : null,
        path: pathOverlay,
        block: blockOutline && {
          drawables: blockOutline.drawables,
          color: cssVar(canvas, `--block-${blockOutline.category}`, '#b79cff'),
        },
        // What the end of a line would go on is marked as picked glyphs are.
        picked: aimed.length > 0 ? [...pickedDrawables, ...aimed] : pickedDrawables,
        guides: cameraGestures.guides.length > 0 ? cameraGestures.guides : guides,
        marquee,
        glyphMarquee,
        marked,
        framed: orderMarked,
        halo:
          symbolPhase && symbolPhase.step !== 'direction' && (haloAt ?? keyCentre)
            ? { center: (haloAt ?? keyCentre)!, radius: symbolRadius * unit }
            : circleSelect && !symbolPhase && !pathTarget && haloAt
              ? { center: haloAt, radius: symbolRadius * unit, selector: true }
              : null,
        guideWidth: GUIDE_WIDTHS[guideWidth],
        colors: {
          accent: cssVar(canvas, '--accent', '#43eeca'),
          frame: cssVar(canvas, '--text-dim', '#acc3cb'),
          handleFill: cssVar(canvas, '--panel', '#10212c'),
          guide: guideColor,
          pick: pickColor,
        },
      },
      size.dpr,
    );
    // The scene's camera over the world: its frame now, the target cameras, the route.
    if (cameraScene) {
      drawCameraLayer(ctx, camera, surface, cameraScene, {
        dpr: size.dpr,
        veil: cameraVeil,
        route: cameraRoute,
        selected: selectedPiece,
        hover: cameraGestures.hover,
        isolated: isolated?.piece ?? null,
      });
    }
    // themeTick: repaint after a theme switch (colours come from CSS variables).
  }, [
    painted,
    world,
    sceneCamera,
    cameraScene,
    cameraVeil,
    cameraRoute,
    selectedPiece,
    isolated,
    cameraGestures.hover,
    cameraGestures.guides,
    keyGlyph,
    keyCentre,
    ghost,
    pathGhost,
    heldGhost,
    pathOverlay,
    camera,
    surface,
    meta,
    hover,
    boxes,
    selectedClipIds,
    relatedClipIds,
    handlesVisible,
    loneLine,
    geometry,
    transforming,
    hoveredHandle,
    reach,
    blockOutline,
    pickedDrawables,
    aimed,
    guides,
    marquee,
    glyphMarquee,
    marked,
    orderPhase,
    orderMarked,
    haloAt,
    symbolPhase,
    symbolRadius,
    circleSelect,
    pathTarget,
    unit,
    guideColor,
    guideWidth,
    pickColor,
    grid,
    gridStep,
    size.dpr,
    themeTick,
  ]);

  // What holds the multicamera on, when something does: its button then turns nothing off.
  const held = sceneCamera ? turnOffBlocker(sceneCamera) : null;

  /** The point of the scene under a point of the window, or null without a canvas. */
  const sceneAtClient = (clientX: number, clientY: number): Vec2 | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return toScene(
      [
        ((clientX - rect.left) * surface.width) / Math.max(1, rect.width),
        ((clientY - rect.top) * surface.height) / Math.max(1, rect.height),
      ],
      camera,
      surface,
    );
  };

  const zoomBy = (factor: number) =>
    setView((current) => {
      const next = zoomAbout(
        { ...camera, ...current },
        surface,
        [surface.width / 2, surface.height / 2],
        factor,
      );
      return { center: next.center, zoom: next.zoom };
    });

  return (
    <div className="preview-stage" ref={stageRef}>
      <div
        className="preview-frame"
        data-testid="preview-frame"
        data-drawable-count={drawables.length}
        data-ghost-count={((ghost ?? pathGhost)?.length ?? 0) + (heldGhost?.length ?? 0)}
        data-path-edit={pathTarget ? `${transferKey(pathTarget.origin)}:${pathTarget.index}` : ''}
        data-path-route={pathTarget && pathRoute ? `${pathRoute.from}>${pathRoute.to}` : ''}
        data-path-per-glyph={pathTarget ? String(pathPerGlyph) : ''}
        data-path-lock-others={pathTarget ? String(pathLockOthers) : ''}
        data-path-routes={pathRouteList}
        data-path-nodes={pathNodes}
        data-path-selected={pathSelected ? `${pathSelected.node}:${pathSelected.part}` : ''}
        data-block-outline-count={blockOutline?.drawables.length ?? 0}
        data-glyph-pick={pickKey(pick)}
        data-world={world ? 'true' : undefined}
        data-pointer-reach={reach}
        data-objects-key={objectsKey ? 'true' : undefined}
        data-camera-view={lens ? 'true' : undefined}
        data-camera-scene={cameraRects}
        data-camera-hover={
          cameraGestures.hover
            ? `${cameraGestures.hover.piece.kind}:${cameraGestures.hover.part}`
            : ''
        }
        data-camera-axis={cameraGestures.axis ?? ''}
        data-camera-isolated={isolated ? isolated.move : ''}
        data-zoom={view.zoom.toFixed(3)}
        data-center={view.center.map((v) => v.toFixed(3)).join(',')}
        data-hover={(hover ?? keyGlyph)?.key ?? ''}
        data-transform-handles={handlePoints}
        data-transform-active={transforming ?? ''}
        data-axis-lock={axisLock ?? ''}
        data-handle-hover={hoveredHandle ?? ''}
        data-snap-guides={guides
          .map((g) =>
            g.kind === 'span'
              ? `${g.axis}=${(g.spans[0]!.to - g.spans[0]!.from).toFixed(4)}`
              : `${g.axis}@${g.at.toFixed(4)}`,
          )
          .join(' ')}
        data-grid={grid ? formatGridStep(gridStep) : ''}
        data-symbol-align={symbolPhase?.step ?? ''}
        data-colour-order={orderPhase?.step ?? ''}
        data-retarget={retarget?.clipId ?? ''}
        data-line-draw={drawingLine ?? ''}
        data-line-curve={curveClipId ?? ''}
        data-colour-order-marked={orderMarked.length}
        data-selector={circleSelect ? 'circle' : 'pointer'}
        data-symbol-held={symbolHeld ? symbolHeld.at : ''}
        data-symbol-cursor={keyGlyph?.key ?? ''}
        data-marquee={
          marquee
            ? [marquee.minX, marquee.minY, marquee.maxX, marquee.maxY]
                .map((v) => v.toFixed(4))
                .join(',')
            : ''
        }
        ref={frameRef}
        style={{
          left: frameRect.left,
          top: frameRect.top,
          width: frameRect.width,
          height: frameRect.height,
          background: meta.background,
        }}
        // A click on the scene gives the frame the focus (never Tab: it is no stop of the page),
        // and with it the arrow keys, which move the selected objects (`nudge.ts`) — not those
        // with Ctrl/⌘ or Alt, not on a control inside the frame, and not when nothing selected is
        // on screen: ←/→ then step the playhead, as anywhere else.
        tabIndex={-1}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setKeysHere(true);
        }}
        onBlur={(event) => {
          if (event.target === event.currentTarget) setKeysHere(false);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || event.defaultPrevented) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const travel = nudgeTravel(event.key, event.shiftKey);
          if (!travel) return;
          // A selected rectangle of the camera takes the arrows as a selected object does.
          const kept = cameraScene && selectedPiece && frameOfPiece(cameraScene, selectedPiece);
          if (kept ? nudgeCameraFrame(kept.owner, travel) : nudgeSelection(travel)) {
            event.preventDefault();
          }
        }}
      >
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          data-testid="preview-canvas"
          style={{
            cursor: pathTarget
              ? pathGestures.dragging
                ? 'grabbing'
                : pathGestures.hover
                  ? 'grab'
                  : pathGestures.hoverRoute
                    ? 'pointer'
                    : 'default'
              : symbolPhase
                ? 'crosshair'
                : orderPhase
                  ? altHeld
                    ? 'grab'
                    : 'crosshair'
                  : (cameraGestures.cursor ?? handleStyle),
          }}
          onPointerDown={(e) => {
            if (pathTarget && pathGestures.onPointerDown(e)) return;
            // The camera's rectangles first; Alt is the glyphs' and the view's.
            if (!e.altKey && cameraGestures.onPointerDown(e)) return;
            gestures.onPointerDown(e);
          }}
          onPointerMove={(e) => {
            if (pathTarget && pathGestures.onPointerMove(e) && !gestures.gestureActive()) return;
            if (!gestures.gestureActive() && cameraGestures.onPointerMove(e)) return;
            gestures.onPointerMove(e);
          }}
          onPointerUp={(e) => {
            pathGestures.onPointerUp(e);
            gestures.onPointerUp(e);
          }}
          onPointerCancel={(e) => {
            pathGestures.onPointerUp(e);
            gestures.onPointerUp(e);
          }}
          onPointerLeave={() => {
            cameraGestures.onPointerLeave();
            gestures.onPointerLeave();
          }}
          onDoubleClick={(e) => {
            if (pathTarget) {
              pathGestures.onDoubleClick(e);
              return;
            }
            if (symbolPhase || orderPhase || reach !== 'objects') return;
            const rect = e.currentTarget.getBoundingClientRect();
            const point = toScene(
              [
                ((e.clientX - rect.left) * surface.width) / Math.max(1, rect.width),
                ((e.clientY - rect.top) * surface.height) / Math.max(1, rect.height),
              ],
              camera,
              surface,
            );
            const hit = pickClip(renderer, hittable, point);
            const clip = hit && project.clips.find((item) => item.id === hit.clipId);
            if (
              clip &&
              isCompositionFormula(project.formulas.find((item) => item.id === clip.formulaId))
            )
              openFormulaEditor(clip.formulaId, false, clip.id);
          }}
          onContextMenu={(e) => {
            // A rectangle of the camera has a menu of its own.
            if (!cameraGestures.onContextMenu(e)) gestures.onContextMenu(e);
          }}
        />
        <LineLayer
          canvasRef={canvasRef}
          renderer={renderer}
          camera={camera}
          surface={surface}
          dpr={size.dpr}
          frame={frameRect}
          project={project}
          resolved={resolved}
          drawables={hittable}
          time={time}
          selected={activeClipIds}
          altHeld={altHeld}
          // Nor does a selected line show its ends while the objects are left alone.
          busy={
            pathTarget !== null ||
            symbolPhase !== null ||
            retarget !== null ||
            orderPhase !== null ||
            reach !== 'objects'
          }
          onMenu={gestures.onContextMenu}
          onPan={gestures.panFrom}
        />
        {pathTarget && (
          <>
            <div className="preview-hint" data-testid="preview-hint">
              {keysText(pathEditHint(pathFrame))}
            </div>
            <button
              type="button"
              className="btn btn-small btn-primary preview-path-done"
              data-testid="path-edit-done"
              onClick={() => usePathEdit.getState().close()}
            >
              Done
            </button>
            <PathRouteBar target={pathTarget} />
          </>
        )}
        {!pathTarget && symbolHint && (
          <div className="preview-hint" data-testid="preview-hint">
            {keysText(symbolHint)}
          </div>
        )}
        {!pathTarget && !symbolPhase && retarget && (
          <>
            <div className="preview-hint" data-testid="retarget-hint">
              {retargetHint(
                project.formulas.find(
                  (f) => f.id === project.clips.find((c) => c.id === retarget.clipId)?.formulaId,
                )?.name ?? 'the shape',
                retargetChosen,
                retarget.actionId !== undefined,
              )}
            </div>
            <button
              type="button"
              className="btn btn-small btn-primary preview-path-done preview-retarget-done"
              data-testid="retarget-confirm"
              title={keysText('Make the Transform to what is chosen, at the playhead (Enter)')}
              onClick={() => confirmRetarget()}
            >
              Transform here
            </button>
          </>
        )}
        {orderHint && (
          <div className="preview-hint" data-testid="colour-order-hint">
            {keysText(orderHint)}
          </div>
        )}
        {axisLock && (
          <div className="preview-hint" data-testid="preview-axis-hint">
            {axisLock === 'x' ? 'Moving horizontally only' : 'Moving vertically only'}{' '}
            {keysText('(Alt) · let Alt go to move freely · Ctrl/⌘ too: no snapping')}
          </div>
        )}
        {!pathTarget &&
          !symbolPhase &&
          !retarget &&
          !orderPhase &&
          !lineMode &&
          !axisLock &&
          handlesVisible &&
          !transforming && (
            <div className="preview-hint" data-testid="preview-hint">
              {editingHere
                ? `End state of the ${partEdit ? 'part' : 'tween'}: drag to move · a corner to scale · the circle to rotate · Esc to finish`
                : groupIds.length > 0
                  ? `Drag a corner to scale the group · the circle to turn it · steps of ${scaleStepText} and 15°, ${keysText('Ctrl/⌘ frees them')}`
                  : `Drag a corner to scale · the circle to rotate · steps of ${scaleStepText} and 15°, ${keysText('Ctrl/⌘ frees them')}`}
            </div>
          )}
        {!pathTarget &&
          !symbolPhase &&
          !retarget &&
          !orderPhase &&
          !lineMode &&
          !axisLock &&
          !handlesVisible &&
          reach === 'objects' &&
          (pick || altHeld) && (
            <div className="preview-hint" data-testid="preview-glyph-hint">
              {pick
                ? `${describePick(project, pick)} · ${keysText('Alt+click adds or removes a glyph, Alt+Shift+click a range, Alt+drag a rectangle')} · Esc clears`
                : keysText(
                    'Alt+click a glyph to select it, of one formula or of several · Alt+drag from a formula selects the glyphs inside · on empty space it pans',
                  )}
            </div>
          )}
        {!pathTarget &&
          !symbolPhase &&
          !retarget &&
          !orderPhase &&
          !lineMode &&
          !axisLock &&
          !pick &&
          !altHeld &&
          reach === 'objects' &&
          handleBox &&
          !transformBlocked &&
          !handlesVisible && (
            <div className="preview-hint" data-testid="preview-handles-hint">
              {keysText(
                'Hold Shift for the transform handles (scale, rotate) · the handles button keeps them on',
              )}
              {keysHere &&
                keysText(
                  ` · the arrows move ${groupIds.length > 0 ? 'them' : 'it'} 0.01 (Shift: 0.1)`,
                )}
            </div>
          )}
        {cameraHintText && !pick && !altHeld && (
          <div className="preview-hint" data-testid="preview-camera-hint">
            {keysText(cameraHintText)}
          </div>
        )}
        {/* A move is isolated: the way back, in the corner the modes have their own button in. */}
        {isolated && !modeOn && (
          <button
            type="button"
            className="btn btn-small btn-primary preview-path-done preview-isolation-done"
            data-testid="preview-isolation-done"
            title={STOP_ISOLATING_TITLE}
            onClick={() => stopIsolating()}
          >
            Stop isolating
          </button>
        )}
        {/* F held in the world view: whose the pointer is now, while nothing else is said. */}
        {objectsKey &&
          reach === 'objects' &&
          !modeOn &&
          !axisLock &&
          !handlesVisible &&
          !pick &&
          !altHeld &&
          !(handleBox && !transformBlocked) && (
            <div className="preview-hint" data-testid="preview-objects-key-hint">
              {OBJECTS_KEY_HINT}
            </div>
          )}
        {/* With no rectangle selected: whose the pointer is in the world view. */}
        {reach === 'camera' && !cameraHintText && !pick && !altHeld && (
          <div className="preview-hint" data-testid="preview-world-hint">
            {WORLD_HINT}
          </div>
        )}
        {readout && (
          <div
            className="preview-readout"
            data-testid="preview-readout"
            style={{ left: readout.x, top: readout.y }}
          >
            {readout.text}
          </div>
        )}
        {symbolPhase?.step === 'direction' && (
          <SymbolCompass
            x={symbolPhase.at.x}
            y={symbolPhase.at.y}
            width={frameRect.width}
            height={frameRect.height}
            reference={symbolPhase.reference.label}
            target={symbolPhase.target.label}
            onPick={(direction) => useSymbolAlign.getState().apply(direction)}
            onCancel={cancelSymbolAlign}
          />
        )}
        {selectedClipIds.length >= 2 && !pathTarget && !pick && (
          <PreviewActions count={selectedClipIds.length} />
        )}
        {pick && !pathTarget && <GlyphPickBar pick={pick} />}
        {toolsSlot &&
          createPortal(
            <div
              className="preview-tools"
              role="toolbar"
              aria-label="View"
              data-testid="preview-tools"
            >
              <button
                type="button"
                className={`preview-tool${symbolPhase ? ' is-on' : ''}`}
                aria-label="Align by symbol"
                aria-pressed={symbolPhase !== null}
                title={`Align by symbol (${keyHint('Alt+G')}): click the symbol to move, then the reference symbol. G after the first click keeps that symbol, for a reference at another time. ${keyHint('Shift+Alt+G')} takes the reference from a formula locked in the preview.`}
                data-testid="preview-align-symbol"
                onClick={() => useSymbolAlign.getState().toggle()}
              >
                <Icon name="align-symbol" />
              </button>
              <button
                type="button"
                className={`preview-tool${circleSelect ? ' is-on' : ''}`}
                aria-label="Circle selector"
                aria-pressed={circleSelect}
                title={keysText(
                  'Circle selector (S): a click takes the symbol nearest to the pointer within the circle — its formula, or with Alt the symbol itself. Shift+wheel sets the reach.',
                )}
                data-testid="preview-circle-select"
                onClick={() => usePreferences.getState().set({ circleSelect: !circleSelect })}
              >
                <Icon name="circle-select" />
              </button>
              <button
                type="button"
                className={`preview-tool${keepHandles ? ' is-on' : ''}`}
                aria-label="Keep the transform handles shown"
                aria-pressed={keepHandles}
                title={keysText(
                  'Keep the transform handles on the selected clips (else hold Shift to see them)',
                )}
                data-testid="preview-handles"
                onClick={() => usePreferences.getState().set({ keepHandles: !keepHandles })}
              >
                <Icon name="handles" />
              </button>
              <button
                type="button"
                className={`preview-tool${snapObjects ? ' is-on' : ''}`}
                aria-label="Snap to objects"
                aria-pressed={snapObjects}
                title={keysText(
                  'Snap a dragged formula to the edges and centres of the others and of the frame (hold Ctrl/⌘ to suspend)',
                )}
                data-testid="preview-snap"
                onClick={() => usePreferences.getState().set({ snapObjects: !snapObjects })}
              >
                <Icon name="magnet" />
              </button>
              <button
                type="button"
                className={`preview-tool${sceneCamera ? ' is-on' : ''}${held ? ' is-held' : ''}`}
                aria-label="Multicamera"
                aria-pressed={sceneCamera !== undefined}
                // Not disabled while a target camera or a move holds it on: the button says why,
                // in its tooltip and in the notice a press gives (`toggleMulticamera`).
                aria-disabled={held !== null || undefined}
                title={
                  held ??
                  `Multicamera (${keyHint('Alt+M')}): the scene's camera — the frame the video is filmed through, its moves and its target cameras — over the whole scene`
                }
                data-testid="preview-multicamera"
                onClick={() => toggleMulticamera()}
              >
                <Icon name="camera" />
              </button>
              {sceneCamera && (
                <button
                  type="button"
                  className={`preview-tool${lens ? ' is-on' : ''}`}
                  aria-label="Camera view"
                  aria-pressed={lens}
                  title="Camera view (V): look through the camera at the playhead, as the video does — its rectangles and the world around it are left out"
                  data-testid="preview-camera-view"
                  onClick={() => toggleCameraView()}
                >
                  <Icon name="camera-view" />
                </button>
              )}
              <span className="preview-tools-sep" aria-hidden="true" />
              <button
                type="button"
                className="preview-tool"
                aria-label="Zoom out"
                title={`Zoom out (${keyHint('Mod + wheel')})`}
                data-testid="preview-zoom-out"
                onClick={() => zoomBy(1 / ZOOM_STEP)}
              >
                <Icon name="minus" />
              </button>
              <span className="preview-zoom" data-testid="preview-zoom-label">
                {Math.round(view.zoom * 100)}%
              </span>
              <button
                type="button"
                className="preview-tool"
                aria-label="Zoom in"
                title={`Zoom in (${keyHint('Mod + wheel')})`}
                data-testid="preview-zoom-in"
                onClick={() => zoomBy(ZOOM_STEP)}
              >
                <Icon name="plus" />
              </button>
              <button
                type="button"
                className="preview-tool preview-tool-fit"
                title={`${
                  worldFit
                    ? 'Show everything of the camera: Manim’s frame, the camera and its target cameras'
                    : 'Show the whole frame'
                } (pan with ${isMac() ? 'a scroll, the ' : ''}middle button or ${keyHint('Alt + drag')})`}
                data-testid="preview-fit"
                disabled={worldFit ? nearView(view, worldFit) : isFitView(keptOfView)}
                onClick={() => (worldFit ? setView(worldFit) : usePreviewView.getState().fit(lens))}
              >
                Fit
              </button>
            </div>,
            toolsSlot,
          )}
        {menu &&
          (menu.pick && pick ? (
            <GlyphPickMenu x={menu.x} y={menu.y} pick={pick} onClose={gestures.closeMenu} />
          ) : (
            <PreviewMenu x={menu.x} y={menu.y} clipId={menu.clipId} onClose={gestures.closeMenu} />
          ))}
        {gestures.spaceMenu && (
          <ContextMenu
            x={gestures.spaceMenu.x}
            y={gestures.spaceMenu.y}
            label="Scene actions"
            testId="preview-space-menu"
            onClose={gestures.closeSpaceMenu}
          >
            <div className="ctx-header">Add line</div>
            <LineMenuItems
              flat
              testIdPrefix="preview-space-line"
              onChoose={(line) => {
                gestures.closeSpaceMenu();
                startLineDraw(line);
              }}
            />
            {cameraNow && (
              <>
                <hr className="ctx-sep" />
                <div className="ctx-header">Camera</div>
                <CameraAddItems
                  testIdPrefix="preview-space-camera"
                  // A target camera centred where the click was, as large as the camera is now.
                  frameAt={() => {
                    const at = gestures.spaceMenu;
                    const point = at && sceneAtClient(at.x, at.y);
                    return point ? { center: point, height: cameraNow.height } : null;
                  }}
                  onClose={gestures.closeSpaceMenu}
                />
              </>
            )}
            <StopIsolatingItem
              testId="preview-space-stop-isolating"
              onClose={gestures.closeSpaceMenu}
            />
          </ContextMenu>
        )}
        {cameraGestures.menu && (
          <CameraPieceMenu
            x={cameraGestures.menu.x}
            y={cameraGestures.menu.y}
            piece={cameraGestures.menu.piece}
            onClose={cameraGestures.closeMenu}
          />
        )}
      </div>
    </div>
  );
}
