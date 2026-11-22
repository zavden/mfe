/* Layout of the relation block diagrams (docs: images/gui-3x.png): blocks for clips in columns,
 * with the glyphs that take part in relations, and an arrow per pair. A pair of several glyphs
 * joins its sources at a node and fans out to its targets (many-to-one, one-to-many,
 * many-to-many). Three views: a clip (its sources, itself, its targets), one relation (its two
 * clips), and the chain of every relation connected to a clip. Pure: coordinates only, in the
 * units of the SVG viewBox. */
import type { ClipId, Project, Relation, RelationId, RelationStyle } from '../../model';
import { glyphLabel, styleOfPair } from './relationOps';
import { MISSING_TAG_COLOR } from '../animations/PropertiesHeader';

export const DIAGRAM_WIDTH = 380;
const GAP = 48;
const TITLE_H = 20;
const CHIP_H = 24;
const CHIP_GAP = 4;
const PAD = 6;
const BLOCK_GAP = 12;

export interface DiagramChip {
  /** `<clipId>:<glyph>`. */
  key: string;
  clipId: ClipId;
  glyph: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramBlock {
  clipId: ClipId;
  formulaId: string;
  name: string;
  icon: string | null;
  color: string;
  current: boolean;
  column: number;
  x: number;
  y: number;
  w: number;
  h: number;
  chips: DiagramChip[];
}

export interface DiagramEdge {
  relationId: RelationId;
  pairIndex: number;
  style: RelationStyle;
  /** SVG path data of every segment of the arrow. */
  paths: string[];
  /** The junction of a pair of several glyphs. */
  node: [number, number] | null;
  /** Arrow heads: tip position (they point right). */
  heads: [number, number][];
  /** Where to put a label / hit area. */
  center: [number, number];
}

export interface Diagram {
  width: number;
  height: number;
  blocks: DiagramBlock[];
  edges: DiagramEdge[];
}

const f = (n: number) => +n.toFixed(2);

const EMPTY: Diagram = { width: DIAGRAM_WIDTH, height: 0, blocks: [], edges: [] };

/** The diagram of one clip: its sources on the left, the clip, its targets on the right. */
export function buildDiagram(project: Project, clipId: ClipId): Diagram {
  const clips = new Set(project.clips.map((c) => c.id));
  const incoming = project.relations.filter(
    (r) => r.toClipId === clipId && clips.has(r.fromClipId),
  );
  const outgoing = project.relations.filter(
    (r) => r.fromClipId === clipId && clips.has(r.toClipId),
  );
  if (!clips.has(clipId) || incoming.length + outgoing.length === 0) return EMPTY;
  // Columns: sources | this clip | targets (empty sides collapse).
  const sourceIds = [...new Set(incoming.map((r) => r.fromClipId))];
  const targetIds = [...new Set(outgoing.map((r) => r.toClipId))];
  const columns: ClipId[][] = [];
  if (sourceIds.length) columns.push(sourceIds);
  columns.push([clipId]);
  if (targetIds.length) columns.push(targetIds);
  return layoutDiagram(project, [...incoming, ...outgoing], columns, new Set([clipId]));
}

/** The diagram of one relation: its source and its target clip only. */
export function buildRelationDiagram(project: Project, relationId: RelationId): Diagram {
  const relation = project.relations.find((r) => r.id === relationId);
  const clips = new Set(project.clips.map((c) => c.id));
  if (!relation || !clips.has(relation.fromClipId) || !clips.has(relation.toClipId)) return EMPTY;
  return layoutDiagram(
    project,
    [relation],
    [[relation.fromClipId], [relation.toClipId]],
    new Set([relation.fromClipId, relation.toClipId]),
  );
}

/** The clips connected to `clipId` through relations (in either direction), itself included. */
export function relatedClips(project: Project, clipId: ClipId): ClipId[] {
  const clips = new Set(project.clips.map((c) => c.id));
  if (!clips.has(clipId)) return [];
  const seen = new Set([clipId]);
  const queue = [clipId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const r of project.relations) {
      if (!clips.has(r.fromClipId) || !clips.has(r.toClipId)) continue;
      const other = r.fromClipId === id ? r.toClipId : r.toClipId === id ? r.fromClipId : null;
      if (other !== null && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return [...seen];
}

/**
 * Every relation connected to `clipId`, as a chain of columns left to right: a clip sits one
 * column after the furthest of its sources (clips taken in order of start time, so a relation
 * back to an earlier clip does not move it), several clips of a column stacked by track.
 * `current` are emphasised.
 */
export function buildChainDiagram(
  project: Project,
  clipId: ClipId,
  current: ReadonlySet<ClipId> = new Set([clipId]),
): Diagram {
  const ids = new Set(relatedClips(project, clipId));
  const relations = project.relations.filter((r) => ids.has(r.fromClipId) && ids.has(r.toClipId));
  if (relations.length === 0) return EMPTY;
  const trackIndex = new Map(project.tracks.map((t, i) => [t.id, i]));
  const clips = project.clips
    .filter((c) => ids.has(c.id))
    .sort(
      (a, b) =>
        a.start - b.start ||
        (trackIndex.get(a.trackId) ?? 0) - (trackIndex.get(b.trackId) ?? 0) ||
        a.id.localeCompare(b.id),
    );
  const order = new Map(clips.map((c, i) => [c.id, i]));
  const column = new Map<ClipId, number>();
  for (const clip of clips) {
    let col = 0;
    for (const r of relations) {
      if (r.toClipId !== clip.id || order.get(r.fromClipId)! >= order.get(clip.id)!) continue;
      col = Math.max(col, column.get(r.fromClipId)! + 1);
    }
    column.set(clip.id, col);
  }
  const columns: ClipId[][] = [];
  for (const clip of clips) {
    const col = column.get(clip.id)!;
    (columns[col] ??= []).push(clip.id);
  }
  const rowOf = new Map(clips.map((c) => [c.id, trackIndex.get(c.trackId) ?? 0]));
  for (const list of columns) list.sort((a, b) => rowOf.get(a)! - rowOf.get(b)!);
  return layoutDiagram(project, relations, columns, current);
}

/** Blocks for `columns` of clips with a chip per glyph that `relations` use, and their arrows. */
function layoutDiagram(
  project: Project,
  relations: readonly Relation[],
  columns: readonly ClipId[][],
  current: ReadonlySet<ClipId>,
): Diagram {
  const clipOf = new Map(project.clips.map((c) => [c.id, c]));
  const formulaOf = new Map(project.formulas.map((fm) => [fm.id, fm]));

  // Which glyphs of which clip take part: per clip a sorted set.
  const glyphsOf = new Map<ClipId, Set<number>>();
  const use = (id: ClipId, glyph: number) => {
    const set = glyphsOf.get(id) ?? new Set<number>();
    set.add(glyph);
    glyphsOf.set(id, set);
  };
  for (const r of relations) {
    for (const p of r.pairs) {
      p.from.forEach((g) => use(r.fromClipId, g));
      p.to.forEach((g) => use(r.toClipId, g));
    }
  }

  const count = columns.length;
  const blockW = count === 1 ? 170 : count === 2 ? 128 : 96;
  const total = count * blockW + (count - 1) * GAP;
  const left = Math.max(PAD, (DIAGRAM_WIDTH - total) / 2);
  const width = Math.max(DIAGRAM_WIDTH, total + 2 * left);

  const blocks: DiagramBlock[] = [];
  const chipByKey = new Map<string, DiagramChip>();
  let height = 0;
  columns.forEach((ids, column) => {
    let y = PAD;
    for (const id of ids) {
      const clip = clipOf.get(id)!;
      const formula = formulaOf.get(clip.formulaId);
      const glyphs = [...(glyphsOf.get(id) ?? [])].sort((a, b) => a - b);
      const x = left + column * (blockW + GAP);
      const h =
        TITLE_H + glyphs.length * (CHIP_H + CHIP_GAP) + PAD - (glyphs.length ? 0 : CHIP_GAP);
      const chips = glyphs.map((glyph, k): DiagramChip => {
        const chip = {
          key: `${id}:${glyph}`,
          clipId: id,
          glyph,
          label: glyphLabel(formula?.snapshot ?? null, glyph),
          x: x + PAD,
          y: y + TITLE_H + k * (CHIP_H + CHIP_GAP),
          w: blockW - 2 * PAD,
          h: CHIP_H,
        };
        chipByKey.set(chip.key, chip);
        return chip;
      });
      blocks.push({
        clipId: id,
        formulaId: clip.formulaId,
        name: formula?.name ?? '(missing)',
        icon: formula?.tag.icon ?? null,
        color: formula?.tag.color ?? MISSING_TAG_COLOR,
        current: current.has(id),
        column,
        x,
        y,
        w: blockW,
        h,
        chips,
      });
      y += h + BLOCK_GAP;
    }
    height = Math.max(height, y - BLOCK_GAP + PAD);
  });

  const edges: DiagramEdge[] = [];
  const addEdges = (relation: Relation) => {
    relation.pairs.forEach((pair, pairIndex) => {
      const src = pair.from
        .map((g) => chipByKey.get(`${relation.fromClipId}:${g}`))
        .filter((c) => !!c);
      const dst = pair.to.map((g) => chipByKey.get(`${relation.toClipId}:${g}`)).filter((c) => !!c);
      if (src.length === 0 || dst.length === 0) return;
      const cy = (c: DiagramChip) => c.y + c.h / 2;
      const rightOf = (c: DiagramChip) => c.x + c.w;
      const style = styleOfPair(pair, relation);
      const edge: DiagramEdge = {
        relationId: relation.id,
        pairIndex,
        style,
        paths: [],
        node: null,
        heads: [],
        center: [0, 0],
      };
      if (src.length === 1 && dst.length === 1) {
        const a = src[0]!;
        const b = dst[0]!;
        const x0 = rightOf(a);
        const x1 = b.x;
        const mid = (x0 + x1) / 2;
        edge.paths.push(
          `M${f(x0)} ${f(cy(a))} C${f(mid)} ${f(cy(a))} ${f(mid)} ${f(cy(b))} ${f(x1)} ${f(cy(b))}`,
        );
        edge.heads.push([x1, cy(b)]);
        edge.center = [mid, (cy(a) + cy(b)) / 2];
      } else {
        const x0 = Math.max(...src.map(rightOf));
        const x1 = Math.min(...dst.map((c) => c.x));
        const nx = (x0 + x1) / 2;
        const ny = [...src, ...dst].reduce((s, c) => s + cy(c), 0) / (src.length + dst.length);
        edge.node = [nx, ny];
        edge.center = [nx, ny];
        for (const a of src) {
          edge.paths.push(
            `M${f(rightOf(a))} ${f(cy(a))} C${f((rightOf(a) + nx) / 2)} ${f(cy(a))} ${f((rightOf(a) + nx) / 2)} ${f(ny)} ${f(nx)} ${f(ny)}`,
          );
        }
        for (const b of dst) {
          edge.paths.push(
            `M${f(nx)} ${f(ny)} C${f((nx + b.x) / 2)} ${f(ny)} ${f((nx + b.x) / 2)} ${f(cy(b))} ${f(b.x)} ${f(cy(b))}`,
          );
          edge.heads.push([b.x, cy(b)]);
        }
      }
      edges.push(edge);
    });
  };
  relations.forEach(addEdges);

  return { width, height, blocks, edges };
}
