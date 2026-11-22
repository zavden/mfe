import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../../../model';
import { loadProject } from '../../../../store';
import { useDialogStore } from '../../../project/dialogStore';
import { templateLibrary } from '../library';
import { TemplateForm } from '../TemplateForm';
import { emptyUserLibrary, type UserTemplate } from '../userLibrary';
import { useTemplateLibrary } from '../userLibraryStore';

// An engine whose companion is never reachable: MathJax draws, as in the app without one.
vi.mock('../../../../engine/instance', async () => {
  const { createEngine } = await import('../../../../engine/engine');
  const engine = createEngine({
    companion: {
      fetch: (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      watchFocus: false,
    },
  });
  return { getEngine: () => engine };
});

const setValue = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
const problem = () => screen.getByTestId('template-form-problem');
const preview = () => screen.getByTestId('template-form-preview');
const drawn = () => waitFor(() => expect(preview()).toHaveAttribute('data-state', 'ready'));
const templates = () => useTemplateLibrary.getState().library.templates;

function open(editing: UserTemplate | null = null) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <TemplateForm
      editing={editing}
      library={templateLibrary()}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { onSaved, onClose };
}

beforeEach(() => {
  window.localStorage.clear();
  useTemplateLibrary.setState({ library: emptyUserLibrary(), unsaved: false, warnings: [] });
  loadProject(createEmptyProject());
});

describe('TemplateForm', () => {
  it('gives a row to each placeholder of the LaTeX as it is written, and says what is missing', () => {
    open();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Create template');
    expect(problem()).toHaveTextContent('Give the template a name.');
    expect(screen.getByTestId('template-form-save')).toBeDisabled();
    setValue('template-form-name', 'Commutative sum');
    expect(problem()).toHaveTextContent('Write the LaTeX of the template.');
    expect(screen.getByTestId('template-form-placeholders')).toHaveTextContent('None yet');

    setValue('template-form-latex', '{#2}+{#1}={#1}+{#2}');
    // By number, whatever the order of the text.
    expect(screen.getByLabelText('Default value of #1')).toHaveValue('');
    expect(screen.getByLabelText('Default value of #2')).toHaveValue('');
    expect(problem()).toHaveTextContent('Give #1 a default value.');
    setValue('template-form-value-1', 'a');
    expect(problem()).toHaveTextContent('Give #2 a default value.');
    setValue('template-form-value-2', 'b');
    setValue('template-form-label-2', 'second term');
    expect(problem()).toBeEmptyDOMElement();
    expect(screen.getByTestId('template-form-save')).toBeEnabled();

    // A number taken out of the text and written again has what it had.
    setValue('template-form-latex', '{#1}+{#1}');
    expect(screen.queryByTestId('template-form-value-2')).not.toBeInTheDocument();
    setValue('template-form-latex', '{#1}+{#2}+{#3}');
    expect(screen.getByTestId('template-form-value-2')).toHaveValue('b');
    expect(screen.getByTestId('template-form-label-2')).toHaveValue('second term');
    expect(problem()).toHaveTextContent('Give #3 a default value.');
  });

  it('draws the formula the default values make, with a box where a value is missing', async () => {
    open();
    setValue('template-form-latex', '#1^{#2}');
    await drawn();
    const boxes = preview().querySelectorAll('svg path').length;
    expect(preview().querySelector('svg')).toHaveAttribute('aria-label', '\\square^{\\square}');
    setValue('template-form-value-1', 'x');
    setValue('template-form-value-2', 'n+1');
    await drawn();
    expect(preview().querySelector('svg')).toHaveAttribute('aria-label', 'x^{n+1}');
    expect(preview().querySelectorAll('svg path').length).toBeGreaterThan(boxes);
  });

  it('saves a new template among the user’s', async () => {
    const { onSaved } = open();
    setValue('template-form-name', '  Commutative sum ');
    setValue('template-form-category', 'My course');
    setValue('template-form-description', 'The order does not matter.');
    setValue('template-form-latex', '{#1}+{#2}={#2}+{#1}');
    setValue('template-form-value-1', 'a');
    setValue('template-form-value-2', 'b');
    setValue('template-form-label-1', 'first term');
    fireEvent.click(screen.getByTestId('template-form-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(templates()).toHaveLength(1);
    expect(templates()[0]).toMatchObject({
      name: 'Commutative sum',
      category: 'My course',
      description: 'The order does not matter.',
      latex: '{#1}+{#2}={#2}+{#1}',
      placeholders: [
        { n: 1, value: 'a', label: 'first term' },
        { n: 2, value: 'b' },
      ],
      packages: [],
    });
    expect(onSaved).toHaveBeenCalledWith(templates()[0]!.id);
  });

  it('changes one of the user’s templates in place', async () => {
    const id = await useTemplateLibrary.getState().createTemplate({
      name: 'Sum',
      category: '',
      description: '',
      latex: '#1+#2',
      placeholders: [
        { n: 1, value: 'a' },
        { n: 2, value: 'b' },
      ],
      packages: [],
    });
    const { onSaved } = open(templates()[0]!);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit template: Sum');
    expect(screen.getByTestId('template-form-latex')).toHaveValue('#1+#2');
    expect(screen.getByTestId('template-form-value-2')).toHaveValue('b');
    setValue('template-form-name', 'Sum of three');
    setValue('template-form-latex', '#1+#2+#3');
    setValue('template-form-value-3', 'c');
    fireEvent.submit(screen.getByTestId('template-form-name').closest('form')!);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(id));
    expect(templates()).toHaveLength(1);
    expect(templates()[0]).toMatchObject({ id, name: 'Sum of three', latex: '#1+#2+#3' });
    expect(templates()[0]!.placeholders.map((p) => p.value)).toEqual(['a', 'b', 'c']);
  });

  it('saves nothing of a LaTeX that cannot be drawn', async () => {
    const { onSaved } = open();
    setValue('template-form-name', 'Broken');
    setValue('template-form-latex', '\\frac{#1}{');
    setValue('template-form-value-1', 'a');
    await waitFor(() => expect(preview()).toHaveAttribute('data-state', 'error'));
    expect(problem()).toHaveTextContent('This LaTeX cannot be drawn');
    expect(screen.getByTestId('template-form-save')).toBeDisabled();
    // Enter right after typing, before the drawing says no: still nothing.
    setValue('template-form-latex', '\\frac{#1}{{');
    fireEvent.submit(screen.getByTestId('template-form-name').closest('form')!);
    await waitFor(() => expect(preview()).toHaveAttribute('data-state', 'error'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(templates()).toHaveLength(0);
  });

  it('asks before what was written is thrown away, and not when nothing was', async () => {
    const { onClose } = open();
    fireEvent.click(screen.getByTestId('template-form-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useDialogStore.getState().queue).toHaveLength(0);

    setValue('template-form-latex', 'x^2');
    fireEvent.click(screen.getByTestId('template-form-cancel'));
    await waitFor(() => expect(useDialogStore.getState().queue).toHaveLength(1));
    const asked = useDialogStore.getState().queue[0]!;
    expect(asked.title).toBe('Discard this template?');
    useDialogStore.getState().settle(asked.key, 'keep');
    await waitFor(() => expect(useDialogStore.getState().queue).toHaveLength(0));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('template-form-cancel'));
    await waitFor(() => expect(useDialogStore.getState().queue).toHaveLength(1));
    useDialogStore.getState().settle(useDialogStore.getState().queue[0]!.key, 'discard');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('suggests the categories there are, the editor’s and the user’s', async () => {
    await useTemplateLibrary.getState().createTemplate({
      name: 'Mine',
      category: 'My course',
      description: '',
      latex: 'x',
      placeholders: [],
      packages: [],
    });
    open();
    const options = [...document.querySelectorAll('datalist option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(options).toContain('Algebra');
    expect(options).toContain('Physics');
    expect(options.at(-1)).toBe('My course');
  });
});
