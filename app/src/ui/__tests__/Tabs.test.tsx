import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from '../Tabs';

const TABS = [
  { id: 'formulas', label: 'Formulas', icon: 'sigma', content: 'the formulas' },
  { id: 'audio', label: 'Audio', content: 'the audio' },
] as const;

describe('Tabs', () => {
  it("draws a tab's icon over its label without changing its name", () => {
    render(<Tabs tabs={TABS} active="formulas" onChange={() => {}} label="Creator" testId="c" />);
    const formulas = screen.getByRole('tab', { name: 'Formulas' });
    expect(formulas.querySelector('.tabs-tab-icon svg')).toHaveAttribute('aria-hidden', 'true');
    expect(formulas.querySelector('.tabs-tab-label')).toHaveTextContent('Formulas');
    const audio = screen.getByRole('tab', { name: 'Audio' });
    expect(audio.querySelector('.tabs-tab-icon')).toBeNull();
    expect(audio.querySelector('.tabs-tab-label')).toHaveTextContent('Audio');
  });

  it('marks the active tab and keeps every panel mounted', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="formulas" onChange={onChange} label="Creator" testId="c" />);
    expect(screen.getByTestId('c-tab-formulas')).toHaveClass('is-active');
    expect(screen.getByTestId('c-tab-formulas')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('c-tab-audio')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('c-panel-formulas')).toBeVisible();
    expect(screen.getByTestId('c-panel-audio')).not.toBeVisible();
    fireEvent.click(screen.getByTestId('c-tab-audio'));
    expect(onChange).toHaveBeenCalledWith('audio');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('audio');
  });
});
