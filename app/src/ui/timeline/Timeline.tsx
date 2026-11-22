/* The timeline: the ruler with the playhead, the Camera row while the multicamera is on
 * (CameraRow.tsx), one row per track with its clips, blocks, relations and link ports, the drop
 * target for formulas from the Creator, and the menus of clips and blocks. Its gestures, keys,
 * zoom and drops live in the hooks next to it. */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import {
  BRACE_SIDE_DEGREES,
  type AudioClip,
  clipLifetimes,
  groupMembers,
  groupOf,
  runsWith,
  sceneDuration,
  type ActionId,
  type CameraMoveId,
  type Clip,
  type ClipAction,
  type ClipId,
  type RelationId,
  type SlideMarkId,
} from '../../model';
import { onProjectLoaded, useProjectStore, useUiStore } from '../../store';
import { openBlockDialog } from '../animations/blockDialogStore';
import { clipIsArrow, clipSubject } from '../animations/blockKinds';
import { startRetarget } from '../preview/shapeRetarget';
import { openFormulaEditor } from '../creator/formulaEditorStore';
import { pruneSelection } from '../selection';
import {
  addBlock,
  changeBlockAnimation,
  changeEmphasisEffect,
  confirmDeleteBlock,
  confirmDeleteGroup,
  duplicateBlock,
  duplicateBlockForOthers,
  duplicateGroup,
  groupBlocks,
  leaveGroup,
  splitBlockIntoRuns,
  reportRefused,
  ungroupBlocks,
} from '../animations/blockActions';
import {
  AddAnimationMenu,
  BlockMenu,
  GroupMenu,
  type BraceChoice,
  type ShapeMenuChoice,
} from '../animations/BlockMenus';
import { addTimeLabel, clipMenuTime, type AddTime } from '../animations/blockOps';
import { addBrace, addBraceLabel, isBraceClip } from '../animations/braceActions';
import { openBraceDialog, openShapeDialog } from '../animations/glyphsDialogStore';
import { ObjectMenuItems } from '../animations/ObjectMenuItems';
import { pickedGlyphsOf } from '../preview/glyphActions';
import { addShape, isShapeClip } from '../animations/shapeActions';
import { openMorphEditor } from '../morph/morphEditorStore';
import { openSplitDialog } from '../animations/splitDialogStore';
import { complementGlyphs } from '../animations/parallel';
import { isGlyphBlock, splitOptions } from '../animations/splitBlock';
import { startBlockGesture } from './blockGestures';
import { PhaseDragReadout } from './PhaseDragReadout';
import { startPhaseGesture } from './phaseGestures';
import { groupKey } from './blockGroups';
import { CameraLaneMenu, CameraMoveMenu } from './CameraMenus';
import { CameraRegionBands } from './CameraRegion';
import { CameraRow } from './CameraRow';
import { startCameraMoveGesture } from './cameraMoveGestures';
import { ClipBlock } from './ClipBlock';
import { ClipsMenu } from './ClipsMenu';
import { editableClips } from './clipOps';
import { TimingMenuItems } from './TimingMenuItems';
import { ClipTooltip } from './ClipTooltip';
import { createHoverTip } from './hoverTip';
import { hasTransforms, toggleTransformLock, useTransformEdit } from '../animations/transformEdit';
import { BlockDragReadout } from './BlockDragReadout';
import { BlockStateIcons } from './BlockStateIcons';
import { LinkBand } from './LinkBand';
import { PlayheadCap, PlayheadLine } from './Playhead';
import { RegionBand, RegionOnRuler } from './RegionMarks';
import {
  SlideMarksOnRuler,
  SlidePauseLines,
  SlideSkipsOnRuler,
  SlideZonesOnRuler,
} from './SlideMarks';
import { SlideMarkMenu, SlideRulerMenu } from './SlideMenus';
import { rulerSpot, type RulerSpot } from '../slides/slideOps';
import { SymbolHoldMark } from './SymbolHoldMark';
import { TimelineLinkPorts } from './TimelineLinkPorts';
import { RelationMenu } from './RelationMenu';
import { TimelineRelations } from './TimelineRelations';
import { TimelineToolbar } from './TimelineToolbar';
import { CLIP_INSET, LANE_HEIGHT, LINK_PORT_RADIUS, RULER_HEIGHT, SNAP_DISTANCE } from './layout';
import { majorTicks, rulerLabel, rulerScale, smallTicks, timelineExtent } from './ruler';
import { TrackHeader } from './TrackHeader';
import { RowZoomControls } from './RowZoomControls';
import { AUDIO_ROW_CHROME, type RowSizes } from './rowSizes';
import { tracksLayout } from './trackLayout';
import { startTimelinePan } from './timelinePan';
import { useTimelineStore } from './timelineStore';
import { useTimelineGestures } from './useTimelineGestures';
import { useTimelineKeyboard } from './useTimelineKeyboard';
import { clipDescription } from './keyboardNav';
import { relateBlocker } from '../relations/relationOps';
import { useAltHeld } from './useAltHeld';
import { useClipLinking } from './useClipLinking';
import { useVisibleSeconds } from './useVisibleSeconds';
import { useFormulaDrop } from './useFormulaDrop';
import { useRegionGestures } from './useRegionGestures';
import { useRegionKeys } from './useRegionKeys';
import { useTimelineKeys } from './useTimelineKeys';
import { useTimelineZoom } from './useTimelineZoom';
import { isAudioClip, timelineClips, type TimelineClip } from './timelineClips';
import { AudioClipBlock } from './AudioClipBlock';
import { AudioClipEditor } from './AudioClipEditor';
import { splitAtPlayhead } from './splitActions';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { duplicateAudio, fadeAudioClip, addAudioToTimeline } from './audioCommands';
import { deleteClipsAsking, setPreviewLock } from './clipActions';
import { AUDIO_MIME } from '../dnd';
import { along } from './axis';
import { useHeaderWidth } from './headerWidth';
import { TimelineScrollbars } from './TimelineScrollbars';
import { useFlyKey } from './useFlyKey';
import { isMainClick } from '../pointer';

/** The menu open on the timeline: adding an animation at a time of a clip (the region's, the
 * playhead's, or the one clicked: `clipMenuTime`), the menu of the selected clips when there are
 * several, a block's own, or the one of a folded group of blocks (through the member it stands
 * for). */
type Menu =
  | ({ kind: 'add'; x: number; y: number; clipId: ClipId } & AddTime)
  | { kind: 'clips'; x: number; y: number; clipIds: ClipId[] }
  | { kind: 'block'; x: number; y: number; clipId: ClipId; actionId: ActionId }
  | { kind: 'group'; x: number; y: number; clipId: ClipId; actionId: ActionId }
  | { kind: 'relation'; x: number; y: number; relationId: RelationId }
  /** A camera move's own, and the Camera row's lane at a time (CameraMenus.tsx). */
  | { kind: 'cameraMove'; x: number; y: number; moveId: CameraMoveId }
  | { kind: 'cameraLane'; x: number; y: number; time: number }
  /** The Slides mode's (SlideMenus.tsx): the ruler's at a time, and a mark's own. */
  | { kind: 'slideRuler'; x: number; y: number; spot: RulerSpot }
  | { kind: 'slideMark'; x: number; y: number; markId: SlideMarkId };

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const selection = useUiStore((s) => s.selection);
  const unlockedClips = useTransformEdit((s) => s.unlocked);
  const select = useUiStore((s) => s.select);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const vertical = useTimelineStore((s) => s.vertical);
  const header = useHeaderWidth();
  /** The vertical timeline's tracks do not all fit: their bar takes room under the well. */
  const [tracksBar, setTracksBar] = useState(false);
  /** A dt of one's own (D181): the small ticks of the ruler follow it; the labels, the zoom. */
  const ownDt = useTimelineStore((s) => s.ownDt);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** The scrolling element's id: the toolbar's slider is its scroll bar. */
  const scrollId = useId();
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [audioEditor, setAudioEditor] = useState<string | null>(null);
  const [audioMenu, setAudioMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /** The clips the menu of a sound acts on: the selected ones, as its Duplicate and its Delete. */
  const audioMenuClips = (id: string): readonly string[] => {
    const current = useUiStore.getState().selection;
    return current.kind === 'clips' ? current.ids : [id];
  };
  /** The audio clips whose volume line is edited on the clip itself (the button in their
   * caption); the others move from anywhere on them. A view state: no file keeps it. */
  const [volumeLines, setVolumeLines] = useState<ReadonlySet<string>>(() => new Set());
  const toggleVolumeLine = (clip: AudioClip) =>
    setVolumeLines((lines) => {
      const next = new Set(lines);
      if (!next.delete(clip.id)) next.add(clip.id);
      return next;
    });
  useEffect(
    () =>
      onProjectLoaded(() => {
        setAudioEditor(null);
        setAudioMenu(null);
        setVolumeLines(new Set());
      }),
    [],
  );
  const openAudioMenu = (clip: AudioClip, x: number, y: number) => {
    const current = useUiStore.getState().selection;
    if (current.kind !== 'clips' || !current.ids.includes(clip.id))
      select({ kind: 'clips', ids: [clip.id] });
    setAudioMenu({ id: clip.id, x, y });
  };

  const { timeAt, scrubTo, startScrub, startMove, startTrim, startMarquee, marquee } =
    useTimelineGestures({
      ruler: rulerRef,
      tracks: tracksRef,
    });
  const { shift, link, startLink, syncShift } = useClipLinking(tracksRef);
  // Alt held: only the edges of the clips, and of their intros and outros, answer the pointer
  // (useAltHeld).
  const { alt, syncAlt } = useAltHeld();
  const trimOnly = alt && !link;
  // The tooltip of the clip the pointer rests on (hoverTip.ts): where it rested, which clip.
  const [tip, setTip] = useState<{ clipId: ClipId; x: number; y: number } | null>(null);
  const [hoverTip] = useState(() =>
    createHoverTip<ClipId>({
      onShow: (clipId, x, y) => setTip({ clipId, x, y }),
      onHide: () => setTip(null),
    }),
  );
  useEffect(() => () => hoverTip.cancel(), [hoverTip]);
  const onTracksPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    syncShift(event);
    syncAlt(event);
    // A drag, or a touch (no hover): nothing to show.
    if (event.buttons !== 0 || event.pointerType === 'touch') {
      hoverTip.cancel();
      return;
    }
    const clipId = (event.target as Element)
      .closest('[data-clip-id]')
      ?.getAttribute('data-clip-id');
    hoverTip.move((clipId as ClipId | null) ?? null, event.clientX, event.clientY);
  };
  const { ghost, clearGhost, onLaneDragOver, onLaneDrop } = useFormulaDrop(timeAt);
  useTimelineKeys();
  // T held: the view follows the mouse along time; with Shift, the playhead does (useFlyKey.ts).
  const flying = useFlyKey(scrollRef, scrubTo);
  useRegionKeys();
  const linkSource = link ? project.clips.find((c) => c.id === link.from) : undefined;

  /** The menu of `clip` at screen point (x, y): the selected clips' when the clip is one of
   * several selected, else the one to add an animation — at the playhead when it is inside the
   * clip, else at `clicked` (D171) —, on a locked track too, with what would change the clip off
   * (its timing can still be copied). */
  const openClipMenuAt = (clip: TimelineClip, x: number, y: number, clicked: number) => {
    if (isAudioClip(clip)) {
      openAudioMenu(clip, x, y);
      return;
    }
    const current = useUiStore.getState().selection;
    if (current.kind === 'clips' && current.ids.length > 1 && current.ids.includes(clip.id)) {
      setMenu({ kind: 'clips', x, y, clipIds: current.ids });
      return;
    }
    const { time } = useUiStore.getState();
    const { region } = useTimelineStore.getState();
    const where = clipMenuTime(clip, time, clicked, project.meta.fps, region);
    setMenu({ kind: 'add', x, y, clipId: clip.id, ...where });
  };

  /** Right-click on a clip (not on a block): the menu to add an animation at the playhead, or
   * where it was clicked when the playhead is outside the clip. */
  const openClipMenu = (e: ReactMouseEvent, clip: Clip) => {
    e.preventDefault();
    openClipMenuAt(clip, e.clientX, e.clientY, timeAt(along(e)));
  };

  /** Select a block and open its menu at screen point (x, y): the group's own when the block is
   * drawn as its folded group. */
  const openBlockMenuAt = (clip: Clip, actionId: ActionId, x: number, y: number) => {
    if (trackById.get(clip.trackId)?.locked) return;
    select({ kind: 'action', clipId: clip.id, actionId });
    const action = clip.actions.find((a) => a.id === actionId);
    const group = action && groupOf(action);
    const folded = group !== undefined && !unfolded.has(groupKey(clip.id, group));
    setMenu({ kind: folded ? 'group' : 'block', x, y, clipId: clip.id, actionId });
  };

  /** Right-click on a block: select it and open its menu. */
  const openBlockMenu = (e: ReactMouseEvent, clip: Clip, action: ClipAction) => {
    e.preventDefault();
    e.stopPropagation();
    openBlockMenuAt(clip, action.id, e.clientX, e.clientY);
  };

  /** Right-click on the ruler with the Slides mode on: its menu at the time clicked, on a frame
   * and snapped as a mark would be put there (`rulerSpot`). */
  const openSlideRulerMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    const { snap, pxPerSecond } = useTimelineStore.getState();
    const spot = rulerSpot(
      project,
      timeAt(along(event)),
      project.meta.fps,
      snap
        ? { playhead: useUiStore.getState().time, threshold: SNAP_DISTANCE / pxPerSecond }
        : null,
    );
    setMenu({ kind: 'slideRuler', x: event.clientX, y: event.clientY, spot });
  };

  const openClip = (clip: TimelineClip) => {
    if (isAudioClip(clip)) {
      setAudioEditor(clip.id);
      return;
    }
    if (formulas.has(clip.formulaId)) openFormulaEditor(clip.formulaId, false, clip.id);
  };

  /** A double-click on a block selects it and opens its dialog (R2); the panel shows it too. */
  const openBlock = (clip: Clip, action: ClipAction) => {
    useUiStore.getState().select({ kind: 'action', clipId: clip.id, actionId: action.id });
    openBlockDialog(clip.id, action.id);
  };

  const duration = sceneDuration(project);
  const lastEnd = timelineClips(project).reduce((end, c) => Math.max(end, c.end), 0);
  const viewSeconds = timelineExtent(duration, lastEnd);
  const { zoomBy, showAll } = useTimelineZoom(scrollRef, timeAt, viewSeconds);
  const { startRegion, startRegionEdge } = useRegionGestures(timeAt, scrubTo, viewSeconds);
  // The region shown stays within the timeline as it is laid out: cut where a shorter scene ends
  // it, and whole again once the timeline grows back — the store keeps the one marked.
  const fps = project.meta.fps;
  useEffect(() => {
    useTimelineStore.getState().setRegionLimit({ seconds: viewSeconds, fps });
  }, [viewSeconds, fps]);
  // The middle button drags the view, both ways at once.
  useEffect(() => (scrollRef.current ? startTimelinePan(scrollRef.current) : undefined), []);
  const scale = rulerScale(px, project.meta.fps);
  const selectedIds = new Set(selection.kind === 'clips' ? selection.ids : []);
  const formulas = new Map(project.formulas.map((f) => [f.id, f]));
  const trackById = new Map(project.tracks.map((t) => [t.id, t]));
  const topBlock = useTimelineStore((s) => s.topBlock);
  const blockDrag = useTimelineStore((s) => s.blockDrag);
  const unfolded = useTimelineStore((s) => s.unfolded);
  const setGroupFolded = useTimelineStore((s) => s.setGroupFolded);
  const rowSizes = useTimelineStore((s) => s.rowSizes);
  const layout = tracksLayout(project, topBlock, unfolded, rowSizes);
  const stoppedAction = blockDrag?.stop ? blockDrag.actionId : null;
  const isPreviewLockedId = (clipId: ClipId) =>
    project.clips.find((c) => c.id === clipId)?.previewLocked === true;
  /** Another height for the tracks, from the corner's keys: the track at the top of the view
   * stays there, at the same place within it. */
  const zoomRows = (next: RowSizes) => {
    const scroll = scrollRef.current;
    const index = scroll ? layout.indexAt(scroll.scrollTop) : -1;
    const row = layout.rows[index];
    const within = row && scroll ? (scroll.scrollTop - row.top) / row.height : 0;
    flushSync(() => useTimelineStore.getState().setRowSizes(next));
    const after = tracksLayout(project, topBlock, unfolded, next).rows[index];
    if (scroll && after) scroll.scrollTop = Math.round(after.top + within * after.height);
  };
  const formulaNameOf = (clipId: ClipId) =>
    formulas.get(project.clips.find((c) => c.id === clipId)?.formulaId ?? '')?.name ?? 'clip';
  const menuClip =
    menu?.kind === 'block' || menu?.kind === 'group'
      ? project.clips.find((c) => c.id === menu.clipId)
      : undefined;
  const menuAction =
    menu?.kind === 'block' || menu?.kind === 'group'
      ? menuClip?.actions.find((a) => a.id === menu.actionId)
      : undefined;
  /** The group of the block the open menu is about, if it is in one, and its members. */
  const menuGroup = menuAction && groupOf(menuAction);
  const menuMembers = menuClip && menuAction ? groupMembers(menuClip, menuAction.id) : [];
  /** The blocks that run with it without being grouped with it: what "Group with…" takes in. */
  const menuMates = menuClip && menuAction ? runsWith(menuClip, menuAction.id).length : 0;
  /** What the block menu may offer: a split, and a copy for the other glyphs. */
  const menuOptions = useMemo(() => {
    if (menu?.kind !== 'block' || !menuAction) return undefined;
    const clip = project.clips.find((c) => c.id === menu.clipId);
    return {
      split: splitOptions(menuAction, clipLifetimes(project).get(menu.clipId)),
      others:
        clip && isGlyphBlock(menuAction)
          ? complementGlyphs(project, clip, menuAction).length > 0
          : false,
    };
  }, [project, menu, menuAction]);

  // Drop selection entries that no longer exist (deleted, or undone away).
  useEffect(() => {
    const left = pruneSelection(selection, project);
    if (left !== selection) select(left);
  }, [project, selection, select]);

  // Only the labels around what the view shows: a long project at the closest zoom has tens of
  // thousands (the small ticks are a repeating gradient, free of DOM).
  const band = useVisibleSeconds(scrollRef, px, viewSeconds);
  const labelTicks = majorTicks(band.from, band.to, scale);
  const contentWidth = header + viewSeconds * px;

  const keyboard = useTimelineKeyboard({
    tracksRef,
    scrollRef,
    project,
    layout,
    selection,
    pxPerSecond: px,
    onOpenClip: openClip,
    onClipMenu: openClipMenuAt,
    onBlockMenu: openBlockMenuAt,
  });
  /** Fold a group of blocks into one block, or unfold it. What draws its members now is not what
   * will: the focus goes to what draws, once it is drawn, the member the block stood for —
   * `actionId`, else the selected member, else the first. */
  const foldGroup = (clipId: ClipId, group: string, folded: boolean, actionId?: ActionId) => {
    focusMember(clipId, group, actionId);
    setGroupFolded(groupKey(clipId, group), folded);
  };
  /** The focus for a member of a group whose blocks are about to be drawn anew. */
  const focusMember = (clipId: ClipId, group: string, actionId?: ActionId) => {
    const members =
      project.clips.find((c) => c.id === clipId)?.actions.filter((a) => groupOf(a) === group) ?? [];
    const wanted =
      actionId ??
      (selection.kind === 'action' && selection.clipId === clipId ? selection.actionId : null);
    const member = members.find((m) => m.id === wanted) ?? members[0];
    if (member) keyboard.focusItemWhenDrawn({ kind: 'block', clipId, actionId: member.id });
  };
  const tabStopOf = (clip: Clip): 'clip' | ActionId | null => {
    const item = keyboard.tabItem;
    if (!item || item.clipId !== clip.id) return null;
    return item.kind === 'clip' ? 'clip' : item.actionId;
  };

  return (
    <div
      className={`tl${vertical ? ' is-vertical' : ''}${project.camera ? ' has-camera' : ''}`}
      data-testid="timeline-view"
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      data-flying={flying ?? undefined}
      data-marquee={marquee ? `${marquee.t0.toFixed(3)}-${marquee.t1.toFixed(3)}` : ''}
      style={{
        // The layout constants the stylesheet needs (timeline.css).
        ['--lane-height' as string]: `${LANE_HEIGHT}px`,
        ['--header-width' as string]: `${header}px`,
        ['--ruler-height' as string]: `${RULER_HEIGHT}px`,
        ['--clip-inset' as string]: `${CLIP_INSET}px`,
        ['--link-port-radius' as string]: `${LINK_PORT_RADIUS}px`,
      }}
    >
      <TimelineToolbar
        onZoomBy={zoomBy}
        onShowAll={showAll}
        extent={viewSeconds}
        scrollRef={scrollRef}
        scrollId={scrollId}
      />

      {/* The well's edge and round corners are its own: the scroller inside has no border, so
          its box starts where its content does (the zoom's anchor measures from it). */}
      <div className={tracksBar ? 'tl-well-place has-tracks-bar' : 'tl-well-place'}>
        <div className="tl-well">
          <div className="tl-scroll" id={scrollId} ref={scrollRef} data-testid="timeline-scroll">
            <div className="tl-content" style={{ width: contentWidth }}>
              <div className="tl-row tl-ruler-row" style={{ height: RULER_HEIGHT }}>
                <div className="tl-corner" style={{ width: header }}>
                  <RowZoomControls sizes={rowSizes} onChange={zoomRows} />
                </div>
                <div
                  className="tl-ruler"
                  ref={rulerRef}
                  data-testid="timeline-ruler"
                  style={{
                    width: viewSeconds * px,
                    backgroundImage: smallTicks(ownDt ?? scale.minor, px),
                    backgroundSize: '100% 6px',
                  }}
                  // Shift draws the region (D180); a plain press moves the playhead.
                  onPointerDown={(event) =>
                    event.shiftKey ? startRegion(event) : startScrub(event)
                  }
                  // With the Slides mode on, its menu at the time clicked (D200); off, none.
                  onContextMenu={project.slides ? openSlideRulerMenu : undefined}
                >
                  <SlideZonesOnRuler />
                  <RegionOnRuler onEdgeDown={startRegionEdge} />
                  <PlayheadCap />
                  <SymbolHoldMark />
                  {labelTicks.map((t) => (
                    <div key={t} className="tl-tick" style={{ left: t * px }}>
                      <span>{rulerLabel(t, scale.major)}</span>
                    </div>
                  ))}
                  <SlideSkipsOnRuler />
                  <SlideMarksOnRuler
                    onMarkMenu={(markId, x, y) => setMenu({ kind: 'slideMark', x, y, markId })}
                  />
                </div>
              </div>

              {project.camera && (
                <CameraRow
                  camera={project.camera}
                  pxPerSecond={px}
                  width={viewSeconds * px}
                  selectedMove={selection.kind === 'cameraMove' ? selection.id : null}
                  onMovePress={(event, move, edge) => startCameraMoveGesture(event, move.id, edge)}
                  // Its menu selects the move it is about.
                  onMoveMenu={(move, x, y) => {
                    select({ kind: 'cameraMove', id: move.id });
                    setMenu({ kind: 'cameraMove', x, y, moveId: move.id });
                  }}
                  onLaneMenu={(event) => {
                    event.preventDefault();
                    setMenu({
                      kind: 'cameraLane',
                      x: event.clientX,
                      y: event.clientY,
                      time: Math.max(0, timeAt(along(event))),
                    });
                  }}
                />
              )}

              <div
                className={`tl-tracks${link ? ' is-linking' : ''}${trimOnly ? ' is-trim-only' : ''}`}
                data-trim-only={trimOnly ? '' : undefined}
                // Trim only: a press that lands on no handle is no press at all (it selects
                // nothing, and clears no selection as a press on the panel's background does).
                onPointerDown={(event) => {
                  if (trimOnly && isMainClick(event)) event.stopPropagation();
                }}
                ref={tracksRef}
                data-testid="timeline-tracks"
                onPointerMove={onTracksPointerMove}
                onPointerLeave={() => hoverTip.cancel()}
                onPointerDownCapture={() => hoverTip.cancel()}
                onWheelCapture={() => hoverTip.cancel()}
              >
                {/* The rows are a grid for the keyboard (useTimelineKeyboard): one Tab stop, the
                arrows between clips and blocks; the overlays below it are pointer tools. */}
                <div
                  role="grid"
                  aria-label="Clips"
                  data-testid="timeline-grid"
                  onKeyDown={keyboard.onKeyDown}
                  onFocus={keyboard.onFocus}
                  onBlur={keyboard.onBlur}
                >
                  {project.tracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="tl-row tl-track-row"
                      role="row"
                      style={{
                        height: layout.rows[index]!.height,
                        // What the row draws is as tall as its lanes (rowSizes.ts).
                        ['--lane-height' as string]: `${layout.rows[index]!.lane}px`,
                        // Drawn vertical, what is read in the row is as wide as the row (timeline.css).
                        ['--row-height' as string]: `${layout.rows[index]!.height}px`,
                      }}
                      data-testid={`track-row-${track.id}`}
                      data-scale={layout.rows[index]!.scale}
                    >
                      <TrackHeader
                        track={track}
                        index={index}
                        row={layout.rows[index]!}
                        count={project.tracks.length}
                        clipCount={
                          timelineClips(project).filter((c) => c.trackId === track.id).length
                        }
                      />
                      <div
                        className={`tl-lane${track.hidden ? ' is-hidden' : ''}${track.locked ? ' is-locked' : ''}`}
                        role="presentation"
                        data-testid={`track-lane-${track.id}`}
                        style={{ width: viewSeconds * px }}
                        onPointerDown={startMarquee}
                        onDragOver={(e) => {
                          if (
                            track.kind === 'audio' &&
                            !track.locked &&
                            e.dataTransfer.types.includes(AUDIO_MIME)
                          ) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                          } else onLaneDragOver(e, track);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                            clearGhost();
                        }}
                        onDrop={(e) => {
                          if (
                            track.kind === 'audio' &&
                            !track.locked &&
                            e.dataTransfer.types.includes(AUDIO_MIME)
                          ) {
                            e.preventDefault();
                            try {
                              const data = JSON.parse(e.dataTransfer.getData(AUDIO_MIME));
                              if (
                                typeof data.assetId === 'string' &&
                                typeof data.sourceStart === 'number' &&
                                typeof data.sourceEnd === 'number'
                              )
                                addAudioToTimeline(
                                  data.assetId,
                                  data.sourceStart,
                                  data.sourceEnd,
                                  Math.max(0, timeAt(along(e))),
                                  track.id,
                                );
                            } catch {
                              /* Foreign drag data. */
                            }
                          } else onLaneDrop(e, track);
                        }}
                      >
                        {project.audioClips
                          .filter(
                            (clip) =>
                              clip.trackId === track.id &&
                              ((clip.end >= band.from && clip.start <= band.to) ||
                                selectedIds.has(clip.id) ||
                                keyboard.tabItem?.clipId === clip.id),
                          )
                          .map((clip) => (
                            <AudioClipBlock
                              key={clip.id}
                              clip={clip}
                              asset={project.audioAssets.find((asset) => asset.id === clip.assetId)}
                              track={track}
                              px={px}
                              band={band}
                              selected={selectedIds.has(clip.id)}
                              tabIndex={keyboard.tabItem?.clipId === clip.id ? 0 : -1}
                              lineEditable={volumeLines.has(clip.id) && !track.locked}
                              onToggleLine={toggleVolumeLine}
                              graphHeight={layout.rows[index]!.height - AUDIO_ROW_CHROME}
                              onMove={startMove}
                              onTrim={startTrim}
                              onEdit={(item) => setAudioEditor(item.id)}
                              onMenu={openAudioMenu}
                            />
                          ))}
                        {project.clips
                          .filter(
                            (c) =>
                              c.trackId === track.id &&
                              ((c.end >= band.from && c.start <= band.to) ||
                                selectedIds.has(c.id) ||
                                keyboard.tabItem?.clipId === c.id ||
                                (selection.kind === 'action' && selection.clipId === c.id) ||
                                linkSource?.id === c.id),
                          )
                          .map((clip) => {
                            const locked = trackById.get(clip.trackId)?.locked ?? false;
                            const reason =
                              linkSource && linkSource.id !== clip.id
                                ? relateBlocker(project, linkSource, clip)
                                : null;
                            return (
                              <ClipBlock
                                key={clip.id}
                                clip={clip}
                                formula={formulas.get(clip.formulaId)}
                                pxPerSecond={px}
                                selected={selectedIds.has(clip.id)}
                                locked={locked}
                                onPointerDown={startMove}
                                onTrimStart={startTrim}
                                onPhaseResize={(e, c, phase) => startPhaseGesture(e, c.id, phase)}
                                linkRole={
                                  !linkSource
                                    ? null
                                    : linkSource.id === clip.id
                                      ? 'source'
                                      : reason
                                        ? 'invalid'
                                        : 'target'
                                }
                                linkReason={reason}
                                onOpen={openClip}
                                lanes={layout.clips.get(clip.id)!}
                                unfolded={unfolded}
                                onGroupFold={(c, group, folded) => foldGroup(c.id, group, folded)}
                                tabStop={tabStopOf(clip)}
                                label={clipDescription(
                                  clip,
                                  formulas.get(clip.formulaId)?.name ?? '(missing formula)',
                                  trackById.get(clip.trackId),
                                )}
                                stoppedAction={stoppedAction}
                                selectedAction={
                                  selection.kind === 'action' && selection.clipId === clip.id
                                    ? selection.actionId
                                    : null
                                }
                                onBlockPress={(e, c, a, edge) =>
                                  startBlockGesture(e, c.id, a.id, edge)
                                }
                                onBlockMenu={openBlockMenu}
                                onBlockOpen={openBlock}
                                onClipMenu={openClipMenu}
                                transformLock={
                                  hasTransforms(clip)
                                    ? unlockedClips.includes(clip.id)
                                      ? 'unlocked'
                                      : 'locked'
                                    : null
                                }
                                onToggleTransformLock={(c) =>
                                  void toggleTransformLock(
                                    c,
                                    formulas.get(c.formulaId)?.name ?? 'formula',
                                  )
                                }
                                onUnlockPreview={(c) => setPreviewLock([c.id], false)}
                              />
                            );
                          })}
                        {ghost && ghost.trackId === track.id && (
                          <div
                            className="tl-ghost"
                            data-testid="timeline-drop-ghost"
                            style={{
                              left: ghost.start * px,
                              width: (ghost.end - ghost.start) * px,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {project.tracks.length === 0 && (
                    <p className="placeholder tl-empty">No tracks. Add one with “+ Track”.</p>
                  )}
                </div>
                <CameraRegionBands project={project} pxPerSecond={px} />
                <TimelineRelations
                  project={project}
                  layout={layout}
                  pxPerSecond={px}
                  selection={selection}
                  onMenu={(relationId, x, y) => setMenu({ kind: 'relation', x, y, relationId })}
                />
                <BlockStateIcons
                  project={project}
                  layout={layout}
                  pxPerSecond={px}
                  selection={selection}
                />
                <BlockDragReadout project={project} layout={layout} pxPerSecond={px} />
                <PhaseDragReadout project={project} layout={layout} pxPerSecond={px} />
                <TimelineLinkPorts
                  project={project}
                  layout={layout}
                  pxPerSecond={px}
                  shift={shift}
                  link={link}
                  onLinkStart={startLink}
                />
                {link && <LinkBand link={link} height={layout.height} />}
                {marquee && (
                  <div
                    className="tl-marquee"
                    data-testid="timeline-marquee"
                    style={{
                      left: header + marquee.t0 * px,
                      width: (marquee.t1 - marquee.t0) * px,
                      top: marquee.y0,
                      height: marquee.y1 - marquee.y0,
                    }}
                  />
                )}
              </div>
              <SlidePauseLines />
              <RegionBand />
              <PlayheadLine scrollRef={scrollRef} />
            </div>
          </div>
        </div>
        {/* Turned, the well has its scrollbars drawn here, outside it (D188). */}
        {vertical && <TimelineScrollbars scrollRef={scrollRef} onTracksOverflow={setTracksBar} />}
      </div>
      {audioEditor && (
        <AudioClipEditor
          key={audioEditor}
          clipId={audioEditor}
          onClose={() => setAudioEditor(null)}
        />
      )}
      {audioMenu && (
        <ContextMenu
          x={audioMenu.x}
          y={audioMenu.y}
          label="Audio clip"
          testId="audio-clip-menu"
          onClose={() => setAudioMenu(null)}
        >
          <MenuItem
            testId="audio-menu-edit"
            onClick={() => {
              setAudioEditor(audioMenu.id);
              setAudioMenu(null);
            }}
          >
            Edit volume and trim…
          </MenuItem>
          <MenuItem
            testId="audio-menu-split"
            onClick={() => {
              splitAtPlayhead();
              setAudioMenu(null);
            }}
          >
            Split at playhead (S)
          </MenuItem>
          <MenuItem
            testId="audio-menu-fade-in"
            onClick={() => {
              fadeAudioClip(audioMenu.id, 'in');
              setAudioMenu(null);
            }}
          >
            Fade In
          </MenuItem>
          <MenuItem
            testId="audio-menu-fade-out"
            onClick={() => {
              fadeAudioClip(audioMenu.id, 'out');
              setAudioMenu(null);
            }}
          >
            Fade Out
          </MenuItem>
          <TimingMenuItems
            clipIds={audioMenuClips(audioMenu.id)}
            testIdPrefix="audio-menu"
            onClose={() => setAudioMenu(null)}
          />
          <MenuItem
            testId="audio-menu-duplicate"
            onClick={() => {
              const current = useUiStore.getState().selection;
              duplicateAudio(new Set(current.kind === 'clips' ? current.ids : [audioMenu.id]));
              setAudioMenu(null);
            }}
          >
            Duplicate
          </MenuItem>
          <MenuItem
            testId="audio-menu-delete"
            onClick={() => {
              const current = useUiStore.getState().selection;
              void deleteClipsAsking(
                new Set(current.kind === 'clips' ? current.ids : [audioMenu.id]),
              );
              setAudioMenu(null);
            }}
          >
            Delete
          </MenuItem>
        </ContextMenu>
      )}
      {tip && <ClipTooltip clipId={tip.clipId} x={tip.x} y={tip.y} />}
      {menu?.kind === 'add' && (
        <AddAnimationMenu
          x={menu.x}
          y={menu.y}
          header={`${formulaNameOf(menu.clipId)} · ${addTimeLabel(menu)}`}
          subject={clipSubject(
            project,
            project.clips.find((c) => c.id === menu.clipId),
          )}
          arrow={clipIsArrow(project, menu.clipId)}
          onPick={(block) =>
            reportRefused(addBlock(menu.clipId, block, menu.time, { atPlayhead: menu.atPlayhead }))
          }
          onRetarget={
            isShapeClip(project, menu.clipId) ? () => startRetarget(menu.clipId) : undefined
          }
          // A brace goes on a formula, a text or a shape, never on a brace (D123).
          onBrace={
            isBraceClip(project, menu.clipId)
              ? undefined
              : (choice: BraceChoice) =>
                  choice === 'glyphs'
                    ? openBraceDialog(menu.clipId, pickedGlyphsOf(menu.clipId))
                    : addBrace(menu.clipId, 'all', BRACE_SIDE_DEGREES[choice])
          }
          onShape={
            isBraceClip(project, menu.clipId) || isShapeClip(project, menu.clipId)
              ? undefined
              : (choice: ShapeMenuChoice) =>
                  choice === 'glyphs'
                    ? openShapeDialog(menu.clipId, pickedGlyphsOf(menu.clipId))
                    : addShape(menu.clipId, 'all', choice)
          }
          lineFrom={{ clipId: menu.clipId, glyphs: 'all' }}
          onLabel={
            isBraceClip(project, menu.clipId)
              ? (kind) => addBraceLabel(menu.clipId, kind)
              : undefined
          }
          object={
            <ObjectMenuItems
              clipId={menu.clipId}
              testIdPrefix="clip-menu"
              afterOutro={
                <TimingMenuItems
                  clipIds={[menu.clipId]}
                  testIdPrefix="clip-menu"
                  onClose={() => setMenu(null)}
                />
              }
              onClose={() => setMenu(null)}
            />
          }
          previewLock={{
            locked: isPreviewLockedId(menu.clipId),
            onToggle: () => setPreviewLock([menu.clipId], !isPreviewLockedId(menu.clipId)),
          }}
          locked={
            editableClips(project, [menu.clipId]).length === 0
              ? 'The track of this clip is locked.'
              : undefined
          }
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === 'clips' && (
        <ClipsMenu x={menu.x} y={menu.y} clipIds={menu.clipIds} onClose={() => setMenu(null)} />
      )}
      {menu?.kind === 'cameraMove' && (
        <CameraMoveMenu x={menu.x} y={menu.y} moveId={menu.moveId} onClose={() => setMenu(null)} />
      )}
      {menu?.kind === 'cameraLane' && (
        <CameraLaneMenu x={menu.x} y={menu.y} time={menu.time} onClose={() => setMenu(null)} />
      )}
      {menu?.kind === 'slideRuler' && (
        <SlideRulerMenu x={menu.x} y={menu.y} spot={menu.spot} onClose={() => setMenu(null)} />
      )}
      {menu?.kind === 'slideMark' && (
        <SlideMarkMenu x={menu.x} y={menu.y} markId={menu.markId} onClose={() => setMenu(null)} />
      )}
      {menu?.kind === 'relation' && (
        <RelationMenu
          x={menu.x}
          y={menu.y}
          relationId={menu.relationId}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === 'group' && menuGroup !== undefined && (
        <GroupMenu
          x={menu.x}
          y={menu.y}
          members={menuMembers}
          onUnfold={() => foldGroup(menu.clipId, menuGroup, false, menu.actionId)}
          onUngroup={() => {
            // Its block goes with the group: the member it stood for takes the focus.
            focusMember(menu.clipId, menuGroup, menu.actionId);
            ungroupBlocks(menu.clipId, menu.actionId);
          }}
          groupWith={
            menuMates > 0
              ? { count: menuMates, onGroup: () => groupBlocks(menu.clipId, menu.actionId) }
              : undefined
          }
          onDuplicate={() =>
            reportRefused(
              duplicateGroup(menu.clipId, menu.actionId),
              'No room for a copy of the group',
            )
          }
          onDelete={() => void confirmDeleteGroup(menu.clipId, menu.actionId)}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === 'block' && menuAction && (
        <BlockMenu
          x={menu.x}
          y={menu.y}
          action={menuAction}
          formula={project.formulas.find((f) => f.id === menuClip?.formulaId)}
          group={
            menuGroup === undefined
              ? undefined
              : {
                  onFold: () => foldGroup(menu.clipId, menuGroup, true, menu.actionId),
                  onLeave: () => leaveGroup(menu.clipId, menu.actionId),
                  onUngroup: () => ungroupBlocks(menu.clipId, menu.actionId),
                }
          }
          groupWith={
            menuMates > 0
              ? { count: menuMates, onGroup: () => groupBlocks(menu.clipId, menu.actionId) }
              : undefined
          }
          onChange={(kind, anim) => changeBlockAnimation(menu.clipId, menu.actionId, kind, anim)}
          onChangeEffect={(effect) => changeEmphasisEffect(menu.clipId, menu.actionId, effect)}
          onEditPairs={() => openMorphEditor(menu.clipId, menu.actionId)}
          onDuplicate={() => reportRefused(duplicateBlock(menu.clipId, menu.actionId))}
          canDuplicateOthers={menuOptions?.others ?? false}
          onDuplicateOthers={() =>
            reportRefused(
              duplicateBlockForOthers(menu.clipId, menu.actionId),
              'Cannot duplicate for the other glyphs',
            )
          }
          split={menuOptions?.split}
          onSplitRuns={() =>
            reportRefused(splitBlockIntoRuns(menu.clipId, menu.actionId), 'Cannot split this block')
          }
          onSplit={() => openSplitDialog(menu.clipId, menu.actionId)}
          onDelete={() => void confirmDeleteBlock(menu.clipId, menu.actionId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
