import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createFormula } from '../../../../model';
import { loadProject } from '../../../../store';
import { UseTemplateDialog } from '../UseTemplateDialog';

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

const POWERS = {
  name: 'Product of powers',
  latex: '#1^{#2}\\cdot #1^{#3}=#1^{#2+#3}',
  placeholders: [
    { n: 1, value: 'a', label: 'base' },
    { n: 2, value: 'm' },
    { n: 3, value: 'n' },
  ],
  packages: [],
};

const setValue = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
const preview = () => screen.getByTestId('use-template-preview');
const drawn = () => waitFor(() => expect(preview()).toHaveAttribute('data-state', 'ready'));

function open(template = POWERS) {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  render(<UseTemplateDialog template={template} onCreate={onCreate} onClose={onClose} />);
  return { onCreate, onClose };
}

beforeEach(() => {
  const project = createEmptyProject();
  project.formulas.push(createFormula({ name: 'product_of_powers', source: 'x' }));
  loadProject(project);
});

describe('UseTemplateDialog', () => {
  it('shows a field for each placeholder, the formula they make and a free name', async () => {
    open();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Use template: Product of powers');
    expect(screen.getByTestId('use-template-value-1')).toHaveValue('a');
    expect(screen.getByTestId('use-template-value-2')).toHaveValue('m');
    expect(screen.getByTestId('use-template-value-3')).toHaveValue('n');
    expect(screen.getByLabelText(/#1\s*base/)).toBe(screen.getByTestId('use-template-value-1'));
    expect(screen.getByTestId('use-template-latex')).toHaveTextContent('a^{m}\\cdot a^{n}=a^{m+n}');
    // The project has a product_of_powers already.
    expect(screen.getByTestId('use-template-name')).toHaveValue('product_of_powers_2');
    expect(screen.getByTestId('use-template-reset')).toBeDisabled();
    await drawn();
    expect(preview().querySelectorAll('svg path').length).toBeGreaterThan(5);
  });

  it('makes the formula of the values typed, under the name given', async () => {
    const { onCreate } = open();
    setValue('use-template-value-1', 'x');
    setValue('use-template-value-2', '2k');
    setValue('use-template-value-3', '\\alpha');
    expect(screen.getByTestId('use-template-latex')).toHaveTextContent(
      'x^{2k}\\cdot x^{\\alpha}=x^{2k+\\alpha}',
    );
    // What is drawn is of the values of before until the new rendering comes.
    expect(preview()).toHaveAttribute('data-state', 'pending');
    setValue('use-template-name', 'powers');
    fireEvent.click(screen.getByTestId('use-template-create'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      name: 'powers',
      latex: 'x^{2k}\\cdot x^{\\alpha}=x^{2k+\\alpha}',
      packages: [],
    });
  });

  it('puts the values of the template back', async () => {
    open();
    setValue('use-template-value-2', 'p');
    expect(screen.getByTestId('use-template-reset')).toBeEnabled();
    fireEvent.click(screen.getByTestId('use-template-reset'));
    expect(screen.getByTestId('use-template-value-2')).toHaveValue('m');
    expect(screen.getByTestId('use-template-latex')).toHaveTextContent('a^{m}\\cdot a^{n}');
    expect(screen.getByTestId('use-template-reset')).toBeDisabled();
  });

  it('refuses a name a formula cannot have', async () => {
    const { onCreate } = open();
    setValue('use-template-name', 'product_of_powers');
    expect(screen.getByTestId('use-template-name-error')).toHaveTextContent(/already called/);
    expect(screen.getByTestId('use-template-create')).toBeDisabled();
    setValue('use-template-name', '2x');
    expect(screen.getByTestId('use-template-name-error')).toHaveTextContent(/Python variable/);
    fireEvent.submit(screen.getByTestId('use-template-name').closest('form')!);
    await drawn();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('says so when the values make a LaTeX that cannot be drawn, and makes nothing of it', async () => {
    const { onCreate } = open();
    await drawn();
    setValue('use-template-value-1', '\\frac{a');
    await waitFor(() => expect(preview()).toHaveAttribute('data-state', 'error'));
    expect(screen.getByTestId('use-template-error')).toHaveTextContent(/cannot be drawn/);
    expect(screen.getByTestId('use-template-create')).toBeDisabled();
    // Enter right after typing, before the rendering says no: still nothing.
    setValue('use-template-value-1', '\\frac{b');
    fireEvent.submit(screen.getByTestId('use-template-name').closest('form')!);
    await waitFor(() => expect(preview()).toHaveAttribute('data-state', 'error'));
    expect(onCreate).not.toHaveBeenCalled();
    // Mended, it goes.
    setValue('use-template-value-1', 'b');
    fireEvent.submit(screen.getByTestId('use-template-name').closest('form')!);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ latex: 'b^{m}\\cdot b^{n}=b^{m+n}' });
  });

  it('closes on Cancel without making anything', () => {
    const { onCreate, onClose } = open();
    fireEvent.click(screen.getByTestId('use-template-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
