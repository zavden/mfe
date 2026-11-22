/* What assistive technology is told about keyboard work that has no visible dialog or notice:
 * a clip moved with the keyboard, a deletion. `announce` sets the text of a visually hidden
 * polite live region (`Announcer`); saying the same thing twice re-announces it. */
import { create } from 'zustand';

interface AnnouncerState {
  text: string;
  /** Counts the announcements, so that a repeated text still changes the region. */
  serial: number;
  announce(text: string): void;
}

export const useAnnouncer = create<AnnouncerState>()((set) => ({
  text: '',
  serial: 0,
  announce: (text) => set((s) => ({ text, serial: s.serial + 1 })),
}));

export function announce(text: string): void {
  useAnnouncer.getState().announce(text);
}
