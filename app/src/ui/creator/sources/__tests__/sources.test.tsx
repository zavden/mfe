import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createBraceFormula,
  createFormula,
  createLineFormula,
  createShapeFormula,
  createTexFormula,
  KINDS,
} from '../../../../model';
import { sameDraft, SOURCE_PANELS, sourcePanelOf, withDraft } from '../index';

describe('a shape’s fill colour in its panel (D123)', () => {
  const { Panel } = SOURCE_PANELS.shape;
  const draftOf = (fields: Parameters<typeof createShapeFormula>[0] = {}) =>
    SOURCE_PANELS.shape.draftOf(createShapeFormula({ name: 's1', ...fields }));

  it('is the stroke’s until it is given one of its own, which starts from the object’s colour', () => {
    const onChange = vi.fn();
    render(<Panel draft={draftOf()} color="#58C4DD" onChange={onChange} />);
    const own = screen.getByTestId('shape-fill-color-on');
    expect(own).not.toBeChecked();
    expect(screen.queryByTestId('shape-fill-color')).toBeNull();
    fireEvent.click(own);
    expect(onChange).toHaveBeenLastCalledWith({ fillColor: '#58C4DD' });
  });

  it('is edited once it has one, and given back to the stroke by unticking', () => {
    const onChange = vi.fn();
    const draft = draftOf({ fillColor: '#FF8800' });
    expect(draft.fillColor).toBe('#FF8800');
    render(<Panel draft={draft} color="#58C4DD" onChange={onChange} />);
    expect(screen.getByTestId('shape-fill-color-on')).toBeChecked();
    const field = screen.getByTestId('shape-fill-color');
    fireEvent.change(field, { target: { value: '#00ff00' } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenLastCalledWith({ fillColor: '#00FF00' });
    fireEvent.click(screen.getByTestId('shape-fill-color-on'));
    expect(onChange).toHaveBeenLastCalledWith({ fillColor: undefined });
    // A draft with and without one are different drafts; two without one are the same.
    expect(sameDraft(draft, draftOf())).toBe(false);
    expect(sameDraft(draftOf(), { ...draftOf(), fillColor: undefined })).toBe(true);
  });

  it('is not offered for a line, a cross or a cross line, which have no inside', () => {
    for (const shape of ['underline', 'cross', 'cross_line'] as const) {
      const view = render(<Panel draft={draftOf({ shape })} onChange={vi.fn()} />);
      expect(screen.queryByTestId('shape-fill-color-on')).toBeNull();
      expect(screen.queryByTestId('shape-fill-opacity')).toBeNull();
      view.unmount();
    }
  });
});

describe('the diagonal of a cross line, in the shape source panel', () => {
  const { Panel } = SOURCE_PANELS.shape;
  const draftOf = (fields: Parameters<typeof createShapeFormula>[0] = {}) =>
    SOURCE_PANELS.shape.draftOf(createShapeFormula({ width: 2, height: 1, ...fields }));

  it('is offered for a cross line alone, the rising one chosen when it names none', () => {
    const box = render(<Panel draft={draftOf()} onChange={vi.fn()} />);
    expect(screen.queryByTestId('shape-diagonal')).toBeNull();
    box.unmount();
    const onChange = vi.fn();
    render(<Panel draft={draftOf({ shape: 'cross_line' })} onChange={onChange} />);
    const choice = (name: string) => screen.getByRole('radio', { name });
    expect(choice('DL-UR')).toHaveAttribute('aria-checked', 'true');
    expect(choice('UL-DR')).toHaveAttribute('aria-checked', 'false');
    // The falling one is kept by the draft; the rising one is the absence of the field.
    fireEvent.click(choice('UL-DR'));
    expect(onChange).toHaveBeenLastCalledWith({ diagonal: 'ul_dr' });
    fireEvent.click(choice('DL-UR'));
    expect(onChange).toHaveBeenLastCalledWith({ diagonal: undefined });
  });

  it('is in the draft, and goes when the shape is changed to another', () => {
    const draft = draftOf({ shape: 'cross_line', diagonal: 'ul_dr' });
    expect(draft).toMatchObject({ shape: 'cross_line', diagonal: 'ul_dr' });
    const onChange = vi.fn();
    render(<Panel draft={draft} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'UL-DR' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Cross' }));
    expect(onChange).toHaveBeenLastCalledWith({ shape: 'cross', diagonal: undefined });
  });
});

describe('source panels', () => {
  it('has a panel per kind of object', () => {
    expect(Object.keys(SOURCE_PANELS)).toEqual(Object.keys(KINDS));
  });

  it("a formula's draft is its source and packages, as a copy", () => {
    const formula = createFormula({ source: 'a+b', packages: ['physics'] });
    const draft = SOURCE_PANELS.math.draftOf(formula);
    expect(draft).toEqual({ source: 'a+b', packages: ['physics'] });
    expect(draft.packages).not.toBe(formula.packages);
    expect(withDraft(formula, { source: 'x', packages: [] })).toEqual({
      ...formula,
      source: 'x',
      packages: [],
    });
  });

  it('compares drafts field by field', () => {
    expect(sourcePanelOf(createFormula())).toBe(SOURCE_PANELS.math);
    expect(sameDraft({ source: 'a', packages: ['p'] }, { source: 'a', packages: ['p'] })).toBe(
      true,
    );
    expect(sameDraft({ source: 'a', packages: ['p'] }, { source: 'a', packages: [] })).toBe(false);
    expect(sameDraft({ source: 'a', packages: [] }, { source: 'b', packages: [] })).toBe(false);
  });

  it("a text's draft is its source and layout, as a copy; it is edited elsewhere", () => {
    const text = createTexFormula({
      source: 'Hi',
      layout: { width: 4, align: 'left', lineSpacing: 1 },
    });
    const draft = SOURCE_PANELS.tex.draftOf(text);
    expect(draft).toEqual({ source: 'Hi', layout: { width: 4, align: 'left', lineSpacing: 1 } });
    expect(draft.layout).not.toBe(text.layout);
    expect(sourcePanelOf(text)).toBe(SOURCE_PANELS.tex);
    // The composition workspace edits a text: the formula editor is never mounted on one.
    const { Panel } = SOURCE_PANELS.tex;
    const { container } = render(<Panel draft={draft} onChange={vi.fn()} />);
    expect(container.textContent).toMatch(/text composition editor/);
    expect(screen.queryByTestId('tex-source')).toBeNull();
  });

  it('the formula panel edits the LaTeX and the packages as patches of the draft', () => {
    const onChange = vi.fn();
    const { Panel } = SOURCE_PANELS.math;
    render(<Panel draft={{ source: 'a+b', packages: [] }} onChange={onChange} />);
    expect(screen.getByTestId('raw-latex')).toHaveValue('a+b');
    fireEvent.change(screen.getByTestId('raw-latex'), { target: { value: 'a+c' } });
    expect(onChange).toHaveBeenLastCalledWith({ source: 'a+c' });
    fireEvent.click(screen.getByTestId('package-quick-physics'));
    expect(onChange).toHaveBeenLastCalledWith({ packages: ['physics'] });
  });
});

describe('the brace panel', () => {
  it("a brace's draft is its sharpness and width; the panel edits both and says the rest is the clip's", () => {
    const brace = createBraceFormula({ sharpness: 1.5, width: 2.123456 });
    const draft = SOURCE_PANELS.brace.draftOf(brace);
    expect(draft).toEqual({ source: '', sharpness: 1.5, width: 2.123456 });
    expect(sourcePanelOf(brace)).toBe(SOURCE_PANELS.brace);
    const onChange = vi.fn();
    const { Panel } = SOURCE_PANELS.brace;
    render(<Panel draft={draft} onChange={onChange} />);
    expect(screen.getByTestId('brace-source-hint').textContent).toContain('Animations panel');
    const sharpness = screen.getByTestId('brace-sharpness');
    expect(sharpness).toHaveValue('1.5');
    fireEvent.change(sharpness, { target: { value: '3' } });
    fireEvent.blur(sharpness);
    expect(onChange).toHaveBeenLastCalledWith({ sharpness: 3 });
    const width = screen.getByTestId('brace-width');
    expect(width).toHaveValue('2.1235');
    fireEvent.change(width, { target: { value: '0' } });
    fireEvent.blur(width);
    expect(onChange).not.toHaveBeenLastCalledWith({ width: 0 });
  });
});

describe('the shape panel', () => {
  it("a shape's draft is its shape, style, corners and size; the panel edits them as patches", () => {
    const shape = createShapeFormula({ width: 2.123456, height: 1, cornerRadius: 0.2 });
    const draft = SOURCE_PANELS.shape.draftOf(shape);
    expect(draft).toEqual({
      source: '',
      shape: 'box',
      style: { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 },
      cornerRadius: 0.2,
      width: 2.123456,
      height: 1,
    });
    expect(draft.style).not.toBe(shape.style);
    expect(sourcePanelOf(shape)).toBe(SOURCE_PANELS.shape);
    const onChange = vi.fn();
    const { Panel } = SOURCE_PANELS.shape;
    const { rerender } = render(<Panel draft={draft} onChange={onChange} />);
    expect(screen.getByTestId('shape-source-hint').textContent).toContain('Animations panel');
    fireEvent.click(screen.getByTestId('shape-kind-circle'));
    expect(onChange).toHaveBeenLastCalledWith({ shape: 'circle' });
    const width = screen.getByTestId('shape-stroke-width');
    expect(width).toHaveValue('4');
    fireEvent.change(width, { target: { value: '2' } });
    fireEvent.blur(width);
    expect(onChange).toHaveBeenLastCalledWith({
      style: { fillOpacity: 0, strokeWidth: 2, strokeOpacity: 1 },
    });
    const fill = screen.getByTestId('shape-fill-opacity');
    fireEvent.change(fill, { target: { value: '0.3' } });
    fireEvent.blur(fill);
    expect(onChange).toHaveBeenLastCalledWith({
      style: { fillOpacity: 0.3, strokeWidth: 4, strokeOpacity: 1 },
    });
    fireEvent.change(fill, { target: { value: '2' } });
    expect(screen.getByTestId('shape-fill-opacity-error')).toHaveTextContent(/between 0 and 1/);
    const corner = screen.getByTestId('shape-corner');
    expect(corner).toHaveValue('0.2');
    fireEvent.change(corner, { target: { value: '0' } });
    fireEvent.blur(corner);
    expect(onChange).toHaveBeenLastCalledWith({ cornerRadius: 0 });
    expect(screen.getByTestId('shape-width')).toHaveValue('2.1235');
    fireEvent.change(screen.getByTestId('shape-height'), { target: { value: '0.5' } });
    fireEvent.blur(screen.getByTestId('shape-height'));
    expect(onChange).toHaveBeenLastCalledWith({ height: 0.5 });
    // A line has no fill and no corners to speak of.
    rerender(<Panel draft={{ ...draft, shape: 'underline' }} onChange={onChange} />);
    expect(screen.queryByTestId('shape-fill-opacity')).toBeNull();
    expect(screen.queryByTestId('shape-corner')).toBeNull();
  });
});

describe('the line panel', () => {
  it('takes a dash no shorter than the Animations panel does: a shorter one is not committed', () => {
    const onChange = vi.fn();
    const { Panel, draftOf } = SOURCE_PANELS.line;
    render(<Panel draft={draftOf(createLineFormula({ line: 'dashed' }))} onChange={onChange} />);
    const field = screen.getByTestId('line-dash-length');
    expect(field).toHaveValue('0.05');
    for (const text of ['1e-9', '0.009', '0', '-1', 'x']) {
      fireEvent.change(field, { target: { value: text } });
      expect(screen.getByTestId('line-dash-length-error')).toHaveTextContent('0.01 or more');
      fireEvent.blur(field);
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '0.01' } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenLastCalledWith({ dashLength: 0.01 });
  });
});
