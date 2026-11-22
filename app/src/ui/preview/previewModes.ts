/* The modes of the Preview, one at a time: Edit path, the choice of a shape's target, colours in
 * order, align by symbol, Add line and Edit curve each take the clicks of the Preview and keys of their own, and two of
 * them on at once would answer the same Enter. Turning one on turns off the one that was on.
 *
 * It is done here, in one place: a mode says how it ends and whether it is on where its store is
 * made (`registerPreviewMode` — a line of the module, no listener: nothing is heard by being
 * imported, and a mode whose module was never loaded cannot be on), and calls `endPreviewModes`
 * with its own name as it turns on. No mode knows the others, and none has to watch them: a new
 * mode adds its two lines and is in the rule. What gives way to any mode asks `previewModeOn`:
 * the arrow keys move the selected objects only while none is on (`nudge.ts`).
 *
 * A mode ends as it would by itself: Edit path settles its path as on leaving it (`close`, which
 * may write), colours in order keeps what it had pasted.
 *
 * A mode can be turned on from a dialog that covers the Preview (Edit path… of a Morph's pair in
 * the block dialog): such a dialog hears the mode turn on (`onPreviewMode`, in an effect) and
 * gets out of its way. */

export type PreviewMode = 'path' | 'retarget' | 'colours' | 'symbol' | 'line' | 'curve';

const modes = new Map<PreviewMode, { end: () => void; on: () => boolean }>();
const heard = new Set<(mode: PreviewMode) => void>();

/** How `mode` ends when another one turns on — nothing happens if it is not on —, and whether it
 * is on. */
export function registerPreviewMode(mode: PreviewMode, end: () => void, on: () => boolean): void {
  modes.set(mode, { end, on });
}

/** Whether a mode of the Preview is on. */
export function previewModeOn(): boolean {
  for (const { on } of modes.values()) if (on()) return true;
  return false;
}

/** Hear every mode as it turns on, until the result is called. */
export function onPreviewMode(hear: (mode: PreviewMode) => void): () => void {
  heard.add(hear);
  return () => {
    heard.delete(hear);
  };
}

/** `except` is turning on: end every other mode, and tell who hears. */
export function endPreviewModes(except: PreviewMode): void {
  for (const [mode, { end }] of modes) if (mode !== except) end();
  for (const hear of [...heard]) hear(except);
}
