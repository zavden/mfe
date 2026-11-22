/** Whether the browser runs on an Apple system: ⌘ is the command key there (Ctrl elsewhere), a
 * Ctrl+click is the secondary click, and the keyboard has no key for the context menu. Asked when
 * it matters, not once: it reads the browser, which a test may dress as another. */
export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

/** The letter, a to z, a key press stands for, on any layout of the keyboard: the letter the key
 * types when it is one, wherever the layout has put it (Dvorak's Z, AZERTY's A: the letter wins
 * over the place); else the letter a Latin keyboard has at the key's place (`code`: "KeyZ" is z),
 * when the key typed a letter of another script — Ctrl+Z is "я" on a Russian layout, and Greek,
 * Hebrew or a Hindi vowel sign likewise — or anything at all with Alt held: Option on a Mac and
 * AltGr compose other characters ("å" for Option+A) or wait for the next key. Null for a key
 * that is no letter: a digit, an arrow, a sign a Latin layout has at a letter's place (Dvorak's
 * ";" where Z is), an input method at work ("Process"). */
export function letterOf(event: { key: string; code?: string; altKey?: boolean }): string | null {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const place = placeLetter(event);
  if (place === null) return null;
  return event.altKey || /^[\p{L}\p{M}]$/u.test(event.key) ? place : null;
}

/** The letter a Latin keyboard has at the place of the key pressed (`code`: "KeyS" is s),
 * whatever the key typed; null for a key that has no letter there. */
export function placeLetter(event: { code?: string }): string | null {
  const place = /^Key([A-Z])$/.exec(event.code ?? '');
  return place ? place[1]!.toLowerCase() : null;
}

/** A Mac's modifier keys with their symbols, in the order its menus write them: Control, Option,
 * Shift, Command ("⌥⌘H", "⇧⌘Z"). `Ctrl` is the Control key itself, which is not the command key
 * there; "Ctrl/⌘" is how the texts for every system write the command key (`keysText`). */
const MAC_MODIFIERS: readonly (readonly [symbol: string, ...keys: string[]])[] = [
  ['⌃', 'Ctrl'],
  ['⌥', 'Alt'],
  ['⇧', 'Shift'],
  ['⌘', 'Mod', 'Ctrl/⌘'],
];

const isModifier = (key: string): boolean =>
  MAC_MODIFIERS.some(([, ...keys]) => keys.includes(key));

/** The other keys a Mac's menus write with a symbol. */
const MAC_KEYS: Readonly<Record<string, string>> = { Enter: '↩' };

/** One key as a Mac writes it: its symbol when it has one, else its name. */
export function macKey(key: string): string {
  const modifier = MAC_MODIFIERS.find(([, ...keys]) => keys.includes(key));
  return modifier ? modifier[0] : (MAC_KEYS[key] ?? key);
}

/** Keys pressed together in the order a Mac writes them: the modifiers first, in its order
 * whatever the order they were given in, then the other keys as they came. */
export function macOrder(chord: readonly string[]): string[] {
  const modifiers = MAC_MODIFIERS.flatMap(([, ...keys]) =>
    chord.filter((key) => keys.includes(key)),
  );
  return [...modifiers, ...chord.filter((key) => !isModifier(key))];
}

/** A shortcut as the system writes it, from the app's own notation: keys joined by "+" ("Mod+Alt+N":
 * Mod is Ctrl, or ⌘ on a Mac), and a gesture of the mouse after them, in lower case, with " + "
 * ("Mod + wheel", "Alt + drag"). "Ctrl+Alt+N" and "Ctrl + wheel" elsewhere; "⌥⌘N" and
 * "⌘ + wheel" on a Mac, whose menus write the modifiers in an order of their own, with nothing
 * between the keys, and Return as ↩. What the menus show after a label, and the tooltips that name
 * a key or a gesture. */
export function keyHint(keys: string, mac: boolean = isMac()): string {
  const gesture = / \+ ([a-z][a-z ]*)$/.exec(keys);
  const chord = (gesture ? keys.slice(0, gesture.index) : keys).split('+');
  const written = mac
    ? macOrder(chord).map(macKey).join('')
    : chord.map((key) => (key === 'Mod' ? 'Ctrl' : key)).join('+');
  return gesture ? `${written} + ${gesture[1]}` : written;
}

/** The modifier keys as the texts written for every system name them. */
const NAMED_MODIFIER = 'Ctrl/⌘|Ctrl|Alt|Shift';

/** A modifier or several joined by "+", and the key or the gesture joined to them, if any, in a
 * text: "Ctrl/⌘+Shift+Z", "Alt+←/→", "Shift+click", "Alt" — a whole word, not the start of one
 * ("Alternate"). A key ends at a space and at the signs a sentence has after it. */
const NAMED_KEYS = new RegExp(
  `(?<![\\w/+])((?:${NAMED_MODIFIER})(?:\\+(?:${NAMED_MODIFIER}))*)(?![\\w/])(?:\\+([^\\s+,;:()·]+))?`,
  'gu',
);

/** How a Mac says the keys it writes with a symbol: what a screen reader is given. */
const MAC_SPOKEN: Readonly<Record<string, string>> = {
  '⌃': 'Control',
  '⌥': 'Option',
  '⇧': 'Shift',
  '⌘': 'Command',
  '↩': 'Return',
};

/** `text` with the keys it names written a Mac's way: `write` gives a key as it is written, and
 * `join` what goes between the keys pressed together and before a gesture joined to them. */
function macText(text: string, write: (key: string) => string, join: string, gesture: string) {
  return text
    .replace(NAMED_KEYS, (_, modifiers: string, key: string | undefined) => {
      const written = macOrder(modifiers.split('+')).map(write).join(join);
      if (key === undefined) return written;
      // A gesture of the mouse: "⌘+click", "Command-click".
      if (/^[a-z]{2,}/.test(key)) return `${written}${gesture}${key}`;
      // The full stop of a sentence is not the key's.
      const stop = key.length > 1 && key.endsWith('.') ? 1 : 0;
      return written + join + write(key.slice(0, key.length - stop)) + key.slice(key.length - stop);
    })
    .replace(/(?<![\w+])Enter(?!\w)/g, write('Enter'));
}

/** A text that names keys for every system — as the README and the shortcut sheet write them:
 * "Ctrl/⌘+Shift+Z", "Alt + drag", "Shift: a range" — as the system the app runs on writes them.
 * Unchanged elsewhere; on a Mac the modifiers become its symbols, in the order of its menus and
 * joined to their key ("⇧⌘Z", "⌥ + drag", "⇧: a range", "⌘+click"), and Enter is ↩, as `keyHint`
 * writes them. What a hint, a tooltip or the sheet shows of a text that is written once: of its
 * own words only — a name the user gave is not a key, and is added after. */
export function keysText(text: string, mac: boolean = isMac()): string {
  return mac ? macText(text, macKey, '', '+') : text;
}

/** `keysText` for what is said, not shown — an announcement, the name a screen reader reads: on a
 * Mac the keys by their names, as its documents write them ("Shift-Command-Z", "Option-click",
 * "hold Option", "Return"), since a symbol is not read as its key by every reader. */
export function keysSpoken(text: string, mac: boolean = isMac()): string {
  return mac ? macText(text, (key) => MAC_SPOKEN[macKey(key)] ?? key, '-', '-') : text;
}
