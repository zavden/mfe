import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../../project/Modal';
import { useAltHeld } from '../useAltHeld';

describe('useAltHeld', () => {
  it('is on while Alt is down, and off again when it goes up or the window loses the focus', () => {
    const { result } = renderHook(useAltHeld);
    expect(result.current.alt).toBe(false);
    fireEvent.keyDown(document.body, { key: 'Alt' });
    expect(result.current.alt).toBe(true);
    fireEvent.keyUp(document.body, { key: 'Alt' });
    expect(result.current.alt).toBe(false);
    fireEvent.keyDown(document.body, { key: 'Alt' });
    fireEvent.blur(window);
    expect(result.current.alt).toBe(false);
    // Another key is not it (AltGr types characters).
    fireEvent.keyDown(document.body, { key: 'AltGraph' });
    fireEvent.keyDown(document.body, { key: 'Shift' });
    expect(result.current.alt).toBe(false);
  });

  it('leaves the key to a text field and to a dialog', () => {
    const { result } = renderHook(useAltHeld);
    const field = document.body.appendChild(document.createElement('input'));
    fireEvent.keyDown(field, { key: 'Alt' });
    expect(result.current.alt).toBe(false);
    field.remove();
    const dialog = render(
      <Modal title="A dialog" onClose={vi.fn()}>
        <p>content</p>
      </Modal>,
    );
    fireEvent.keyDown(document.body, { key: 'Alt' });
    expect(result.current.alt).toBe(false);
    // …nor does a pointer event over the timeline turn it on under a dialog.
    act(() => result.current.syncAlt({ altKey: true }));
    expect(result.current.alt).toBe(false);
    dialog.unmount();
  });

  it('follows the pointer when a key event was missed', () => {
    const { result } = renderHook(useAltHeld);
    act(() => result.current.syncAlt({ altKey: true }));
    expect(result.current.alt).toBe(true);
    act(() => result.current.syncAlt({ altKey: false }));
    expect(result.current.alt).toBe(false);
  });

  it('stops listening when it is unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(useAltHeld);
    unmount();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(['blur', 'keydown', 'keyup']);
    remove.mockRestore();
  });
});
