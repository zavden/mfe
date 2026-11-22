import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import userEvent from '@testing-library/user-event';
import {
  createAppear,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { BlockDialogHost } from '../../animations/BlockDialog';
import { duplicateSelectedFormulas } from '../../creator/formulaCommands';
import { openBlockDialog, useBlockDialogStore } from '../../animations/blockDialogStore';
import { useTimelineGestures } from '../../timeline/useTimelineGestures';
import { useTimelineStore } from '../../timeline/timelineStore';
import { useGlobalShortcuts } from '../shortcuts';
import { useHistoryState } from '../useHistoryState';
import { SliderField } from '../../animations/fields';
import { startBlockGesture } from '../../timeline/blockGestures';
import { startWindowGesture } from '../../timeline/relationGestures';
import { Modal } from '../Modal';

function setup() {
  const project = createEmptyProject('Before');
  const formula = createFormula({ name: 'letters', source: 'abc' });
  const block = createAppear(1, 'write', 'all');
  block.duration = 3;
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 10, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    actions: [block],
  });
  project.formulas = [formula];
  project.clips = [clip];
  loadProject(project);
  useTimelineStore.setState({ snap: false, pxPerSecond: 100 });
  useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
  return { project, clip, block, formula };
}

function key(key: string, shiftKey = false, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function pointer(type: string, x: number, target: EventTarget = window) {
  const event = new MouseEvent(type, { clientX: x, clientY: 10, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => {
    target.dispatchEvent(event);
  });
}

afterEach(() => {
  pointer('pointercancel', 0);
  cleanup();
  useBlockDialogStore.getState().close();
  loadProject(createEmptyProject());
});

describe('real history commands', () => {
  it.each(['Escape', 'pointercancel', 'lostpointercapture', 'remove', 'load', 'lock'] as const)(
    '%s invalidates a timeline owner and its pending events',
    async (reason) => {
      const { clip, project } = setup();
      const host = document.createElement('div');
      document.body.append(host);
      const { result } = renderHook(() =>
        useTimelineGestures({ ruler: { current: host }, tracks: { current: host } }),
      );
      const event = {
        button: 0,
        clientX: 0,
        clientY: 10,
        pointerId: 1,
        currentTarget: host,
        stopPropagation() {},
        preventDefault() {},
      } as unknown as ReactPointerEvent;
      act(() => result.current.startMove(event, clip));
      pointer('pointermove', 100);
      expect(useProjectStore.getState().project.clips[0]!.start).toBe(1);
      if (reason === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
      else if (reason === 'pointercancel') pointer('pointercancel', 100);
      else if (reason === 'lostpointercapture') pointer('lostpointercapture', 100, host);
      else if (reason === 'remove')
        await act(async () => {
          host.remove();
        });
      else if (reason === 'load') act(() => loadProject(structuredClone(project)));
      else
        act(() =>
          useProjectStore.getState().update((p) => {
            p.tracks[0]!.locked = true;
          }),
        );
      pointer('pointermove', 200);
      pointer('pointerup', 200);
      expect(useProjectStore.getState().project.clips[0]!).toEqual(clip);
      expect(useProjectStore.getState().project.tracks[0]!.locked).toBe(reason === 'lock');
      expect(history.canUndo()).toBe(reason === 'lock');
      expect(history.canRedo()).toBe(false);
      host.remove();
    },
  );

  it('Undo can remove the block currently edited by its immediate-edit dialog', () => {
    const { clip } = setup();
    const block = createAppear(5, 'write', 'all');
    useProjectStore.getState().update((p) => {
      p.clips[0]!.actions.push(block);
    });
    renderHook(useGlobalShortcuts);
    openBlockDialog(clip.id, block.id);
    render(<BlockDialogHost />);
    key('z', false, screen.getByTestId('block-preview-open'));
    expect(
      useProjectStore.getState().project.clips[0]!.actions.some((a) => a.id === block.id),
    ).toBe(false);
    expect(screen.queryByTestId('block-dialog')).toBeNull();
    expect(useBlockDialogStore.getState().request).toBeNull();
  });

  it('Duplicate copies a mixed formula selection once, preserving shape capability and document order', () => {
    const { project, formula } = setup();
    const shape = createShapeFormula({ name: 'shape' });
    project.formulas.push(shape);
    project.tracks[0]!.locked = true; // formula copies do not edit their locked timeline clips
    loadProject(project);
    useUiStore.getState().select({ kind: 'formulas', ids: [shape.id, formula.id] });
    renderHook(useGlobalShortcuts);
    // The command of the formulas' menu: Duplicate has no key of its own in the Creator.
    expect(duplicateSelectedFormulas()).toBe(true);
    const copies = useProjectStore.getState().project.formulas;
    expect(copies.map((f) => f.kind)).toEqual(['math', 'math', 'shape', 'shape']);
    expect(copies[1]).toMatchObject({ source: formula.source, name: 'letters2' });
    expect(copies[3]).toMatchObject({ shape: shape.shape });
    expect(useProjectStore.getState().project.clips).toEqual(project.clips);
    expect(useUiStore.getState().selection).toEqual({
      kind: 'formulas',
      ids: [copies[1]!.id, copies[3]!.id],
    });
    key('z');
    expect(useProjectStore.getState().project.formulas).toEqual([formula, shape]);
    expect(history.canUndo()).toBe(false);
  });

  it.each(['block', 'window'] as const)(
    'Redo cancels a %s drag and leaves the future available',
    (kind) => {
      const { clip, block, project } = setup();
      const other = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
      });
      const relation = createRelation(clip.id, other.id, {
        offset: 2,
        duration: 2,
        style: 'copy',
        pairs: [],
      });
      project.clips.push(other);
      project.relations.push(relation);
      loadProject(project);
      useProjectStore.getState().update((p) => {
        p.meta.name = 'Future';
      });
      history.undo();
      const before = useProjectStore.getState().project;
      renderHook(useGlobalShortcuts);
      const host = document.createElement('div');
      document.body.append(host);
      const event = {
        button: 0,
        clientX: 0,
        pointerId: 1,
        currentTarget: host,
        stopPropagation() {},
        preventDefault() {},
      } as unknown as ReactPointerEvent;
      act(() => {
        if (kind === 'block') startBlockGesture(event, clip.id, block.id, 'move');
        else startWindowGesture(event, relation.id, 'move');
      });
      pointer('pointermove', 100);
      expect(useProjectStore.getState().project).not.toEqual(before);
      key('z', true);
      expect(useProjectStore.getState().project).toEqual(before);
      expect(useTimelineStore.getState().blockDrag).toBeNull();
      expect(useTimelineStore.getState().windowDrag).toBeNull();
      pointer('pointermove', 200);
      pointer('pointerup', 200);
      key('z', true);
      expect(useProjectStore.getState().project.meta.name).toBe('Future');
      expect(useProjectStore.getState().project.clips).toEqual(before.clips);
      expect(useProjectStore.getState().project.relations).toEqual(before.relations);
      host.remove();
    },
  );

  it('slider cancellation updates command availability and ignores pending native changes', () => {
    setup();
    function Field() {
      useGlobalShortcuts();
      const value = useProjectStore((s) => s.project.meta.duration ?? 5);
      const available = useHistoryState();
      return (
        <>
          <SliderField
            label="Duration"
            value={value}
            min={0}
            max={10}
            step={1}
            testId="range"
            onChange={(next) =>
              useProjectStore.getState().update((p) => {
                p.meta.duration = next;
              })
            }
          />
          <output>{`${available.canUndo}/${available.canRedo}`}</output>
        </>
      );
    }
    const { unmount } = render(<Field />);
    const range = screen.getByTestId('range');
    pointer('pointerdown', 0, range);
    fireEvent.change(range, { target: { value: '7' } });
    expect(useProjectStore.getState().project.meta.duration).toBe(7);
    expect(screen.getByRole('status')).toHaveTextContent('true/true');
    key('z', false, range);
    fireEvent.change(range, { target: { value: '9' } });
    pointer('pointerup', 20);
    expect(useProjectStore.getState().project.meta.duration).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('false/false');
    pointer('pointerdown', 0, range);
    fireEvent.change(range, { target: { value: '6' } });
    unmount();
    expect(useProjectStore.getState().project.meta.duration).toBeNull();
    expect(history.canUndo()).toBe(false);
  });

  it('text fields and draft modals leave idle history and Duplicate alone', () => {
    const { formula } = setup();
    useUiStore.getState().select({ kind: 'formula', id: formula.id });
    useProjectStore.getState().update((p) => {
      p.meta.name = 'After';
    });
    renderHook(useGlobalShortcuts);
    const { unmount } = render(
      <Modal title="Draft" onClose={() => {}}>
        <button>Draft control</button>
        <input aria-label="Text" />
      </Modal>,
    );
    const input = screen.getByLabelText('Text');
    expect(key('z', false, input).defaultPrevented).toBe(false);
    expect(key('d', false, input).defaultPrevented).toBe(false);
    expect(key('z', false, screen.getByText('Draft control')).defaultPrevented).toBe(true);
    expect(key('d', false, screen.getByText('Draft control')).defaultPrevented).toBe(false);
    expect(useProjectStore.getState().project.meta.name).toBe('After');
    expect(useProjectStore.getState().project.formulas).toHaveLength(1);
    unmount();
  });

  it.each(['move', 'trim'] as const)(
    'Undo cancels a timeline %s without consuming past history or accepting later pointer events',
    (kind) => {
      const { clip } = setup();
      useProjectStore.getState().update((p) => {
        p.meta.name = 'After';
      });
      const host = document.createElement('div');
      document.body.append(host);
      const { result, unmount } = renderHook(() => {
        useGlobalShortcuts();
        return useTimelineGestures({ ruler: { current: host }, tracks: { current: host } });
      });
      const event = {
        button: 0,
        clientX: 0,
        clientY: 10,
        pointerId: 1,
        currentTarget: host,
        stopPropagation() {},
        preventDefault() {},
      } as unknown as ReactPointerEvent;
      act(() => {
        if (kind === 'move') result.current.startMove(event, clip);
        else result.current.startTrim(event, clip, 'end');
      });
      pointer('pointermove', 100);
      expect(
        useProjectStore.getState().project.clips[0]![kind === 'move' ? 'start' : 'end'],
      ).not.toBe(kind === 'move' ? 0 : 10);
      expect(key('z').defaultPrevented).toBe(true);
      expect(useProjectStore.getState().project.meta.name).toBe('After');
      expect(useProjectStore.getState().project.clips[0]).toEqual(clip);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      pointer('pointermove', 200);
      pointer('pointerup', 200);
      expect(useProjectStore.getState().project.clips[0]).toEqual(clip);
      key('z');
      expect(useProjectStore.getState().project.meta.name).toBe('Before');
      key('z', true);
      expect(useProjectStore.getState().project.meta.name).toBe('After');
      expect(useProjectStore.getState().project.clips[0]).toEqual(clip);
      unmount();
      host.remove();
    },
  );

  it('Block dialog routes committed number edits to project Undo/Redo, leaving text undo native', async () => {
    const { clip, block } = setup();
    renderHook(useGlobalShortcuts);
    openBlockDialog(clip.id, block.id);
    render(<BlockDialogHost />);
    const duration = screen.getByTestId('block-duration');
    const user = userEvent.setup();
    await user.clear(duration);
    await user.type(duration, '2{Enter}');
    expect(useProjectStore.getState().project.clips[0]!.actions[0]!.duration).toBe(2);
    expect(key('z', false, duration).defaultPrevented).toBe(false);
    expect(useProjectStore.getState().project.clips[0]!.actions[0]!.duration).toBe(2);
    const button = screen.getByTestId('block-preview-open');
    button.focus();
    expect(key('z', false, button).defaultPrevented).toBe(true);
    expect(useProjectStore.getState().project.clips[0]!.actions[0]!.duration).toBe(3);
    key('z', true, button);
    expect(useProjectStore.getState().project.clips[0]!.actions[0]!.duration).toBe(2);
  });

  it('leaves Ctrl+D to the timeline: a selected formula is duplicated from its menu, in one undo step', () => {
    const { formula } = setup();
    useUiStore.getState().select({ kind: 'formula', id: formula.id });
    renderHook(useGlobalShortcuts);
    expect(key('d').defaultPrevented).toBe(false);
    expect(useProjectStore.getState().project.formulas).toEqual([formula]);
    expect(history.canUndo()).toBe(false);
    expect(duplicateSelectedFormulas()).toBe(true);
    const formulas = useProjectStore.getState().project.formulas;
    expect(formulas).toHaveLength(2);
    expect(formulas[1]!.source).toBe('abc');
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: formulas[1]!.id });
    key('z');
    expect(useProjectStore.getState().project.formulas).toEqual([formula]);
    expect(history.canUndo()).toBe(false);
  });
});
