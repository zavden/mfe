/* The keys of a deck: the ones PowerPoint and reveal.js share, and what a presenter's remote
 * sends (a Logitech R400, R700 or R800 sends PageDown, PageUp and `.`). Pure: which command a key
 * press is, given what it was pressed on. `controls.ts` listens for them where the deck's `keys`
 * option says — on the whole page, or only while the focus is inside the deck — and runs them.
 *
 *   →  ↓  Space  PageDown  N  Enter     go on: play to the next pause (`deck.next()`)
 *   ←  ↑  PageUp  P  Backspace  ⇧Space  back to the pause before (`deck.previous()`)
 *   Home  End                           the start, the end
 *   K                                   play / pause
 *   F                                   full screen
 *   S                                   the notes
 *   B  .                                black the stage out, and back
 *   M                                   the sound, when the scene has one
 *
 * Never with Ctrl, ⌘ or Alt held (the browser's and the system's chords), never while typing in
 * a field, never Space or Enter on a button or a link (they press it), never the arrows on a
 * widget of the page that moves with them (a slider, a list, a menu…), and never a key the
 * browser needs (Tab, Escape, the function keys). */

export type KeyCommand =
  'next' | 'previous' | 'start' | 'end' | 'toggle' | 'fullscreen' | 'notes' | 'blackout' | 'mute';

/** What a key was pressed on, as far as the deck's keys care:
 * - `field`: something one types in (an input, a text area, a select, an editable element);
 * - `button`: something Space and Enter press (a button, a link, a summary, a checkbox…);
 * - `widget`: something the arrows move (a slider, a list box, a menu, a tab list…);
 * - `other`: anything else (the page, the deck, its stage), and the deck's own timeline: it takes
 *   its arrows, Home and End itself (`timeline.ts`) and leaves PageDown, PageUp and Space to the
 *   deck, which a presenter's remote means. */
export type TargetKind = 'field' | 'button' | 'widget' | 'other';

/** The keys a press of which says something; the old names (`Right`, `Spacebar`) of browsers
 * that had them too. */
const NEXT = new Set(['ArrowRight', 'Right', 'ArrowDown', 'Down', 'PageDown', 'n', 'N', 'Enter']);
const PREVIOUS = new Set(['ArrowLeft', 'Left', 'ArrowUp', 'Up', 'PageUp', 'p', 'P', 'Backspace']);
const SPACE = new Set([' ', 'Spacebar']);
/** The keys a widget of the page moves with. */
const MOVING = new Set([
  'ArrowRight',
  'Right',
  'ArrowDown',
  'Down',
  'ArrowLeft',
  'Left',
  'ArrowUp',
  'Up',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);
/** Commands that switch something: a key held down switches it once. */
const SWITCHES = new Set<KeyCommand>(['toggle', 'fullscreen', 'notes', 'blackout', 'mute']);

/** The roles of what one types in, presses, or moves with the arrows. */
const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
const BUTTON_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'option',
  'treeitem',
]);
const WIDGET_ROLES = new Set([
  'slider',
  'scrollbar',
  'listbox',
  'menu',
  'menubar',
  'radiogroup',
  'tablist',
  'tree',
  'treegrid',
  'grid',
]);
/** The inputs a key presses rather than types in. */
const PRESSED_INPUTS = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'image',
  'file',
  'color',
]);

/** What `target` is, for the keys (see `TargetKind`). */
export function targetKind(target: EventTarget | null): TargetKind {
  // Not `instanceof Element`: the target may be of another window (a frame's).
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return 'other';
  if (
    (element as HTMLElement).isContentEditable ||
    element.closest('[contenteditable]:not([contenteditable="false"])')
  )
    return 'field';
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    const type = ((element as HTMLInputElement).type || 'text').toLowerCase();
    if (type === 'range') return 'widget';
    return PRESSED_INPUTS.has(type) ? 'button' : 'field';
  }
  if (tag === 'textarea' || tag === 'select') return 'field';
  if (element.closest('.mfe-deck .mfe-timeline')) return 'other';
  // The nearest element with a role of these says it, or an element that has one by its tag.
  for (let node: Element | null = element; node; node = node.parentElement) {
    const role = node.getAttribute('role');
    if (role && FIELD_ROLES.has(role)) return 'field';
    if (role && WIDGET_ROLES.has(role)) return 'widget';
    if (role && BUTTON_ROLES.has(role)) return 'button';
    const name = node.tagName.toLowerCase();
    if (name === 'button' || name === 'summary') return 'button';
    if (name === 'a' && node.hasAttribute('href')) return 'button';
    if ((name === 'audio' || name === 'video') && node.hasAttribute('controls')) return 'widget';
    if (node.classList.contains('mfe-deck')) break; // the deck's own: nothing above counts
  }
  return 'other';
}

/** What a key press says, as the deck hears it; null when it is none of its keys, or not here. */
export function keyCommand(
  event: Pick<
    KeyboardEvent,
    'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat' | 'isComposing'
  >,
  on: TargetKind,
): KeyCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
  if (on === 'field') return null;
  const { key } = event;
  if (on === 'button' && (SPACE.has(key) || key === 'Enter')) return null;
  if (on === 'widget' && MOVING.has(key)) return null;
  let command: KeyCommand | null = null;
  if (SPACE.has(key)) command = event.shiftKey ? 'previous' : 'next';
  else if (NEXT.has(key)) command = 'next';
  else if (PREVIOUS.has(key)) command = 'previous';
  else if (key === 'Home') command = 'start';
  else if (key === 'End') command = 'end';
  else
    switch (key.toLowerCase()) {
      case 'k':
        command = 'toggle';
        break;
      case 'f':
        command = 'fullscreen';
        break;
      case 's':
        command = 'notes';
        break;
      case 'b':
      case '.':
        command = 'blackout';
        break;
      case 'm':
        command = 'mute';
        break;
    }
  if (command && event.repeat && SWITCHES.has(command)) return null;
  return command;
}
