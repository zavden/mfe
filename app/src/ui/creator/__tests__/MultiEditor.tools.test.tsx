import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createColorMatch,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  type Formula,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore } from '../../../store';
import { MultiEditor } from '../MultiEditor';

/* The tools of the whole formulas in «Edit together» (D155): one Scale for all, and Match colors.
 * The colours a list gives are applyColorMatch's (its own tests, and e2e/multiEditor.spec.ts). */
const formulas = () => useProjectStore.getState().project.formulas;

function open(objects: Formula[], lists = 0) {
  const project = createEmptyProject();
  project.formulas = objects;
  project.colorMatches = Array.from({ length: lists }, (_, i) =>
    createColorMatch(`List ${i + 1}`, [{ pattern: 'x', color: '#FC6255' }]),
  );
  loadProject(project);
  useRenderStore.setState({ entries: {}, resolved: new Map() });
  render(<MultiEditor ids={objects.map((f) => f.id)} onClose={() => {}} />);
}

beforeEach(() => {
  loadProject(createEmptyProject());
});

describe('the Scale of Edit together', () => {
  it('says "mixed" while the scales differ; a value gives it to all, as one undo step', () => {
    open([
      { ...createFormula({ name: 'f1', fontSize: 48 }), id: 'a' },
      { ...createTexFormula({ name: 't1', fontSize: 72 }), id: 'b' },
    ]);
    const field = screen.getByTestId('multi-scale') as HTMLInputElement;
    expect(field).toHaveAccessibleName('Scale');
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('mixed');
    expect(screen.queryByTestId('multi-scale-note')).toBeNull();

    fireEvent.change(field, { target: { value: '20' } });
    expect(screen.getByTestId('multi-scale-error')).toHaveTextContent(
      'A number or a fraction from 0.1 to 10.',
    );
    fireEvent.change(field, { target: { value: '3/2' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(formulas().map((f) => f.fontSize)).toEqual([72, 72]);
    expect(field.value).toBe('1.5');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(formulas().map((f) => f.fontSize)).toEqual([48, 72]);
    expect(field.value).toBe('');
  });

  it('leaves out what has no scale, and says how many', () => {
    open([
      { ...createFormula({ name: 'f1', fontSize: 48 }), id: 'a' },
      { ...createShapeFormula({ name: 's1' }), id: 's' },
    ]);
    expect((screen.getByTestId('multi-scale') as HTMLInputElement).value).toBe('1');
    expect(screen.getByTestId('multi-scale-note')).toHaveTextContent(
      'Not for 1 of them: braces, shapes and lines take the size of what they mark.',
    );
  });
});

describe('Match colors in Edit together', () => {
  it('lists the project’s lists, by name and colours, as the menu of the selection does', () => {
    open(
      [
        { ...createFormula({ name: 'f1' }), id: 'a' },
        { ...createTexFormula({ name: 't1' }), id: 'b' },
      ],
      2,
    );
    const button = screen.getByTestId('multi-match');
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const [first, second] = useProjectStore.getState().project.colorMatches;
    expect(screen.getByTestId(`multi-match-${first!.id}`)).toHaveTextContent('List 1');
    expect(screen.getByTestId(`multi-match-${second!.id}`)).toHaveTextContent('List 2');
    // Each with the colours it gives, as ColorMatchLabel draws them.
    const swatches = screen
      .getByTestId(`multi-match-${first!.id}`)
      .querySelectorAll('.match-swatch');
    expect([...swatches].map((swatch) => swatch.getAttribute('data-color'))).toEqual(['#FC6255']);
  });

  it('offers to make one while the project has none', () => {
    open([
      { ...createFormula({ name: 'f1' }), id: 'a' },
      { ...createFormula({ name: 'f2' }), id: 'b' },
    ]);
    fireEvent.click(screen.getByTestId('multi-match'));
    expect(screen.getByTestId('multi-match-create')).toHaveTextContent('Create match colors…');
  });

  it('is off, saying why, when one of the objects cannot take match colours', () => {
    open(
      [
        { ...createFormula({ name: 'f1' }), id: 'a' },
        { ...createTextFormula({ name: 'p1' }), id: 'p' },
      ],
      1,
    );
    const button = screen.getByTestId('multi-match');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'p1 is a Text (font): it has no LaTeX to find the patterns in',
    );
  });
});
