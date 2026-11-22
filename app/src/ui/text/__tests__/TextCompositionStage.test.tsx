import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../../model';
import { TextCompositionStage } from '../TextCompositionStage';

/** A 2D context that only keeps the colours it is given to fill with, in order. */
function fillRecorder() {
  const fills: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: () => () => undefined,
    set: (_, name, value: unknown) => {
      if (name === 'fillStyle') fills.push(String(value));
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

/** The theme's window colour, as the stylesheet gives it in each theme. */
const sheet = document.createElement('style');
sheet.textContent = `
  canvas { --bg: #102030; }
  :root[data-theme='light'] canvas { --bg: #e0f0f0; }
`;

beforeEach(() => document.head.append(sheet));
afterEach(() => {
  cleanup();
  sheet.remove();
  vi.restoreAllMocks();
});

const noop = () => {};

describe('the composition stage', () => {
  it('paints around the frame in the theme’s colour, and paints again when the theme changes', async () => {
    const { ctx, fills } = fillRecorder();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctx as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
    const meta = createEmptyProject().meta;
    render(
      <TextCompositionStage
        render={null}
        meta={meta}
        placement={{ position: [0, 0], scale: 1, rotation: 0, flipX: false, flipY: false }}
        color="#FFFFFF"
        glyphColors={{}}
        current={false}
        movable={false}
        positionLabel=""
        onPosition={noop}
        onRecordPosition={noop}
        onUndo={noop}
      />,
    );
    // The first fill of a paint is what lies outside the frame; the frame is the scene's colour.
    expect(fills[0]).toBe('#102030');
    expect(fills).toContain(meta.background);

    fills.length = 0;
    await act(async () => {
      document.documentElement.dataset.theme = 'light';
      await Promise.resolve();
    });
    expect(fills[0]).toBe('#e0f0f0');
    expect(fills).toContain(meta.background);
  });

  /** The stage with nothing to draw, and what the test says of «New clips start here». */
  function stage(keep: { keepPosition?: boolean; onKeepPosition?(keep: boolean): void }) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    return render(
      <TextCompositionStage
        render={null}
        meta={createEmptyProject().meta}
        placement={{ position: [0, 0], scale: 1, rotation: 0, flipX: false, flipY: false }}
        color="#FFFFFF"
        glyphColors={{}}
        current={false}
        movable
        positionLabel="Where"
        onPosition={noop}
        onRecordPosition={noop}
        onUndo={noop}
        {...keep}
      />,
    );
  }

  it('has «New clips start here» when it is told whether the position is kept, and reports a click', () => {
    const onKeepPosition = vi.fn();
    const host = stage({ keepPosition: true, onKeepPosition });
    const box = screen.getByTestId('text-keep-position');
    expect(box).toBeChecked();
    expect(box.closest('label')).toHaveTextContent('New clips start here');
    // Beside the position it keeps: after the fields and the centring, before the note.
    const row = [...box.closest('.text-position-controls')!.children];
    expect(row.indexOf(box.closest('label')!)).toBe(row.length - 2);
    expect(row.at(-1)).toHaveAttribute('data-testid', 'text-placement-hint');
    fireEvent.click(box);
    expect(onKeepPosition).toHaveBeenCalledExactlyOnceWith(false);
    // What it shows is what it is told.
    expect(box).toBeChecked();
    host.unmount();
    stage({ keepPosition: false, onKeepPosition });
    expect(screen.getByTestId('text-keep-position')).not.toBeChecked();
  });

  it('has no such box when the stage places a clip', () => {
    stage({});
    expect(screen.queryByTestId('text-keep-position')).toBeNull();
    expect(screen.getByTestId('text-placement-hint')).toHaveTextContent('Where');
  });
});
