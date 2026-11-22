/* Splits the keys of a shortcut, as the sheet and the README write them, into what the sheet
 * draws as key caps. Pure.
 *
 *   "Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y"  two lines ("; "), the second with two alternatives
 *   "Home, End" "Delete / Backspace"       alternatives or a list: ", ", " or ", " / "
 *   "Ctrl/⌘+S" "Alt + drag"                a combination: its parts joined by "+" (or " + ")
 *   "Ctrl/⌘" "←/→"                         a "/" without spaces stays in one cap
 *   "wheel" "middle button"                lower-case words are mouse gestures, not keys
 *   "←/→ (Shift: 1 s)" "Shift (held)"      a trailing note in brackets, maybe led by a key
 *
 * `formatKeys(parseKeys(s)) === s` for every row of the sheet (a unit test checks it), so the
 * caps never say more or less than the text. On a Mac the lines are drawn as its menus write keys
 * (`macLines`), and say what `keysText` makes of the text there. */
import { keysText, macKey, macOrder } from '../platform';

export type KeyPart = { kind: 'key' | 'gesture'; text: string };

/** Keys pressed together. */
export interface KeyCombo {
  parts: KeyPart[];
  /** Written with " + " (a key and a gesture) rather than "+". */
  spaced: boolean;
  /** A Mac's: its keys with nothing between them ("⇧⌘Z"), a "+" before a gesture alone. */
  bare?: boolean;
}

/** How an alternative is set apart from the one before it. */
export type KeySeparator = ',' | 'or' | '/';

export interface KeyLine {
  combos: { separator: KeySeparator | null; combo: KeyCombo }[];
  /** The bracketed note at the end: "(Shift: 1 s)" → key "Shift", text "1 s". */
  note: { key: string | null; text: string } | null;
}

const SEPARATORS: Record<string, KeySeparator> = { ', ': ',', ' or ': 'or', ' / ': '/' };
const SEPARATOR_TEXT: Record<KeySeparator, string> = { ',': ', ', or: ' or ', '/': ' / ' };

const isGesture = (text: string) => /^[a-z][a-z ]+$/.test(text);

function parseCombo(text: string): KeyCombo {
  const spaced = text.includes(' + ');
  const parts = text.split(spaced ? ' + ' : '+').map((part) => part.trim());
  return {
    parts: parts.map((part) => ({ kind: isGesture(part) ? 'gesture' : 'key', text: part })),
    spaced,
  };
}

function parseLine(text: string): KeyLine {
  const bracket = /^(.*?) \(([^()]*)\)$/.exec(text);
  const body = bracket ? bracket[1]! : text;
  let note: KeyLine['note'] = null;
  if (bracket) {
    const led = /^([A-Z][\w/⌘]*): (.+)$/.exec(bracket[2]!);
    note = led ? { key: led[1]!, text: led[2]! } : { key: null, text: bracket[2]! };
  }
  const combos: KeyLine['combos'] = [];
  // Split on the separators, keeping them, so each alternative knows what came before it.
  const pieces = body.split(/(, | or | \/ )/);
  for (let i = 0; i < pieces.length; i += 2) {
    const separator = i === 0 ? null : SEPARATORS[pieces[i - 1]!]!;
    combos.push({ separator, combo: parseCombo(pieces[i]!) });
  }
  return { combos, note };
}

/** The lines of a shortcut's keys ("; " starts a new line). */
export function parseKeys(keys: string): KeyLine[] {
  return keys.split('; ').map(parseLine);
}

/** Whether a "+" is written before the part at `index` of a combination: between any two parts,
 * but between the keys of a Mac's, which follow each other. */
export function plusBefore(combo: KeyCombo, index: number): boolean {
  if (index === 0) return false;
  const bothKeys = combo.parts[index]!.kind === 'key' && combo.parts[index - 1]!.kind === 'key';
  return !(combo.bare && bothKeys);
}

/** The lines as a Mac writes them: each key with its symbol when it has one (⌘ for "Ctrl/⌘", ⌃
 * for "Ctrl", ⌥, ⇧, ↩), the modifiers of a combination first and in the order of its menus, and
 * nothing between its keys. */
export function macLines(lines: readonly KeyLine[]): KeyLine[] {
  return lines.map(({ combos, note }) => ({
    combos: combos.map(({ separator, combo }) => {
      const keys = combo.parts.filter((part) => part.kind === 'key').map((part) => part.text);
      const gestures = combo.parts.filter((part) => part.kind === 'gesture');
      return {
        separator,
        combo: {
          parts: [
            ...macOrder(keys).map((key): KeyPart => ({ kind: 'key', text: macKey(key) })),
            ...gestures,
          ],
          spaced: combo.spaced,
          bare: true,
        },
      };
    }),
    note: note && { key: note.key && macKey(note.key), text: keysText(note.text, true) },
  }));
}

/** Back to the text, as written in the sheet and the README. */
export function formatKeys(lines: readonly KeyLine[]): string {
  return lines
    .map(({ combos, note }) => {
      const body = combos
        .map(
          ({ separator, combo }) =>
            (separator ? SEPARATOR_TEXT[separator] : '') +
            combo.parts
              .map((p, i) => (plusBefore(combo, i) ? (combo.spaced ? ' + ' : '+') : '') + p.text)
              .join(''),
        )
        .join('');
      if (!note) return body;
      return `${body} (${note.key ? `${note.key}: ` : ''}${note.text})`;
    })
    .join('; ');
}
