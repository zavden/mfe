/* Where the window band of a relation goes inside the lane of a clip (TimelineRelations.tsx).
 * A clip carries one band per relation that touches it, as source or as target, all in the same
 * lane. Bands whose windows overlap in time would lie one over the other — two relations of the
 * same two clips can even have the same window —, so they share the lane in stripes: each takes
 * a slot, the lane cut in as many as the busiest instant of their group needs, and every band
 * can be seen and pressed. A band nothing overlaps keeps the whole lane. Pure. */
import {
  relationWindow,
  TIME_EPSILON,
  type ClipId,
  type Project,
  type RelationId,
} from '../../model';

/** The stripe of a band: the `slot`-th (from the top, counting from 0) of `of` equal stripes. */
export interface BandSlot {
  slot: number;
  of: number;
}

/** The key of the band of relation `relationId` on clip `clipId` in `bandSlots`. */
export const bandKey = (relationId: RelationId, clipId: ClipId): string =>
  `${relationId}:${clipId}`;

interface Band {
  key: string;
  start: number;
  end: number;
  slot: number;
}

/** The stripe of every band of the project, by `bandKey`. Bands of a clip that overlap in time
 * (touching ends do not count) form a group; within one, a band takes the first stripe free when
 * it starts — earlier windows first, then the project's order — and the lane is cut in as many
 * stripes as the group uses. A relation to or from a missing clip has no band. */
export function bandSlots(project: Project): Map<string, BandSlot> {
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const byClip = new Map<ClipId, Band[]>();
  for (const relation of project.relations) {
    const from = clips.get(relation.fromClipId);
    const to = clips.get(relation.toClipId);
    if (!from || !to) continue;
    const { start, end } = relationWindow(relation, to);
    for (const clipId of new Set([from.id, to.id])) {
      const band = { key: bandKey(relation.id, clipId), start, end, slot: 0 };
      const list = byClip.get(clipId);
      if (list) list.push(band);
      else byClip.set(clipId, [band]);
    }
  }
  const out = new Map<string, BandSlot>();
  for (const bands of byClip.values()) {
    // A stable sort: bands that start together keep the project's order.
    bands.sort((a, b) => (Math.abs(a.start - b.start) <= TIME_EPSILON ? 0 : a.start - b.start));
    let group: Band[] = [];
    let groupEnd = -Infinity;
    /** When the band in each stripe of the group ends. */
    let stripes: number[] = [];
    const close = () => {
      for (const band of group) out.set(band.key, { slot: band.slot, of: stripes.length });
      group = [];
      stripes = [];
    };
    for (const band of bands) {
      if (group.length > 0 && band.start >= groupEnd - TIME_EPSILON) close();
      const free = stripes.findIndex((end) => end <= band.start + TIME_EPSILON);
      band.slot = free < 0 ? stripes.length : free;
      stripes[band.slot] = band.end;
      group.push(band);
      groupEnd = Math.max(groupEnd, band.end);
    }
    close();
  }
  return out;
}
