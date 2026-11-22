/* Which Help dialog is open (a UI state, not part of the project). `HelpHost` mounts it; the
 * Help menu and the "?" key open it. */
import { create } from 'zustand';

export type HelpDialog = 'shortcuts' | 'about' | 'licenses';

interface HelpDialogState {
  open: HelpDialog | null;
}

export const useHelpDialog = create<HelpDialogState>()(() => ({ open: null }));

export const openHelpDialog = (dialog: HelpDialog) => useHelpDialog.setState({ open: dialog });
export const closeHelpDialog = () => useHelpDialog.setState({ open: null });
