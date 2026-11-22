/* An audio clip on the timeline (AudioClipBlock.tsx): the keys of a point of its volume line. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../../model';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import { history, loadProject, useProjectStore } from '../../../store';
import { AudioClipBlock } from '../AudioClipBlock';

// The waveform is a drawing of the decoded original, which a unit test has none of.
vi.mock('../../audio/AudioWaveform', () => ({ AudioWaveform: () => null }));

const nothing = () => {};

/** The audio clip of the project, its volume line being edited, as the timeline draws it. */
function Clip() {
  const project = useProjectStore((s) => s.project);
  const clip = project.audioClips[0];
  const track = project.tracks.find((t) => t.id === clip?.trackId);
  if (!clip || !track) return null;
  return (
    <AudioClipBlock
      clip={clip}
      asset={project.audioAssets[0]}
      track={track}
      px={50}
      band={{ from: 0, to: 30 }}
      selected
      tabIndex={0}
      lineEditable
      onToggleLine={nothing}
      onMove={nothing}
      onTrim={nothing}
      onEdit={nothing}
      onMenu={nothing}
    />
  );
}

/** A clip over 10–20 s of the source's 30–40 s, with three points at full volume. */
function open() {
  const { project, clip } = audioProject();
  clip.volume = [
    { id: 'a', time: 32, gain: 1 },
    { id: 'b', time: 35, gain: 1 },
    { id: 'c', time: 38, gain: 1 },
  ];
  loadProject(project);
  render(<Clip />);
}

const point = (id: string) =>
  useProjectStore.getState().project.audioClips[0]!.volume.find((p) => p.id === id)!;
const press = (id: string, key: string, shiftKey = false) =>
  fireEvent.keyDown(screen.getByTestId(`audio-point-${id}`), { key, shiftKey });

afterEach(() => loadProject(createEmptyProject()));

describe('the buttons of an audio clip', () => {
  it('are named by what they show: «Volume…» opens the editor, and says so as its description', () => {
    // WCAG 2.5.3, Label in Name: a voice command says "Volume", a screen reader reads the same.
    open();
    const edit = screen.getByTestId(
      `audio-edit-${useProjectStore.getState().project.audioClips[0]!.id}`,
    );
    expect(edit).toHaveTextContent('Volume…');
    expect(edit).toHaveAccessibleName('Volume…');
    expect(edit).toHaveAccessibleDescription(
      'Edit the audio clip: its trim, its volume and its fades',
    );
    expect(screen.getByRole('button', { name: /^Volume…/ })).toBe(edit);
  });
});

describe('a point of the volume line', () => {
  it('takes the arrows: a hundredth of the volume or of a second, a tenth with Shift', () => {
    open();
    press('b', 'ArrowUp');
    expect(point('b')).toMatchObject({ time: 35, gain: 1.01 });
    press('b', 'ArrowDown', true);
    expect(point('b').gain).toBeCloseTo(0.91, 9);
    press('b', 'ArrowRight');
    expect(point('b').time).toBeCloseTo(35.01, 9);
    press('b', 'ArrowLeft', true);
    expect(point('b').time).toBeCloseTo(34.91, 9);
    history.undo();
    expect(point('b').time).toBeCloseTo(35.01, 9);
  });

  it('is removed with Delete', () => {
    open();
    press('b', 'Delete');
    expect(useProjectStore.getState().project.audioClips[0]!.volume.map((p) => p.id)).toEqual([
      'a',
      'c',
    ]);
  });

  /* The point keeps the focus while it is dragged, so an arrow can come before the button is
   * released: the key gives the drag up and steps from where the point was. */
  describe('while a drag of it is still held', () => {
    /** The point dragged to 37 s of the source and to twice the volume, the button still held. */
    const dragged = () => {
      const gesture = history.beginGesture();
      act(() =>
        gesture.update((draft) => {
          const volume = draft.audioClips[0]!.volume;
          volume[1] = { ...volume[1]!, time: 37, gain: 2 };
        }),
      );
      return gesture;
    };

    it('↑ steps the volume from the one the point had', () => {
      open();
      const gesture = dragged();
      press('b', 'ArrowUp');
      expect(gesture.active).toBe(false);
      expect(point('b')).toMatchObject({ time: 35, gain: 1.01 });
    });

    it('→ steps the time from the one the point had', () => {
      open();
      const gesture = dragged();
      press('b', 'ArrowRight');
      expect(gesture.active).toBe(false);
      expect(point('b').gain).toBe(1);
      expect(point('b').time).toBeCloseTo(35.01, 9);
    });
  });
});
