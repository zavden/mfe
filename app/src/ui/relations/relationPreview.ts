/* The relation editor's own previews (D156, D157): the two formulas of a relation alone, looping
 * from a little before the transformation to a little after it, drawn from the editor's draft by
 * the scene engine in a canvas of its own — as the scene has them (RelationPreview.tsx), or raw,
 * on the spots of the drawing that links their glyphs (RawPreview.tsx). Pure: the window the
 * transformation runs over, the span the loop runs over, how far through the window a time is,
 * the instants the camera frames, where the window lies on the bar, and the raw stage and scene. */
import type { Box, Vec2 } from '../../geom';
import type { Clip, Project, Relation, RelationId } from '../../model';
import type { Camera } from '../../render';
import type { TimeSpan } from '../animations/blockPreview';
import { linkFrame, type LinkOffset, type PairLayout } from './linkLayout';

type Lifetime = Pick<Clip, 'start' | 'end'>;
type WindowSpec = Pick<Relation, 'offset' | 'duration'>;

/** Seconds shown before and after the transformation, so that the loop shows the source standing
 * and the target settled. */
export const WINDOW_PAD = 0.5;

// To the microsecond, so that the bar's bounds read as the times they are.
const round = (t: number) => Math.round(t * 1e6) / 1e6;

/** The scene seconds a relation's transformation runs over: its window, counted from the start of
 * its target clip. */
export function relationWindow(to: Pick<Clip, 'start'>, relation: WindowSpec): TimeSpan {
  const start = round(to.start + relation.offset);
  return { start, end: round(start + relation.duration) };
}

/** The scene seconds the preview loops over: the window padded by `pad`, within the time either
 * clip is on the scene; never empty. */
export function relationSpan(
  from: Lifetime,
  to: Lifetime,
  relation: WindowSpec,
  pad = WINDOW_PAD,
): TimeSpan {
  const window = relationWindow(to, relation);
  const start = round(Math.max(Math.min(from.start, to.start), window.start - pad));
  const end = round(Math.min(Math.max(from.end, to.end), window.end + pad));
  return { start, end: Math.max(end, round(start + 0.001)) };
}

/** How far through the transformation the scene time `time` is: 0 before its window, 1 after. */
export function windowProgress(time: number, window: TimeSpan): number {
  const length = window.end - window.start;
  if (length <= 0) return time >= window.start ? 1 : 0;
  return Math.min(1, Math.max(0, (time - window.start) / length));
}

/** The instants the camera frames, in order: the ends of the span, and the window cut in `steps`
 * — a path that bulges away from both formulas is in the picture all the way. */
export function framedTimes(span: TimeSpan, window: TimeSpan, steps = 8): number[] {
  const times = [span.start, span.end];
  for (let i = 0; i <= steps; i += 1) {
    times.push(window.start + ((window.end - window.start) * i) / steps);
  }
  return [...new Set(times.map(round))].sort((a, b) => a - b);
}

/** Where the window lies on the bar of the span, as fractions from 0 to 1: the band the bar marks
 * the transformation with. */
export function windowBand(span: TimeSpan, window: TimeSpan): { from: number; to: number } {
  const length = span.end - span.start;
  const at = (t: number) => Math.min(1, Math.max(0, (t - span.start) / length));
  return { from: at(window.start), to: at(window.end) };
}

/** The stage of the raw preview (D157): the drawing that links glyphs, as a scene. Where the
 * centre of each formula's box goes, how its own coordinates are moved there, and the camera
 * whose frame is the drawing's box. */
export interface RawStage {
  from: Vec2;
  to: Vec2;
  offsets: { from: LinkOffset; to: LinkOffset };
  camera: Camera;
}

/** The raw stage for the boxes of the source (`a`) and of the target (`b`) in their own
 * coordinates, whose text is `text` large: as `linkFrame` lays them out — the source above the
 * target, or at its left. */
export function rawStage(a: Box, b: Box, text: number, layout: PairLayout = 'stacked'): RawStage {
  const frame = linkFrame(a, b, text, layout);
  const centre = (box: Box, at: LinkOffset): Vec2 => [
    (box.minX + box.maxX) / 2 + at.dx,
    (box.minY + box.maxY) / 2 + at.dy,
  ];
  return {
    from: centre(a, frame.from),
    to: centre(b, frame.to),
    offsets: { from: frame.from, to: frame.to },
    camera: {
      frameWidth: frame.right - frame.left,
      frameHeight: frame.top - frame.bottom,
      center: [(frame.left + frame.right) / 2, (frame.top + frame.bottom) / 2],
      zoom: 1,
    },
  };
}

/** The scene the raw preview animates: `scene` with the two clips of the relation as the drawing
 * that links them has them — the source at `stage.from`, the target at `stage.to`, each at its
 * formula's own size, upright, attached to nothing and without the blocks that would move or
 * reshape it (the ones that show and hide glyphs stay: they say what is on screen) — and the
 * relation alone between them, its glyphs going straight: no path arc, no path of a pair's own.
 * The other relations of the two clips are left out, so that the source is whole when the
 * transformation starts and the target when it ends; for the same reason a source that starts
 * empty (`Clip.startsEmpty`), or that leaves glyphs out of its intro itself (`Clip.startHidden`),
 * does not here: what filled it is one of the relations left out. The target keeps both: of a
 * target that starts empty, the transformation shows what its pairs bring. */
export function rawScene(
  scene: Project,
  relationId: RelationId,
  stage: Pick<RawStage, 'from' | 'to'>,
): Project {
  const relation = scene.relations.find((r) => r.id === relationId);
  if (!relation) return scene;
  const { fromClipId, toClipId } = relation;
  const bare = (clip: Clip, position: Vec2): Clip => ({
    ...clip,
    attach: null,
    initial: { ...clip.initial, position, scale: 1, rotation: 0, flipX: false, flipY: false },
    actions: clip.actions.filter((a) => a.kind === 'appear' || a.kind === 'disappear'),
  });
  const whole = (clip: Clip): Clip => {
    const copy = { ...clip };
    delete copy.startsEmpty;
    delete copy.startHidden;
    return copy;
  };
  const ofTheTwo = (r: Relation) =>
    [r.fromClipId, r.toClipId].some((id) => id === fromClipId || id === toClipId);
  return {
    ...scene,
    clips: scene.clips.map((clip) =>
      clip.id === fromClipId
        ? whole(bare(clip, stage.from))
        : clip.id === toClipId
          ? bare(clip, stage.to)
          : clip,
    ),
    relations: scene.relations
      .filter((r) => r.id === relationId || !ofTheTwo(r))
      .map((r) => {
        if (r.id !== relationId) return r;
        const pairs = r.pairs.map((pair) => {
          const straight = { ...pair };
          delete straight.path;
          // Nor a path of one of its routes (D167).
          delete straight.routes;
          return straight;
        });
        return { ...r, pathArc: 0, pairs };
      }),
  };
}
