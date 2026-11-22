import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Project } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { useDocumentStore } from '../documentStore';
import { SettingsDialog } from '../SettingsDialog';

/** A project of its own name and frame rate. */
function projectOf(name: string, fps: number): Project {
  const project = createEmptyProject(name);
  project.meta.fps = fps;
  return project;
}

/** Make `project` the open document, as File → Open… does. The project the store holds. */
function open(project: Project): Project {
  loadProject(project);
  const held = useProjectStore.getState().project;
  useDocumentStore.getState().beginDocument(held, { fileName: null, handle: null });
  return held;
}

const meta = () => useProjectStore.getState().project.meta;

beforeEach(() => {
  open(projectOf('First', 30));
});

describe('File → Project settings…', () => {
  it('applies what it shows to the project, as one step, and closes', () => {
    const onClose = vi.fn();
    render(<SettingsDialog onClose={onClose} />);
    expect(screen.getByTestId('settings-name')).toHaveValue('First');
    fireEvent.change(screen.getByTestId('settings-name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('settings-apply'));
    expect(meta()).toMatchObject({ name: 'Renamed', fps: 30 });
    expect(history.depth()).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The dialog shows the settings of the document that was open when it opened. Another one that
  // opens while it is on screen — the file chosen in File → Open… arrives, and the first had
  // nothing to save, so nothing is asked — has its own name, target, size, frame rate, background
  // and preamble: Apply gave it every one of the first's.
  it('goes when another document opens, and writes nothing into it', () => {
    const onClose = vi.fn();
    render(<SettingsDialog onClose={onClose} />);
    let second!: Project;
    act(() => {
      second = open(projectOf('Second', 60));
    });
    expect(onClose).toHaveBeenCalled();
    // Until its host takes it away, it is still there with the first one's settings: its Apply
    // writes nothing.
    fireEvent.change(screen.getByTestId('settings-name'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByTestId('settings-apply'));
    expect(useProjectStore.getState().project).toBe(second);
    expect(meta()).toMatchObject({ name: 'Second', fps: 60 });
    expect(history.canUndo()).toBe(false);
  });
});
