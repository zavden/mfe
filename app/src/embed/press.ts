/* Which press of the pointer is a press. On a Mac a click with Ctrl is the secondary click: the
 * browser sends the press of the main button with Ctrl held, then the menu's event, and no click.
 * A handler that reads the button alone takes that press for its own, and seeks, or starts a
 * drag, under the menu that opens.
 *
 * The page of an export and the players of the documentation have none of the editor's modules:
 * this is their `isMainClick` (`ui/pointer.ts` asks the same of the editor's presses). */

/** Whether the page runs on an Apple system. Asked at each press: it reads the browser, and a
 * page checked without one (`check.mjs` of an exported folder) has none to read. */
export const onApple = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

/** Whether a press is the main button's and not a Mac's click with Ctrl, which is the menu's. */
export function isMainPress(
  event: { button: number; ctrlKey: boolean },
  apple: boolean = onApple(),
): boolean {
  return event.button === 0 && !(event.ctrlKey && apple);
}
