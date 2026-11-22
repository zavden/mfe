import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

const hoisted = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../project/files', async (original) => ({
  ...(await original<typeof import('../project/files')>()),
  downloadBlob: hoisted.downloadBlob,
}));

function Boom(): never {
  throw new Error('boom');
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('replaces a crashed tree with a way back and the project as a file', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('crash')).toHaveTextContent('Something went wrong');
    expect(screen.getByTestId('crash')).toHaveTextContent('Error: boom');
    fireEvent.click(screen.getByTestId('crash-download'));
    expect(hoisted.downloadBlob).toHaveBeenCalledWith('untitled.mfe.json', expect.any(Blob));
  });

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
