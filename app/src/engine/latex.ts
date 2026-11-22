/* LaTeX backend (exact mode): the companion compiles the formula with the target's Manim
 * template; we parse the dvisvgm SVG exactly as Manim does and calibrate sizes per target.
 *
 * Size calibration (docs/COMPANION.md): CE `font_size / 960` scene units per SVG unit; GL
 * `font_size / (144 · h₀)`. ManimGL measures h₀ on `latex_to_svg("0")`, i.e. a *text-mode* 0
 * in its T1 template, not on `Tex("0")` (math mode, ≈0.3 % shorter). The companion only
 * typesets inside align*, so we compile `\text{0}`, which yields the same glyph, and take its
 * exact (curve-extrema) height. Once per session; on failure the measured fallback is used and
 * the render is reported as transient so it is not cached. */
import { boxSize, exactContoursBox } from '../geom';
import { GL_H0_FALLBACK, latexScale } from './calibration';
import { CompanionError, type CompanionClient } from './companion';
import { buildGlyphs, type RawGlyph } from './glyphs';
import { producerOf } from './producers';
import { parseDvisvgmSvg } from './svg';
import type { CompanionGlyphInfo, FormulaRender, RenderRequest, RenderResult } from './types';

/** Bump when glyph extraction or calibration changes (part of every render key). */
export const LATEX_BACKEND_VERSION = 'latex+1';
/** What ManimGL's get_tex_mob_scale_factor typesets (see the header comment). */
export const GL_CALIBRATION_LATEX = '\\text{0}';

// The constants of the calibration live in calibration.ts (the text wrapper needs them too).
export { CE_GL_SIZE_RATIO, GL_H0_FALLBACK, latexScale } from './calibration';

/** Combine the SVG shapes with the companion's labels (1:1 by position). */
export function glyphsFromSvg(
  svg: string,
  infos: readonly CompanionGlyphInfo[],
): { raw: RawGlyph[]; warnings: string[] } {
  const shapes = parseDvisvgmSvg(svg);
  const warnings: string[] = [];
  const aligned = infos.length === shapes.length;
  if (!aligned) {
    warnings.push(
      `The companion labelled ${infos.length} glyphs but the SVG has ${shapes.length}; labels are unavailable.`,
    );
  }
  const raw = shapes.map((shape, i): RawGlyph => {
    const info = aligned ? infos[i] : undefined;
    return {
      label: info?.label || '?',
      kind: info?.kind ?? shape.kind,
      contours: shape.contours,
      ...(shape.fill ? { fill: shape.fill } : {}),
    };
  });
  return { raw, warnings };
}

/** Exact height of the GL calibration glyph in an SVG. */
export function calibrationHeight(svg: string): number {
  const shapes = parseDvisvgmSvg(svg);
  return boxSize(exactContoursBox(shapes.flatMap((s) => s.contours)))[1];
}

export interface BackendOutcome {
  result: RenderResult;
  /** True when the result must not be cached (companion unreachable, fallback calibration). */
  transient: boolean;
  /** The companion could not be reached (network error or timeout). */
  unavailable?: boolean;
}

export interface LatexBackend {
  render(request: RenderRequest, key: string): Promise<BackendOutcome>;
  /** GL calibration height h₀ for this session. */
  glH0(): Promise<{ h0: number; measured: boolean }>;
}

export function createLatexBackend(client: CompanionClient): LatexBackend {
  let h0Promise: Promise<number> | null = null;

  const glH0 = async (): Promise<{ h0: number; measured: boolean }> => {
    if (!h0Promise) {
      h0Promise = (async () => {
        const response = await client.tex({
          latex: GL_CALIBRATION_LATEX,
          packages: [],
          preamble: '',
          target: 'gl',
        });
        if (!response.ok) throw new Error(response.error.message);
        const h = calibrationHeight(response.svg);
        if (!(h > 0)) throw new Error('empty calibration glyph');
        return h;
      })();
      h0Promise.catch(() => {
        h0Promise = null; // retry next time
      });
    }
    try {
      return { h0: await h0Promise, measured: true };
    } catch {
      return { h0: GL_H0_FALLBACK, measured: false };
    }
  };

  const render = async (request: RenderRequest, key: string): Promise<BackendOutcome> => {
    // What the companion compiles for this kind of object (math: the formula as MathTex / Tex).
    const texRequest = producerOf(request.kind).texRequest(request);
    let response;
    try {
      response = await client.tex(texRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unavailable = error instanceof CompanionError ? error.unavailable : true;
      return {
        result: { ok: false, error: { message, backend: 'latex' } },
        transient: true,
        unavailable,
      };
    }
    if (!response.ok) {
      const { message, line, log } = response.error;
      return {
        result: {
          ok: false,
          error: { message, backend: 'latex', ...(line !== null ? { line } : {}), log },
        },
        // A LaTeX error comes with its log; without one the companion's own setup failed (no
        // latex or dvisvgm, a timeout under load), which may be fixed by the next request.
        transient: !log,
      };
    }
    let raw: RawGlyph[];
    const warnings = [...response.warnings];
    try {
      const parsed = glyphsFromSvg(response.svg, response.glyphs);
      raw = parsed.raw;
      warnings.push(...parsed.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { result: { ok: false, error: { message, backend: 'latex' } }, transient: false };
    }
    let h0 = GL_H0_FALLBACK;
    let measured = true;
    if (request.target === 'gl') {
      ({ h0, measured } = await glH0());
      if (!measured) warnings.push('GL size calibration unavailable; using the reference value.');
    }
    const { glyphs, bbox } = buildGlyphs(
      raw,
      latexScale(request.target, request.fontSize, h0),
      request.target,
    );
    const render: FormulaRender = {
      key,
      backend: 'latex',
      exact: true,
      target: request.target,
      fontSize: request.fontSize,
      glyphs,
      bbox,
      warnings,
    };
    return { result: { ok: true, render }, transient: !measured };
  };

  return { render, glH0 };
}
