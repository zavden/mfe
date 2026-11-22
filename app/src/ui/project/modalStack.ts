/* The open modals, innermost last: only the top one reacts to Escape and Tab, and global
 * shortcuts stay quiet while any is open — except undo / redo under a modal whose edits are
 * project edits (the formula editor), when it is the top one. */
export const modalStack: symbol[] = [];

/** Modals that let undo / redo through while they are on top. */
export const historyModals = new Set<symbol>();

export function isModalOpen(): boolean {
  return modalStack.length > 0;
}

/** The top modal lets the undo / redo shortcuts act on the project. */
export function topModalAllowsHistory(): boolean {
  const top = modalStack[modalStack.length - 1];
  return top !== undefined && historyModals.has(top);
}

/** Spread on a field: while `active` (it has an edit that Escape takes back), Escape is the
 * field's and does not close the dialog around it. */
export function ownEscape(active: boolean): { 'data-own-escape'?: '' } {
  return active ? { 'data-own-escape': '' } : {};
}

/** Whether a key event comes from a field that uses Escape itself right now. */
export function fieldOwnsEscape(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-own-escape]') !== null;
}
