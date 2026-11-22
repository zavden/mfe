/* The raw preview of a relation (D157), inside the drawing that links its glyphs: the source and
 * the target on the very spots of that drawing, in its layout (`rawStage`), and the glyphs going
 * from one to the other as the draft's pairs and styles say — in straight lines: the path arc and
 * the paths of the pairs belong to the scene, which the Preview shows. The scene engine draws it
 * (`rawScene`: the two clips alone, laid out as the drawing, the relation alone between them), so
 * a style, a copy, a fade and what the unpaired glyphs do are what the scene would do.
 *
 * Two guides stay all along. The target as it stands when the loop ends, at half its opacity
 * under the glyphs: where each of them arrives. And, dashed, the outline of every glyph of
 * either formula that the loop never shows — a glyph hidden at the start and not shown yet, or
 * hidden by then: it is not on screen while the transformation runs.
 *
 * It takes the place of the drawing and of its toolbar: the canvas, then the bar of the loop with
 * the key that ends the preview. Escape ends it too, wherever the focus is, and does not close
 * the editor (a field of the side column with an edit to take back keeps its Escape). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedFormula } from '../../engine';
import type { Contour } from '../../geom';
import { multicameraOn, type Formula, type Project } from '../../model';
import {
  createCanvasRenderer,
  pixelsPerUnit,
  sceneToPixelMatrix,
  traceContours,
  type Surface,
} from '../../render';
import { createEvaluator, glyphColor, type Drawable } from '../../scene';
import type { useRenderStore } from '../../store';
import { fieldOwnsEscape } from '../project/modalStack';
import { rendersTextSize, type PairLayout } from './linkLayout';
import { PreviewBar } from './PreviewBar';
import { projectWithDraft, type RelationDraft } from './relationDraft';
import {
  framedTimes,
  rawScene,
  rawStage,
  relationSpan,
  relationWindow,
  windowProgress,
} from './relationPreview';
import { useLoopClock } from './useLoopClock';
import './relations.css';

const renderer = createCanvasRenderer();

/** How much of the target shows all along, under the glyphs that arrive. */
const GHOST_OPACITY = 0.5;

interface Side {
  formula: Formula;
  resolved: ResolvedFormula;
}

/** A glyph the loop never shows: its outline in its formula's own coordinates, where the stage
 * puts that formula, and its colour. */
interface Absent {
  contours: readonly Contour[];
  dx: number;
  dy: number;
  color: string;
}

interface RawPreviewProps {
  project: Project;
  resolved: ReturnType<typeof useRenderStore.getState>['resolved'];
  /** The editor's draft as it would be saved now (`resolveDraft`). */
  draft: RelationDraft;
  from: Side;
  to: Side;
  /** How the drawing lays the two formulas out: the preview does the same, and shows both whole
   * whatever part of the drawing its view had. */
  layout: PairLayout;
  /** The preview is over: its key, or Escape. */
  onEnd(): void;
}

export function RawPreview({ project, resolved, draft, from, to, layout, onEnd }: RawPreviewProps) {
  const stage = useMemo(
    () =>
      rawStage(
        from.resolved.render.bbox,
        to.resolved.render.bbox,
        rendersTextSize(from.resolved.render, to.resolved.render),
        layout,
      ),
    [from.resolved, to.resolved, layout],
  );
  // The draft is a new object at each render of the editor: the scene is made again only when
  // what it says changes.
  const key = JSON.stringify(draft);
  const scene = useMemo(() => {
    const parsed = JSON.parse(key) as RelationDraft;
    return rawScene(projectWithDraft(project, parsed), parsed.relation.id, stage);
  }, [project, key, stage]);
  const evaluator = useMemo(
    () => createEvaluator(scene, resolved, { includeHidden: true }),
    [scene, resolved],
  );
  const { fromClipId, toClipId, offset, duration } = draft.relation;
  const fromClip = project.clips.find((clip) => clip.id === fromClipId);
  const toClip = project.clips.find((clip) => clip.id === toClipId);
  const ends = fromClip && toClip ? [fromClip.start, fromClip.end, toClip.start, toClip.end] : null;
  const [fromStart, fromEnd, toStart, toEnd] = (ends ?? [0, 1, 0, 1]) as [
    number,
    number,
    number,
    number,
  ];
  const window = useMemo(
    () => relationWindow({ start: toStart }, { offset, duration }),
    [toStart, offset, duration],
  );
  const span = useMemo(
    () =>
      relationSpan(
        { start: fromStart, end: fromEnd },
        { start: toStart, end: toEnd },
        { offset, duration },
      ),
    [fromStart, fromEnd, toStart, toEnd, offset, duration],
  );

  /** The drawables of the two clips at an instant. */
  const drawn = useMemo(
    () =>
      (t: number): Drawable[] =>
        evaluator.evaluate(t).filter((d) => d.clipId === fromClipId || d.clipId === toClipId),
    [evaluator, fromClipId, toClipId],
  );
  const fromState = fromClip?.initial;
  const toState = toClip?.initial;
  const guide = useMemo(() => {
    // What the loop shows of each clip, at the instants the Preview frames too.
    const seen = new Set<string>();
    let floor = 0;
    for (const t of framedTimes(span, window)) {
      for (const d of drawn(t)) {
        seen.add(`${d.clipId}:${d.glyph}`);
        floor = Math.min(floor, d.z);
      }
    }
    // The target as it stands when the loop ends, under everything, at half its opacity.
    const ghosts: Drawable[] = drawn(span.end)
      .filter((d) => d.clipId === toClipId && d.glyph >= 0)
      .map((d) => ({
        ...d,
        key: `ghost:${d.key}`,
        z: floor - 1,
        fill: d.fill && { ...d.fill, opacity: d.fill.opacity * GHOST_OPACITY },
        stroke: d.stroke && { ...d.stroke, opacity: d.stroke.opacity * GHOST_OPACITY },
      }));
    const absent: Absent[] = [];
    const sides = [
      { side: from, clipId: fromClipId, state: fromState, at: stage.offsets.from },
      { side: to, clipId: toClipId, state: toState, at: stage.offsets.to },
    ];
    for (const { side, clipId, state, at } of sides) {
      if (!state) continue;
      side.resolved.canonToRender.forEach((renderIndex, canonical) => {
        const glyph = renderIndex === null ? undefined : side.resolved.render.glyphs[renderIndex];
        if (!glyph || seen.has(`${clipId}:${canonical}`)) return;
        absent.push({
          contours: glyph.contours,
          dx: at.dx,
          dy: at.dy,
          color: glyphColor(canonical, state, side.formula),
        });
      });
    }
    return { ghosts, absent };
  }, [drawn, span, window, from, to, fromClipId, toClipId, fromState, toState, stage]);

  const clock = useLoopClock(true, span);
  const { shown } = clock;

  // Escape ends the preview, before the dialog around it hears of it (the dialog listens on the
  // document: the window comes first).
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || fieldOwnsEscape(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      onEndRef.current();
    };
    globalThis.addEventListener('keydown', onKeyDown, true);
    return () => globalThis.removeEventListener('keydown', onKeyDown, true);
  }, []);
  // The key that ends it takes the focus: the toolbar that held it is gone.
  const endRef = useRef<HTMLButtonElement>(null);
  useEffect(() => endRef.current?.focus(), []);

  // The canvas: the box the drawing had, on whole device pixels; the camera fits the stage in
  // it whole, as the drawing fitted itself.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [surface, setSurface] = useState<Surface>({ width: 1, height: 1 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const dpr = globalThis.devicePixelRatio || 1;
      setSurface({
        width: Math.max(1, Math.round(canvas.clientWidth * dpr)),
        height: Math.max(1, Math.round(canvas.clientHeight * dpr)),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const drawables = useMemo(() => [...guide.ghosts, ...drawn(shown)], [guide, drawn, shown]);
  const { camera } = stage;
  const world = multicameraOn(project);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== surface.width) canvas.width = surface.width;
    if (canvas.height !== surface.height) canvas.height = surface.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // no 2D context (jsdom)
    renderer.draw(ctx, drawables, camera, surface, {
      background: project.meta.background,
      outside: null,
      // With a scene camera the clips may be anywhere in the world: nothing is cut at Manim's
      // own frame, which the camera may have left.
      unclipped: world,
      // The outlines of the glyphs that are not on screen, dashed, under the glyphs.
      underlay: (under) => {
        if (guide.absent.length === 0) return;
        const m = sceneToPixelMatrix(camera, surface);
        // One CSS pixel, in scene units.
        const px = (globalThis.devicePixelRatio || 1) / pixelsPerUnit(camera, surface);
        under.save();
        under.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        under.lineWidth = 1.25 * px;
        under.setLineDash([4 * px, 3 * px]);
        under.globalAlpha = 0.85;
        for (const mark of guide.absent) {
          under.beginPath();
          under.save();
          under.translate(mark.dx, mark.dy);
          traceContours(under, mark.contours);
          under.restore();
          under.strokeStyle = mark.color;
          under.stroke();
        }
        under.restore();
      },
    });
  }, [drawables, guide, camera, surface, project.meta.background, world]);

  if (!fromClip || !toClip) return null;
  return (
    <>
      <canvas
        ref={canvasRef}
        className="rel-canvas rel-raw-canvas"
        style={{
          aspectRatio: `${camera.frameWidth} / ${camera.frameHeight}`,
          background: project.meta.background,
        }}
        data-testid="rel-raw-canvas"
        data-progress={windowProgress(shown, window).toFixed(3)}
        data-drawn={drawables.length - guide.ghosts.length}
        data-ghosts={guide.ghosts.length}
        data-absent={guide.absent.length}
        role="img"
        aria-label={
          layout === 'side'
            ? 'The glyphs going from the source, at the left, to the target, at the right'
            : 'The glyphs going from the source, on top, to the target, below'
        }
      />
      <div className="rel-toolbar rel-raw-bar" data-testid="rel-raw-bar">
        <PreviewBar clock={clock} span={span} window={window} testId="rel-raw">
          <button
            ref={endRef}
            type="button"
            className="btn btn-small"
            data-testid="rel-raw-end"
            title="End the raw preview and go back to linking glyphs (Esc)"
            onClick={onEnd}
          >
            End preview
          </button>
        </PreviewBar>
      </div>
    </>
  );
}
