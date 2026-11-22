/* Which export dialog is open (a UI state, not part of the project), and the Python target the
 * last one used, kept in the browser for the Export… button of the menu bar (D62). The dialogs
 * are mounted by `ExportHost`; the Export button and its arrow open them. */
import { create } from 'zustand';
import type { Target } from '../../model';
import { safeStorage } from '../storage';
import { blockTextCompositionCommand } from '../text/textCompositionStore';

export type ExportRequest =
  | { kind: 'python'; target: Target }
  | { kind: 'video' }
  | { kind: 'image' }
  | { kind: 'audio' }
  | { kind: 'html' };

/** Where the last Python target is kept. */
export const LAST_TARGET_KEY = 'mfe.export.target';

const isTarget = (value: string | null): value is Target => value === 'ce' || value === 'gl';

/** The stored target; 'ce' when there is none (or nonsense). */
export function readLastTarget(): Target {
  const stored = safeStorage.getItem(LAST_TARGET_KEY);
  return isTarget(stored) ? stored : 'ce';
}

interface ExportDialogState {
  request: ExportRequest | null;
  /** The target of the last Python export opened: what the Export… button opens. */
  lastTarget: Target;
  open(request: ExportRequest): void;
  close(): void;
}

export const useExportDialog = create<ExportDialogState>()((set) => ({
  request: null,
  lastTarget: readLastTarget(),
  open: (request) => {
    if (blockTextCompositionCommand()) return;
    if (request.kind === 'python') {
      safeStorage.setItem(LAST_TARGET_KEY, request.target);
      set({ request, lastTarget: request.target });
    } else {
      set({ request });
    }
  },
  close: () => set({ request: null }),
}));

export const openExportDialog = (request: ExportRequest) =>
  useExportDialog.getState().open(request);
