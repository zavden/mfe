/* Keeps the paint of a LaTeX text's session on the render of its draft (`glyphPaint.ts`): it
 * starts it from the applied object once the render sync has resolved its glyphs — or, for an
 * object without glyphs yet, on the first render of the draft —, and carries it to each new
 * render with the correspondence the sync uses. */
import { useEffect, useMemo } from 'react';
import {
  BACKEND_VERSIONS,
  getEngine,
  renderKey,
  renderRequestFor,
  type FormulaRender,
  type RenderRequest,
} from '../../engine';
import { matchRenderChange } from '../../engine/correspondence';
import type { TexFormula } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { seedPaint } from './glyphPaint';
import { useTextComposition, type TextCompositionSession } from './textCompositionStore';

/** `request` is the draft's, and `render` its render when that is the current one (null while it
 * is being rendered, when it does not render, and when it draws nothing). */
export function useDraftPaint(
  session: TextCompositionSession<TexFormula>,
  request: RenderRequest,
  render: FormulaRender | null,
): void {
  const engine = getEngine();
  const meta = useProjectStore((state) => state.project.meta);
  const live = useProjectStore((state) =>
    state.project.formulas.find((formula) => formula.id === session.original.id),
  );
  const applied = useRenderStore((state) => state.resolved.get(session.original.id));
  const prefer = useRenderStore((state) => state.prefer);
  const { paint, paintLost, token } = session;
  // The object the paint starts from: the project's, as the render sync keeps it (its snapshot
  // may come, or change, while the session is open); a new one is the session's own.
  const object = session.isNew ? session.original : live?.kind === 'tex' ? live : null;
  const current = useMemo(() => (render ? { request, render } : null), [request, render]);

  useEffect(() => {
    if (!object || paintLost) return;
    const snapshotKey = object.snapshot?.key ?? null;
    if (paint && (paint.edited || paint.snapshotKey === snapshotKey)) return;
    const { session: now, startPaint } = useTextComposition.getState();
    if (now?.token !== token) return;
    if (!object.snapshot) {
      if (current) startPaint(seedPaint(object, current, []));
      return;
    }
    // The applied object's glyphs, as the sync resolved them, when its render is the render of
    // the object as it stands (not one kept from an earlier source while a new one is on its way).
    if (applied?.formula.snapshot?.key !== snapshotKey) return;
    const asked = renderRequestFor(object, meta, prefer);
    const { backend, key } = applied.render;
    if (renderKey(asked, backend, BACKEND_VERSIONS[backend]) !== key) return;
    startPaint(
      seedPaint(
        object,
        { request: asked, render: applied.render },
        applied.canonToRender,
        applied.confidence,
      ),
    );
  }, [object, applied, meta, prefer, paint, paintLost, current, token]);

  const basis = paint?.basis ?? null;
  useEffect(() => {
    if (!basis || !current || current.render.key === basis.render.key) return;
    let stale = false;
    const follow = (match: Awaited<ReturnType<typeof matchRenderChange>>) => {
      const state = useTextComposition.getState();
      if (!stale && state.session?.token === token) state.followPaint(current, match);
    };
    matchRenderChange(basis, current, engine, () => !stale).then(follow, () => follow(null));
    return () => {
      stale = true;
    };
  }, [basis, current, engine, token]);
}
