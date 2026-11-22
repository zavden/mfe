import type { ReactNode } from 'react';
import './fileDrop.css';

interface FileDropOverlayProps {
  testId?: string;
  /** What dropping here does, in a few words. */
  children: ReactNode;
}

/** The overlay of a drop area (`useFileDrop`): render it inside the area, which is
 * `position: relative`, while `drop.over`. It shows where the files go and covers what could take
 * the drag away from the area, a frame above all; the area's own handlers do the rest. */
export function FileDropOverlay({ testId, children }: FileDropOverlayProps) {
  return (
    <div className="file-drop" data-testid={testId}>
      <p>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path
            d="M9 2.5v8M5.5 7.2 9 10.7l3.5-3.5M3 11.5v2.2c0 .7.6 1.3 1.3 1.3h9.4c.7 0 1.3-.6 1.3-1.3v-2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{children}</span>
      </p>
    </div>
  );
}
