/* Non-blocking notices (toasts): file problems, glyph-mapping warnings… Errors stay until
 * dismissed; info and warnings fade after a while, unless they are `sticky`. */
import { create } from 'zustand';

export type NoticeKind = 'info' | 'warning' | 'error';

export interface Notice {
  id: number;
  kind: NoticeKind;
  title: string;
  message?: string;
  details?: string[];
  /** A button in the notice (it stays open). */
  action?: { label: string; run: () => void };
  /** It stays until it is dismissed, whatever its kind: something to read once, at leisure. */
  sticky?: boolean;
}

interface NoticeState {
  notices: Notice[];
  dismiss(id: number): void;
  clear(): void;
}

let nextId = 1;

export const useNoticeStore = create<NoticeState>()((set) => ({
  notices: [],
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
  clear: () => set({ notices: [] }),
}));

export const AUTO_DISMISS_MS: Record<NoticeKind, number | null> = {
  info: 6000,
  warning: 12000,
  error: null,
};

const MAX_NOTICES = 4;

/** Keep the stack short: the oldest notice that is not an error goes first (errors stay until
 * dismissed; only when every notice is one does the oldest error go). */
function keepShort(notices: Notice[]): Notice[] {
  const out = [...notices];
  while (out.length > MAX_NOTICES) {
    const oldest = out.findIndex((n) => n.kind !== 'error');
    out.splice(oldest === -1 ? 0 : oldest, 1);
  }
  return out;
}

export function notify(notice: Omit<Notice, 'id'>): number {
  const id = nextId++;
  useNoticeStore.setState((state) => ({
    notices: keepShort([...state.notices, { ...notice, id }]),
  }));
  return id;
}
