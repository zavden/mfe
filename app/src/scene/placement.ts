/* How a clip state places and colours its formula. Shared by the evaluator and the exporter so
 * both agree on transform order and colour precedence. */
import { multiply, rotate, scale, translate, type Mat2D } from '../geom';
import {
  visualTracks,
  type Appearance,
  type Formula,
  type Placement,
  type Project,
  type TrackId,
} from '../model';

/** Formula-local → scene: flips and scale about the formula centre, then rotation about it,
 * then translation of the centre to `position` (renders are centred on the origin). */
export function placementMatrix(p: Placement): Mat2D {
  return multiply(translate(p.position[0], p.position[1]), placementLinear(p));
}

/** The linear part of `placementMatrix`: flips and scale, then rotation (no translation). */
export function placementLinear(p: Placement): Mat2D {
  const sx = p.scale * (p.flipX ? -1 : 1);
  const sy = p.scale * (p.flipY ? -1 : 1);
  return multiply(rotate(p.rotation), scale(sx, sy));
}

/** Depth of visual rows only: audio row insertion/reordering cannot change a mobject's depth. */
export function trackDepths(project: Pick<Project, 'tracks'>): Map<TrackId, number> {
  const tracks = visualTracks(project);
  return new Map(tracks.map((t, i) => [t.id, tracks.length - 1 - i]));
}

/** Colour of canonical glyph `glyph`: clip glyphColors > clip color > formula glyphColors >
 * formula color. */
export function glyphColor(glyph: number, state: Appearance, formula: Formula): string {
  const key = String(glyph);
  return state.glyphColors[key] ?? state.color ?? formula.glyphColors[key] ?? formula.color;
}
