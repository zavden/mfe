/* A question asked in a dialog's own footer (the relation editor's): which one is open, the
 * button that takes the focus while it is, and the control that gets the focus back when the
 * question closes. */
import { useEffect, useId, useRef, useState } from 'react';

export type FooterQuestion = 'discard' | 'delete';

export function useFooterConfirmation() {
  const [confirming, setConfirming] = useState<FooterQuestion | null>(null);
  const labelId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  /** The test id of what had the focus when the confirmation opened (the footer is rebuilt). */
  const focusBefore = useRef<string | null>(null);
  const ask = (kind: FooterQuestion) => {
    focusBefore.current =
      document.activeElement instanceof HTMLElement
        ? (document.activeElement.dataset.testid ?? null)
        : null;
    setConfirming(kind);
  };
  // The confirmation takes the focus (on its safe answer), and gives it back when dismissed.
  useEffect(() => {
    if (confirming) {
      keepRef.current?.focus();
      return;
    }
    const id = focusBefore.current;
    focusBefore.current = null;
    if (id) document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.focus();
  }, [confirming]);
  return { confirming, labelId, keepRef, ask, dismiss: () => setConfirming(null) };
}

export type FooterConfirmation = ReturnType<typeof useFooterConfirmation>;
