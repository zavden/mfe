/* Small DOM helpers shared by the timeline and transport keyboard handlers. */

/** True for events that come from something the user is typing in: keyboard shortcuts of the
 * timeline and transport must leave those alone. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'MATH-FIELD')
    return true;
  return target.closest('math-field') !== null;
}
