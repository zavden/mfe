/* Colours in order (D129): the colours of glyphs copied one by one, in the order they are
 * clicked, and given in that order to other glyphs — whatever symbols those are. Where «Copy
 * colour sequence» (`colourSequence.ts`, D92) pairs the equal symbols of two Alt picks, this
 * pairs the first click with the first click: the «2» of a fraction with the «4» of another.
 *
 * A mode of the preview, in two steps. Copy (Shift+C): each click on a glyph of a formula or a
 * text on screen adds the colour it is seen in — its own, else its object's (`seenColour`) — to
 * a list; Backspace takes the last one off, Enter goes on to paste, Escape leaves with nothing.
 * Paste: each click gives a glyph the first colour left of the list, as a colour of its own;
 * Backspace takes the last one back, and the mode ends with the last colour — or with Escape,
 * which keeps what was pasted. The list is kept: Shift+V pastes it again, from its first colour.
 * Clicks only: no Alt pick and no rectangle while the mode is on (`usePreviewGestures.ts`).
 *
 * The list is values, not references: it outlives the glyphs it was read from, the playhead may
 * be anywhere at each click, and the project may be another one by the time it is pasted.
 *
 * One undo step. A pasted colour is the object's own (`Formula.glyphColors`, written through
 * `assignGlyphColors`), so it holds in every clip of that object. Each is written at its click
 * and joined to the step of the click before (`history.continueStep`): one undo takes the whole
 * paste back. Nothing is held open meanwhile — whatever else is edited between two clicks is a
 * step of its own, and the paste goes on as another step after it. When what was pasted is no
 * longer there (an undo, its formula deleted) the mode ends: `startColourOrderTracking`, which
 * also ends it when another project is opened. Another mode of the preview turning on ends it
 * too, as it ends any other (`previewModes.ts`).
 *
 * The functions above the store are pure; the rest reads and writes the stores. */
import { create } from 'zustand';
import { KINDS, type ClipId, type Formula, type FormulaId, type Project } from '../../model';
import { history, onProjectAmended, onProjectLoaded, useProjectStore } from '../../store';
import { announce } from '../announcer';
import { assignGlyphColors } from '../creator/formulaActions';
import { usePanels } from '../panelsStore';
import { keysSpoken, keysText } from '../platform';
import { notify } from '../project/noticeStore';
import { useGlyphPick } from './glyphPickStore';
import { endPreviewModes, registerPreviewMode } from './previewModes';

/** A glyph of a clip, as a click in the preview names it. */
export interface OrderGlyph {
  clipId: ClipId;
  /** Its canonical index. */
  glyph: number;
  /** Its symbol, as its render labels it ("x", "∑"; "?" when nobody could name it). */
  label: string;
}

/** A colour of the list: what the strip of the Animations panel shows as a chip. */
export interface OrderColour {
  /** The symbol of the glyph it was read from. */
  label: string;
  color: string;
}

/** A copied colour, with the glyph it was read from: outlined while the copy lasts. */
export interface CopiedColour extends OrderColour {
  clipId: ClipId;
  glyph: number;
}

/** A pasted colour: the glyph that took it, and the colour of its own it had before. */
export interface PastedColour {
  clipId: ClipId;
  formulaId: FormulaId;
  glyph: number;
  color: string;
  /** Null: it had none, and followed its object's. */
  previous: string | null;
}

/** The step the mode is in. In `paste`, the colours of `list` are given in order: the next one
 * is the one at `pasted.length`. */
export type ColourOrderPhase =
  | { step: 'copy'; copied: readonly CopiedColour[] }
  | { step: 'paste'; list: readonly OrderColour[]; pasted: readonly PastedColour[] };

/** A chip of the strip. */
export interface OrderChip extends OrderColour {
  /** Its place in the list, from 1. */
  number: number;
  /** Whether it is the colour the next click pastes. */
  next: boolean;
}

/** The colour a glyph is seen in, as its object has it: the glyph's own, else the object's. What
 * a clip adds over them (a tint of its own, a colour animation) is not read: the copy is of the
 * object, as the paste is. */
export function seenColour(formula: Pick<Formula, 'color' | 'glyphColors'>, glyph: number): string {
  return formula.glyphColors[String(glyph)] ?? formula.color;
}

/** The chips of the strip, left to right: every colour copied so far, or the ones still to
 * paste — the first of them the next —, each with the number it has in the list. */
export function orderChips(phase: ColourOrderPhase | null): OrderChip[] {
  if (!phase) return [];
  if (phase.step === 'copy') {
    return phase.copied.map(({ label, color }, index) => ({
      label,
      color,
      number: index + 1,
      next: false,
    }));
  }
  const done = phase.pasted.length;
  return phase.list.slice(done).map(({ label, color }, index) => ({
    label,
    color,
    number: done + index + 1,
    next: index === 0,
  }));
}

/** The glyphs to outline in the preview: the ones copied from, or the ones pasted on. */
export function orderGlyphs(phase: ColourOrderPhase | null): { clipId: ClipId; glyph: number }[] {
  if (!phase) return [];
  return (phase.step === 'copy' ? phase.copied : phase.pasted).map(({ clipId, glyph }) => ({
    clipId,
    glyph,
  }));
}

const colours = (count: number) => `${count} colour${count === 1 ? '' : 's'}`;

/** What the preview's hint says in each step. */
export function colourOrderHint(phase: ColourOrderPhase | null): string | null {
  if (!phase) return null;
  if (phase.step === 'copy') {
    const count = phase.copied.length;
    return count === 0
      ? 'Colours in order: click the glyphs to copy, one by one, in order · Enter then pastes them · Esc cancels'
      : `Colours in order: ${colours(count)} copied — click the next glyph · Enter to paste them · Backspace takes the last off · Esc cancels`;
  }
  const next = phase.list[phase.pasted.length];
  if (!next) return null;
  const back = phase.pasted.length > 0 ? ' · Backspace takes the last back' : '';
  return `Colours in order: click the glyph that takes colour ${phase.pasted.length + 1} of ${phase.list.length}, the one of “${next.label}”${back} · Esc ends`;
}

/** Whether every glyph the mode pasted on still has the colour it was given (the last one, for
 * a glyph pasted on twice): false once the paste was undone, its formula deleted or rendered
 * anew, or the glyph coloured by something else. */
export function pastedIntact(
  project: Pick<Project, 'formulas'>,
  pasted: readonly PastedColour[],
): boolean {
  const expected = new Map<string, PastedColour>();
  for (const entry of pasted) expected.set(`${entry.formulaId}:${entry.glyph}`, entry);
  const formulas = Array.isArray(project.formulas) ? project.formulas : [];
  return [...expected.values()].every(
    (entry) =>
      formulas.find((f) => f.id === entry.formulaId)?.glyphColors[String(entry.glyph)] ===
      entry.color,
  );
}

interface ColourOrderState {
  /** The step the mode is in; null while it is off. */
  phase: ColourOrderPhase | null;
  /** The list of the last copy, which «Paste colours in order» pastes again: symbols and
   * colours, with no reference to where they came from. Null until something is copied. */
  kept: readonly OrderColour[] | null;
}

export const useColourOrder = create<ColourOrderState>()(() => ({ phase: null, kept: null }));

/** The undo step the paste is being written as. */
const step = {
  /** The project the mode's last write left: while the project is still that very object,
   * nothing else was edited since, and the next write joins that step. */
  own: null as Project | null,
  /** Whether every write of this paste is in that one step: false once something else was
   * edited in between, and the paste is several steps. */
  whole: true,
  /** The mode is writing: the change of project is its own. */
  writing: false,
};

/** Run a write of the mode as part of the paste's undo step. */
function record<T>(write: () => T): T {
  const before = useProjectStore.getState().project;
  const mine = step.own !== null && before === step.own;
  step.writing = true;
  try {
    const result = mine ? history.continueStep(write) : write();
    const after = useProjectStore.getState().project;
    if (after !== before) {
      // A first step, or one that starts after something else was edited.
      if (!mine) step.whole = step.own === null;
      step.own = after;
    }
    return result;
  } finally {
    step.writing = false;
  }
}

/** Take the paste's step back for good (`history.retractStep`). Whether it did. */
function retract(): boolean {
  step.writing = true;
  try {
    if (!history.retractStep()) return false;
  } finally {
    step.writing = false;
  }
  step.own = null;
  return true;
}

/** Enter a step of the mode: the other modes of the preview end (`previewModes.ts`), the glyphs
 * picked with Alt are let go, and the Animations panel, where the strip is, opens if it was
 * folded. */
function enter(phase: ColourOrderPhase): void {
  endPreviewModes('colours');
  useGlyphPick.getState().clear();
  step.own = null;
  step.whole = true;
  useColourOrder.setState({ phase });
  // The colours taken are listed in the Animations panel, which is shown. Not in Zen mode: there
  // the panel would open over the Preview, where the glyphs are clicked (D188).
  const panels = usePanels.getState();
  if (panels.collapsed.animations && panels.strip === null) panels.toggle('animations');
}

/** Leave the mode. What was pasted stays, and so does the list of the last copy. */
export function leaveColourOrder(): void {
  if (useColourOrder.getState().phase) useColourOrder.setState({ phase: null });
}

registerPreviewMode('colours', leaveColourOrder, () => useColourOrder.getState().phase !== null);

/** Shift+C, «Copy colours in order…»: start a copy, with an empty list. In the copy step it
 * leaves the mode instead — the shortcut toggles, as the one of align by symbol does. */
export function startColourCopy(): void {
  if (useColourOrder.getState().phase?.step === 'copy') {
    leaveColourOrder();
    announce('Colours in order: cancelled');
    return;
  }
  enter({ step: 'copy', copied: [] });
  announce(
    keysSpoken(
      'Colours in order: click the glyphs to copy, one by one, in order; Enter then pastes them, Escape cancels',
    ),
  );
}

/** Enter in the copy step, Shift+V, «Paste colours in order»: start pasting, from the first
 * colour — the list being copied, which is kept from then on, or else the kept one. With
 * nothing to paste a notice says how a list is copied, and nothing changes. */
export function startColourPaste(): void {
  const { phase, kept } = useColourOrder.getState();
  if (phase?.step === 'copy' && phase.copied.length === 0) {
    notify({
      kind: 'info',
      title: 'Nothing copied yet',
      message: keysText(
        'Click a glyph in the preview to copy its colour, then press Enter to paste.',
      ),
    });
    return;
  }
  const list =
    phase?.step === 'copy' ? phase.copied.map(({ label, color }) => ({ label, color })) : kept;
  if (!list || list.length === 0) {
    notify({
      kind: 'info',
      title: 'No colours copied in order yet',
      message: keysText(
        'Press Shift+C and click, one by one, the glyphs whose colours to copy; Enter then ' +
          'pastes them, in that order, on the glyphs clicked next.',
      ),
    });
    return;
  }
  enter({ step: 'paste', list, pasted: [] });
  useColourOrder.setState({ kept: list });
  announce(
    `Colours in order: ${colours(list.length)} to paste; click the glyph that takes the first, of ${list[0]!.label}`,
  );
}

/** The object of the clip of `glyph`, when its glyphs take colours of their own. */
function formulaOf(glyph: OrderGlyph): Formula | null {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === glyph.clipId);
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  return formula && KINDS[formula.kind].glyphColors ? formula : null;
}

/** A click on a glyph in the preview while the mode is on: in the copy step its colour joins
 * the list (again, when it is already there); in the paste step it takes the next colour. */
export function clickColourGlyph(glyph: OrderGlyph): void {
  const { phase } = useColourOrder.getState();
  const formula = formulaOf(glyph);
  if (!phase || !formula) return;
  if (phase.step === 'copy') {
    const color = seenColour(formula, glyph.glyph);
    const copied = [...phase.copied, { ...glyph, color }];
    useColourOrder.setState({ phase: { step: 'copy', copied } });
    announce(`${glyph.label} copied, ${color}: ${colours(copied.length)}`);
    return;
  }
  const next = phase.list[phase.pasted.length];
  if (!next) return;
  const previous = formula.glyphColors[String(glyph.glyph)] ?? null;
  // A glyph that already has the colour as its own takes it without a write. One that cannot be
  // written (a text used on a locked track: its notice says so) leaves the colour in the list.
  if (
    previous !== next.color &&
    !record(() => assignGlyphColors(formula.id, new Map([[glyph.glyph, next.color]])))
  ) {
    return;
  }
  const pasted = [
    ...phase.pasted,
    {
      clipId: glyph.clipId,
      formulaId: formula.id,
      glyph: glyph.glyph,
      color: next.color,
      previous,
    },
  ];
  if (pasted.length === phase.list.length) {
    useColourOrder.setState({ phase: null });
    announce(`${colours(pasted.length)} pasted in order`);
    return;
  }
  useColourOrder.setState({ phase: { ...phase, pasted } });
  const after = phase.list[pasted.length]!;
  announce(`${glyph.label} takes ${next.color}; next, the colour of ${after.label}`);
}

/** Backspace: in the copy step the last colour leaves the list; in the paste step the last
 * glyph pasted on has again the colour it had, and its colour is the next to paste again. */
export function stepBackColourOrder(): void {
  const { phase } = useColourOrder.getState();
  if (!phase) return;
  if (phase.step === 'copy') {
    const last = phase.copied.at(-1);
    if (!last) return;
    useColourOrder.setState({ phase: { step: 'copy', copied: phase.copied.slice(0, -1) } });
    announce(`${last.label} taken off: ${colours(phase.copied.length - 1)}`);
    return;
  }
  const last = phase.pasted.at(-1);
  if (!last) return;
  if (last.previous !== last.color) {
    const written = phase.pasted.filter((entry) => entry.previous !== entry.color).length;
    const alone = written === 1 && step.whole && useProjectStore.getState().project === step.own;
    // The only colour the paste has written: without it there is no step at all.
    const restored =
      (alone && retract()) ||
      record(() => assignGlyphColors(last.formulaId, new Map([[last.glyph, last.previous]])));
    if (!restored) return;
  }
  useColourOrder.setState({ phase: { ...phase, pasted: phase.pasted.slice(0, -1) } });
  announce(`Taken back: the colour of ${phase.list[phase.pasted.length - 1]!.label} is next again`);
}

/** End the mode with what it pasted when that is no longer there — an undo, the formula deleted
 * or rendered anew — and when another project is opened: one of the app's services. Returns the
 * function that stops it. (Another mode of the preview turning on ends it without a service:
 * `previewModes.ts`.) */
export function startColourOrderTracking(): () => void {
  const stops = [
    useProjectStore.subscribe((state) => {
      if (step.writing) return;
      const { phase } = useColourOrder.getState();
      if (phase?.step !== 'paste' || phase.pasted.length === 0) return;
      if (pastedIntact(state.project, phase.pasted)) return;
      useColourOrder.setState({ phase: null });
      announce('Colours in order: ended, what it had pasted was changed');
    }),
    // Derived data written without a step (a snapshot) leaves the paste's step the last one.
    onProjectAmended((before, after) => {
      if (before === step.own) step.own = after;
    }),
    onProjectLoaded(() => leaveColourOrder()),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
