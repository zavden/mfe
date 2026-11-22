import { useAnnouncer } from './announcer';

/** The polite live region behind `announce` (announcer.ts): always mounted, never seen. */
export function Announcer() {
  const text = useAnnouncer((s) => s.text);
  const serial = useAnnouncer((s) => s.serial);
  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="announcer"
    >
      {/* A zero-width space on every other announcement: the same words said again still
          change the region, which is what makes it speak. */}
      {text}
      {serial % 2 === 1 ? '​' : ''}
    </div>
  );
}
