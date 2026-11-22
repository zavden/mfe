import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultIntro, defaultOutro } from '../../../model';
import {
  defaultPreferences,
  newClipAnimations,
  PREFERENCES_STORAGE_KEY,
  usePreferences,
} from '../../preferences';
import { DefaultAnimationsDialog } from '../DefaultAnimationsDialog';

beforeEach(() => {
  window.localStorage.clear();
  usePreferences.setState(defaultPreferences());
});

const setValue = (id: string, value: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value } });

describe('DefaultAnimationsDialog', () => {
  it('starts from the saved defaults and offers no "none" animation', () => {
    render(<DefaultAnimationsDialog onClose={() => {}} />);
    expect(screen.getByTestId('default-intro-kind')).toHaveValue('write');
    expect(screen.getByTestId('default-outro-kind')).toHaveValue('fade_out');
    for (const id of ['default-intro-kind', 'default-outro-kind']) {
      const values = [...(screen.getByTestId(id) as HTMLSelectElement).options].map((o) => o.value);
      expect(values).not.toContain('none');
    }
    expect(screen.getByTestId('default-intro-duration')).toHaveValue('1');
    expect(screen.getByTestId('default-intro-lag-mode')).toHaveValue('auto');
    expect(screen.getByTestId('default-intro-lag')).toBeDisabled();
    // Shift and scale are fade options only.
    expect(screen.queryByTestId('default-intro-shift-x')).not.toBeInTheDocument();
    expect(screen.getByTestId('default-outro-shift-x')).toBeInTheDocument();
  });

  it('saves the chosen animations as preferences without turning the toggles on', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DefaultAnimationsDialog onClose={onClose} />);

    await user.selectOptions(screen.getByTestId('default-intro-kind'), 'fade_in');
    setValue('default-intro-duration', '0.6');
    await user.selectOptions(screen.getByTestId('default-intro-easing'), 'linear');
    await user.selectOptions(screen.getByTestId('default-intro-lag-mode'), 'custom');
    setValue('default-intro-lag', '0.3');
    setValue('default-intro-shift-x', '0');
    setValue('default-intro-shift-y', '-0.5');
    setValue('default-intro-scale', '0.8');
    await user.selectOptions(screen.getByTestId('default-outro-kind'), 'shrink_to_center');
    setValue('default-outro-duration', '0.5');
    await user.click(screen.getByTestId('default-animations-save'));

    const state = usePreferences.getState();
    expect(state.intro).toEqual({
      kind: 'fade_in',
      duration: 0.6,
      easing: 'linear',
      lagRatio: 0.3,
      shift: [0, -0.5],
      scale: 0.8,
    });
    expect(state.outro).toMatchObject({ kind: 'shrink_to_center', duration: 0.5 });
    expect(state.autoIntro).toBe(false);
    expect(state.autoOutro).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Persisted for the next session, outside the project.
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!).intro.kind).toBe(
      'fade_in',
    );
    // New clips use them once the toggles are on.
    usePreferences.getState().set({ autoIntro: true });
    expect(newClipAnimations().intro).toMatchObject({ kind: 'fade_in', duration: 0.6 });
  });

  it('switching the animation brings that animation’s own duration and easing', async () => {
    const user = userEvent.setup();
    render(<DefaultAnimationsDialog onClose={() => {}} />);
    await user.selectOptions(screen.getByTestId('default-intro-kind'), 'draw_border_then_fill');
    expect(screen.getByTestId('default-intro-duration')).toHaveValue('2');
    expect(screen.getByTestId('default-intro-easing')).toHaveValue('double_smooth');
  });

  it('flags invalid values, blocks Save and leaves the preferences alone', () => {
    const onClose = vi.fn();
    render(<DefaultAnimationsDialog onClose={onClose} />);
    setValue('default-intro-duration', '0');
    expect(screen.getByTestId('default-intro-duration-error')).toHaveTextContent(/at least/);
    expect(screen.getByTestId('default-animations-save')).toBeDisabled();

    setValue('default-intro-duration', '1');
    expect(screen.queryByTestId('default-intro-duration-error')).not.toBeInTheDocument();
    setValue('default-intro-duration', '2.5'); // 2.5 + 1 s outro > the 3 s of a dropped clip
    expect(screen.getByTestId('default-animations-total-error')).toHaveTextContent(/3 s long/);
    expect(screen.getByTestId('default-animations-save')).toBeDisabled();

    setValue('default-intro-duration', '1');
    setValue('default-outro-duration', 'soon');
    expect(screen.getByTestId('default-outro-duration-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('default-animations-save'));
    expect(onClose).not.toHaveBeenCalled();
    expect(usePreferences.getState().intro).toEqual(defaultIntro('write'));
    expect(usePreferences.getState().outro).toEqual(defaultOutro('fade_out'));
  });

  it('Cancel changes nothing; Restore defaults refills the form', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    usePreferences.getState().set({ outro: { ...defaultOutro('uncreate'), duration: 0.7 } });
    render(<DefaultAnimationsDialog onClose={onClose} />);
    expect(screen.getByTestId('default-outro-kind')).toHaveValue('uncreate');
    expect(screen.getByTestId('default-outro-duration')).toHaveValue('0.7');

    await user.click(screen.getByTestId('default-animations-restore'));
    expect(screen.getByTestId('default-outro-kind')).toHaveValue('fade_out');
    expect(screen.getByTestId('default-outro-duration')).toHaveValue('1');
    expect(usePreferences.getState().outro.kind).toBe('uncreate'); // not saved yet

    await user.click(screen.getByTestId('default-animations-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePreferences.getState().outro.kind).toBe('uncreate');
  });

  it('closes on Escape without saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DefaultAnimationsDialog onClose={onClose} />);
    setValue('default-intro-duration', '0.4');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePreferences.getState().intro.duration).toBe(1);
  });
});
