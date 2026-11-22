// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { openBlockDialog, useBlockDialogStore } from '../blockDialogStore';

beforeEach(() => useBlockDialogStore.getState().close());

describe('the block dialog store', () => {
  it('opens the dialog of a block, one at a time, and closes it', () => {
    expect(useBlockDialogStore.getState().request).toBeNull();
    openBlockDialog('c1', 'a1');
    expect(useBlockDialogStore.getState().request).toEqual({ clipId: 'c1', actionId: 'a1' });
    openBlockDialog('c1', 'a2');
    expect(useBlockDialogStore.getState().request).toEqual({ clipId: 'c1', actionId: 'a2' });
    useBlockDialogStore.getState().close();
    expect(useBlockDialogStore.getState().request).toBeNull();
  });
});
