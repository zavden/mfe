/* Font text: Pango shapes it, in the companion, with the fonts of that machine. The immutable
 * geometry it returns is also the portable browser appearance; whether the fonts it was shaped
 * with are still here is a separate question (`textEnvironment`), which the exports answer with a
 * note and never wait for. Where nothing can shape a text it is drawn as placeholder boxes
 * (`textBoxes.ts`), which the engine falls back on. */
import {
  validateTextGeometryArtifact,
  type TextRequestBasis,
  type TextGeometryArtifact,
  type Target,
} from '../model';
import { CompanionError, type CompanionClient } from './companion';
import { renderKey } from './key';
import { TEXT_BOXES_VERSION } from './textBoxes';
import type { CompanionState, FormulaRender, RenderResult, TextRenderRequest } from './types';

export const PANGO_BACKEND_VERSION = 'pango+1';

export { TEXT_CE_GL_SIZE_RATIO } from './textBoxes';

export function textRequestBasis(request: TextRequestBasis): TextRequestBasis {
  return {
    source: request.source,
    font: { ...request.font },
    fontSize: request.fontSize,
    target: request.target,
  };
}

export function textBasisMatches(a: TextRequestBasis, b: TextRequestBasis): boolean {
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.fontSize === b.fontSize &&
    a.font.family === b.font.family &&
    a.font.weight === b.font.weight &&
    a.font.slant === b.font.slant
  );
}

export function textBasisKey(request: TextRenderRequest): string {
  return renderKey(request, 'pango', PANGO_BACKEND_VERSION);
}

/** The same text whatever the library sets it: source, font and size. */
export function sameTextShape(a: TextRequestBasis, b: TextRequestBasis): boolean {
  return textBasisMatches(a, { ...b, target: a.target });
}

/** The key of the placeholder boxes of a text (`textBoxes.ts`): a snapshot with this key counts
 * the boxes of the text as it stands, one per grapheme. */
export function textBoxesKey(request: TextRenderRequest): string {
  return renderKey(request, 'pango', TEXT_BOXES_VERSION);
}

/** The key of the boxes drawn where the glyphs of a saved snapshot were. */
export function textSavedBoxesKey(request: TextRenderRequest, snapshotKey: string): string {
  return renderKey(request, 'pango', `saved-${TEXT_BOXES_VERSION}:${snapshotKey}`);
}

/** A font text drawn as placeholder boxes: nothing shaped what is on screen. */
export function isTextBoxes(render: FormulaRender): boolean {
  return render.backend === 'pango' && !render.exact;
}

/** Where the companion's text worker for `target` stands: its state, or `none` when there is no
 * companion, or it has no interpreter of that library (or no font text at all). */
export type PangoState = 'none' | 'unused' | 'preparing' | 'ready' | 'failed';

export function pangoState(state: CompanionState, target: Target): PangoState {
  const pango = state.status === 'online' ? state.health.capabilities.pango?.[target] : null;
  return pango?.state ?? 'none';
}

/** The font environment the companion shapes text in for `target`, once its worker is ready. */
export function pangoCapability(
  state: CompanionState,
  target: Target,
): { adapterVersion: string; environmentKey: string } | null {
  const pango = state.status === 'online' ? state.health.capabilities.pango?.[target] : null;
  return pango?.state === 'ready' ? pango : null;
}

export function canRenderPango(state: CompanionState, target: Target): boolean {
  return pangoCapability(state, target) !== null;
}

export function textArtifactRender(text: TextGeometryArtifact): FormulaRender {
  return {
    key: text.key,
    backend: 'pango',
    exact: true,
    target: text.basis.target,
    fontSize: text.basis.fontSize,
    glyphs: text.glyphs,
    bbox: text.bbox,
    warnings: text.warnings,
    text,
  };
}

/** How the running companion's text environment stands to the one `render` was shaped in: the
 * fonts, the versions of Manim, Pango and the libraries under them, and the adapter. 'unknown':
 * there is no companion to ask, or it does not shape text for `target`. */
export type TextEnvironment = 'same' | 'changed' | 'unknown';

export function textEnvironment(
  render: FormulaRender,
  state: CompanionState,
  target: Target,
): TextEnvironment {
  const capability = pangoCapability(state, target);
  if (!render.text || !capability) return 'unknown';
  const { environmentKey, adapterVersion } = render.text.provenance;
  return capability.environmentKey === environmentKey &&
    capability.adapterVersion === adapterVersion
    ? 'same'
    : 'changed';
}

/** Whether the running companion vouches for `render` as `target`'s own text, here and now: its
 * library shaped it, it carries a fingerprint, and the environment is still the one it was shaped
 * in. What "Refresh appearance" waits for. An export never does (D82): it says what it knows. */
export function isVerifiedText(
  render: FormulaRender,
  state: CompanionState,
  target: Target,
): boolean {
  return (
    render.backend === 'pango' &&
    render.target === target &&
    !!render.text?.provenance.geometrySignature &&
    textEnvironment(render, state, target) === 'same'
  );
}

interface Pending {
  controller: AbortController;
  promise: Promise<RenderResult>;
  consumers: number;
  settled: boolean;
  bytes: number;
}

/** Each subscriber owns its cancellation. Closing a draft cannot abort a committed render
 * sharing the same request, but an abandoned native job is cancelled when its last user leaves. */
export function createPangoBackend(client: CompanionClient, maxEntries = 64) {
  const cache = new Map<string, Pending>();
  let outstanding = 0;
  let active = 0;
  const waiting: { start(): void; cancel(): void }[] = [];
  const drain = () => {
    while (active < 2 && waiting.length) waiting.shift()!.start();
  };
  const admit = <T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> =>
    new Promise((resolve, reject) => {
      const job = {
        start() {
          signal.removeEventListener('abort', job.cancel);
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          active++;
          void Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => {
              active--;
              drain();
            });
        },
        cancel() {
          const index = waiting.indexOf(job);
          if (index >= 0) waiting.splice(index, 1);
          reject(signal.reason);
        },
      };
      signal.addEventListener('abort', job.cancel, { once: true });
      waiting.push(job);
      drain();
    });
  const byteBudget = 32 * 1024 * 1024;
  const prune = () => {
    let bytes = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
    for (const [key, item] of cache) {
      if (bytes <= byteBudget && cache.size <= maxEntries) break;
      if (!item.settled) continue;
      cache.delete(key);
      bytes -= item.bytes;
    }
  };
  const consume = (pending: Pending, signal?: AbortSignal): Promise<RenderResult> => {
    signal?.throwIfAborted();
    pending.consumers++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', abort);
        pending.consumers--;
        if (!pending.settled && pending.consumers === 0) pending.controller.abort();
        return true;
      };
      const abort = () => {
        if (release()) reject(signal?.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      pending.promise.then(
        (result) => {
          if (release()) resolve(result);
        },
        (error: unknown) => {
          if (release()) reject(error);
        },
      );
    });
  };
  return {
    async render(request: TextRenderRequest, signal?: AbortSignal): Promise<RenderResult> {
      signal?.throwIfAborted();
      const capability = pangoCapability(client.state(), request.target);
      if (!client.text || !capability) {
        return {
          ok: false,
          error: {
            backend: 'pango',
            message: 'No companion shapes font text for this Manim library now.',
            unavailable: true,
          },
        };
      }
      const basisKey = textBasisKey(request);
      const cacheKey = JSON.stringify([
        basisKey,
        capability.environmentKey,
        capability.adapterVersion,
      ]);
      let pending = cache.get(cacheKey);
      if (pending?.controller.signal.aborted) {
        cache.delete(cacheKey);
        pending = undefined;
      }
      if (!pending) {
        if (outstanding >= 6)
          return {
            ok: false,
            error: {
              backend: 'pango',
              message: 'Waiting for an available Pango worker.',
              retryAfterMs: 250,
            },
          };
        outstanding++;
        const controller = new AbortController();
        const entry: Pending = {
          controller,
          consumers: 0,
          settled: false,
          bytes: 0,
          promise: Promise.resolve(null as never),
        };
        entry.promise = (async (): Promise<RenderResult> => {
          try {
            const response = await admit(
              () => client.text!(textRequestBasis(request), controller.signal),
              controller.signal,
            );
            controller.signal.throwIfAborted();
            if (!response || typeof response.ok !== 'boolean')
              throw new Error('The companion sent an invalid Pango response.');
            if (!response.ok) {
              const changed = response.diagnostics?.some(
                (diagnostic) => diagnostic.code === 'font-environment-changed',
              );
              if (changed) void client.check();
              const affected = response.diagnostics
                ?.flatMap((diagnostic) => diagnostic.ranges ?? [])
                .slice(0, 4)
                .filter(
                  ({ start, end }) =>
                    Number.isInteger(start) &&
                    Number.isInteger(end) &&
                    start >= 0 &&
                    end > start &&
                    end <= request.source.length,
                )
                .map(({ start, end }) =>
                  JSON.stringify(request.source.slice(start, end).slice(0, 64)),
                );
              return {
                ok: false,
                error: {
                  backend: 'pango',
                  message:
                    (response.error?.message ?? 'The companion could not shape this text.') +
                    (affected?.length ? ` Affected text: ${affected.join(', ')}.` : ''),
                  log: response.error?.log,
                  ...(changed ? { retryAfterMs: 500 } : {}),
                },
              };
            }
            if (
              response.target !== request.target ||
              response.environmentKey !== response.provenance.environmentKey ||
              response.adapterVersion !== response.provenance.adapterVersion
            ) {
              throw new Error('The companion returned inconsistent Pango provenance.');
            }
            if (
              response.environmentKey !== capability.environmentKey ||
              response.adapterVersion !== capability.adapterVersion
            ) {
              void client.check();
              return {
                ok: false,
                error: {
                  backend: 'pango',
                  message: 'The font environment changed during shaping; checking it again.',
                  retryAfterMs: 500,
                },
              };
            }
            const artifact = validateTextGeometryArtifact({
              format: 'mfe-text-geometry',
              version: 1,
              basis: textRequestBasis(request),
              basisKey,
              key: response.requestKey,
              glyphs: response.glyphs,
              bbox: response.bbox,
              logicalBBox: response.logicalBBox,
              lines: response.lines,
              provenance: response.provenance,
              diagnostics: response.diagnostics,
              warnings: response.warnings,
            });
            return { ok: true, render: textArtifactRender(artifact) };
          } catch (error) {
            if (controller.signal.aborted) throw controller.signal.reason;
            return {
              ok: false,
              error: {
                backend: 'pango',
                message: error instanceof Error ? error.message : String(error),
                ...(error instanceof CompanionError && error.status === 429
                  ? { retryAfterMs: 500 }
                  : {}),
                // The companion went away under the request: no word about the text itself.
                ...(error instanceof CompanionError && error.unavailable
                  ? { unavailable: true }
                  : {}),
              },
            };
          }
        })().then(
          (result) => {
            entry.settled = true;
            outstanding--;
            if (!result.ok && cache.get(cacheKey) === entry) cache.delete(cacheKey);
            if (result.ok) {
              entry.bytes = result.render.glyphs.reduce(
                (sum, glyph) =>
                  sum +
                  256 +
                  glyph.label.length * 2 +
                  glyph.contours.reduce((n, c) => n + c.length * 8, 0),
                request.source.length * 2 + 2048,
              );
              prune();
            }
            return result;
          },
          (error: unknown) => {
            entry.settled = true;
            outstanding--;
            if (cache.get(cacheKey) === entry) cache.delete(cacheKey);
            throw error;
          },
        );
        cache.set(cacheKey, entry);
        pending = entry;
        prune();
      } else {
        cache.delete(cacheKey);
        cache.set(cacheKey, pending);
      }
      return consume(pending, signal);
    },
    invalidate(request: TextRenderRequest) {
      const basisKey = textBasisKey(request);
      for (const [key, pending] of cache) {
        if ((JSON.parse(key) as string[])[0] === basisKey && pending.settled) cache.delete(key);
      }
    },
    clear() {
      for (const pending of cache.values()) if (!pending.settled) pending.controller.abort();
      cache.clear();
    },
  };
}
