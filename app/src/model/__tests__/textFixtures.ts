import type { TextGeometryArtifact } from '../types';

/** Valid small payload for persistence tests, independent of installed fonts or native tools. */
export function textGeometryFixture(source = 'A'): TextGeometryArtifact {
  const bbox = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    format: 'mfe-text-geometry',
    version: 1,
    basis: {
      source,
      font: { family: 'Fixture Sans', weight: 'normal', slant: 'normal' },
      fontSize: 48,
      target: 'ce',
    },
    key: `pango-result-${source}`,
    basisKey: `pango-basis-${source}`,
    glyphs: [
      {
        index: 0,
        label: source,
        kind: 'char',
        contours: [[0, 0, 0, 1, 1, 1, 1, 0]],
        bbox: { ...bbox },
        sourceRanges: [{ start: 0, end: source.length }],
      },
    ],
    bbox: { ...bbox },
    logicalBBox: { ...bbox },
    lines: [{ start: 0, end: source.length, baseline: 0, bbox: { ...bbox } }],
    provenance: {
      environmentKey: 'fixture-env',
      adapterVersion: 'fixture-adapter',
      versions: { pango: 'fixture' },
      calibration: 1,
      resolvedFonts: [
        {
          family: 'Fixture Sans',
          face: 'Regular',
          weight: 'normal',
          slant: 'normal',
          fontHash: null,
          faceIndex: null,
          ranges: [{ start: 0, end: source.length }],
        },
      ],
    },
    diagnostics: [],
    warnings: [],
  };
}
