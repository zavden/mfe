/* The suffix of the copy a split makes (D169): "Split at playhead" leaves the first half of a clip
 * to its object and gives the second half a new, unlinked copy of it, named after it with this
 * suffix — `f1_s`, or `f1_s1`, `f1_s2`… when that name is taken. A formula's name is a Python
 * variable, so the suffix is made of ASCII letters, digits and "_" only: `name + suffix` and
 * `name + suffix + number` stay identifiers. An editor preference (`ui/preferences.ts`), set in
 * Preferences ▸ Split suffix… (`project/SplitSuffixDialog.tsx`). Pure. */

export const DEFAULT_SPLIT_SUFFIX = '_s';

/** The longest suffix: a name stays readable, and the suffix is not a name of its own. */
const MAX_LENGTH = 16;

const SUFFIX = new RegExp(`^[A-Za-z0-9_]{1,${MAX_LENGTH}}$`);

/** True for a string of 1 to 16 ASCII letters, digits or "_". */
export function isSplitSuffix(value: unknown): value is string {
  return typeof value === 'string' && SUFFIX.test(value);
}

/** Why `text` cannot be the suffix, as a sentence for the dialog, or null when it can. The text
 * is read as typed: a space is not one of the characters a suffix may hold. */
export function splitSuffixError(text: string): string | null {
  if (text === '') return 'The suffix cannot be empty.';
  if (isSplitSuffix(text)) return null;
  return `Use at most ${MAX_LENGTH} characters, each a letter (a–z, A–Z), a digit or "_": the suffix becomes part of a Python variable.`;
}
