/* Creator operations on the project: create, rename, duplicate, delete. Each is one undo step. */
import {
  attachTargets,
  clipWindow,
  defaultIntro,
  groupCopies,
  introsOf,
  newId,
  relationWindow,
  takesIntro,
  type Clip,
  type ClipId,
  type Formula,
  type FormulaId,
  type FormulaKind,
  type Project,
  type Relation,
  type IntroKind,
  type IntroSpec,
  nextFormulaName,
} from '../../model';
import { history, useProjectStore, useRenderStore, useUiStore } from '../../store';
import { confirmDelete } from '../project/dialogStore';
import { currentDocumentCheck } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { newClipAnimations, usePreferences } from '../preferences';
import { createEditorFormula } from './newFormula';
import {
  hasOwnScale,
  planStandardScale,
  scaleChanges,
  type ScaleKind,
  type StandardScaleChange,
} from './standardScale';
import { MIN_DURATION } from '../project/defaultAnimations';
import { formulaSelection, pruneSelection, selectionOrder } from '../selection';
import {
  addClipAt,
  addClipIn,
  attachedClips,
  deleteClips,
  freedClips,
  heldRelations,
  regionClipBlocker,
} from '../timeline/clipOps';
import { freedEnds, reportFreed, reportHeld } from '../timeline/freedObjects';
import { DROPPED_CLIP_LENGTH } from '../timeline/layout';
import { useTimelineStore } from '../timeline/timelineStore';
import { INTRO_CHOICES } from '../animations/catalogue';
import type { SourceDraft } from './sources';
import { getActivePalette } from '../colors/paletteStore';
import { textSourceLock } from '../text/textCompositionModel';

function textMutationBlocked(project: Project, formula: Formula): boolean {
  const message = formula.kind === 'text' ? textSourceLock(project, formula.id) : null;
  if (!message) return false;
  notify({ kind: 'info', title: 'Text is used on a locked track', message });
  return true;
}

// --- Names -------------------------------------------------------------------------

/** Python keywords: a formula name becomes a variable name in the exported script. */
const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Why `name` cannot be used for a formula, or null when it can. A formula name is the base of
 * a Python variable, so it must be an identifier and unique (validateProject: duplicate-name). */
export function validateFormulaName(
  name: string,
  formulas: readonly Formula[],
  selfId: FormulaId | null,
): string | null {
  if (name.trim() === '') return 'The name cannot be empty.';
  if (name !== name.trim()) return 'The name cannot start or end with spaces.';
  if (!IDENTIFIER.test(name)) {
    return 'Use letters, digits and "_", not starting with a digit: the name becomes a Python variable.';
  }
  if (PYTHON_KEYWORDS.has(name)) return `"${name}" is a Python keyword.`;
  if (formulas.some((f) => f.id !== selfId && f.name === name)) {
    return `Another formula is already called "${name}".`;
  }
  return null;
}

/** The decimal string plus one, exact for any length and keeping the width: "007" → "008",
 * "99" → "100" (a number stops counting at 2^53, and a name may carry a longer one). */
function incrementDigits(digits: string): string {
  const out = digits.split('');
  let i = out.length - 1;
  while (i >= 0 && out[i] === '9') out[i--] = '0';
  if (i < 0) out.unshift('1');
  else out[i] = String(Number(out[i]) + 1);
  return out.join('');
}

/** A free name derived from `name`: "f1" → "f2", "f" → "f2", "f007" → "f008" (numbers keep
 * their stem and width). */
export function duplicateName(name: string, formulas: readonly Formula[]): string {
  const used = new Set(formulas.map((f) => f.name));
  const match = /^(.*?)(\d+)$/.exec(name);
  const stem = match ? match[1]! : name;
  let digits = match ? match[2]! : '1';
  // The candidates never repeat, so one of the first `used.size + 1` is free.
  for (;;) {
    digits = incrementDigits(digits);
    if (!used.has(`${stem}${digits}`)) return `${stem}${digits}`;
  }
}

/** A free name from a title, as a Python identifier: "Euler's formula" → "eulers_formula",
 * numbered when taken ("eulers_formula_2"). */
export function formulaNameFrom(title: string, formulas: readonly Formula[]): string {
  let name = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f'’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (name === '') return nextFormulaName('math', formulas);
  if (/^\d/.test(name)) name = `f_${name}`;
  if (PYTHON_KEYWORDS.has(name)) name = `${name}_`;
  const used = new Set(formulas.map((f) => f.name));
  if (!used.has(name)) return name;
  for (let n = 2; ; n++) if (!used.has(`${name}_${n}`)) return `${name}_${n}`;
}

// --- Operations ---------------------------------------------------------------------

/** Add an object after the last one (the next tag colour) and select it, as one undo step.
 * Returns its id. */
function addFormula(fields: {
  kind: FormulaKind;
  name: string;
  source?: string;
  packages?: string[];
}): FormulaId {
  const project = useProjectStore.getState().project;
  const { kind, ...rest } = fields;
  const formula = createEditorFormula(
    kind,
    project.formulas,
    usePreferences.getState().standardScale,
    rest,
    getActivePalette()?.source.colors,
  );
  useProjectStore.getState().update((draft) => {
    draft.formulas.push(formula);
  });
  useUiStore.getState().select({ kind: 'formula', id: formula.id });
  return formula.id;
}

/** Add an empty object of a kind (a formula unless said otherwise), named after the kind, and
 * select it. Returns its id. */
export function createNewFormula(kind: FormulaKind = 'math'): FormulaId {
  const formulas = useProjectStore.getState().project.formulas;
  return addFormula({ kind, name: nextFormulaName(kind, formulas) });
}

/** Add a formula made from a template — its LaTeX (final: the placeholders already replaced)
 * and packages, and `formulaName` or else a name from the template's title — and select it.
 * Returns its id. */
export function createFormulaFromTemplate(
  template: { name: string; latex: string; packages: readonly string[] },
  formulaName?: string,
): FormulaId {
  return addFormula({
    kind: 'math',
    name:
      formulaName ?? formulaNameFrom(template.name, useProjectStore.getState().project.formulas),
    source: template.latex,
    packages: [...template.packages],
  });
}

/** Put a clip of each formula on the timeline at the playhead, without dragging (the formula's
 * menu, the Animations panel): one undo step, and the new clips are selected. While a region is
 * marked on the timeline (D180) each clip takes the region instead, on a track of its own
 * (`addClipIn`) — and none is made when the region is too short for a clip. */
export function addToTimeline(ids: readonly FormulaId[]): void {
  if (ids.length === 0) return;
  const time = useUiStore.getState().time;
  const { region } = useTimelineStore.getState();
  const blocker = region && regionClipBlocker(region);
  if (blocker) {
    notify({ kind: 'warning', title: 'No room in the region', message: blocker });
    return;
  }
  const added: ClipId[] = [];
  useProjectStore.getState().update((draft) => {
    for (const id of ids) {
      const own = draft.formulas.find((f) => f.id === id)?.intro ?? null;
      const clip = region
        ? addClipIn(draft, id, region, newClipAnimations(region.end - region.start, own))
        : addClipAt(draft, id, time, newClipAnimations(DROPPED_CLIP_LENGTH, own));
      added.push(clip.id);
    }
  });
  useUiStore.getState().select({ kind: 'clips', ids: added });
}

/** The intro «Default» gives the clips of `formula` (`formula.intro` null): the editor's preference
 * (Edit → Always add intro) when the object takes it as it is (`takesIntro`), else none — a line
 * is never grown, nor faded with a scale. */
export function defaultIntroOf(
  formula: Formula,
  autoIntro: boolean,
  preferred: IntroSpec,
): IntroSpec {
  return autoIntro && takesIntro(formula, preferred) ? preferred : defaultIntro('none');
}

/** The intro a formula gives its new clips as it stands: its own, else what «Default» gives it
 * (`defaultIntroOf`). */
export function effectiveIntro(formula: Formula): IntroSpec {
  if (formula.intro) return formula.intro;
  const { autoIntro, intro } = usePreferences.getState();
  return defaultIntroOf(formula, autoIntro, intro);
}

/** Whether a clip's intro is still the one its formula gave it (same kind and duration): a clip
 * retouched in Timing is left alone when the formula's intro changes. */
function stillHas(clip: Clip, intro: IntroSpec): boolean {
  if (clip.intro.kind !== intro.kind) return false;
  return intro.kind === 'none' || Math.abs(clip.intro.duration - intro.duration) < 1e-6;
}

const cloneIntro = (intro: IntroSpec): IntroSpec => ({ ...intro, shift: [...intro.shift] });

/** Inside a project update: what new clips of a formula start with becomes the intro one of its
 * clips was just given from that clip's menu (D120), so that «Appears with» does not say one
 * thing and the clip show another. Nothing changes when it says so already (the formula's own
 * intro or, for "Default", the preference's), and the formula's other clips stay as they are. */
export function recordClipIntro(draft: Project, clip: Clip): void {
  const formula = draft.formulas.find((f) => f.id === clip.formulaId);
  if (!formula || stillHas(clip, effectiveIntro(formula))) return;
  formula.intro = cloneIntro(clip.intro);
}

/** How long an intro `clip` can take as it stands: up to its outro, and not into its first
 * animation block nor into the first window of a relation that leaves it (the glyphs an incoming
 * relation brings stay out of the intro anyway). Nothing else of the clip moves to make room. */
function introRoom(project: Project, clip: Clip): number {
  let end = clip.end - clip.outro.duration;
  for (const action of clip.actions) end = Math.min(end, clip.start + action.start);
  for (const relation of project.relations) {
    if (relation.fromClipId !== clip.id) continue;
    const to = project.clips.find((c) => c.id === relation.toClipId);
    if (to) end = Math.min(end, relationWindow(relation, to).start);
  }
  return Math.max(0, end - clip.start);
}

/** Inside a project update: set what new clips of a formula start with (`next`; null = the
 * preference) and bring along its clips that still had the previous intro. With `onlyDuration`
 * the kind is the same, so those clips keep their other options. A clip takes the new intro only
 * as far as it fits (`introRoom`: its blocks, outgoing relations and outro stay where they are),
 * or stays as it is when nothing fits; a clip on a locked track stays too. Returns how many
 * stayed for their lock (`introStayedNotice` says so). */
export function applyFormulaIntro(
  draft: Project,
  id: FormulaId,
  next: IntroSpec | null,
  onlyDuration = false,
): number {
  const target = draft.formulas.find((f) => f.id === id);
  if (!target) return 0;
  const before = effectiveIntro(target);
  const after = next ?? effectiveIntro({ ...target, intro: null });
  const locked = new Set(draft.tracks.filter((t) => t.locked).map((t) => t.id));
  let stayed = 0;
  target.intro = next ? cloneIntro(next) : null;
  for (const clip of draft.clips) {
    if (clip.formulaId !== id || !stillHas(clip, before)) continue;
    if (locked.has(clip.trackId)) {
      stayed += 1;
      continue;
    }
    const duration = Math.min(after.duration, introRoom(draft, clip));
    if (after.kind !== 'none' && duration < MIN_DURATION) continue;
    clip.intro = onlyDuration ? { ...clip.intro, duration } : { ...cloneIntro(after), duration };
  }
  return stayed;
}

/** Say that `stayed` clips of the object named `name` kept their intro for their lock. */
export function introStayedNotice(name: string, stayed: number): void {
  if (stayed <= 0) return;
  notify({
    kind: 'info',
    title: stayed === 1 ? '1 clip stayed' : `${stayed} clips stayed`,
    message: `“${name}”: a clip on a locked track keeps its intro.`,
  });
}

/** `applyFormulaIntro` as one undo step, with its notice. */
function changeFormulaIntro(id: FormulaId, next: IntroSpec | null, onlyDuration = false): void {
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === id);
  if (!formula) return;
  let stayed = 0;
  useProjectStore.getState().update((draft) => {
    stayed = applyFormulaIntro(draft, id, next, onlyDuration);
  });
  introStayedNotice(formula.name, stayed);
}

/** The intro new clips of a formula start with: a kind's defaults (`defaultIntro`), or '' to
 * follow the editor's preference; its clips that still had the previous intro follow. A kind the
 * object does not take (`introsOf`: GrowArrow is an arrow's) changes nothing. */
export function setFormulaIntro(id: FormulaId, kind: string): void {
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === id);
  if (!formula) return;
  if (kind === '') changeFormulaIntro(id, null);
  else if (introsOf(formula).some((taken) => taken === kind)) {
    changeFormulaIntro(id, defaultIntro(kind as IntroKind));
  }
}

/** The duration of the intro a formula chose (not for "Default" or none); its clips that still
 * had the previous duration follow, keeping their other options. */
export function setFormulaIntroDuration(id: FormulaId, seconds: number): void {
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === id);
  if (!formula?.intro || formula.intro.kind === 'none') return;
  if (!Number.isFinite(seconds) || seconds < MIN_DURATION) return;
  changeFormulaIntro(id, { ...formula.intro, duration: seconds }, true);
}

/** The label of the formula editor's "Default" intro choice: what the preference gives now, to an
 * object that `takes` it (`takesIntro`), else none. */
export function defaultIntroLabel(
  autoIntro: boolean,
  intro: IntroSpec,
  takes: (intro: IntroSpec) => boolean = () => true,
): string {
  const kind = autoIntro && takes(intro) ? intro.kind : 'none';
  const label =
    kind === 'none' ? 'none' : (INTRO_CHOICES.find((c) => c.value === kind)?.label ?? kind);
  return `Default (${label})`;
}

export function renameFormula(id: FormulaId, name: string): string | null {
  const project = useProjectStore.getState().project;
  const error = validateFormulaName(name, project.formulas, id);
  if (error) return error;
  useProjectStore.getState().update((draft) => {
    const formula = draft.formulas.find((f) => f.id === id);
    if (formula) formula.name = name;
  });
  return null;
}

/** Copy a formula (snapshot and glyph colours included) right after the original. */
export function duplicateFormula(id: FormulaId): FormulaId | null {
  return duplicateFormulas([id])[0] ?? null;
}

/** The copies Duplicate makes of the formulas `ids` among `formulas`, in the order of `formulas`
 * (original id → copy): each a deep copy of its original — source, size, colour, glyph colours
 * and hidden glyphs, tag, packages, intro, start position, the fields of its kind, snapshot —
 * with a new id and the next free name after the original's (`duplicateName`, the copies' names
 * taken one after the other). Ids that are not formulas are left out. */
export function formulaCopies(
  formulas: readonly Formula[],
  ids: Iterable<FormulaId>,
): Map<FormulaId, Formula> {
  const wanted = new Set(ids);
  const used = [...formulas];
  const copies = new Map<FormulaId, Formula>();
  for (const source of formulas) {
    if (!wanted.has(source.id)) continue;
    const copy: Formula = {
      ...structuredClone(source),
      id: newId('f'),
      name: duplicateName(source.name, used),
    };
    copies.set(source.id, copy);
    used.push(copy);
  }
  return copies;
}

/** Inside a project update: each copy (`copies`: original id → copy) right after its original in
 * the Creator's list, and, when the original is in a group, in that group right after it. */
export function insertFormulaCopies(draft: Project, copies: ReadonlyMap<FormulaId, Formula>): void {
  draft.formulas = draft.formulas.flatMap((formula) => {
    const copy = copies.get(formula.id);
    return copy ? [formula, copy] : [formula];
  });
  groupCopies(draft, new Map([...copies].map(([id, copy]) => [id, copy.id])));
}

/** Copy the formulas `ids` as Duplicate does (`formulaCopies`, `insertFormulaCopies`), as one
 * undo step, with `alsoWrite` writing into that step what goes with the copies (Unlink formula:
 * the clips that take them). Each copy starts with the render its original has (`seedCopies` of
 * the render store): what draws it does not wait for a render of its own. A drag still held is
 * given up first. Returns original id → copy; empty, and no step, when none of `ids` is a
 * formula. Selects nothing. */
export function addFormulaCopies(
  ids: readonly FormulaId[],
  alsoWrite?: (draft: Project, copies: ReadonlyMap<FormulaId, Formula>) => void,
): Map<FormulaId, Formula> {
  history.cancelForeignGesture();
  const copies = formulaCopies(useProjectStore.getState().project.formulas, ids);
  if (copies.size === 0) return copies;
  useRenderStore.getState().seedCopies(copies);
  useProjectStore.getState().update((draft) => {
    insertFormulaCopies(draft, copies);
    alsoWrite?.(draft, copies);
  });
  return copies;
}

/** Copy the selected formulas together, one history step, and select the copies in the order of
 * the Creator's list (`selectionOrder`: a group of formulas changes it; audit B1-01). Returns the
 * copies in that order. */
export function duplicateFormulas(ids: readonly FormulaId[]): FormulaId[] {
  const copies = addFormulaCopies(ids);
  if (!copies.size) return [];
  const made = new Set([...copies.values()].map((copy) => copy.id));
  const selected = selectionOrder(useProjectStore.getState().project).filter((id) => made.has(id));
  useUiStore.getState().select(formulaSelection(selected, selected));
  return selected;
}

export interface FormulaUsage {
  clips: Clip[];
  /** Clips of other formulas attached to those (`clip.attach`): they go with them. */
  attached: Clip[];
  relations: Relation[];
}

/** The clips of a formula, the objects attached to them and the relations of all of those. */
export function formulaUsage(project: Project, id: FormulaId): FormulaUsage {
  return formulasUsage(project, new Set([id]));
}

/** The clips of several formulas, the objects attached to them and the relations of all of
 * those, each listed once. */
export function formulasUsage(project: Project, ids: ReadonlySet<FormulaId>): FormulaUsage {
  const clips = project.clips.filter((c) => ids.has(c.formulaId));
  const attached = attachedClips(project, new Set(clips.map((c) => c.id)));
  const clipIds = new Set([...clips, ...attached].map((c) => c.id));
  const relations = project.relations.filter(
    (r) => clipIds.has(r.fromClipId) || clipIds.has(r.toClipId),
  );
  return { clips, attached, relations };
}

const seconds = (t: number) => `${+t.toFixed(2)} s`;

/** Lines for the delete confirmation: what goes away with the formula. */
export function describeUsage(project: Project, usage: FormulaUsage): string[] {
  const trackName = new Map(project.tracks.map((t) => [t.id, t.name]));
  const clipName = new Map(
    project.clips.map((c) => [
      c.id,
      `${project.formulas.find((f) => f.id === c.formulaId)?.name ?? '?'} (${seconds(clipWindow(c).start)}–${seconds(clipWindow(c).end)})`,
    ]),
  );
  const lines = usage.clips.map(
    (c) => `Clip ${clipName.get(c.id)} on ${trackName.get(c.trackId) ?? 'a track'}`,
  );
  for (const c of usage.attached) {
    lines.push(
      `Clip ${clipName.get(c.id)} on ${trackName.get(c.trackId) ?? 'a track'}, attached to ${clipName.get((c.attach && attachTargets(c.attach)[0]?.clipId) ?? '') ?? '?'}`,
    );
  }
  for (const r of usage.relations) {
    const pairs = r.pairs.length;
    lines.push(
      `Relation ${clipName.get(r.fromClipId) ?? '?'} → ${clipName.get(r.toClipId) ?? '?'} (${pairs} glyph pair${pairs === 1 ? '' : 's'})`,
    );
  }
  return lines;
}

/** Delete a formula with its clips and their relations, after a confirmation whose button is
 * held down (like deleting a track); it lists what goes with the formula. Returns true when
 * deleted. */
export function deleteFormula(id: FormulaId): Promise<boolean> {
  return deleteFormulas([id]);
}

/** The question of the delete confirmation: how many of the `count` formulas are on the timeline. */
function deleteMessage(count: number, used: number): string {
  if (count === 1) {
    return used > 0
      ? 'The formula is used on the timeline. Deleting it also removes:'
      : 'It is not on the timeline: nothing else is removed.';
  }
  if (used === 0) return 'None of them is on the timeline: nothing else is removed.';
  const who = used === count ? 'They are' : used === 1 ? 'One of them is' : `${used} of them are`;
  return `${who} used on the timeline. Deleting them also removes:`;
}

/** The formulas of `formulas` whose deletion a relation a locked track holds stops
 * (`heldRelations`), under the name each is said by, with those relations. */
function formulasHeld(project: Project, formulas: readonly Formula[]): Map<string, Relation[]> {
  const kept = new Map<string, Relation[]>();
  for (const formula of formulas) {
    const clips = new Set(project.clips.filter((c) => c.formulaId === formula.id).map((c) => c.id));
    const held = heldRelations(project, clips);
    if (held.length > 0) kept.set(`“${formula.name}”`, held);
  }
  return kept;
}

/** Delete several formulas (the right-click menu of a selection) with their clips and the
 * relations of those clips, as one undo step, after one confirmation whose button is held down;
 * it lists everything that goes with them. Ids that are not formulas are ignored. A formula with
 * a clip whose relation a locked track holds stays (D34, D187: such a relation is not deleted),
 * and a notice says why, before any question; the others go. Returns true when deleted. */
export async function deleteFormulas(ids: readonly FormulaId[]): Promise<boolean> {
  const project = useProjectStore.getState().project;
  const wanted = new Set(ids);
  const asked = project.formulas.filter((f) => wanted.has(f.id));
  const kept = formulasHeld(project, asked);
  reportHeld(project, kept, 'formulas');
  const formulas = asked.filter((f) => !kept.has(`“${f.name}”`));
  if (formulas.length === 0) return false;
  const chosen = new Set(formulas.map((f) => f.id));
  const usage = formulasUsage(project, chosen);
  const used = new Set(usage.clips.map((c) => c.formulaId)).size;
  const count = formulas.length;
  const sameDocument = currentDocumentCheck();
  const ok = await confirmDelete({
    what: count === 1 ? 'formula' : `${count} formulas`,
    title: count === 1 ? `Delete "${formulas[0]!.name}"?` : `Delete ${count} formulas?`,
    message: deleteMessage(count, used),
    details: used > 0 ? describeUsage(project, usage) : undefined,
  });
  // The formulas that were asked about are of the document that was open then.
  if (!ok || !sameDocument()) return false;
  const before = useProjectStore.getState().project;
  // A relation or a lock may have come while the question was open: then nothing is deleted.
  const late = formulasHeld(
    before,
    before.formulas.filter((f) => chosen.has(f.id)),
  );
  reportHeld(before, late, 'formulas');
  if (late.size > 0) return false;
  const clipsOf = (p: Project) =>
    new Set(p.clips.filter((c) => chosen.has(c.formulaId)).map((c) => c.id));
  const freed = freedClips(before, clipsOf(before));
  useProjectStore.getState().update((draft) => {
    deleteClips(draft, clipsOf(draft), freedEnds(before));
    draft.formulas = draft.formulas.filter((f) => !chosen.has(f.id));
  });
  reportFreed(before, freed);
  const ui = useUiStore.getState();
  const left = pruneSelection(ui.selection, useProjectStore.getState().project);
  if (left !== ui.selection) ui.select(left);
  return true;
}

// --- Glyph colours ------------------------------------------------------------------

/** Colour the given canonical glyphs of a formula; `null` removes their own colour. */
export function setGlyphColors(
  id: FormulaId,
  indices: readonly number[],
  color: string | null,
): void {
  setGlyphColorsOf([{ id, glyphs: indices }], color);
}

/** Glyphs of one or several formulas: what an action of the multi-formula editor applies to. */
export interface FormulaGlyphs {
  id: FormulaId;
  glyphs: readonly number[];
}

/** Colour glyphs of several formulas at once (`null` removes their own colour), as one undo
 * step. */
export function setGlyphColorsOf(targets: readonly FormulaGlyphs[], color: string | null): void {
  if (targets.every((t) => t.glyphs.length === 0)) return;
  useProjectStore.getState().update((draft) => {
    for (const { id, glyphs } of targets) {
      const formula = draft.formulas.find((f) => f.id === id);
      if (!formula || textMutationBlocked(draft, formula)) continue;
      for (const i of glyphs) {
        if (color === null) delete formula.glyphColors[String(i)];
        else formula.glyphColors[String(i)] = color;
      }
    }
  });
}

/** Give glyphs of a formula each a colour of its own (`null`: the glyph loses its own), as one
 * undo step. Nothing is written, and no undo step added, when no glyph would change. Whether
 * anything changed. */
export function assignGlyphColors(
  id: FormulaId,
  colors: ReadonlyMap<number, string | null>,
): boolean {
  const { project } = useProjectStore.getState();
  const formula = project.formulas.find((f) => f.id === id);
  if (!formula) return false;
  const changes = [...colors].filter(
    ([glyph, color]) => (formula.glyphColors[String(glyph)] ?? null) !== color,
  );
  if (changes.length === 0 || textMutationBlocked(project, formula)) return false;
  useProjectStore.getState().update((draft) => {
    const target = draft.formulas.find((f) => f.id === id);
    if (!target) return;
    for (const [glyph, color] of changes) {
      if (color === null) delete target.glyphColors[String(glyph)];
      else target.glyphColors[String(glyph)] = color;
    }
  });
  return true;
}

export function clearAllGlyphColors(id: FormulaId): void {
  useProjectStore.getState().update((draft) => {
    const formula = draft.formulas.find((f) => f.id === id);
    if (formula && !textMutationBlocked(draft, formula)) formula.glyphColors = {};
  });
}

// --- Hidden glyphs -------------------------------------------------------------------

/** Hide (or show again) the given canonical glyphs at the start of every clip of a formula. */
export function setGlyphsHidden(id: FormulaId, indices: readonly number[], hidden: boolean): void {
  setGlyphsHiddenOf([{ id, glyphs: indices }], hidden);
}

/** Hide or show glyphs of several formulas at once, as one undo step. */
export function setGlyphsHiddenOf(targets: readonly FormulaGlyphs[], hidden: boolean): void {
  if (targets.every((t) => t.glyphs.length === 0)) return;
  useProjectStore.getState().update((draft) => {
    for (const { id, glyphs } of targets) {
      const formula = draft.formulas.find((f) => f.id === id);
      if (!formula || textMutationBlocked(draft, formula)) continue;
      const set = new Set(formula.hiddenGlyphs);
      for (const i of glyphs) {
        if (hidden) set.add(i);
        else set.delete(i);
      }
      formula.hiddenGlyphs = [...set].sort((a, b) => a - b);
    }
  });
}

/** Change a formula's own fields (tag, size, colour, name excluded) as one undo step. */
export function patchFormula(
  id: FormulaId,
  patch: Partial<Pick<Formula, 'tag' | 'fontSize' | 'color' | 'intro'>>,
): void {
  useProjectStore.getState().update((draft) => {
    const formula = draft.formulas.find((f) => f.id === id);
    if (
      formula &&
      (!(patch.color !== undefined || patch.fontSize !== undefined) ||
        !textMutationBlocked(draft, formula))
    )
      Object.assign(formula, patch);
  });
}

/** Give every object of a kind a scale (Preferences → Standard scale…, «Apply to all formulas» or
 * «… texts»): the font size a new one of the kind is born with at that scale, as one undo step.
 * What changes is `planStandardScale`'s, read from the project as it is now; the clips keep their
 * own scale and their animations. Returns how many objects changed. */
export function applyStandardScale(kind: ScaleKind, scale: number): number {
  const { changes } = planStandardScale(useProjectStore.getState().project.formulas, kind, scale);
  return writeFontSizes(changes);
}

/** Give the objects `ids` that have a scale of their own one scale (the Scale of «Edit
 * together», D155): each takes the font size of `scale`, as one undo step. A brace, a shape or a
 * line has no scale and is left out, as a font text on a locked track is (which the formula editor
 * would not change either: it says why). The clips keep their own scale and their animations.
 * Returns how many objects changed. */
export function setScaleOf(ids: readonly FormulaId[], scale: number): number {
  const { project } = useProjectStore.getState();
  const chosen = new Set(ids);
  const scaled = new Map(
    project.formulas.filter((f) => chosen.has(f.id) && hasOwnScale(f)).map((f) => [f.id, f]),
  );
  // Only an object that would change is asked about its lock (and said to be locked).
  const free = (change: StandardScaleChange) =>
    !textMutationBlocked(project, scaled.get(change.id)!);
  return writeFontSizes(scaleChanges([...scaled.values()], scale).filter(free));
}

/** Write the font sizes `changes` give, as one undo step (none when there is nothing to change).
 * How many objects changed. */
function writeFontSizes(changes: readonly StandardScaleChange[]): number {
  if (changes.length === 0) return 0;
  useProjectStore.getState().update((draft) => {
    for (const change of changes) {
      const formula = draft.formulas.find((f) => f.id === change.id);
      if (formula) formula.fontSize = change.to;
    }
  });
  return changes.length;
}

/** Commit an edited source draft (the editor's Apply: the source and the kind's own fields, a
 * formula's packages) as one undo step. */
export function applyFormulaSource(id: FormulaId, source: SourceDraft): void {
  useProjectStore.getState().update((draft) => {
    const formula = draft.formulas.find((f) => f.id === id);
    if (!formula || textMutationBlocked(draft, formula)) return;
    Object.assign(formula, source);
    // A field the draft leaves unset (a shape's fill colour) is absent from the object.
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) delete (formula as unknown as Record<string, unknown>)[key];
    }
  });
}
