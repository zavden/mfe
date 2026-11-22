import { useEffect, useState } from 'react';
import { AUTO_DISMISS_MS, useNoticeStore, type Notice } from './noticeStore';

function NoticeItem({ notice }: { notice: Notice }) {
  const dismiss = useNoticeStore((state) => state.dismiss);
  // Not faded while the pointer is on it or it has the focus (it is being read or used).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    const ms = notice.sticky ? null : AUTO_DISMISS_MS[notice.kind];
    if (ms === null || paused) return;
    const timer = setTimeout(() => dismiss(notice.id), ms);
    return () => clearTimeout(timer);
  }, [notice.id, notice.kind, notice.sticky, dismiss, paused]);
  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : undefined}
      data-testid="notice"
      data-kind={notice.kind}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="notice-text">
        <strong>{notice.title}</strong>
        {notice.message && <div>{notice.message}</div>}
        {notice.details && notice.details.length > 0 && (
          <ul>
            {notice.details.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {notice.action && (
          <button
            type="button"
            className="btn notice-action"
            data-testid="notice-action"
            onClick={notice.action.run}
          >
            {notice.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="notice-close"
        aria-label="Dismiss"
        data-testid="notice-dismiss"
        onClick={() => dismiss(notice.id)}
      >
        ×
      </button>
    </div>
  );
}

/** Always mounted: a live region must exist before what it announces (errors also say so
 * themselves, as alerts). */
export function NoticeHost() {
  const notices = useNoticeStore((state) => state.notices);
  return (
    <div className="notice-host" data-testid="notice-host" aria-live="polite">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </div>
  );
}
