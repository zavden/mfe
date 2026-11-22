/* Attach sync: keeps attached objects (`clip.attach`, R4) where their targets put them
 * (docs/ARCHITECTURE.md §5, "Attached objects"). After every change of the project or of a
 * render it derives the placement of every attached clip (`scene/attach.ts`) and writes those
 * that moved into the clip's initial state with `amend` — derived data, no undo step, like the
 * snapshots — and again while something still moves (a chain of attachments settles one link
 * per pass), over the dependency graph's depth. Undoing an edit of the target restores the project
 * before it; the sync then places the objects for that project again. */
import { hasPlacementUses } from '../model';
import { applyAttachments, attachmentPassLimit, deriveAttachments } from '../scene';
import { useProjectStore } from './projectStore';
import { useRenderStore } from './renderStore';
import { createVisualProjectSelector } from './visualProject';

export function startAttachSync(): () => void {
  /** True while the service itself amends the project (its own change needs no processing). */
  let amending = false;
  let processing = false;
  let again = false;
  const selectVisual = createVisualProjectSelector(true);
  const initial = useProjectStore.getState();
  let visual = Array.isArray(initial.project.clips) ? selectVisual(initial) : initial.project;

  const process = (): void => {
    if (processing) {
      again = true;
      return;
    }
    processing = true;
    try {
      do {
        again = false;
        const { project: first } = useProjectStore.getState();
        // Broken projects reach the error screen; empty projects need no evaluator.
        if (!Array.isArray(first.clips) || !first.clips.some(hasPlacementUses)) return;
        const passes = attachmentPassLimit(first);
        for (let pass = 0; pass < passes; pass++) {
          const { project } = useProjectStore.getState();
          const { resolved } = useRenderStore.getState();
          const placements = deriveAttachments(project, resolved);
          if (placements.length === 0) break;
          amending = true;
          try {
            useProjectStore.getState().amend((draft) => applyAttachments(draft, placements));
          } finally {
            amending = false;
          }
        }
      } while (again);
    } finally {
      processing = false;
    }
  };

  const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project) return;
    // Preserve the existing crash-screen boundary: a store listener must not consume a render
    // failure before React can show the recovery UI.
    if (!Array.isArray(state.project.clips)) return;
    const next = selectVisual(state);
    const changed = next !== visual;
    visual = next;
    if (!amending && changed) process();
  });
  const unsubscribeRenders = useRenderStore.subscribe((state, previous) => {
    if (state.resolved !== previous.resolved) process();
  });
  process();

  return () => {
    unsubscribeProject();
    unsubscribeRenders();
  };
}
