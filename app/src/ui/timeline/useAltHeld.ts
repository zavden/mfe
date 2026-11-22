/* Whether Alt is held, for the timeline: while it is, only the edges answer the pointer
 * (timeline.css, `.is-trim-only`) — those of the clips, and the inner edge of their intro and of
 * their outro. A block or a relation window that ends where its clip does lies over the clip's
 * edge, and a window lies over where an outro starts: a press there is theirs. With Alt held the
 * edge is the clip's again, and nothing else in the lanes can be pressed. A dialog and a text
 * field keep the key for themselves. */
import { useCallback, useEffect, useState } from 'react';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';

export function useAltHeld(): {
  alt: boolean;
  /** Keep in step with the pointer in case a key event was missed (focus elsewhere). */
  syncAlt(event: { altKey: boolean }): void;
} {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      if (event.type === 'keyup') setAlt(false);
      else if (!isModalOpen() && !isTextEntryTarget(event.target)) setAlt(true);
    };
    const onBlur = () => setAlt(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  const syncAlt = useCallback((event: { altKey: boolean }) => {
    setAlt((held) => (held === event.altKey || isModalOpen() ? held : event.altKey));
  }, []);
  return { alt, syncAlt };
}
