// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTextFormula, type Target, type TextFormula } from '../../model';
import { textGeometry } from '../../test/textGeometry';
import { textCountedByBoxes, textDrawing, textShapedFor } from '../engine';
import { toSnapshot } from '../key';
import { textArtifactRender, textBoxesKey, textSavedBoxesKey } from '../pango';
import { renderRequestFor } from '../producers';
import { fixedTextMeasurer, savedBoxesRender, textBoxesRender } from '../textBoxes';
import type { TextRenderRequest } from '../types';

/** A text and the render of its saved geometry, shaped by `target`, as the render sync leaves
 * them: the snapshot and the geometry reference are the render's. */
function shaped(source: string, target: Target) {
  const artifact = textGeometry(source, undefined, target);
  const render = textArtifactRender(artifact);
  const formula: TextFormula = createTextFormula({
    source,
    snapshot: toSnapshot(render),
    geometry: {
      contentHash: 'a'.repeat(64),
      byteLength: 1,
      key: artifact.key,
      basisKey: artifact.basisKey,
    },
  });
  return { formula, render };
}

describe('textShapedFor', () => {
  it.each(['ce', 'gl'] as const)(
    'names the library that shaped the text as it stands (%s)',
    (target) => {
      const { formula, render } = shaped('AB', target);
      expect(textShapedFor(formula, render)).toBe(target);
    },
  );

  it('answers from the geometry reference when the render is not at hand', () => {
    expect(textShapedFor(shaped('AB', 'gl').formula)).toBe('gl');
    expect(textShapedFor(shaped('AB', 'ce').formula, undefined)).toBe('ce');
  });

  it('has no library for a text whose saved geometry is of another source, font or size', () => {
    const { formula, render } = shaped('AB', 'ce');
    for (const changed of [
      { ...formula, source: 'AC' },
      { ...formula, fontSize: formula.fontSize + 1 },
      { ...formula, font: { ...formula.font, weight: 'bold' as const } },
    ]) {
      expect(textShapedFor(changed, render)).toBeNull();
      expect(textShapedFor(changed)).toBeNull();
    }
  });

  it('has none for a text that was never shaped', () => {
    expect(textShapedFor(createTextFormula({ source: 'AB' }))).toBeNull();
  });

  it('takes a first render that has no snapshot yet', () => {
    const { formula, render } = shaped('AB', 'gl');
    expect(textShapedFor({ ...formula, snapshot: null, geometry: null }, render)).toBe('gl');
  });

  it('does not let a render that is not the snapshot’s speak for the glyph references', () => {
    // The references of the project count the glyphs of the snapshot. A render with another key
    // (a newer shaping on its way in) is another geometry: the formula's own reference answers.
    const { formula } = shaped('AB', 'ce');
    const other = textArtifactRender({ ...textGeometry('AB', undefined, 'gl'), key: 'another' });
    expect(textShapedFor(formula, other)).toBe('ce');
    expect(textShapedFor({ ...formula, geometry: null }, other)).toBeNull();
  });
});

describe('textDrawing', () => {
  const meta = (target: Target) => ({ preamble: '', target });
  const requestOf = (formula: TextFormula, target: Target) =>
    renderRequestFor(formula, meta(target), 'auto') as TextRenderRequest;
  const boxesOf = (formula: TextFormula, target: Target) => {
    const request = requestOf(formula, target);
    return textBoxesRender(request, textBoxesKey(request), fixedTextMeasurer);
  };

  it('is exact for the geometry the project’s library shaped', () => {
    const { formula, render } = shaped('AB', 'ce');
    expect(textDrawing(formula, render, meta('ce'))).toBe('exact');
  });

  it('is borrowed for the geometry the other library shaped for the same text', () => {
    const { formula, render } = shaped('AB', 'ce');
    expect(textDrawing(formula, render, meta('gl'))).toBe('borrowed');
  });

  it('is stale for the geometry of an earlier source, font or size', () => {
    const { formula, render } = shaped('AB', 'ce');
    expect(textDrawing({ ...formula, source: 'ABC' }, render, meta('ce'))).toBe('stale');
    expect(textDrawing({ ...formula, fontSize: 60 }, render, meta('ce'))).toBe('stale');
  });

  it('is boxes for the boxes of the text as it stands, and stale for those of another', () => {
    const formula = createTextFormula({ source: 'AB' });
    const boxes = boxesOf(formula, 'ce');
    expect(textDrawing(formula, boxes, meta('ce'))).toBe('boxes');
    // Other boxes: another source, another size, another library.
    expect(textDrawing({ ...formula, source: 'ABC' }, boxes, meta('ce'))).toBe('stale');
    expect(textDrawing({ ...formula, fontSize: 60 }, boxes, meta('ce'))).toBe('stale');
    expect(textDrawing(formula, boxes, meta('gl'))).toBe('stale');
  });

  it('is saved boxes for the boxes of the snapshot of a text whose shape is its own', () => {
    const { formula } = shaped('AB', 'ce');
    const request = requestOf(formula, 'ce');
    const render = savedBoxesRender(
      formula.snapshot!,
      request,
      textSavedBoxesKey(request, formula.snapshot!.key),
    );
    expect(textDrawing(formula, render, meta('ce'))).toBe('saved-boxes');
    // The text moved on: these are the boxes of something it no longer is.
    expect(textDrawing({ ...formula, source: 'ABC' }, render, meta('ce'))).toBe('stale');
  });
});

describe('textCountedByBoxes', () => {
  const meta = { preamble: '', target: 'ce' as const };
  const boxesOf = (formula: TextFormula) => {
    const request = renderRequestFor(formula, meta, 'auto') as TextRenderRequest;
    return textBoxesRender(request, textBoxesKey(request), fixedTextMeasurer);
  };
  const resolved = (render: ReturnType<typeof boxesOf>, confidence: number) => ({
    render,
    confidence,
  });

  it('counts a text whose snapshot is the one of its boxes', () => {
    const draft = createTextFormula({ source: 'AB' });
    const boxes = boxesOf(draft);
    const formula = { ...draft, snapshot: toSnapshot(boxes) };
    expect(textCountedByBoxes(formula, resolved(boxes, 1), meta)).toBe(true);
    // The render not at hand: the snapshot's key says it.
    expect(textCountedByBoxes(formula, undefined, meta)).toBe(true);
    // First render, the snapshot still to be taken: the boxes themselves.
    expect(textCountedByBoxes(draft, resolved(boxes, 1), meta)).toBe(true);
  });

  it('counts an earlier shape of the same source that was carried over to the boxes', () => {
    const { formula } = shaped('AB', 'ce');
    const resized = { ...formula, fontSize: 60 };
    expect(textCountedByBoxes(resized, resolved(boxesOf(resized), 1), meta)).toBe(true);
  });

  it('does not count boxes drawn over a snapshot nothing could carry over to them', () => {
    // The geometry the references count by is gone and the source moved on: confidence 0.
    const { formula } = shaped('AB', 'ce');
    const edited = { ...formula, source: 'ABC' };
    expect(textCountedByBoxes(edited, resolved(boxesOf(edited), 0), meta)).toBe(false);
    // Nor a shaped snapshot with nothing resolved: its count is not the boxes'.
    expect(textCountedByBoxes(edited, undefined, meta)).toBe(false);
  });

  it('does not count a snapshot with the key of the boxes and another number of glyphs', () => {
    // Boxes cut by another rule (an earlier version, a file written by hand): the key says "the
    // boxes of this text", the count says otherwise, and the indices are of the other cut.
    const draft = createTextFormula({ source: 'AB' });
    const boxes = boxesOf(draft);
    const snapshot = toSnapshot(boxes);
    const stranger = {
      ...draft,
      snapshot: {
        ...snapshot,
        glyphs: [...snapshot.glyphs, { ...snapshot.glyphs[0]!, label: '!' }],
      },
    };
    // As the sync leaves it: the boxes of the text, unsure of every reference.
    expect(textCountedByBoxes(stranger, resolved(boxes, 0), meta)).toBe(false);
    expect(textCountedByBoxes(stranger, resolved(boxes, 1), meta)).toBe(false);
    expect(textCountedByBoxes(stranger, undefined, meta)).toBe(false);
  });

  it('does not count boxes that are not those of the text as it stands', () => {
    const draft = createTextFormula({ source: 'AB' });
    const boxes = boxesOf(draft);
    const formula = { ...draft, snapshot: toSnapshot(boxes) };
    const edited = { ...formula, source: 'ABC' };
    expect(textCountedByBoxes(edited, resolved(boxes, 1), meta)).toBe(false);
    expect(textCountedByBoxes(formula, resolved(boxes, 1), { ...meta, target: 'gl' })).toBe(false);
    // Nor a shape: it has a count of its own, and other words in the exports.
    const exact = shaped('AB', 'ce');
    expect(textCountedByBoxes(exact.formula, { render: exact.render, confidence: 1 }, meta)).toBe(
      false,
    );
  });
});
