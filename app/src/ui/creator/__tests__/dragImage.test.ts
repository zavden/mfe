import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormula } from '../../../model';
import { createDragChip, DRAG_CHIP_HEIGHT, setFormulaDragImage } from '../dragImage';

const formula = createFormula({
  name: 'alpha',
  source: 'a',
  tag: { color: '#83C167', icon: 'α' },
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('createDragChip', () => {
  it('is a small, semi-transparent pill with the tag colour, icon and name', () => {
    const chip = createDragChip(formula);
    expect(chip.style.height).toBe(`${DRAG_CHIP_HEIGHT}px`);
    expect(DRAG_CHIP_HEIGHT).toBeLessThanOrEqual(26);
    expect(Number(chip.style.opacity)).toBeGreaterThan(0);
    expect(Number(chip.style.opacity)).toBeLessThan(1);
    expect(chip.style.background).not.toBe('');
    expect(chip.textContent).toBe('αalpha');
    expect(chip.style.pointerEvents).toBe('none');
    expect(chip.style.maxWidth).not.toBe('');
  });

  it('is built off-screen and without an icon when the tag has none', () => {
    const chip = createDragChip({ name: 'beta', tag: { color: '#58C4DD', icon: null } });
    expect(chip.textContent).toBe('beta');
    expect(chip.style.position).toBe('fixed');
    expect(parseFloat(chip.style.top)).toBeLessThan(-DRAG_CHIP_HEIGHT);
    expect(parseFloat(chip.style.left)).toBeLessThan(0);
  });
});

describe('setFormulaDragImage', () => {
  it('attaches the chip to the document for the snapshot, then removes it', () => {
    vi.useFakeTimers();
    const calls: { element: Element; x: number; y: number; connected: boolean }[] = [];
    const dataTransfer = {
      setDragImage: (element: Element, x: number, y: number) => {
        calls.push({ element, x, y, connected: element.isConnected });
      },
    };
    setFormulaDragImage(dataTransfer, formula);

    expect(calls).toHaveLength(1);
    const { element, x, y, connected } = calls[0]!;
    expect(connected).toBe(true); // rendered while the browser takes its snapshot
    expect(element.textContent).toBe('αalpha');
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBe(DRAG_CHIP_HEIGHT / 2);
    expect(document.body.contains(element)).toBe(true);

    vi.runAllTimers();
    expect(document.querySelector('.formula-drag-chip')).toBeNull();
    expect(element.isConnected).toBe(false);
  });

  it('does nothing where the browser has no setDragImage', () => {
    expect(() => setFormulaDragImage({} as DataTransfer, formula)).not.toThrow();
    expect(document.querySelector('.formula-drag-chip')).toBeNull();
  });
});
