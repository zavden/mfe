// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DIALECTS, renderCommand } from '../dialect';

describe('dialect', () => {
  it('names the same things for ManimCE and ManimGL', () => {
    expect(DIALECTS.ce).toMatchObject({
      importLine: 'from manim import *',
      create: 'Create',
      texSetupKw: 'tex_template',
      glyphsPrefix: '[0]',
      bareGlyph: true,
    });
    expect(DIALECTS.gl).toMatchObject({
      importLine: 'from manimlib import *',
      create: 'ShowCreation',
      texSetupKw: 'additional_preamble',
      glyphsPrefix: '',
      bareGlyph: false,
    });
    expect(Object.keys(DIALECTS.gl)).toEqual(Object.keys(DIALECTS.ce));
  });

  it('renders at the size and frame rate, each with its own command line', () => {
    const size = { width: 1920, height: 1080, fps: 30 };
    expect(renderCommand('ce', 'Scene.py', 'Scene', size)).toBe(
      'manim -r 1920,1080 --fps 30 Scene.py Scene',
    );
    expect(renderCommand('gl', 'Scene.py', 'Scene', size)).toBe(
      'manimgl Scene.py Scene -w -r 1920x1080 --fps 30',
    );
  });
});
