/* What the Animations panel is showing, in one line above its header (D28): the kind of object
 * and where it is — "CLIP · Track 2 · 0.00–3.00 s". A relation of two clips that have several
 * says which it is: "RELATION 2 OF 3 · f1 → f2 · 2.00–3.00 s". Pure. */
import {
  relationWindow,
  type Clip,
  type ClipAction,
  type Formula,
  type Project,
  type Relation,
} from '../../model';
import { relationTitle } from '../relations/relationOps';
import { animationName } from './blockKinds';

export interface Context {
  /** The kind of object, shown in capitals: "Clip", "Animation block", "Relation" ("Relation 2 of
   * 3" among several of the same two clips), "Formula". */
  kind: string;
  details: string[];
}

const span = (start: number, end: number) => `${start.toFixed(2)}–${end.toFixed(2)} s`;

const trackName = (project: Project, clip: Clip) =>
  project.tracks.find((t) => t.id === clip.trackId)?.name ?? '?';

const formulaName = (project: Project, clip: Clip | undefined) =>
  project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';

export function clipContext(project: Project, clip: Clip): Context {
  return { kind: 'Clip', details: [trackName(project, clip), span(clip.start, clip.end)] };
}

export function blockContext(project: Project, clip: Clip, action: ClipAction): Context {
  const start = clip.start + action.start;
  return {
    kind: 'Animation block',
    details: [
      animationName(action),
      `on ${formulaName(project, clip)}`,
      span(start, start + action.duration),
    ],
  };
}

export function relationContext(project: Project, relation: Relation): Context {
  const from = project.clips.find((c) => c.id === relation.fromClipId);
  const to = project.clips.find((c) => c.id === relation.toClipId);
  const details = [`${formulaName(project, from)} → ${formulaName(project, to)}`];
  if (to) {
    const window = relationWindow(relation, to);
    details.push(span(window.start, window.end));
  }
  return { kind: relationTitle(project, relation), details };
}

export function formulaContext(project: Project, formula: Formula): Context {
  const clips = project.clips.filter((c) => c.formulaId === formula.id).length;
  return {
    kind: 'Formula',
    details: [clips === 0 ? 'not on the timeline' : `on ${clips} clip${clips === 1 ? '' : 's'}`],
  };
}
