import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { PanelFrame } from '../PanelFrame';
import { usePanels } from '../panelsStore';

function fakeHandle(): PanelImperativeHandle & { folded: boolean } {
  const handle = {
    folded: false,
    collapse: vi.fn(() => {
      handle.folded = true;
      usePanels.getState().report('creator', true);
    }),
    expand: vi.fn(() => {
      handle.folded = false;
      usePanels.getState().report('creator', false);
    }),
    isCollapsed: () => handle.folded,
  };
  return handle as unknown as PanelImperativeHandle & { folded: boolean };
}

beforeEach(() => {
  usePanels.setState({
    collapsed: { creator: false, animations: false, timeline: false },
    handles: {},
  });
});

describe('PanelFrame', () => {
  it('shows the icon of its panel before the title, for the eye only', () => {
    render(
      <PanelFrame title="Preview" icon="play-outline" testId="panel-preview">
        body
      </PanelFrame>,
    );
    const header = screen.getByTestId('panel-preview').querySelector('.panel-header')!;
    const icon = header.querySelector('.panel-icon svg')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(header.firstElementChild).toHaveClass('panel-icon');
    // The panel's name stays the title alone.
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Preview' })).toBeVisible();
  });

  it('puts the tools of its panel at the end of the title bar, and hides them when folded', () => {
    const frame = (
      <PanelFrame
        title="Creator"
        testId="panel-creator"
        fold="creator"
        tools={<button type="button">Zoom in</button>}
      >
        body
      </PanelFrame>
    );
    const { rerender } = render(frame);
    const header = screen.getByTestId('panel-creator').querySelector('.panel-header')!;
    const tools = screen.getByTestId('panel-creator-tools');
    expect(tools.parentElement).toBe(header);
    expect(tools).toContainElement(screen.getByRole('button', { name: 'Zoom in' }));
    // After the title, in the bar's order.
    expect(header.querySelector('.panel-title')!.nextElementSibling).toBe(tools);
    // Folded to its title bar, a panel has no room for them.
    usePanels.setState({ collapsed: { creator: true, animations: false, timeline: false } });
    rerender(frame);
    expect(screen.queryByTestId('panel-creator-tools')).toBeNull();
  });

  it('has no tools when none are given', () => {
    render(
      <PanelFrame title="Preview" testId="panel-preview">
        body
      </PanelFrame>,
    );
    expect(screen.queryByTestId('panel-preview-tools')).toBeNull();
  });

  it('has no icon when none is given', () => {
    render(
      <PanelFrame title="Preview" testId="panel-preview">
        body
      </PanelFrame>,
    );
    expect(screen.getByTestId('panel-preview').querySelector('.panel-icon')).toBeNull();
  });

  it('has no fold button while its panel is not in the resizable layout', () => {
    render(
      <PanelFrame title="Creator" testId="panel-creator" fold="creator">
        body
      </PanelFrame>,
    );
    expect(screen.queryByTestId('panel-fold-creator')).toBeNull();
    expect(screen.getByTestId('panel-creator')).toHaveAttribute('data-folded', 'false');
    expect(screen.getByText('body')).toBeVisible();
  });

  it('folds to its title bar from the button or a double-click on the header, and back', () => {
    const handle = fakeHandle();
    usePanels.getState().register('creator', handle);
    render(
      <PanelFrame title="Creator" testId="panel-creator" fold="creator">
        body
      </PanelFrame>,
    );
    const button = screen.getByTestId('panel-fold-creator');
    expect(button).toHaveAccessibleName('Fold Creator');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('data-direction', 'left');
    fireEvent.click(button);
    expect(handle.collapse).toHaveBeenCalledTimes(1);
    const frame = screen.getByTestId('panel-creator');
    expect(frame).toHaveAttribute('data-folded', 'true');
    expect(frame).toHaveClass('is-folded');
    expect(frame).toHaveAttribute('data-side', 'left');
    expect(screen.getByText('body')).not.toBeVisible();
    expect(button).toHaveAccessibleName('Unfold Creator');
    expect(button).toHaveAttribute('data-direction', 'right');
    // A double-click on the title unfolds; one on the button itself does nothing more.
    fireEvent.doubleClick(screen.getByText('Creator'));
    expect(handle.expand).toHaveBeenCalledTimes(1);
    expect(frame).toHaveAttribute('data-folded', 'false');
    fireEvent.doubleClick(button);
    expect(handle.collapse).toHaveBeenCalledTimes(1);
  });
});
