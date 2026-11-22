import { describe, expect, it } from 'vitest';
import { timelineKey } from '../useTimelineKeys';

const press = (
  key: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
  code?: string,
) => ({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('timelineKey: which key of the timeline a key press is', () => {
  it('names S, Delete and Backspace, Ctrl/⌘+D and Alt+←/→', () => {
    expect(timelineKey(press('s'))).toBe('split');
    expect(timelineKey(press('S'))).toBe('split'); // Caps Lock
    expect(timelineKey(press('Delete'))).toBe('delete');
    expect(timelineKey(press('Backspace'))).toBe('delete');
    expect(timelineKey(press('d', { ctrlKey: true }))).toBe('duplicate');
    expect(timelineKey(press('D', { metaKey: true }))).toBe('duplicate');
    expect(timelineKey(press('ArrowLeft', { altKey: true }))).toBe('nudge');
    expect(timelineKey(press('ArrowRight', { altKey: true, shiftKey: true }))).toBe('nudge');
  });

  it('is none of them with another modifier, nor any other key', () => {
    expect(timelineKey(press('s', { ctrlKey: true }))).toBeNull(); // Save
    expect(timelineKey(press('s', { altKey: true }))).toBeNull(); // Align bottom
    expect(timelineKey(press('d'))).toBeNull();
    expect(timelineKey(press('d', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(timelineKey(press('d', { metaKey: true, altKey: true }))).toBeNull();
    expect(timelineKey(press('ArrowLeft'))).toBeNull(); // the playhead's
    expect(timelineKey(press('ArrowRight', { altKey: true, ctrlKey: true }))).toBeNull();
    expect(timelineKey(press('ArrowUp', { altKey: true }))).toBeNull();
    expect(timelineKey(press('Enter'))).toBeNull();
  });

  it('reads S and Ctrl/⌘+D from the place of the key on a layout of another script', () => {
    // Russian: S is "ы", D is "в".
    expect(timelineKey(press('ы', {}, 'KeyS'))).toBe('split');
    expect(timelineKey(press('в', { ctrlKey: true }, 'KeyD'))).toBe('duplicate');
    expect(timelineKey(press('δ', { metaKey: true }, 'KeyD'))).toBe('duplicate'); // Greek
    // A Latin layout keeps its own letter: Dvorak has "o" where S is, "e" where D is.
    expect(timelineKey(press('o', {}, 'KeyS'))).toBeNull();
    expect(timelineKey(press('e', { ctrlKey: true }, 'KeyD'))).toBeNull();
    expect(timelineKey(press('s', {}, 'Semicolon'))).toBe('split');
    expect(timelineKey(press('d', { ctrlKey: true }, 'KeyH'))).toBe('duplicate');
  });
});
