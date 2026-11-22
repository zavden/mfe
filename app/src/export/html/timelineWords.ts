/* The timeline of a scene in words, for the head of its exported `scene.js` and for the guide that
 * goes with it (`AGENTS.md`): one line per thing that happens, in order — an intro, a block, a
 * relation, a move of the camera, a clip that appears or goes without an animation, a pause or a
 * comment of the Slides mode —, each with its time, the clips by the names the page gives them
 * (`deck/names.ts`) and where it is in the file (`clips[2].actions[0]`), so that whoever reads
 * the file can find in it what they see on the page.
 *
 *   0.00–1.00 s   eq1  write  clips[0].intro
 *   1.00 s        PAUSE 1 (skips its wait to 1.50 s) · “Ask the room”  slides.marks[1]
 *   1.50–2.70 s   eq1 → eq2  (transform, 3 pairs)  relations[0]
 *
 * At one instant, what appears or goes without an animation comes first, then the marks, then
 * what starts there: the order the exported Python writes them in (`codegen/timeline.ts`). The
 * marks are those an export carries (`exportedMarks`); a pause that skips its wait says where the
 * page goes on from it (`skippedWait`). Pure. */
import {
  animationWindows,
  exportedMarks,
  movesInOrder,
  sceneDuration,
  skippedWait,
  TIME_EPSILON,
  type CameraDestination,
  type Clip,
  type ClipAction,
  type ClipId,
  type GlyphTarget,
  type Project,
  type SceneCamera,
  type TweenAction,
} from '../../model';
import { clipNames } from '../../deck/names';

/** One thing that happens in the scene. */
export interface TimelineEntry {
  /** Seconds of the scene. */
  start: number;
  /** Null for what takes no time: a clip that appears or goes at once, a mark. */
  end: number | null;
  /** What it is: an intro, an outro, a block, a relation, a move of the camera, a clip that
   * appears or goes at once, a pause or a comment. */
  kind:
    'intro' | 'outro' | 'action' | 'relation' | 'camera' | 'appears' | 'goes' | 'pause' | 'comment';
  /** What happens, in words, without its time: `eq1 → eq2  (transform, 3 pairs)`. */
  text: string;
  /** Where it is in the scene file: `clips[2].actions[0]`, `relations[1]`, `slides.marks[0]`. */
  path: string;
  /** The names of the clips it is about. */
  clips: string[];
}

/** Seconds as the timeline writes them. */
export const seconds = (time: number): string => (Math.abs(time) < 0.005 ? 0 : time).toFixed(2);

/** The time of an entry: `0.00–1.00 s`, or `1.00 s` for an instant. */
export function entryTime(entry: Pick<TimelineEntry, 'start' | 'end'>): string {
  return entry.end === null
    ? `${seconds(entry.start)} s`
    : `${seconds(entry.start)}–${seconds(entry.end)} s`;
}

/** A list of glyphs as a reader takes it in: `all`, `[3, 4]`, `[0–5, 8]` (runs of three or more
 * as a range). */
export function glyphList(glyphs: GlyphTarget): string {
  if (glyphs === 'all') return 'all';
  const parts: string[] = [];
  let k = 0;
  while (k < glyphs.length) {
    let j = k;
    while (j + 1 < glyphs.length && glyphs[j + 1] === glyphs[j]! + 1) j++;
    if (j - k >= 2) parts.push(`${glyphs[k]}–${glyphs[j]}`);
    else for (let i = k; i <= j; i++) parts.push(String(glyphs[i]));
    k = j + 1;
  }
  return `[${parts.join(', ')}]`;
}

/** A text on one short line, for a comment of a script: its first line, its spaces one, cut at
 * `width` with an ellipsis. */
export function shortText(text: string, width = 60): string {
  const lines = text.split('\n').map((line) => line.trim());
  const first = lines.find((line) => line !== '') ?? '';
  const one = first.replace(/\s+/g, ' ');
  const more = lines.filter((line) => line !== '').length > 1;
  if (one.length <= width && !more) return one;
  return `${one.slice(0, width).trimEnd()}…`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** What a tween changes, in a word each. */
function tweenChanges(tween: TweenAction): string {
  const words = new Set<string>();
  for (const key of Object.keys(tween.to) as (keyof TweenAction['to'])[]) {
    if (tween.to[key] === undefined) continue;
    if (key === 'position') words.add('move');
    else if (key === 'rotation') words.add('turn');
    else if (key === 'flipX' || key === 'flipY') words.add('flip');
    else if (key === 'color' || key === 'glyphColors') words.add('colour');
    else if (key === 'strokeWidth' || key === 'strokeOpacity' || key === 'fillOpacity')
      words.add('paint');
    else if (key === 'fillColor') words.add('paint');
    else words.add(key);
  }
  if (tween.fit) words.add('fit');
  if (tween.ends) words.add('ends');
  return words.size === 0 ? 'tween' : `tween (${[...words].join(', ')})`;
}

/** A block in words, without its clip. */
function actionWords(action: ClipAction): string {
  switch (action.kind) {
    case 'tween':
      return tweenChanges(action);
    case 'appear':
      return `appear ${action.anim} ${glyphList(action.glyphs)}`;
    case 'disappear':
      return `disappear ${action.anim} ${glyphList(action.glyphs)}`;
    case 'transform':
      return `transform ${glyphList(action.glyphs)}`;
    case 'morph':
      return `morph (${action.style}, ${plural(action.pairs.length, 'pair')})`;
    case 'emphasis':
      return `emphasis ${action.effect} ${glyphList(action.glyphs)}`;
  }
}

const point = ([x, y]: readonly [number, number]) => `(${+x.toFixed(2)}, ${+y.toFixed(2)})`;

/** Where a move of the camera goes, in words. */
function destinationWords(camera: SceneCamera, to: CameraDestination): string {
  switch (to.kind) {
    case 'start':
      return 'the start';
    case 'frame':
      return `centre ${point(to.frame.center)}, height ${+to.frame.height.toFixed(2)}`;
    case 'target': {
      const target = camera.targets.find((t) => t.id === to.target);
      return target ? `“${shortText(target.name, 30)}”` : 'a missing target';
    }
  }
}

/** The rank of an entry among those that start at one instant. */
const RANK: Record<TimelineEntry['kind'], number> = {
  appears: 0,
  goes: 0,
  comment: 1,
  pause: 1,
  intro: 2,
  action: 2,
  outro: 2,
  relation: 2,
  camera: 2,
};

/** What happens in `project`, in order. */
export function timelineEntries(project: Project): TimelineEntry[] {
  const names = clipNames(project);
  const nameOf = (id: ClipId) => names.get(id) ?? id;
  const clips = new Map<ClipId, { clip: Clip; index: number }>();
  project.clips.forEach((clip, index) => clips.set(clip.id, { clip, index }));
  const duration = sceneDuration(project);
  const entries: TimelineEntry[] = [];

  // A clip that comes or goes without an animation.
  project.clips.forEach((clip, ci) => {
    const name = names.get(clip.id);
    if (name === undefined) return;
    if (!(clip.intro.kind !== 'none' && clip.intro.duration > TIME_EPSILON) && !clip.startsEmpty) {
      entries.push({
        start: clip.start,
        end: null,
        kind: 'appears',
        text: `${name}  appears`,
        path: `clips[${ci}]`,
        clips: [name],
      });
    }
    const animated = clip.outro.kind !== 'none' && clip.outro.duration > TIME_EPSILON;
    if (!animated && clip.end < duration - TIME_EPSILON) {
      entries.push({
        start: clip.end,
        end: null,
        kind: 'goes',
        text: `${name}  goes`,
        path: `clips[${ci}]`,
        clips: [name],
      });
    }
  });

  for (const { owner, window, path } of animationWindows(project)) {
    const where = path
      .map((part, k) => (typeof part === 'number' ? `[${part}]` : `${k === 0 ? '' : '.'}${part}`))
      .join('');
    const time = { start: window.start, end: window.end };
    if (owner.kind === 'relation') {
      const relation = project.relations.find((r) => r.id === owner.relationId)!;
      const from = nameOf(relation.fromClipId);
      const to = nameOf(relation.toClipId);
      entries.push({
        ...time,
        kind: 'relation',
        text: `${from} → ${to}  (${relation.style}, ${plural(relation.pairs.length, 'pair')})`,
        path: where,
        clips: [from, to],
      });
      continue;
    }
    const found = clips.get(owner.clipId);
    if (!found || !names.has(owner.clipId)) continue;
    const name = nameOf(owner.clipId);
    const { clip } = found;
    if (owner.kind !== 'action') {
      const spec = owner.kind === 'intro' ? clip.intro : clip.outro;
      entries.push({
        ...time,
        kind: owner.kind,
        text: `${name}  ${spec.kind}`,
        path: where,
        clips: [name],
      });
      continue;
    }
    const action = clip.actions.find((a) => a.id === owner.actionId)!;
    entries.push({
      ...time,
      kind: 'action',
      text: `${name}  ${actionWords(action)}`,
      path: where,
      clips: [name],
    });
  }

  if (project.camera) {
    const camera = project.camera;
    for (const move of movesInOrder(camera)) {
      const index = camera.moves.indexOf(move);
      const back = move.easing === 'there_and_back' || move.easing === 'there_and_back_with_pause';
      entries.push({
        start: move.start,
        end: move.start + move.duration,
        kind: 'camera',
        text: `camera → ${destinationWords(camera, move.to)}${back ? ' and back' : ''}`,
        path: `camera.moves[${index}]`,
        clips: [],
      });
    }
  }

  const marks = exportedMarks(project);
  const pauses = marks.filter((mark) => mark.kind === 'pause');
  for (const mark of marks) {
    const index = project.slides!.marks.indexOf(mark);
    const words = mark.text?.trim() ? ` · “${shortText(mark.text)}”` : '';
    // Where going on from a pause that skips its wait goes on from (D202).
    const skipped = skippedWait(project, mark);
    const skip = skipped ? ` (skips its wait to ${seconds(skipped.end)} s)` : '';
    entries.push({
      start: mark.time,
      end: null,
      kind: mark.kind,
      text:
        mark.kind === 'pause'
          ? `PAUSE ${pauses.indexOf(mark) + 1}${skip}${words}`
          : `NOTE${words || ' (no words)'}`,
      path: `slides.marks[${index}]`,
      clips: [],
    });
  }

  // In order of time; at one instant by rank, then by end; else as they were made (stable).
  const key = (time: number) => Math.round(time * 1e6);
  return entries
    .map((entry, order) => ({ entry, order }))
    .sort(
      (a, b) =>
        key(a.entry.start) - key(b.entry.start) ||
        RANK[a.entry.kind] - RANK[b.entry.kind] ||
        key(a.entry.end ?? a.entry.start) - key(b.entry.end ?? b.entry.start) ||
        a.order - b.order,
    )
    .map(({ entry }) => entry);
}

/** The timeline as lines: the time in a column, what happens, where it is in the file. */
export function timelineWords(project: Project): string[] {
  const entries = timelineEntries(project);
  const width = Math.max(0, ...entries.map((entry) => entryTime(entry).length));
  return entries.map((entry) => `${entryTime(entry).padEnd(width)}  ${entry.text}  ${entry.path}`);
}

/** The clips as the page names them, each with where it is in the file, its time on screen and
 * its formula: `eq1  clips[0]  0.00–5.00 s  formulas[0] math “x^2”`, no line longer than `width`
 * when it can be helped (a long source is cut). In the order of their names (the order the clips
 * start in). */
export function clipLines(project: Project, width = 94): string[] {
  const names = clipNames(project);
  const rows: [string, string, string, string, string][] = [];
  for (const [id, name] of names) {
    const index = project.clips.findIndex((clip) => clip.id === id);
    const clip = project.clips[index]!;
    const fi = project.formulas.findIndex((formula) => formula.id === clip.formulaId);
    const formula = project.formulas[fi]!;
    rows.push([
      name,
      `clips[${index}]`,
      entryTime({ start: clip.start, end: clip.end }),
      `formulas[${fi}] ${formula.kind}`,
      formula.source,
    ]);
  }
  const widths = [0, 1, 2, 3].map((column) =>
    Math.max(0, ...rows.map((row) => row[column]!.length)),
  );
  return rows.map((row) => {
    const head = row
      .slice(0, 4)
      .map((cell, column) => (column < 3 ? cell.padEnd(widths[column]!) : cell))
      .join('  ');
    const source = row[4].trim();
    if (source === '') return head;
    return `${head} “${shortText(source, Math.max(12, width - head.length - 4))}”`;
  });
}

/** The glyphs of every formula on screen, by the indices that `glyphs: [3, 4]` names: a line
 * per formula with the labels of its glyphs, `eq1:  0 a  1 x  2 ²  3 +  4 b …`, wrapped at
 * `width` columns. Formulas never rendered have none. */
export function glyphLines(project: Project, width = 92): string[] {
  const lines: string[] = [];
  const used = new Set(project.clips.map((clip) => clip.formulaId));
  for (const formula of project.formulas) {
    const glyphs = formula.snapshot?.glyphs ?? [];
    if (!used.has(formula.id) || glyphs.length === 0) continue;
    const head = `${formula.name}:`;
    let line = head;
    for (const [index, glyph] of glyphs.entries()) {
      const label = glyph.label.replace(/\s+/g, ' ').trim() || '?';
      const cell = `${index} ${label.length > 8 ? `${label.slice(0, 7)}…` : label}`;
      if (line.length + 2 + cell.length > width && line !== head) {
        lines.push(line);
        line = ' '.repeat(Math.min(head.length, 12));
      }
      line += `  ${cell}`;
    }
    lines.push(line);
  }
  return lines;
}
