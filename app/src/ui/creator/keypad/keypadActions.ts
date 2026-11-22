/* What a key of the formula editor's keypad does to the visual field (`FormulaKeypad.tsx`): MathLive's
 * commands for the keys that move and delete, the LaTeX of the ones that write, and which key the
 * arrows of the physical keyboard move to. Pure: the component runs it on the field. */
import { keyWidth, type KeypadKey, type KeypadTab } from './keypadLayout';

/** The commands of the field (MathLive's) that the keys run. */
export type FieldCommand = 'moveToPreviousChar' | 'moveToNextChar' | 'deleteBackward' | 'deleteAll';

/** What pressing a key comes to. */
export type KeyAction =
  | { readonly kind: 'insert'; readonly latex: string }
  | { readonly kind: 'command'; readonly command: FieldCommand }
  | { readonly kind: 'shift' }
  | { readonly kind: 'apply' };

const FIELD_COMMANDS = {
  left: 'moveToPreviousChar',
  right: 'moveToNextChar',
  backspace: 'deleteBackward',
  clear: 'deleteAll',
} as const satisfies Record<string, FieldCommand>;

/** What `key` does, with the capitals on (`shifted`) or off. */
export function keyAction(key: KeypadKey, shifted: boolean): KeyAction {
  if (key.command === 'shift') return { kind: 'shift' };
  if (key.command === 'apply') return { kind: 'apply' };
  if (key.command !== undefined) return { kind: 'command', command: FIELD_COMMANDS[key.command] };
  return { kind: 'insert', latex: (shifted ? key.shifted : undefined) ?? key.insert ?? '' };
}

/** The LaTeX of the face of `key`, or its text: a letter shows its capital while they are on. */
export function shownFace(key: KeypadKey, shifted: boolean): KeypadKey['face'] {
  return shifted && key.shifted !== undefined ? { latex: key.shifted } : key.face;
}

/** A move among the keys of a tab, from the physical keyboard. */
export type KeypadMove = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

const MOVES: Readonly<Record<string, KeypadMove>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
};

/** The move a key of the physical keyboard asks for, if any. */
export const moveOfKey = (key: string): KeypadMove | null => MOVES[key] ?? null;

/** Where a key is in its tab: its row, its place in the row and the column it starts at. */
function place(tab: KeypadTab, id: string): { row: number; index: number; column: number } | null {
  for (const [row, keys] of tab.rows.entries()) {
    let column = 0;
    for (const [index, key] of keys.entries()) {
      if (key.id === id) return { row, index, column };
      column += keyWidth(key);
    }
  }
  return null;
}

/** The key of `row` that is over or under `column`: the one whose columns hold it. */
function keyAtColumn(row: readonly KeypadKey[], column: number): KeypadKey {
  let start = 0;
  for (const key of row) {
    start += keyWidth(key);
    if (column < start) return key;
  }
  return row.at(-1)!;
}

/** The key a move from the key `id` reaches: the next one in its row, the one over or under it,
 * or the ends of the row; the same key where there is none that way. */
export function neighbourKey(tab: KeypadTab, id: string, move: KeypadMove): string {
  const at = place(tab, id);
  if (!at) return tab.rows[0]?.[0]?.id ?? id;
  const row = tab.rows[at.row]!;
  switch (move) {
    case 'left':
      return row[Math.max(0, at.index - 1)]!.id;
    case 'right':
      return row[Math.min(row.length - 1, at.index + 1)]!.id;
    case 'home':
      return row[0]!.id;
    case 'end':
      return row.at(-1)!.id;
    case 'up':
    case 'down': {
      const other = tab.rows[at.row + (move === 'up' ? -1 : 1)];
      return other ? keyAtColumn(other, at.column).id : id;
    }
  }
}
