import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { FOLDABLE_PANELS, FOLD_SIDE, foldSide, usePanels } from '../panelsStore';

/** A handle that folds and unfolds in memory. */
function fakeHandle(): PanelImperativeHandle & { folded: boolean } {
  const handle = {
    folded: false,
    collapse: vi.fn(() => {
      handle.folded = true;
    }),
    expand: vi.fn(() => {
      handle.folded = false;
    }),
    isCollapsed: () => handle.folded,
  };
  return handle as unknown as PanelImperativeHandle & { folded: boolean };
}

beforeEach(() => {
  usePanels.setState({
    collapsed: { creator: false, animations: false, timeline: false },
    handles: {},
    strip: null,
  });
});

describe('usePanels', () => {
  it('names the three foldable panels and the side each one folds to', () => {
    expect(FOLDABLE_PANELS.map((p) => p.id)).toEqual(['creator', 'animations', 'timeline']);
    expect(FOLD_SIDE).toEqual({ creator: 'left', animations: 'right', timeline: 'bottom' });
  });

  it('folds and unfolds through the registered handle, nothing without one', () => {
    const { register, toggle } = usePanels.getState();
    toggle('creator'); // no handle: nothing happens
    const handle = fakeHandle();
    register('creator', handle);
    toggle('creator');
    expect(handle.collapse).toHaveBeenCalledTimes(1);
    toggle('creator');
    expect(handle.expand).toHaveBeenCalledTimes(1);
    register('creator', null);
    expect(usePanels.getState().handles.creator).toBeUndefined();
    toggle('creator');
    expect(handle.collapse).toHaveBeenCalledTimes(1);
  });

  it('keeps what the layout reports, without a new state for the same word', () => {
    const { report } = usePanels.getState();
    const before = usePanels.getState().collapsed;
    report('timeline', false);
    expect(usePanels.getState().collapsed).toBe(before);
    report('timeline', true);
    expect(usePanels.getState().collapsed).toEqual({
      creator: false,
      animations: false,
      timeline: true,
    });
  });
});

describe('usePanels in Zen mode: the Creator and the Animations panel are halves of a drawer', () => {
  /** A half of the drawer, as `ZenStage` registers it: it folds by reporting its own fold. */
  function half(id: 'creator' | 'animations', open: boolean) {
    const handle = {
      collapse: vi.fn(() => usePanels.getState().report(id, true)),
      expand: vi.fn(() => usePanels.getState().report(id, false)),
      isCollapsed: () => usePanels.getState().collapsed[id],
    };
    usePanels.getState().report(id, !open);
    usePanels.getState().register(id, handle);
    return handle;
  }
  const collapsed = () => usePanels.getState().collapsed;

  it('opens and closes each half on its own, both at once if asked', () => {
    usePanels.getState().setStrip('top');
    half('creator', false);
    half('animations', false);
    expect(collapsed()).toEqual({ creator: true, animations: true, timeline: false });
    usePanels.getState().toggle('animations');
    expect(collapsed()).toEqual({ creator: true, animations: false, timeline: false });
    usePanels.getState().toggle('creator');
    expect(collapsed()).toEqual({ creator: false, animations: false, timeline: false });
    usePanels.getState().toggle('animations');
    expect(collapsed()).toEqual({ creator: false, animations: true, timeline: false });
  });

  it('what unfolds a panel it needs opens its half, and leaves it open the next time', () => {
    usePanels.getState().setStrip('top');
    const creator = half('creator', false);
    // As a brace's editor does.
    for (let i = 0; i < 2; i += 1) {
      const panels = usePanels.getState();
      if (panels.collapsed.creator) panels.toggle('creator');
    }
    expect(creator.expand).toHaveBeenCalledTimes(1);
    expect(collapsed().creator).toBe(false);
  });

  it('folds a panel towards the strip, and the timeline to the left', () => {
    expect(
      (['creator', 'animations', 'timeline'] as const).map((id) => foldSide(id, null)),
    ).toEqual(['left', 'right', 'bottom']);
    expect(foldSide('creator', 'top')).toBe('top');
    expect(foldSide('animations', 'bottom')).toBe('bottom');
    expect(foldSide('timeline', 'top')).toBe('left');
    usePanels.getState().setStrip('top');
    usePanels.getState().setStrip('bottom');
    expect(usePanels.getState().strip).toBe('bottom');
  });

  it('carries no fold over from one layout to the other; moving the strip keeps them', () => {
    usePanels.getState().setStrip('top');
    half('creator', false);
    half('animations', true);
    usePanels.getState().setStrip('bottom');
    expect(collapsed()).toMatchObject({ creator: true, animations: false });
    usePanels.getState().setStrip(null);
    expect(collapsed()).toEqual({ creator: false, animations: false, timeline: false });
    // And a panel folded in the usual layout does not close a half on the way in.
    usePanels.getState().report('animations', true);
    usePanels.getState().report('timeline', true);
    usePanels.getState().setStrip('top');
    expect(collapsed()).toEqual({ creator: false, animations: false, timeline: true });
  });
});
