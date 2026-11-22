/* The transformation of a relation, looping, inside its editor (D156): the two formulas of the
 * relation alone, as the scene engine draws them from the editor's DRAFT — the pairs, the styles,
 * the window and the two phases as they would be saved now, nothing of it saved yet —, from a
 * little before the transformation to a little after it, in a canvas of its own framed on them.
 * Play and pause, a bar to choose the instant, on which the window of the transformation is
 * marked, and the time with how far through the transformation it is. The same evaluator as the
 * preview, so what loops here is what the scene would show; a clip of a hidden track is drawn too,
 * as the export draws it.
 *
 * The editor keeps it mounted while it shows the drawing to link glyphs (`active` false): it
 * draws and computes nothing then, and comes back at the instant it was left on. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contoursBox, unionBox, type Box } from '../../geom';
import { multicameraOn, type Project } from '../../model';
import { createCanvasRenderer, type Surface } from '../../render';
import { createEvaluator, type Drawable } from '../../scene';
import type { useRenderStore } from '../../store';
import { fitCamera } from '../animations/blockPreview';
import { PreviewBar } from './PreviewBar';
import { projectWithDraft, type RelationDraft } from './relationDraft';
import { framedTimes, relationSpan, relationWindow, windowProgress } from './relationPreview';
import { useLoopClock } from './useLoopClock';
import './relations.css';

const renderer = createCanvasRenderer();

interface RelationPreviewProps {
  /** Shown: while false nothing is computed or drawn, and the instant is kept. */
  active: boolean;
  project: Project;
  resolved: ReturnType<typeof useRenderStore.getState>['resolved'];
  /** The editor's draft as it would be saved now (`resolveDraft`). */
  draft: RelationDraft;
}

export function RelationPreview({ active, project, resolved, draft }: RelationPreviewProps) {
  // The draft is a new object at each render of the editor: the scene is made again only when
  // what it says changes.
  const key = active ? JSON.stringify(draft) : null;
  const scene = useMemo(
    () => (key === null ? null : projectWithDraft(project, JSON.parse(key) as RelationDraft)),
    [project, key],
  );
  const evaluator = useMemo(
    () => (scene ? createEvaluator(scene, resolved, { includeHidden: true }) : null),
    [scene, resolved],
  );
  const { fromClipId, toClipId, offset, duration } = draft.relation;
  const from = project.clips.find((clip) => clip.id === fromClipId);
  const to = project.clips.find((clip) => clip.id === toClipId);
  // The window and the span, kept while their numbers are the same: an edit of a pair or of a
  // style does not restart the loop.
  const ends = from && to ? [from.start, from.end, to.start, to.end] : [0, 1, 0, 1];
  const [fromStart, fromEnd, toStart, toEnd] = ends as [number, number, number, number];
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
  const drawn = useMemo(() => {
    if (!evaluator) return null;
    return (t: number): Drawable[] =>
      evaluator.evaluate(t).filter((d) => d.clipId === fromClipId || d.clipId === toClipId);
  }, [evaluator, fromClipId, toClipId]);
  const world = multicameraOn(project);
  const camera = useMemo(() => {
    const boxes: Box[] = [];
    if (drawn) {
      for (const t of framedTimes(span, window)) {
        for (const drawable of drawn(t)) {
          const box = contoursBox(drawable.path.contours);
          if (Number.isFinite(box.minX)) boxes.push(box);
        }
      }
    }
    return fitCamera(boxes.length > 0 ? unionBox(boxes) : null, project.meta, 0.25);
  }, [drawn, span, window, project.meta]);

  const clock = useLoopClock(active, span);
  const { shown } = clock;

  // The canvas: as wide as CSS makes it, 16:9, on whole device pixels.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [surface, setSurface] = useState<Surface>({ width: 1, height: 1 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const dpr = globalThis.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      setSurface({ width, height: Math.max(1, Math.round((width * 9) / 16)) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active]);

  const drawables = useMemo(() => (drawn ? drawn(shown) : []), [drawn, shown]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
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
    });
  }, [active, drawables, camera, surface, project.meta.background, world]);

  if (!active || !from || !to) return null;
  const progress = windowProgress(shown, window);
  return (
    <div
      className="rel-preview"
      data-testid="rel-preview"
      data-progress={progress.toFixed(3)}
      data-drawn={drawables.length}
    >
      <div className="rel-preview-frame">
        <canvas
          ref={canvasRef}
          className="rel-preview-canvas"
          data-testid="rel-preview-canvas"
          role="img"
          aria-label="The transformation, looping"
        />
      </div>
      <PreviewBar clock={clock} span={span} window={window} testId="rel-preview" />
    </div>
  );
}
