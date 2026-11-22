/* Compact synthetic vectors for state-machine tests; native parity uses real Pango separately. */
import {
  createTextFormula,
  type TextGeometryArtifact,
  type TextSourceRange,
  type Target,
} from '../model';
import { renderRequestFor } from '../engine/producers';
import { textBasisKey } from '../engine/pango';
import type { CompanionTextResponse } from '../engine/types';

export function textGeometry(
  source = 'AB',
  ranges?: TextSourceRange[],
  target: Target = 'ce',
): TextGeometryArtifact {
  const formula = createTextFormula({ source });
  const request = renderRequestFor(formula, { target, preamble: '' }, 'pango');
  if (request.kind !== 'text') throw new Error('Expected font text.');
  let offset = 0;
  const clusters =
    ranges ??
    Array.from(source, (char) => {
      const start = offset;
      offset += char.length;
      return { start, end: offset };
    }).filter(({ start, end }) => source.slice(start, end).trim() !== '');
  const glyphs = clusters.map((range, index) => {
    const x = index - clusters.length / 2;
    return {
      index,
      label: source.slice(range.start, range.end),
      kind: 'char' as const,
      contours: [[x, -0.5, x + 0.1, 0.5, x + 0.4, 0.5, x + 0.5, -0.5]],
      bbox: { minX: x, minY: -0.5, maxX: x + 0.5, maxY: 0.5 },
      sourceRanges: [range],
    };
  });
  const bbox = glyphs.length
    ? { minX: glyphs[0]!.bbox.minX, minY: -0.5, maxX: glyphs.at(-1)!.bbox.maxX, maxY: 0.5 }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const basisKey = textBasisKey(request);
  return {
    format: 'mfe-text-geometry',
    version: 1,
    basis: { source, font: formula.font, fontSize: formula.fontSize, target },
    basisKey,
    key: `${basisKey}-test-environment`,
    glyphs,
    bbox,
    logicalBBox: bbox,
    lines: [{ start: 0, end: source.length, baseline: 0, bbox }],
    provenance: {
      environmentKey: 'test-environment',
      adapterVersion: 'test-adapter',
      geometrySignature: '0'.repeat(64),
      versions: { pango: 'test' },
      calibration: 1,
      resolvedFonts: [],
    },
    diagnostics: [],
    warnings: [],
  };
}

export function textResponse(artifact: TextGeometryArtifact): CompanionTextResponse {
  return {
    ok: true,
    target: artifact.basis.target,
    adapterVersion: artifact.provenance.adapterVersion,
    environmentKey: artifact.provenance.environmentKey,
    requestKey: artifact.key,
    glyphs: artifact.glyphs,
    bbox: artifact.bbox,
    logicalBBox: artifact.logicalBBox,
    lines: artifact.lines,
    provenance: artifact.provenance,
    diagnostics: artifact.diagnostics,
    warnings: artifact.warnings,
  };
}
