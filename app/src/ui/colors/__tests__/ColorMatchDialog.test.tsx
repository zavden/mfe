import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { producerOf, resolveFormula, toSnapshot, type RenderRequest } from '../../../engine';
import { createColorMatch, createEmptyProject, createFormula, type Formula } from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { ColorMatchDialog, ColorMatchDialogHost } from '../ColorMatchDialog';
import { overlapNote } from '../useMatchPreview';
import { useColorMatchDialog } from '../colorMatchDialogStore';

const lists = () => useProjectStore.getState().project.colorMatches;

/** MathJax renders keyed by their source, so a formula's snapshot is the identity of its render. */
const engine = {
  render: async (request: RenderRequest) =>
    producerOf(request.kind).free(
      request,
      `k:${request.kind === 'math' ? request.latex : request.kind === 'tex' ? request.source : 'brace'}`,
    ),
};

/** Render `formula` through `engine` and publish it in the render store. */
async function published(formula: Formula): Promise<Formula> {
  const result = await engine.render({
    kind: 'math',
    latex: formula.source,
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'mathjax',
  });
  if (!result.ok) throw new Error(result.error.message);
  const withSnapshot = { ...formula, snapshot: toSnapshot(result.render) };
  useRenderStore.getState().setEntry(formula.id, {
    status: 'ok',
    resolved: resolveFormula(withSnapshot, result.render),
    error: null,
  });
  return withSnapshot;
}

function setup() {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'f1', source: 'x' });
  project.formulas.push(formula);
  const course = createColorMatch('Course', [{ pattern: 'x', color: '#FC6255' }]);
  const grey = createColorMatch('Greyscale', []);
  project.colorMatches.push(course, grey);
  loadProject(project);
  history.clear();
  return { formula, course, grey };
}

afterEach(() => {
  useColorMatchDialog.setState({ shown: null });
  useUiStore.setState({ selection: { kind: 'none' } });
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
});

describe('ColorMatchDialog', () => {
  it('shows the lists and the shown list, and switches between them', async () => {
    const { course, grey } = setup();
    const user = userEvent.setup();
    render(<ColorMatchDialog shown={course.id} onClose={() => {}} />);
    expect(screen.getByTestId('match-colors-name')).toHaveValue('Course');
    expect(screen.getByTestId('match-colors-pattern-0')).toHaveValue('x');
    expect(screen.getByTestId(`match-colors-list-${course.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByTestId(`match-colors-list-${grey.id}`));
    expect(useColorMatchDialog.getState().shown).toBe(grey.id);
  });

  it('adds an entry in the next colour and focuses it; a pattern commits on blur, one step', async () => {
    const { grey } = setup();
    const user = userEvent.setup();
    render(<ColorMatchDialog shown={grey.id} onClose={() => {}} />);
    await user.click(screen.getByTestId('match-colors-add'));
    const field = screen.getByTestId('match-colors-pattern-0');
    expect(field).toHaveFocus();
    expect(lists()[1]!.entries).toEqual([{ pattern: '', color: '#58C4DD' }]);
    expect(screen.getByTestId('match-colors-issue-0')).toHaveTextContent('Type some LaTeX.');
    fireEvent.change(field, { target: { value: '\\frac{a' } });
    expect(lists()[1]!.entries[0]!.pattern).toBe(''); // not yet
    fireEvent.blur(field);
    expect(lists()[1]!.entries[0]!.pattern).toBe('\\frac{a');
    expect(screen.getByTestId('match-colors-issue-0')).toHaveTextContent('braces');
    // The palette under the chip sets the colour.
    await user.click(screen.getByTestId('match-colors-chip-0'));
    await user.click(screen.getByTestId('match-colors-palette-RED'));
    expect(lists()[1]!.entries[0]!.color).toBe('#FC6255');
    history.undo();
    expect(lists()[1]!.entries[0]!.color).toBe('#58C4DD');
    history.undo();
    expect(lists()[1]!.entries[0]!.pattern).toBe('');
  });

  it('renames on Enter, takes an edit back on Escape, and Delete removes the list', async () => {
    const { course, grey } = setup();
    const user = userEvent.setup();
    render(<ColorMatchDialog shown={course.id} onClose={() => {}} />);
    const name = screen.getByTestId('match-colors-name');
    await user.clear(name);
    await user.type(name, 'Lesson 1{Enter}');
    expect(lists()[0]!.name).toBe('Lesson 1');
    await user.type(name, ' draft{Escape}');
    expect(name).toHaveValue('Lesson 1');
    // A click with no press before it acts at once on a hold button (assistive input).
    fireEvent.click(screen.getByTestId('match-colors-delete'));
    expect(lists().map((l) => l.name)).toEqual(['Greyscale']);
    // The shown list is gone: the first remaining one is shown.
    expect(screen.getByTestId('match-colors-name')).toHaveValue('Greyscale');
    expect(screen.getByTestId(`match-colors-list-${grey.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('applies to the selection only, and + New makes a list through the host', async () => {
    const { formula, course } = setup();
    const user = userEvent.setup();
    act(() => useColorMatchDialog.getState().open(course.id));
    render(<ColorMatchDialogHost />);
    expect(screen.getByTestId('match-colors-apply')).toBeDisabled();
    expect(screen.getByTestId('match-colors-targets')).toHaveTextContent('Select formulas');
    act(() => useUiStore.getState().select({ kind: 'formula', id: formula.id }));
    expect(screen.getByTestId('match-colors-apply')).toBeEnabled();
    expect(screen.getByTestId('match-colors-apply')).toHaveTextContent('Apply to 1 formula');
    await user.click(screen.getByTestId('match-colors-new'));
    expect(lists().map((l) => l.name)).toEqual(['Course', 'Greyscale', 'Match colors 1']);
    expect(screen.getByTestId('match-colors-name')).toHaveValue('Match colors 1');
    expect(screen.queryByTestId('match-colors-empty')).toBeNull();
    await user.click(screen.getByTestId('match-colors-done'));
    expect(screen.queryByTestId('match-colors')).toBeNull();
  });

  it('previews the colours on a formula, and says what overlaps or cannot be rendered', async () => {
    const project = createEmptyProject();
    const f1 = await published(createFormula({ name: 'f1', source: 'a x + b' }));
    const f2 = await published(createFormula({ name: 'f2', source: '\\sqrt{x}' }));
    project.formulas.push(f1, f2);
    const course = createColorMatch('Course', [
      { pattern: 'a x', color: '#FC6255' },
      { pattern: 'x +', color: '#58C4DD' },
    ]);
    project.colorMatches.push(course);
    loadProject(project);
    const user = userEvent.setup();
    render(<ColorMatchDialog shown={course.id} onClose={() => {}} engine={engine} />);
    expect(screen.getByTestId('match-colors-preview-formula')).toHaveValue(f1.id);
    expect(screen.getByTestId('match-colors-preview-note')).toHaveTextContent('Rendering…');
    await waitFor(() =>
      expect(screen.getByTestId('match-colors-preview-note')).toHaveTextContent(
        '2 glyphs of f1 take a colour.',
      ),
    );
    // "a x" lost its x to "x +", the lower entry: x and + are blue, a stays white.
    const fills = () =>
      [...screen.getByTestId('match-colors-preview').querySelectorAll('path')].map((p) =>
        p.getAttribute('fill'),
      );
    expect(fills()).toEqual(['#FFFFFF', '#58C4DD', '#58C4DD', '#FFFFFF']);
    expect(screen.getByTestId('match-colors-preview-overlap')).toHaveTextContent(
      'Pattern 1 (“a x”) overlaps a lower one here: the lower entry wins.',
    );
    // Another formula: the patterns cut \\sqrt's argument, so they cannot be rendered on it.
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.colorMatches[0]!.entries = [{ pattern: '\\sqrt', color: '#FC6255' }];
      }),
    );
    await user.selectOptions(screen.getByTestId('match-colors-preview-formula'), f2.id);
    await waitFor(() =>
      expect(screen.getByTestId('match-colors-preview-note')).toHaveTextContent(
        /f2: the patterns cannot be rendered on it/,
      ),
    );
    expect(screen.queryByTestId('match-colors-preview-overlap')).toBeNull();
  });

  it('says so when there is no list at all', () => {
    setup();
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.colorMatches = [];
      }),
    );
    render(<ColorMatchDialog shown="gone" onClose={() => {}} />);
    expect(screen.getByTestId('match-colors-empty')).toBeInTheDocument();
    expect(screen.getByTestId('match-colors-apply')).toBeDisabled();
  });
});

describe('the note on overlapping patterns', () => {
  it('names one pattern in the singular, several in the plural', () => {
    const patterns = ['a x', '+ b', 'x +'];
    expect(overlapNote(patterns, [0])).toBe(
      'Pattern 1 (“a x”) overlaps a lower one here: the lower entry wins.',
    );
    expect(overlapNote(patterns, [0, 1])).toBe(
      'Patterns 1 (“a x”), 2 (“+ b”) overlap a lower one here: the lower entry wins.',
    );
  });
});
