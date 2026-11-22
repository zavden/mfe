/* Render keys and snapshots. */
import { boxCenter, boxSize } from '../geom';
import type { FormulaSnapshot, RenderBackend } from '../model';
import { producerOf } from './producers';
import type { FormulaRender, GlyphLike, RenderRequest } from './types';

/** cyrb53: fast, well-distributed 53-bit string hash (not cryptographic). */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Identifies a render: same key ⇒ same glyphs in the same order. The request's producer says
 * what identifies it (`prefer` is no part of it); the backend and its version complete the key. */
export function renderKey(
  request: RenderRequest,
  backend: RenderBackend,
  engineVersion: string,
): string {
  const payload = JSON.stringify([
    ...producerOf(request.kind).identity(request),
    backend,
    engineVersion,
  ]);
  return `${backend}-${hash53(payload)}`;
}

export function glyphLikes(render: FormulaRender): GlyphLike[] {
  return render.glyphs.map((g) => ({
    label: g.label,
    center: boxCenter(g.bbox),
    size: boxSize(g.bbox),
  }));
}

export function toSnapshot(render: FormulaRender): FormulaSnapshot {
  return { backend: render.backend, key: render.key, glyphs: glyphLikes(render) };
}
