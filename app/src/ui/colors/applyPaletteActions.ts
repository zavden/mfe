/* A confirmation owns one document, project revision and palette snapshot. Stale confirmation
 * never authorizes a newly calculated plan; it returns a new preview for another confirmation. */
import { original } from 'immer';
import type { Project } from '../../model';
import { history, onProjectLoaded, useProjectStore } from '../../store';
import { useDocumentStore } from '../project/documentStore';
import { applyPalettePlan, planApplyPalette, type ApplyPalettePlan } from './applyPalette';
import { PALETTE_ROLES, type PaletteColors } from './palette';

/** The library owns identity and revision; application only consumes copied colour values. */
export interface ApplyPaletteSnapshot {
  id: string;
  revision: number;
  displayName: string;
  colors: PaletteColors;
}

export interface ApplyPalettePreview {
  palette: ApplyPaletteSnapshot;
  includeBackground: boolean;
  plan: ApplyPalettePlan;
}

export type ApplyPaletteResult =
  | { status: 'applied' | 'noop'; plan: ApplyPalettePlan }
  | { status: 'stale'; preview: ApplyPalettePreview | null }
  | { status: 'cancelled' };

export interface ApplyPaletteCommand {
  /** Cancel transient work before capturing the state the user will review. */
  preview(includeBackground?: boolean): ApplyPalettePreview | null;
  isCurrent(preview: ApplyPalettePreview): boolean;
  isCancelled(): boolean;
  confirm(preview: ApplyPalettePreview): ApplyPaletteResult;
  dispose(): void;
}

function samePalette(a: ApplyPaletteSnapshot, b: ApplyPaletteSnapshot | null): boolean {
  return (
    b !== null &&
    a.id === b.id &&
    a.revision === b.revision &&
    a.displayName === b.displayName &&
    PALETTE_ROLES.every((role) => a.colors[role] === b.colors[role])
  );
}

/** Create at dialog opening and dispose at closing. The reader must resolve the current chosen
 * library entry, including its current revision, each time it is called. */
export function createApplyPaletteCommand(
  readPalette: () => ApplyPaletteSnapshot | null,
): ApplyPaletteCommand {
  const { session, documentId } = useDocumentStore.getState();
  let cancelled = false;
  let revision = 0;
  let captured: { preview: ApplyPalettePreview; project: Project; revision: number } | null = null;
  const offLoad = onProjectLoaded(() => {
    cancelled = true;
  });
  const offDocument = useDocumentStore.subscribe((state) => {
    if (state.session !== session || state.documentId !== documentId) cancelled = true;
  });
  const offProject = useProjectStore.subscribe((state, previous) => {
    // Sticky invalidation: editing and undoing back to the same reference cannot revive a preview.
    if (state.project !== previous.project) revision++;
  });
  const isCancelled = () => {
    const current = useDocumentStore.getState();
    return cancelled || current.session !== session || current.documentId !== documentId;
  };
  const matches = (preview: ApplyPalettePreview, project: Project) =>
    !isCancelled() &&
    captured?.preview === preview &&
    captured.project === project &&
    captured.revision === revision &&
    samePalette(preview.palette, readPalette());

  const command: ApplyPaletteCommand = {
    preview(includeBackground = true) {
      if (isCancelled()) return null;
      history.cancelGesture();
      if (isCancelled()) return null;
      const palette = readPalette();
      if (!palette) {
        captured = null;
        return null;
      }
      const project = useProjectStore.getState().project;
      const snapshot = { ...palette, colors: { ...palette.colors } };
      const preview = {
        palette: snapshot,
        includeBackground,
        plan: planApplyPalette(project, snapshot.colors, { includeBackground }),
      };
      captured = { preview, project, revision };
      return preview;
    },
    isCurrent: (preview) => matches(preview, useProjectStore.getState().project),
    isCancelled,
    confirm(preview) {
      if (isCancelled()) return { status: 'cancelled' };
      let result: ApplyPaletteResult = { status: 'stale', preview: null };
      useProjectStore.getState().update((draft) => {
        // `update` cancels an independent gesture before entering this recipe. Its cancellation
        // may replace the document, preserve new locks, or remove gesture-only objects/tracks.
        if (isCancelled()) {
          result = { status: 'cancelled' };
          return;
        }
        if (!matches(preview, original(draft)!)) return;
        const plan = planApplyPalette(draft, preview.palette.colors, {
          includeBackground: preview.includeBackground,
        });
        applyPalettePlan(draft, plan);
        result = { status: plan.hasChanges ? 'applied' : 'noop', plan };
      });
      // TypeScript cannot observe assignments inside an immer recipe.
      const outcome = result as ApplyPaletteResult;
      if (outcome.status === 'stale') {
        const refreshed = command.preview(preview.includeBackground);
        return isCancelled() ? { status: 'cancelled' } : { status: 'stale', preview: refreshed };
      }
      if (outcome.status === 'applied' || outcome.status === 'noop') command.dispose();
      return outcome;
    },
    dispose() {
      cancelled = true;
      captured = null;
      offLoad();
      offDocument();
      offProject();
    },
  };
  return command;
}
