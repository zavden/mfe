/* Correspondence across independent request changes. Sequence matching is meaningful only
 * after both sides have the same backend/target; large reflows need occurrence matching. */
import { glyphLikes } from './key';
import { matchGlyphs } from './match';
import { producerOf } from './producers';
import { matchTextGeometry } from './textMatch';
import type { FormulaEngine, FormulaRender, GlyphMatch, RenderRequest } from './types';

export interface RenderBasis {
  request: RenderRequest;
  render: FormulaRender;
}

/** The complete output identity without backend preference (the actual render supplies it). */
export const requestIdentity = (request: RenderRequest): string =>
  JSON.stringify([request.kind, producerOf(request.kind).identity(request)]);

export const requestContent = (request: RenderRequest): string =>
  JSON.stringify([request.kind, producerOf(request.kind).requestContent(request)]);

export function composeGlyphMatches(first: GlyphMatch, second: GlyphMatch): GlyphMatch {
  return {
    map: first.map.map((index) => (index === null ? null : (second.map[index] ?? null))),
    confidence: Math.min(first.confidence, second.confidence),
  };
}

/** Use a successful same-request intermediate, never a fallback from a different backend.
 * A missing bridge leaves the canonical references intact; callers can report uncertainty. */
export async function renderBasis(
  engine: FormulaEngine,
  request: RenderRequest,
  backend: FormulaRender['backend'],
  current: () => boolean = () => true,
): Promise<RenderBasis | null> {
  if (!current()) return null;
  try {
    const result = await engine.render({ ...request, prefer: backend });
    if (
      !current() ||
      !result.ok ||
      result.render.backend !== backend ||
      result.render.target !== request.target
    ) {
      return null;
    }
    return { request, render: result.render };
  } catch {
    return null;
  }
}

/** Compose renderer conversion at the old layout, then a same-renderer content edit, then a
 * same-content layout change. This also handles a source edit simultaneous with companion loss
 * or return, where the previous current render cannot be used directly for sequence matching. */
export async function matchRenderChange(
  from: RenderBasis,
  to: RenderBasis,
  engine: FormulaEngine,
  current: () => boolean = () => true,
): Promise<GlyphMatch | null> {
  if (from.request.kind !== to.request.kind) return null;
  if (from.request.kind === 'text' && to.request.kind === 'text') {
    return current() && from.render.text && to.render.text
      ? matchTextGeometry(from.render.text, to.render.text)
      : null;
  }
  let basis = from;
  let match: GlyphMatch = { map: from.render.glyphs.map((_, index) => index), confidence: 1 };
  const append = (next: RenderBasis, mode: 'position' | 'edit' | 'sequence') => {
    match = composeGlyphMatches(
      match,
      matchGlyphs(glyphLikes(basis.render), glyphLikes(next.render), mode),
    );
    basis = next;
  };
  const intermediate = async (request: RenderRequest) => {
    if (requestIdentity(request) === requestIdentity(to.request)) return to;
    return renderBasis(engine, request, to.render.backend, current);
  };

  if (basis.render.backend !== to.render.backend || basis.render.target !== to.render.target) {
    const bridge = await intermediate({ ...basis.request, target: to.request.target });
    if (!bridge) return null;
    append(bridge, 'position');
  }
  if (
    requestContent(basis.request) !== requestContent(to.request) ||
    basis.request.preamble !== to.request.preamble
  ) {
    const edited = await intermediate(
      producerOf(to.request.kind).withContent(basis.request, to.request),
    );
    if (!edited) return null;
    append(edited, 'edit');
  }
  if (basis.render.key !== to.render.key) {
    append(to, producerOf(to.request.kind).layoutMatch ?? 'position');
  }
  return current() ? match : null;
}
