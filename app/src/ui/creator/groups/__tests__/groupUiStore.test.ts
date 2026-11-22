import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../../../model';
import { loadProject } from '../../../../store';
import { startGroupUiTracking, useGroupUi } from '../groupUiStore';

beforeEach(() => useGroupUi.setState({ open: new Set(), renaming: null }));

describe('what the view remembers about the groups of formulas', () => {
  it('opens and closes groups, each on its own, starting closed', () => {
    const { toggle, setOpen } = useGroupUi.getState();
    expect(useGroupUi.getState().open.size).toBe(0);
    toggle('a');
    setOpen('b', true);
    expect([...useGroupUi.getState().open]).toEqual(['a', 'b']);
    toggle('a');
    expect([...useGroupUi.getState().open]).toEqual(['b']);
    // Nothing to do: the very state, so that nothing is drawn again.
    const before = useGroupUi.getState().open;
    setOpen('b', true);
    setOpen('a', false);
    expect(useGroupUi.getState().open).toBe(before);
  });

  it('names the one group being renamed', () => {
    useGroupUi.getState().startRename('a');
    expect(useGroupUi.getState().renaming).toBe('a');
    useGroupUi.getState().stopRename();
    expect(useGroupUi.getState().renaming).toBeNull();
  });

  it('forgets both with the document, while its service runs', () => {
    const open = () => {
      useGroupUi.getState().setOpen('a', true);
      useGroupUi.getState().startRename('a');
    };
    open();
    loadProject(createEmptyProject());
    expect(useGroupUi.getState().open.has('a')).toBe(true); // not started: it listens to nothing
    const stop = startGroupUiTracking();
    loadProject(createEmptyProject());
    expect(useGroupUi.getState()).toMatchObject({ renaming: null });
    expect(useGroupUi.getState().open.size).toBe(0);
    stop();
    open();
    loadProject(createEmptyProject());
    expect(useGroupUi.getState().renaming).toBe('a');
  });
});
