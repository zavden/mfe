/* Whether the focused element got the focus from the keyboard (Tab, or a key that moved it) or
 * from a pointer. Chrome's :focus-visible cannot tell: it turns true as soon as a key is pressed
 * on a focused button, so "clicked, then Space" would look like "reached with Tab". */
let lastInput: 'keyboard' | 'pointer' = 'pointer';
let keyboardFocused: Element | null = null;
let installed = false;

/** Start listening (once per page). */
export function trackFocusOrigin(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', () => (lastInput = 'keyboard'), true);
  document.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
  document.addEventListener(
    'focusin',
    (event) => {
      keyboardFocused = lastInput === 'keyboard' ? (event.target as Element) : null;
    },
    true,
  );
}

/** `element` has the focus, and got it from the keyboard. */
export function focusedByKeyboard(element: Element): boolean {
  return element === keyboardFocused && element === document.activeElement;
}
