import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createEmptyProject, createFormula } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { ColorField } from '../fields';
import { StateFields } from '../StateFields';

const field = () => screen.getByTestId('color') as HTMLInputElement;

describe('native colour commits', () => {
  it('previews input events and commits each completed native choice exactly once', () => {
    const committed = vi.fn();
    function Harness() {
      const [value, setValue] = useState('#FFFFFF');
      return (
        <ColorField
          label="Colour"
          testId="color"
          value={value}
          onCommit={(next) => {
            committed(next);
            setValue(next);
          }}
        />
      );
    }
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    for (const color of ['#ff0000', '#00ff00', '#0000ff']) {
      const before = committed.mock.calls.length;
      const input = field();
      fireEvent.input(input, { target: { value: '#123456' } });
      fireEvent.input(input, { target: { value: color } });
      expect(input).toHaveValue(color);
      expect(committed).toHaveBeenCalledTimes(before);
      fireEvent.change(input);
      expect(committed).toHaveBeenCalledTimes(before + 1);
      expect(committed).toHaveBeenLastCalledWith(color.toUpperCase());
      // A replaced input cannot write back after its picker has gone away.
      if (input !== field()) fireEvent.change(input, { target: { value: '#abcdef' } });
      expect(committed).toHaveBeenCalledTimes(before + 1);
      fireEvent.change(field());
      expect(committed).toHaveBeenCalledTimes(before + 1);
    }
    const input = field();
    view.unmount();
    fireEvent.change(input, { target: { value: '#abcdef' } });
    expect(committed).toHaveBeenCalledTimes(3);
  });

  it('uses the current callback after an external value replacement or callback-only update', () => {
    const first = vi.fn();
    const next = vi.fn();
    const view = render(
      <ColorField label="Colour" testId="color" value="#FF0000" onCommit={first} />,
    );
    view.rerender(<ColorField label="Colour" testId="color" value="#FFFFFF" onCommit={next} />);
    fireEvent.change(field(), { target: { value: '#00ff00' } });
    expect(next).toHaveBeenCalledWith('#00FF00');
    expect(first).not.toHaveBeenCalled();
    const current = vi.fn();
    view.rerender(<ColorField label="Colour" testId="color" value="#FFFFFF" onCommit={current} />);
    fireEvent.change(field(), { target: { value: '#0000ff' } });
    expect(current).toHaveBeenCalledWith('#0000FF');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('colour overrides and project history', () => {
  beforeEach(() => {
    const project = createEmptyProject();
    const formula = createFormula({ name: 'letters', source: 'abc' });
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 5));
    project.clips[0]!.initial.color = '#FFFFFF';
    loadProject(project);
  });

  it('commits one step per choice through undo/redo and disabling and enabling the override', () => {
    function Harness() {
      const initial = useProjectStore((s) => s.project.clips[0]!.initial);
      return (
        <StateFields
          state={initial}
          idPrefix="state"
          patch={(patch) =>
            useProjectStore.getState().update((d) => {
              Object.assign(d.clips[0]!.initial, patch);
            })
          }
        />
      );
    }
    render(<Harness />);
    const input = () => screen.getByTestId('state-color');
    const color = () => useProjectStore.getState().project.clips[0]!.initial.color;
    for (const next of ['#ff0000', '#00ff00', '#0000ff']) {
      fireEvent.input(input(), { target: { value: next } });
      fireEvent.change(input());
      expect(color()).toBe(next.toUpperCase());
    }
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(3);
    act(() => history.undo());
    expect(input()).toHaveValue('#00ff00');
    act(() => history.redo());
    expect(input()).toHaveValue('#0000ff');
    fireEvent.change(input(), { target: { value: '#aa00aa' } });
    expect(color()).toBe('#AA00AA');
    fireEvent.change(input());
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(4);
    fireEvent.click(screen.getByTestId('state-color-on'));
    expect(input()).toBeDisabled();
    fireEvent.click(screen.getByTestId('state-color-on'));
    fireEvent.change(input(), { target: { value: '#00aaff' } });
    expect(color()).toBe('#00AAFF');
    act(() => history.undo());
    expect(color()).toBe('#FFFFFF');
  });
});
