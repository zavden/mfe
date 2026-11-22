/* What the two Manim dialects call the same things: the names the generator writes. The class of
 * each kind of object is its emitter's (emitters.ts: ManimCE's `Tex` is text, ManimGL's is math).
 * Where ManimCE and ManimGL need different code — a TexTemplate against a preamble string, how a
 * formula is coloured, Unwrite, the frame, the background — the generator keeps the branch next
 * to its reason (ARCHITECTURE §8). */
import type { Target } from '../../model';

export interface Dialect {
  /** The library and version the generated file is written for. */
  library: string;
  importLine: string;
  /** The animation that draws a mobject's strokes. */
  create: 'Create' | 'ShowCreation';
  /** The variable holding an extra preamble, and the keyword that passes it to the mobject. */
  texSetupVar: 'template' | 'preamble';
  texSetupKw: 'tex_template' | 'additional_preamble';
  /** Between a formula and its glyphs: CE wraps them in one submobject, `f1[0][g]`. */
  glyphsPrefix: '[0]' | '';
  /** Whether a single glyph can be animated bare, outside a VGroup: GL counts the group as
   * stagger slot 0 and would lose it. */
  bareGlyph: boolean;
}

export const DIALECTS: Readonly<Record<Target, Dialect>> = {
  ce: {
    library: 'ManimCE 0.22',
    importLine: 'from manim import *',
    create: 'Create',
    texSetupVar: 'template',
    texSetupKw: 'tex_template',
    glyphsPrefix: '[0]',
    bareGlyph: true,
  },
  gl: {
    library: 'ManimGL 1.7',
    importLine: 'from manimlib import *',
    create: 'ShowCreation',
    texSetupVar: 'preamble',
    texSetupKw: 'additional_preamble',
    glyphsPrefix: '',
    bareGlyph: false,
  },
};

/** The command that renders the scene file at the project's size and frame rate. */
export function renderCommand(
  target: Target,
  file: string,
  scene: string,
  { width, height, fps }: { width: number; height: number; fps: number },
): string {
  return target === 'ce'
    ? `manim -r ${width},${height} --fps ${fps} ${file} ${scene}`
    : `manimgl ${file} ${scene} -w -r ${width}x${height} --fps ${fps}`;
}
