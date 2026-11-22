/* Literal text and the portable geometry payload contract. No native or browser renderer is
 * required to validate owned geometry or compare it with its authored source. */
import { z } from 'zod';
import type { TextFormula, TextGeometryArtifact, TextRequestBasis } from './types';

export const MAX_TEXT_SOURCE_BYTES = 32 * 1024;
export const MAX_TEXT_LINES = 512;
export const MAX_TEXT_GLYPHS = 8192;
export const MAX_TEXT_POINTS = 500_000;
export const MAX_TEXT_ARTIFACT_BYTES = 16 * 1024 * 1024;
export const TEXT_GEOMETRY_MIME_TYPE = 'application/vnd.manim-formula-editor.text-geometry+json';

/** JSON can contain lone surrogates; passing one through UTF-8 must not silently replace the
 * author's source. NUL cannot be passed safely through the native string APIs. */
export function validTextUnicode(source: string): boolean {
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === 0 || (code >= 0xdc00 && code <= 0xdfff)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    }
  }
  return true;
}

/** A source offset may lie between code points, never inside a surrogate pair. */
export function isTextBoundary(source: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) return false;
  if (offset === 0 || offset === source.length) return true;
  const before = source.charCodeAt(offset - 1);
  const after = source.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

export const TextSourceSchema = z
  .string()
  .max(MAX_TEXT_SOURCE_BYTES)
  .refine(validTextUnicode, 'Text must contain valid Unicode and no NUL characters.')
  .refine(
    (source) => new TextEncoder().encode(source).byteLength <= MAX_TEXT_SOURCE_BYTES,
    `Text must fit within ${MAX_TEXT_SOURCE_BYTES} UTF-8 bytes.`,
  )
  .refine(
    (source) => source.split('\n').length <= MAX_TEXT_LINES,
    `Text may have at most ${MAX_TEXT_LINES} lines.`,
  );

export const TextFontSchema = z.object({
  family: z
    .string()
    .min(1)
    .max(256)
    .refine(
      (family) => family.trim() === family && validTextUnicode(family),
      'Invalid font family.',
    ),
  weight: z.enum(['normal', 'bold']),
  slant: z.enum(['normal', 'italic']),
});

export const TextRequestBasisSchema = z.object({
  source: TextSourceSchema,
  font: TextFontSchema,
  fontSize: z.number().positive(),
  target: z.enum(['ce', 'gl']),
});

const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Key = z.string().min(1).max(1024);

export const TextGeometryRefSchema = z.object({
  contentHash: Hash,
  byteLength: z.number().int().positive().max(MAX_TEXT_ARTIFACT_BYTES),
  key: Key,
  basisKey: Key,
});

const Coordinate = z.number().min(-1e9).max(1e9);
const BoxSchema = z
  .object({ minX: Coordinate, minY: Coordinate, maxX: Coordinate, maxY: Coordinate })
  .refine((box) => box.minX <= box.maxX && box.minY <= box.maxY, 'Invalid geometry bounds.');
const RangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
const RangesSchema = z.array(RangeSchema).max(MAX_TEXT_GLYPHS);
const ContourSchema = z
  .array(Coordinate)
  .min(2)
  .max(MAX_TEXT_POINTS * 2)
  .refine((contour) => (contour.length - 2) % 6 === 0, 'Invalid cubic contour.');

export const TextGeometryArtifactSchema = z
  .object({
    format: z.literal('mfe-text-geometry'),
    version: z.literal(1),
    basis: TextRequestBasisSchema,
    basisKey: Key,
    key: Key,
    glyphs: z
      .array(
        z.object({
          index: z.number().int().nonnegative(),
          label: z.string().max(MAX_TEXT_SOURCE_BYTES),
          kind: z.enum(['char', 'rule']),
          contours: z.array(ContourSchema).max(MAX_TEXT_POINTS),
          bbox: BoxSchema,
          sourceRanges: RangesSchema,
        }),
      )
      .max(MAX_TEXT_GLYPHS),
    bbox: BoxSchema,
    logicalBBox: BoxSchema,
    lines: z
      .array(RangeSchema.extend({ baseline: Coordinate, bbox: BoxSchema }))
      .max(MAX_TEXT_LINES),
    provenance: z.object({
      environmentKey: Key,
      adapterVersion: Key,
      geometrySignature: Hash.optional(),
      versions: z.record(z.string().max(128), z.string().max(256)),
      calibration: z.number().positive(),
      resolvedFonts: z
        .array(
          z.object({
            family: z.string().max(256),
            face: z.string().max(256),
            weight: z.string().max(128),
            slant: z.string().max(128),
            fontHash: Hash.nullable(),
            faceIndex: z.number().int().nonnegative().nullable(),
            ranges: RangesSchema,
          }),
        )
        .max(MAX_TEXT_GLYPHS),
    }),
    diagnostics: z
      .array(
        z.object({
          code: z.string().min(1).max(128),
          message: z.string().max(4096),
          ranges: RangesSchema,
        }),
      )
      .max(MAX_TEXT_GLYPHS),
    warnings: z.array(z.string().max(4096)).max(MAX_TEXT_GLYPHS),
  })
  .superRefine((artifact, ctx) => {
    const source = artifact.basis.source;
    const checkRange = (range: { start: number; end: number }, path: (string | number)[]) => {
      if (
        range.end < range.start ||
        !isTextBoundary(source, range.start) ||
        !isTextBoundary(source, range.end)
      ) {
        ctx.addIssue({ code: 'custom', path, message: 'Invalid UTF-16 source range.' });
      }
    };
    let points = 0;
    const contains = (
      box: { minX: number; minY: number; maxX: number; maxY: number },
      x: number,
      y: number,
    ) => {
      const epsilon = 1e-7 * Math.max(1, Math.abs(x), Math.abs(y));
      return (
        x >= box.minX - epsilon &&
        x <= box.maxX + epsilon &&
        y >= box.minY - epsilon &&
        y <= box.maxY + epsilon
      );
    };
    artifact.glyphs.forEach((glyph, index) => {
      if (glyph.index !== index) {
        ctx.addIssue({
          code: 'custom',
          path: ['glyphs', index, 'index'],
          message: 'Unordered glyphs.',
        });
      }
      for (const contour of glyph.contours) {
        points += contour.length / 2;
        for (let i = 0; i < contour.length; i += 2) {
          if (!contains(glyph.bbox, contour[i]!, contour[i + 1]!)) {
            ctx.addIssue({
              code: 'custom',
              path: ['glyphs', index, 'bbox'],
              message: 'Glyph bounds exclude its points.',
            });
            break;
          }
        }
      }
      if (
        !contains(artifact.bbox, glyph.bbox.minX, glyph.bbox.minY) ||
        !contains(artifact.bbox, glyph.bbox.maxX, glyph.bbox.maxY)
      ) {
        ctx.addIssue({ code: 'custom', path: ['bbox'], message: 'Text bounds exclude a glyph.' });
      }
      glyph.sourceRanges.forEach((range, i) =>
        checkRange(range, ['glyphs', index, 'sourceRanges', i]),
      );
    });
    if (points > MAX_TEXT_POINTS) {
      ctx.addIssue({
        code: 'custom',
        path: ['glyphs'],
        message: 'Text geometry has too many points.',
      });
    }
    artifact.lines.forEach((line, index) => checkRange(line, ['lines', index]));
    artifact.provenance.resolvedFonts.forEach((font, index) =>
      font.ranges.forEach((range, i) =>
        checkRange(range, ['provenance', 'resolvedFonts', index, 'ranges', i]),
      ),
    );
    artifact.diagnostics.forEach((diagnostic, index) =>
      diagnostic.ranges.forEach((range, i) =>
        checkRange(range, ['diagnostics', index, 'ranges', i]),
      ),
    );
  }) satisfies z.ZodType<TextGeometryArtifact>;

/** Throws a structured validation error; callers must validate before publishing or owning it. */
export function validateTextGeometryArtifact(value: unknown): TextGeometryArtifact {
  return TextGeometryArtifactSchema.parse(value);
}

export function textRequestBasis(
  formula: Pick<TextFormula, 'source' | 'font' | 'fontSize'>,
  target: TextRequestBasis['target'],
): TextRequestBasis {
  return { source: formula.source, font: { ...formula.font }, fontSize: formula.fontSize, target };
}

/** Source freshness is independent of the machine currently available to render it. */
export function sameTextBasis(a: TextRequestBasis, b: TextRequestBasis): boolean {
  return (
    a.source === b.source &&
    a.font.family === b.font.family &&
    a.font.weight === b.font.weight &&
    a.font.slant === b.font.slant &&
    a.fontSize === b.fontSize &&
    a.target === b.target
  );
}
