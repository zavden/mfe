/* Which formulas on the timeline an export can use, from the render store. Pure. */
import {
  isCurrentRender,
  isTextBoxes,
  textCountedByBoxes,
  textDrawing,
  textEnvironment,
  textShapedFor,
  textSignatureFor,
  type CompanionState,
  type PangoState,
  type ResolvedFormulas,
} from '../../engine';
import { isBlank, TARGET_NAMES, type Formula, type Project, type Target } from '../../model';
import type { FormulaRenderEntry } from '../../store';

/** Font texts whose look in Manim the editor cannot vouch for now. They are the ones a scene for
 * `target` checks itself when it runs (`textSignatureFor`); the editor would compare the text
 * environment of this machine (its fonts, the versions of Manim, Pango and what they stand on,
 * the locale) with the one they were shaped in, and either has no companion to ask (`unknown`) or
 * is told it is another (`changed`: something changed here, or the text was shaped on another
 * machine). Never a reason to hold an export back (D82): a
 * dialog lists them and goes on. A text the other library shaped, and one without a fingerprint,
 * are the generator's to report (`export-text-other-library`, `export-text-unchecked`). */
export interface TextVerification {
  unknown: Formula[];
  changed: Formula[];
}

export function textVerification(
  project: Project,
  resolved: ResolvedFormulas,
  companion: CompanionState,
  target: Target,
): TextVerification {
  const used = new Set(project.clips.map((clip) => clip.formulaId));
  const out: TextVerification = { unknown: [], changed: [] };
  for (const formula of project.formulas) {
    if (formula.kind !== 'text' || !used.has(formula.id) || isBlank(formula)) continue;
    const render = resolved.get(formula.id)?.render;
    if (!render || textSignatureFor(formula, render, target) === null) continue;
    const environment = textEnvironment(render, companion, target);
    if (environment !== 'same') out[environment].push(formula);
  }
  return out;
}

/** The words for it, one note per list. `scene`: the reader gets the scene itself, whose own
 * check speaks when it runs; a render by the companion keeps that on its log, so the note does
 * not promise it. `worker`: where the companion's text worker for `target` stands (`pangoState`):
 * a text nobody compared yet is not one nobody can compare. */
export function textVerificationNotes(
  verification: TextVerification,
  target: Target,
  scene: boolean,
  worker: PangoState = 'none',
): string[] {
  const notes: string[] = [];
  const say = (texts: Formula[], one: string, many: string) => {
    if (texts.length === 0) return;
    const names = texts.map((formula) => `"${formula.name}"`).join(', ');
    const single = texts.length === 1;
    notes.push(`${single ? 'Font text' : 'Font texts'} ${names}: ${single ? one : many}`);
  };
  const library = TARGET_NAMES[target];
  say(
    verification.changed,
    'shaped with other fonts, or other versions of Manim or Pango, than this machine has now ' +
      '(they changed here, or the text comes from another machine), so Manim may draw it ' +
      'differently from the preview. Refresh appearance, in its editor, shapes it again.' +
      (scene ? ' The scene warns when it runs if the text differs.' : ''),
    'shaped with other fonts, or other versions of Manim or Pango, than this machine has now ' +
      '(they changed here, or the texts come from another machine), so Manim may draw them ' +
      'differently from the preview. Refresh appearance, in their editor, shapes them again.' +
      (scene ? ' The scene warns when it runs if a text differs.' : ''),
  );
  const why =
    worker === 'unused' || worker === 'preparing'
      ? `not compared with the fonts of this machine yet: the companion is starting its text worker for ${library}.`
      : worker === 'failed'
        ? `not compared with the fonts of this machine: the companion could not start its text worker for ${library}.`
        : `not compared with the fonts of this machine: no companion that shapes text for ${library} is running.`;
  say(
    verification.unknown,
    why +
      (scene ? ' The scene checks it when it runs, and warns if Manim draws it differently.' : ''),
    why +
      (scene
        ? ' The scene checks them when it runs, and warns if Manim draws one differently.'
        : ''),
  );
  return notes;
}

export interface FormulaReadiness {
  /** No LaTeX: the exports leave their clips out. */
  empty: Formula[];
  /** Still rendering (or not started yet): wait for them. */
  pending: Formula[];
  /** Their render does not belong to their current LaTeX: it failed, or it is the one of an
   * earlier version (an export would address glyphs that are not there). */
  stale: Formula[];
  /** Font texts drawn without their real glyphs, and settled so: as placeholder boxes, or with
   * the shape the other library gave them. Nothing is on its way: no companion shapes them. */
  unshaped: Formula[];
}

export function formulaReadiness(
  project: Project,
  entries: Readonly<Record<string, FormulaRenderEntry | undefined>>,
  resolved: ResolvedFormulas,
): FormulaReadiness {
  const used = new Set(project.clips.map((c) => c.formulaId));
  const out: FormulaReadiness = { empty: [], pending: [], stale: [], unshaped: [] };
  for (const f of project.formulas) {
    if (!used.has(f.id)) continue;
    const entry = entries[f.id];
    const current = resolved.get(f.id);
    if (isBlank(f)) out.empty.push(f);
    else if (entry?.status === 'error') out.stale.push(f);
    else if (!current || !entry || entry.status !== 'ok') out.pending.push(f);
    else if (isCurrentRender(current.render, f, project.meta)) continue;
    else if (f.kind === 'text' && textDrawing(f, current.render, project.meta) !== 'stale')
      out.unshaped.push(f);
    else out.stale.push(f);
  }
  return out;
}

/** Whether a font text can be drawn or written at all: a shape of its current source, font and
 * size is saved, by either library. The preview draws it from that shape, the videos with it, and
 * the generator writes it (`export-text-other-library` when the shape is the other library's). */
export function textHasShape(formula: Formula, resolved: ResolvedFormulas): boolean {
  return (
    formula.kind === 'text' && textShapedFor(formula, resolved.get(formula.id)?.render) !== null
  );
}

/** Whether the generator writes a font text: it has a shape of its current source, font and
 * size, or nothing shaped it and its glyphs are counted by its placeholder boxes
 * (`export-text-unshaped`). */
export function textIsWritten(formula: Formula, project: Project, resolved: ResolvedFormulas) {
  return (
    textHasShape(formula, resolved) ||
    (formula.kind === 'text' && textCountedByBoxes(formula, resolved.get(formula.id), project.meta))
  );
}

/** What the Python dialog does with the formulas on the timeline: it waits for the `pending`
 * ones, and Copy and Download are off while some are `unwritten`: the stale ones, but for a font
 * text the generator writes all the same and says what it is: one that keeps a saved shape of
 * its current source, font and size (shaped by the other library while the project was made for
 * it, say), and one nothing has shaped, written by its boxes. */
export interface PythonReadiness {
  pending: Formula[];
  unwritten: Formula[];
}

export function pythonReadiness(
  project: Project,
  entries: Readonly<Record<string, FormulaRenderEntry | undefined>>,
  resolved: ResolvedFormulas,
): PythonReadiness {
  const { pending, stale, unshaped } = formulaReadiness(project, entries, resolved);
  return {
    pending,
    unwritten: [...stale, ...unshaped].filter(
      (formula) => !textIsWritten(formula, project, resolved),
    ),
  };
}

/** What the video dialog does with the formulas on the timeline. */
export interface VideoReadiness {
  /** Rendering, or rendered from an earlier LaTeX (the new render is on its way): Export waits. */
  waiting: Formula[];
  /** Their current LaTeX fails and they have a last good render: Browser and ffmpeg draw it;
   * Render with Manim, which gets the LaTeX, is off. */
  failing: Formula[];
  /** Their current LaTeX fails and they never rendered: left out; Render with Manim is off. */
  missing: Formula[];
  /** No LaTeX: left out. */
  empty: Formula[];
  /** Font texts on screen as placeholder boxes: what Browser and ffmpeg would film. */
  boxes: Formula[];
  /** Of `boxes`, the ones the generator leaves out of the Python (`textIsWritten`: nothing
   * counts their glyphs as they stand). Render with Manim, which gets that Python, is off for
   * them, as Copy and Download are in the Python dialog. */
  uncounted: Formula[];
  /** Of `boxes`, the ones drawn where the glyphs of their saved shape were, its geometry not
   * being at hand: the Python counts their glyphs by that shape, not one per character. */
  savedBoxes: Formula[];
}

export function videoReadiness(
  project: Project,
  entries: Readonly<Record<string, FormulaRenderEntry | undefined>>,
  resolved: ResolvedFormulas,
): VideoReadiness {
  const { empty, pending, stale, unshaped } = formulaReadiness(project, entries, resolved);
  const failed = (f: Formula) => entries[f.id]?.status === 'error';
  /** On screen as the boxes of the text as it stands: settled so, or kept so by a companion
   * that then refused to shape it (a font it does not have). */
  const boxed = (f: Formula) => {
    const render = resolved.get(f.id)?.render;
    return (
      f.kind === 'text' &&
      !!render &&
      isTextBoxes(render) &&
      textDrawing(f, render, project.meta) !== 'stale'
    );
  };
  const boxes = [...unshaped, ...stale.filter(failed)].filter(boxed);
  return {
    waiting: [...pending, ...stale.filter((f) => !failed(f))],
    failing: stale.filter((f) => failed(f) && resolved.has(f.id)),
    missing: stale.filter((f) => failed(f) && !resolved.has(f.id)),
    empty,
    boxes,
    uncounted: boxes.filter((f) => !textIsWritten(f, project, resolved)),
    savedBoxes: boxes.filter(
      (f) =>
        f.kind === 'text' &&
        textDrawing(f, resolved.get(f.id)!.render, project.meta) === 'saved-boxes',
    ),
  };
}
