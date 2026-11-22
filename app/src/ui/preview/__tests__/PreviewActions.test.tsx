import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createColorMatch, createEmptyProject } from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { useColorMatchDialog } from '../../colors/colorMatchDialogStore';
import { alignSelection, distributeSelection } from '../alignActions';
import { PreviewActions } from '../PreviewActions';
import { usePropertyClipboard } from '../propertyClipboard';

vi.mock('../alignActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../alignActions')>()),
  alignSelection: vi.fn(),
  distributeSelection: vi.fn(),
}));

beforeEach(() => {
  loadProject(createEmptyProject());
  useUiStore.setState({ selection: { kind: 'none' } });
  usePropertyClipboard.setState({ properties: null });
  useColorMatchDialog.getState().close();
  vi.mocked(alignSelection).mockClear();
  vi.mocked(distributeSelection).mockClear();
});

describe('PreviewActions', () => {
  it('offers align for two clips and distribute from three, and says how many', () => {
    const { rerender } = render(<PreviewActions count={2} />);
    expect(screen.getByTestId('preview-actions-count')).toHaveTextContent('2 clips');
    for (const id of ['left', 'center', 'right', 'top', 'middle', 'bottom']) {
      expect(screen.getByTestId(`preview-actions-align-${id}`)).toBeEnabled();
    }
    expect(screen.getByTestId('preview-actions-distribute-h')).toBeDisabled();
    expect(screen.getByTestId('preview-actions-distribute-v')).toBeDisabled();
    fireEvent.click(screen.getByTestId('preview-actions-align-left'));
    expect(alignSelection).toHaveBeenCalledWith('left');
    rerender(<PreviewActions count={3} />);
    expect(screen.getByTestId('preview-actions-count')).toHaveTextContent('3 clips');
    fireEvent.click(screen.getByTestId('preview-actions-distribute-h'));
    expect(distributeSelection).toHaveBeenCalledWith('x');
  });

  it('pastes once properties were copied, by group', () => {
    render(<PreviewActions count={2} />);
    const paste = screen.getByTestId('preview-actions-paste');
    expect(paste).toBeDisabled();
    act(() => {
      usePropertyClipboard.setState({
        properties: { ...createClip('f1', 't1', 0, 3).initial, formulaId: 'f1' },
      });
    });
    expect(paste).toBeEnabled();
    fireEvent.click(paste);
    const menu = screen.getByTestId('preview-actions-paste-menu');
    expect(menu).toHaveAttribute('aria-label', 'Paste properties');
    for (const id of ['all', 'transformation', 'appearance', 'glyph-colors', 'position']) {
      expect(screen.getByTestId(`preview-actions-paste-${id}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('preview-actions-paste-position'));
    expect(screen.queryByTestId('preview-actions-paste-menu')).toBeNull();
  });

  it("offers the project's match colour lists, or creating one", () => {
    render(<PreviewActions count={2} />);
    fireEvent.click(screen.getByTestId('preview-actions-match'));
    fireEvent.click(screen.getByTestId('preview-actions-match-create'));
    expect(useColorMatchDialog.getState().open).not.toBeNull();
    useColorMatchDialog.getState().close();
    const match = createColorMatch('Vars');
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.colorMatches.push(match);
      });
    });
    fireEvent.click(screen.getByTestId('preview-actions-match'));
    expect(screen.getByTestId(`preview-actions-match-${match.id}`)).toHaveTextContent('Vars');
    expect(screen.queryByTestId('preview-actions-match-create')).toBeNull();
  });
});
