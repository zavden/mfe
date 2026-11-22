import { beforeEach, describe, expect, it } from 'vitest';
import { LAST_TARGET_KEY, openExportDialog, readLastTarget, useExportDialog } from '../exportStore';

beforeEach(() => {
  window.localStorage.removeItem(LAST_TARGET_KEY);
  useExportDialog.setState({ request: null, lastTarget: 'ce' });
});

describe('useExportDialog', () => {
  it('remembers the last Python target opened, in the browser', () => {
    expect(useExportDialog.getState().lastTarget).toBe('ce');
    openExportDialog({ kind: 'python', target: 'gl' });
    expect(useExportDialog.getState().request).toEqual({ kind: 'python', target: 'gl' });
    expect(useExportDialog.getState().lastTarget).toBe('gl');
    expect(window.localStorage.getItem(LAST_TARGET_KEY)).toBe('gl');
    // A video export leaves it alone.
    openExportDialog({ kind: 'video' });
    expect(useExportDialog.getState().request).toEqual({ kind: 'video' });
    expect(useExportDialog.getState().lastTarget).toBe('gl');
    useExportDialog.getState().close();
    expect(useExportDialog.getState().request).toBeNull();
    // Nor does the picture of a frame.
    openExportDialog({ kind: 'image' });
    expect(useExportDialog.getState().request).toEqual({ kind: 'image' });
    expect(useExportDialog.getState().lastTarget).toBe('gl');
  });

  it('reads a stored target back, ignoring anything else', () => {
    expect(readLastTarget()).toBe('ce');
    window.localStorage.setItem(LAST_TARGET_KEY, 'gl');
    expect(readLastTarget()).toBe('gl');
    window.localStorage.setItem(LAST_TARGET_KEY, 'nope');
    expect(readLastTarget()).toBe('ce');
  });
});
