import { describe, expect, it } from 'vitest';
import {
  fixedTextMeasurer,
  renderRequestFor,
  type CompanionHealth,
  type CompanionPango,
  type CompanionState,
  resolveFormula,
  savedBoxesRender,
  textArtifactRender,
  textBoxesKey,
  textSavedBoxesKey,
  toSnapshot,
  type FormulaRender,
  type TextRenderRequest,
} from '../../../engine';
import { textBoxesRender } from '../../../engine/textBoxes';
import { createFormula, createTextFormula, type Target, type TextFormula } from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { textGeometry } from '../../../test/textGeometry';
import { companionTextNote, formulaStatus, NEEDS_COMPANION } from '../formulaStatus';

const entry = (patch: Partial<FormulaRenderEntry>): FormulaRenderEntry => ({
  status: 'ok',
  resolved: null,
  error: null,
  ...patch,
});

describe('formulaStatus', () => {
  it('says empty for a blank formula not rendered yet, … for one with a source', () => {
    expect(formulaStatus(undefined, createFormula({ name: 'f', source: '' }))).toMatchObject({
      status: 'idle',
      label: 'empty',
    });
    expect(
      formulaStatus(entry({ status: 'idle' }), createFormula({ name: 'f', source: 'x' })),
    ).toMatchObject({ status: 'idle', label: '…', exact: false, title: undefined });
  });

  it('says rendering, error (with the reason) or the source of the glyphs', () => {
    const f = createFormula({ name: 'f', source: 'x' });
    expect(formulaStatus(entry({ status: 'loading' }), f)).toMatchObject({
      status: 'loading',
      label: 'rendering…',
    });
    const failed = formulaStatus(
      entry({
        status: 'error',
        error: { backend: 'mathjax', message: 'Undefined control sequence' },
      }),
      f,
    );
    expect(failed).toMatchObject({ status: 'error', label: 'error' });
    expect(failed.title).toContain('Undefined control sequence');
    const mathjax = formulaStatus(
      entry({ resolved: { render: { exact: false } } as FormulaRenderEntry['resolved'] }),
      f,
    );
    expect(mathjax).toMatchObject({ status: 'ok', exact: false, label: 'MathJax' });
    expect(mathjax.title).toContain('MathJax');
    const exact = formulaStatus(
      entry({ resolved: { render: { exact: true } } as FormulaRenderEntry['resolved'] }),
      f,
    );
    expect(exact).toMatchObject({ status: 'ok', exact: true, label: 'exact' });
    expect(exact.title).toContain('LaTeX');
  });
});

describe('formulaStatus of a font text', () => {
  /** A text shaped by `by`, as the render sync leaves it. */
  function shaped(by: Target) {
    const artifact = textGeometry('AB', undefined, by);
    const render = textArtifactRender(artifact);
    const formula: TextFormula = createTextFormula({
      name: 'title',
      source: 'AB',
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
  const drawnBy = (formula: TextFormula, render: FormulaRender) =>
    entry({ resolved: resolveFormula(formula, render) });
  const requestOf = (formula: TextFormula, target: Target) =>
    renderRequestFor(formula, { preamble: '', target }, 'auto') as TextRenderRequest;

  it('is exact with the shape the project’s library gave it', () => {
    const { formula, render } = shaped('gl');
    const status = formulaStatus(drawnBy(formula, render), formula, 'gl');
    expect(status).toMatchObject({ status: 'ok', exact: true, needsCompanion: false });
    expect(status.label).toBe('exact');
    expect(status.title).toContain('Pango');
  });

  it('needs the companion while it is drawn as boxes', () => {
    const formula = createTextFormula({ name: 'title', source: 'AB' });
    const request = requestOf(formula, 'ce');
    const boxes = textBoxesRender(request, textBoxesKey(request), fixedTextMeasurer);
    const status = formulaStatus(drawnBy(formula, boxes), formula, 'ce');
    expect(status).toMatchObject({
      status: 'ok',
      exact: false,
      needsCompanion: true,
      label: NEEDS_COMPANION,
    });
    expect(status.label).toBe('needs the companion');
    expect(status.title).toContain('Placeholder boxes, one per character');
    expect(status.title).toContain('placed, coloured and animated');
  });

  it('says what its boxes say of themselves when that is not the usual', () => {
    const formula = createTextFormula({ name: 'title', source: 'AB' });
    const request = requestOf(formula, 'ce');
    const boxes = textBoxesRender(request, textBoxesKey(request), fixedTextMeasurer);
    const told = { ...boxes, warnings: ['Its saved appearance is not at hand. Refresh it.'] };
    const status = formulaStatus(drawnBy(formula, told), formula, 'ce');
    expect(status).toMatchObject({ needsCompanion: true, label: NEEDS_COMPANION });
    expect(status.title).toBe('Its saved appearance is not at hand. Refresh it.');
  });

  it('needs the companion with the shape the other library gave it, and says whose it is', () => {
    const { formula, render } = shaped('ce');
    const status = formulaStatus(drawnBy(formula, render), formula, 'gl');
    expect(status).toMatchObject({ exact: false, needsCompanion: true, label: NEEDS_COMPANION });
    expect(status.title).toBe(
      "Drawn with the shape ManimCE gave it: the same glyphs, at ManimCE's size. A companion " +
        'that shapes text for ManimGL draws it as ManimGL will.',
    );
  });

  it('says why a text is drawn as boxes where its glyphs were', () => {
    const { formula } = shaped('ce');
    const request = requestOf(formula, 'ce');
    const key = textSavedBoxesKey(request, formula.snapshot!.key);
    const render = savedBoxesRender(formula.snapshot!, request, key, 'Its appearance is gone.');
    const status = formulaStatus(drawnBy(formula, render), formula, 'ce');
    expect(status).toMatchObject({ needsCompanion: true, label: NEEDS_COMPANION });
    expect(status.title).toBe('Its appearance is gone.');
  });

  it('is an error when the companion says what is wrong with it', () => {
    const { formula } = shaped('ce');
    const status = formulaStatus(
      entry({ status: 'error', error: { backend: 'pango', message: 'No such font family.' } }),
      formula,
      'ce',
    );
    expect(status).toMatchObject({ status: 'error', needsCompanion: false, label: 'error' });
    expect(status.title).toContain('No such font family.');
  });
});

describe('why no companion shapes text now', () => {
  const online = (
    pango: CompanionPango | null,
    extra: Partial<CompanionHealth['capabilities']> = {},
  ): CompanionState => ({
    status: 'online',
    health: {
      name: 'mfe-companion',
      version: 'test',
      protocol: 1,
      capabilities: {
        latex: false,
        dvisvgm: false,
        ffmpeg: false,
        manimCE: null,
        manimGL: null,
        pango: { gl: pango },
        ...extra,
      },
    },
  });

  it('says a worker is starting, could not start, or that there is no interpreter', () => {
    expect(companionTextNote(online({ state: 'preparing' }), 'gl')).toBe(
      'The companion is starting its text worker: the text is shaped as soon as it is ready.',
    );
    expect(companionTextNote(online({ state: 'failed', message: 'No Pango here.' }), 'gl')).toBe(
      'The companion could not start its text worker for ManimGL (No Pango here.).',
    );
    expect(companionTextNote(online({ state: 'failed' }), 'gl')).toBe(
      'The companion could not start its text worker for ManimGL.',
    );
    expect(companionTextNote(online(null), 'gl')).toBe(
      'The companion that is running shapes no text for ManimGL: it has no ManimGL interpreter (start it with --gl-python).',
    );
  });

  it('does not blame a missing interpreter while the companion is still looking for it', () => {
    expect(companionTextNote(online(null, { manimProbing: true }), 'gl')).toBeNull();
  });

  it('tells an interpreter that is there from one that is not', () => {
    // The interpreter is found and still there is no font text: an older companion.
    expect(
      companionTextNote(online(null, { manimGL: { python: '/gl/python', version: '1.7' } }), 'gl'),
    ).toBe(
      'The companion that is running shapes no text for ManimGL (font text needs companion 1.6 or later).',
    );
  });

  it('has nothing to add when one does, may, or none is running', () => {
    expect(
      companionTextNote(online({ state: 'ready', adapterVersion: 'a', environmentKey: 'e' }), 'gl'),
    ).toBeNull();
    expect(companionTextNote(online({ state: 'unused' }), 'gl')).toBeNull();
    expect(companionTextNote({ status: 'offline' }, 'gl')).toBeNull();
    expect(companionTextNote({ status: 'checking' }, 'gl')).toBeNull();
  });
});
