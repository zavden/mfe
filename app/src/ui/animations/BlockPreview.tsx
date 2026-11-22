/* The block alone, looping (R2, D75): the clip's glyphs as the scene engine draws them from a
 * little before the block to a little after it, in a canvas of its own framed on the clip. Play
 * and pause, a playhead of its own to scrub, and the time; under them the block's easing curve,
 * its point following the loop. The same evaluator as the preview, so what loops here is what
 * the scene shows. It is the body of a dialog of its own, opened from the block's dialog
 * (`BlockDialog`): as wide as that dialog by default, and the whole picture in the room it has
 * once the dialog is sized by hand or maximized (animations.css). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contoursBox, unionBox, type Box } from '../../geom';
import { multicameraOn, type ActionId, type ClipId } from '../../model';
import { createCanvasRenderer, type Surface } from '../../render';
import { createEvaluator, type Drawable } from '../../scene';
import { useProjectStore, useRenderStore } from '../../store';
import { Icon } from '../timeline/icons';
import {
  blockProgress,
  fitCamera,
  loopTime,
  playedSeconds,
  previewSpan,
  type TimeSpan,
} from './blockPreview';
import { EasingCurve } from './EasingCurve.tsx';

const renderer = createCanvasRenderer();

/** The union box of a clip's drawables at a few instants (the span's start, middle and end). */
function clipBoxAt(
  evaluate: (t: number) => readonly Drawable[],
  clipId: ClipId,
  times: readonly number[],
): Box | null {
  const boxes: Box[] = [];
  for (const t of times) {
    for (const drawable of evaluate(t)) {
      if (drawable.clipId !== clipId) continue;
      const box = contoursBox(drawable.path.contours);
      if (Number.isFinite(box.minX)) boxes.push(box);
    }
  }
  return boxes.length > 0 ? unionBox(boxes) : null;
}

const within = (t: number, span: TimeSpan) => t >= span.start && t <= span.end;

export function BlockPreview({ clipId, actionId }: { clipId: ClipId; actionId: ActionId }) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const clip = project.clips.find((c) => c.id === clipId);
  const action = clip?.actions.find((a) => a.id === actionId);
  const evaluator = useMemo(() => createEvaluator(project, resolved), [project, resolved]);
  const world = multicameraOn(project);
  // The span, kept while its numbers are the same: an edit of the easing does not restart it.
  const loop = clip && action ? previewSpan(clip, action) : { start: 0, end: 1 };
  const span = useMemo(() => ({ start: loop.start, end: loop.end }), [loop.start, loop.end]);
  const camera = useMemo(() => {
    const middle = (span.start + span.end) / 2;
    const box = clipBoxAt((t) => evaluator.evaluate(t), clipId, [span.start, middle, span.end]);
    return fitCamera(box, project.meta);
  }, [evaluator, clipId, span, project.meta]);

  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(span.start);
  const timeRef = useRef(time);
  const moveTo = (t: number) => {
    timeRef.current = t;
    setTime(t);
  };
  // The clock, while playing: on from where the playhead is (the span's start if the span moved
  // away from it), looping over the span.
  useEffect(() => {
    if (!playing) return;
    const from = within(timeRef.current, span) ? timeRef.current : span.start;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = loopTime(from - span.start + playedSeconds(now, startedAt), span);
      timeRef.current = t;
      setTime(t);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, span]);
  // Paused, the playhead stays in the span (it moved: back to its start).
  const shown = within(time, span) ? time : span.start;

  // The canvas: as wide as CSS makes it, 16:9, on whole device pixels.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [surface, setSurface] = useState<Surface>({ width: 1, height: 1 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const dpr = globalThis.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      setSurface({ width, height: Math.max(1, Math.round((width * 9) / 16)) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const drawables = useMemo(
    () => evaluator.evaluate(shown).filter((d) => d.clipId === clipId),
    [evaluator, shown, clipId],
  );
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
      // With a scene camera the clip may be anywhere in the world: nothing is cut at Manim's
      // own frame, which the camera may have left.
      unclipped: world,
    });
  }, [drawables, camera, surface, project.meta.background, world]);

  if (!clip || !action) return null;
  const progress = blockProgress(shown, clip, action);
  return (
    <div className="block-preview" data-testid="block-preview" data-progress={progress.toFixed(3)}>
      <div className="block-preview-frame">
        <canvas
          ref={canvasRef}
          className="block-preview-canvas"
          data-testid="block-preview-canvas"
          role="img"
          aria-label="The block, looping"
        />
      </div>
      <div className="block-preview-bar">
        <button
          type="button"
          className="an-small-button block-preview-play"
          data-testid="block-preview-play"
          aria-label="Play the loop"
          aria-pressed={playing}
          title={playing ? 'Pause the loop' : 'Play the block in a loop'}
          onClick={() => setPlaying((p) => !p)}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <input
          type="range"
          className="block-preview-scrub"
          data-testid="block-preview-scrub"
          aria-label="Time in the loop"
          min={span.start}
          max={span.end}
          step={0.01}
          value={shown}
          onPointerDown={() => setPlaying(false)}
          onChange={(e) => {
            setPlaying(false);
            moveTo(Number(e.target.value));
          }}
        />
        <span className="block-preview-time" data-testid="block-preview-time">
          {shown.toFixed(2)} s
        </span>
      </div>
      {/* The easing as a graph of progress over time; a Flash keeps each library's own tempo. */}
      {!(action.kind === 'emphasis' && action.effect === 'flash') && (
        <EasingCurve easing={action.easing} target={project.meta.target} progress={progress} />
      )}
    </div>
  );
}
