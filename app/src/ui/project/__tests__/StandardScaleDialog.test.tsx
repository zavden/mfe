import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createFormula, type Project } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { defaultPreferences, usePreferences } from '../../preferences';
import { useDialogStore } from '../dialogStore';
import { useDocumentStore } from '../documentStore';
import { StandardScaleDialog } from '../StandardScaleDialog';

/** A project with two formulas at Manim's size (scale 1). */
function twoFormulas(): Project {
  const project = createEmptyProject('First');
  project.formulas = ['a', 'b'].map((n) => createFormula({ name: n, source: n, fontSize: 48 }));
  return project;
}

/** A copy of `project` under another name, as a copy of its file is: it has every id of it. */
function copyOf(project: Project): Project {
  const copy = structuredClone(project);
  copy.meta.name = 'Second';
  return copy;
}

/** Make `project` the open document, as File → Open… does. The project the store holds. */
function open(project: Project): Project {
  loadProject(project);
  const held = useProjectStore.getState().project;
  useDocumentStore.getState().beginDocument(held, { fileName: null, handle: null });
  return held;
}

const sizes = () => useProjectStore.getState().project.formulas.map((f) => f.fontSize);

/** Type 2 for the formulas and press «Apply to all formulas»; the question that follows. */
function askToApply() {
  render(<StandardScaleDialog onClose={vi.fn()} />);
  fireEvent.change(screen.getByTestId('standard-scale-math'), { target: { value: '2' } });
  fireEvent.click(screen.getByTestId('standard-scale-math-apply'));
  const question = useDialogStore.getState().queue.at(-1)!;
  expect(question.title).toBe('Apply scale 2 to every formula?');
  return question;
}

/** The command that waited for the answer has run to its end. It goes on some microtasks after
 * the answer is given (the question's promise, then the confirmation's, then its own): a check
 * made before it went on would pass whatever the command does. */
const commandRan = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  window.localStorage.clear();
  usePreferences.setState(defaultPreferences());
  useDialogStore.setState({ queue: [] });
  open(twoFormulas());
});

describe('«Apply to all» of the Standard scale dialog', () => {
  it('asks, and gives the scale to every formula of the project as one step', async () => {
    const question = askToApply();
    expect(sizes()).toEqual([48, 48]);
    useDialogStore.getState().settle(question.key, 'confirm');
    expect(await screen.findByText('2 formulas now have scale 2.')).toBeInTheDocument();
    expect(sizes()).toEqual([96, 96]);
    expect(history.depth()).toBe(1);
  });

  it('changes nothing when the answer is no', async () => {
    const question = askToApply();
    useDialogStore.getState().settle(question.key, 'cancel');
    await commandRan();
    expect(sizes()).toEqual([48, 48]);
    expect(history.canUndo()).toBe(false);
  });

  // The question tells of the formulas of the project that is open then. Another document that
  // opens while it is on screen (the file chosen in File → Open… arrives) has formulas of its
  // own, which nobody asked about, though they may have the same ids.
  it('changes nothing in another document that opened while it asked', async () => {
    const question = askToApply();
    const first = useProjectStore.getState().project;
    const second = open(copyOf(first));
    expect(second.formulas.map((f) => f.id)).toEqual(first.formulas.map((f) => f.id));
    useDialogStore.getState().settle(question.key, 'confirm');
    await commandRan();
    expect(useProjectStore.getState().project).toBe(second);
    expect(sizes()).toEqual([48, 48]);
    expect(history.canUndo()).toBe(false);
    expect(screen.getByTestId('standard-scale-applied')).toBeEmptyDOMElement();
  });
});
