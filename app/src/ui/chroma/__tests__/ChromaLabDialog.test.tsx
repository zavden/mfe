import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PALETTE_ROLES } from '../../colors/palette';
import { usePaletteStore } from '../../colors/paletteStore';
import { historyModals } from '../../project/modalStack';
import { ChromaLabDialog } from '../ChromaLabDialog';
import snapshot from '../snapshot.json';

/** A theme file as Chroma Lab downloads it. */
function themeFile(name: string, colors: readonly string[] = PALETTE_ROLES): File {
  const text = JSON.stringify({
    format: 'manim-palette',
    version: 1,
    name,
    colors: Object.fromEntries(colors.map((role) => [role, '#123456'])),
  });
  const file = new File([text], 'theme-manim.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

afterEach(async () => {
  vi.restoreAllMocks();
  const { library, remove } = usePaletteStore.getState();
  for (const entry of library.palettes) await remove(entry.id);
});

describe('Chroma Lab host', () => {
  it('preserves the frame across maximize, restore and callback changes', () => {
    const onClose = vi.fn();
    const onImported = vi.fn();
    const onLibrary = vi.fn();
    const { rerender } = render(
      <ChromaLabDialog onClose={onClose} onImported={onImported} onLibrary={onLibrary} />,
    );
    const frame = screen.getByTitle('Chroma Lab color studio');
    expect(frame).toHaveAttribute('src', './chroma-lab/index.html');
    expect(frame).toHaveAttribute('tabindex', '0');
    expect(historyModals.size).toBe(0);
    // The version it names is the one of the pinned copy.
    expect(snapshot.upstream.packageVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(screen.getByTestId('chroma-lab-notices')).toHaveTextContent(
      `Chroma Lab ${snapshot.upstream.packageVersion} · Notices`,
    );
    fireEvent.click(screen.getByTestId('chroma-lab-dialog-maximize'));
    expect(screen.getByTestId('chroma-lab-dialog')).toHaveClass('is-maximized');
    expect(screen.getByTitle('Chroma Lab color studio')).toBe(frame);
    fireEvent.click(screen.getByTestId('chroma-lab-dialog-maximize'));
    rerender(<ChromaLabDialog onClose={vi.fn()} onImported={onImported} onLibrary={onLibrary} />);
    expect(screen.getByTitle('Chroma Lab color studio')).toBe(frame);
    fireEvent.click(screen.getByTestId('chroma-lab-library'));
    expect(onLibrary).toHaveBeenCalledOnce();
    expect(onImported).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Import palette… opens the file picker, and the chosen theme enters the library', async () => {
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const onImported = vi.fn();
    const onLibrary = vi.fn();
    render(<ChromaLabDialog onClose={vi.fn()} onImported={onImported} onLibrary={onLibrary} />);
    const input = screen.getByTestId('chroma-lab-import-input');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.json,application/json');
    fireEvent.click(screen.getByTestId('chroma-lab-import'));
    expect(picker.mock.contexts).toEqual([input]);
    expect(onLibrary).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [themeFile('From Chroma')] } });
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    const stored = usePaletteStore.getState().library.palettes;
    expect(stored.map((entry) => entry.displayName)).toEqual(['From Chroma']);
    expect(onImported).toHaveBeenCalledWith({
      id: stored[0]!.id,
      sourceSignature: JSON.stringify(stored[0]!.source),
      warnings: [],
    });
    expect(screen.queryByTestId('chroma-lab-import-error')).toBeNull();
  });

  it('keeps its controls in the title bar, and the body for the frame', () => {
    render(<ChromaLabDialog onClose={vi.fn()} onImported={vi.fn()} onLibrary={vi.fn()} />);
    const dialog = screen.getByTestId('chroma-lab-dialog');
    const header = dialog.querySelector('.modal-header')!;
    for (const id of ['chroma-lab-import', 'chroma-lab-library', 'chroma-lab-info']) {
      expect(header).toContainElement(screen.getByTestId(id));
    }
    // Nothing but the frame in the body: no band over it.
    const host = screen.getByTestId('chroma-lab-host');
    expect([...host.children]).toEqual([screen.getByTestId('chroma-lab-frame')]);
    // The dialog opens on its first control, as before.
    expect(screen.getByTestId('chroma-lab-import')).toHaveFocus();
  });

  it('tells how a theme reaches the editor in a panel its information button opens', () => {
    const onClose = vi.fn();
    render(<ChromaLabDialog onClose={onClose} onImported={vi.fn()} onLibrary={vi.fn()} />);
    const button = screen.getByTestId('chroma-lab-info');
    const panel = screen.getByTestId('chroma-lab-info-panel');
    expect(button).toHaveAccessibleName('How a theme reaches the editor');
    expect(button).toHaveAttribute('aria-controls', panel.id);
    const open = () => button.getAttribute('aria-expanded') === 'true' && !panel.hidden;
    const closed = () => button.getAttribute('aria-expanded') === 'false' && panel.hidden;
    expect(closed()).toBe(true);
    // Closed, its text still describes Import palette….
    expect(screen.getByTestId('chroma-lab-import')).toHaveAccessibleDescription(
      /Send to Manim Formula Editor.*can be imported with Import palette…, or dragged/,
    );
    fireEvent.click(button);
    expect(open()).toBe(true);
    expect(panel).toContainElement(screen.getByTestId('chroma-lab-notices'));
    fireEvent.click(button);
    expect(closed()).toBe(true);
    // Escape closes the panel and gives the button the focus: the dialog stays.
    fireEvent.click(button);
    screen.getByTestId('chroma-lab-notices').focus();
    fireEvent.keyDown(screen.getByTestId('chroma-lab-notices'), { key: 'Escape' });
    expect(closed()).toBe(true);
    expect(button).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    // A press elsewhere closes it; a press inside does not.
    fireEvent.click(button);
    fireEvent.pointerDown(panel);
    expect(open()).toBe(true);
    fireEvent.pointerDown(screen.getByTestId('chroma-lab-done'));
    expect(closed()).toBe(true);
    // So does the focus going into Chroma Lab: the window loses it to the frame.
    fireEvent.click(button);
    fireEvent.blur(window);
    expect(closed()).toBe(true);
    // With the panel closed, Escape is the dialog's again.
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('says over the frame why a file was not imported, until the next one is chosen', async () => {
    const onImported = vi.fn();
    render(<ChromaLabDialog onClose={vi.fn()} onImported={onImported} onLibrary={vi.fn()} />);
    const input = screen.getByTestId('chroma-lab-import-input');
    fireEvent.change(input, { target: { files: [themeFile('Roles missing', ['formula'])] } });
    const error = await screen.findByTestId('chroma-lab-import-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('background');
    expect(error.nextElementSibling).toBe(screen.getByTestId('chroma-lab-frame'));
    expect(onImported).not.toHaveBeenCalled();
    expect(usePaletteStore.getState().library.palettes).toEqual([]);
    fireEvent.change(input, { target: { files: [themeFile('Complete')] } });
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('chroma-lab-import-error')).toBeNull();
  });

  it('takes a theme dragged onto the dialog, and leaves the studio what is not called JSON', async () => {
    const onImported = vi.fn();
    render(<ChromaLabDialog onClose={vi.fn()} onImported={onImported} onLibrary={vi.fn()} />);
    const dragged = (type: string) => ({ types: ['Files'], items: [{ kind: 'file', type }] });
    const frame = screen.getByTestId('chroma-lab-frame');
    // A picture is for Chroma's extractor, and a file whose type the browser keeps to itself
    // may be one.
    fireEvent.dragEnter(frame, { dataTransfer: dragged('image/png') });
    fireEvent.dragEnter(frame, { dataTransfer: dragged('') });
    expect(screen.queryByTestId('chroma-lab-drop')).toBeNull();
    fireEvent.dragEnter(frame, { dataTransfer: dragged('application/json') });
    expect(screen.getByTestId('chroma-lab-drop')).toHaveTextContent('Drop the theme JSON');
    fireEvent.drop(screen.getByTestId('chroma-lab-drop'), {
      dataTransfer: { ...dragged('application/json'), files: [themeFile('Dragged')] },
    });
    expect(screen.queryByTestId('chroma-lab-drop')).toBeNull();
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(usePaletteStore.getState().library.palettes.map((entry) => entry.displayName)).toEqual([
      'Dragged',
    ]);
  });

  it('asks for one file when several are dropped', async () => {
    const onImported = vi.fn();
    render(<ChromaLabDialog onClose={vi.fn()} onImported={onImported} onLibrary={vi.fn()} />);
    const data = { types: ['Files'], items: [{ kind: 'file', type: 'application/json' }] };
    fireEvent.dragEnter(screen.getByTestId('chroma-lab-frame'), { dataTransfer: data });
    fireEvent.drop(screen.getByTestId('chroma-lab-drop'), {
      dataTransfer: { ...data, files: [themeFile('One'), themeFile('Two')] },
    });
    expect(await screen.findByTestId('chroma-lab-import-error')).toHaveTextContent(
      'Import one palette file at a time.',
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(usePaletteStore.getState().library.palettes).toEqual([]);
  });

  it('keeps a visible export reminder and restores focus when closed', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <ChromaLabDialog onClose={onClose} onImported={vi.fn()} onLibrary={vi.fn()} />,
    );
    expect(screen.getByTestId('chroma-lab-reminder')).toHaveTextContent(
      'Send or export your theme before closing.',
    );
    fireEvent.click(screen.getByTestId('chroma-lab-done'));
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(screen.queryByTitle('Chroma Lab color studio')).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('Chroma Lab host bridge in the dialog', () => {
  const theme = (name: string, roles: readonly string[] = PALETTE_ROLES) => ({
    format: 'manim-palette',
    version: 1,
    name,
    colors: Object.fromEntries(roles.map((role) => [role, '#123456'])),
  });

  function open(onImported = vi.fn()) {
    const view = render(
      <ChromaLabDialog onClose={vi.fn()} onImported={onImported} onLibrary={vi.fn()} />,
    );
    const frame = screen.getByTestId<HTMLIFrameElement>('chroma-lab-frame');
    const posted = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    /** A message of Chroma Lab's, as the frame's window sends it. */
    const says = (data: Record<string, unknown>, source: Window = frame.contentWindow!) =>
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { channel: 'chroma-lab', version: 1, ...data },
            source,
            origin: window.location.origin,
          }),
        );
      });
    const answer = (type: string) =>
      posted.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .filter((message) => message.type === type);
    return { ...view, frame, posted, says, answer, onImported };
  }

  it('presents the editor to the frame when it loads and when it greets', () => {
    const { frame, posted, says } = open();
    const host = { channel: 'chroma-lab', version: 1, type: 'host', name: 'Manim Formula Editor' };
    fireEvent.load(frame);
    expect(posted.mock.calls).toEqual([[host, window.location.origin]]);
    says({ type: 'hello' });
    expect(posted.mock.calls).toHaveLength(2);
    expect(screen.getByTestId('chroma-lab-host')).toHaveAttribute('data-bridge', 'waiting');
    says({ type: 'ready' });
    expect(screen.getByTestId('chroma-lab-host')).toHaveAttribute('data-bridge', 'ready');
    expect(screen.getByTestId('chroma-lab-dialog')).toHaveTextContent(
      'Send to Manim Formula Editor',
    );
  });

  it('imports the theme the frame sends, shows it and tells the frame', async () => {
    const { says, answer, onImported } = open();
    says({ type: 'theme', theme: theme('Sent from Chroma') });
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    const stored = usePaletteStore.getState().library.palettes;
    expect(stored.map((entry) => entry.displayName)).toEqual(['Sent from Chroma']);
    expect(onImported).toHaveBeenCalledWith({
      id: stored[0]!.id,
      sourceSignature: JSON.stringify(stored[0]!.source),
      warnings: [],
    });
    await waitFor(() =>
      expect(answer('theme-result')).toEqual([
        {
          channel: 'chroma-lab',
          version: 1,
          type: 'theme-result',
          ok: true,
          message: 'The theme is in the editor’s palettes.',
        },
      ]),
    );
    expect(screen.queryByTestId('chroma-lab-import-error')).toBeNull();
  });

  it('refuses what is not a theme, in its toolbar and to the frame', async () => {
    const { says, answer, onImported } = open();
    says({ type: 'theme', theme: theme('Roles missing', ['formula']) });
    const error = await screen.findByTestId('chroma-lab-import-error');
    expect(error).toHaveTextContent('background');
    await waitFor(() => expect(answer('theme-result')).toHaveLength(1));
    expect(answer('theme-result')[0]).toMatchObject({ ok: false });
    expect(String(answer('theme-result')[0]!.message)).toContain('missing required roles');
    says({ type: 'theme' });
    await waitFor(() => expect(answer('theme-result')).toHaveLength(2));
    expect(answer('theme-result')[1]).toMatchObject({ ok: false });
    expect(onImported).not.toHaveBeenCalled();
    expect(usePaletteStore.getState().library.palettes).toEqual([]);
  });

  it('hears no other window, and nothing once it is closed', async () => {
    const { says, unmount, onImported, posted } = open();
    says({ type: 'theme', theme: theme('From elsewhere') }, window);
    unmount();
    says({ type: 'theme', theme: theme('After closing') });
    says({ type: 'hello' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(onImported).not.toHaveBeenCalled();
    expect(posted).not.toHaveBeenCalled();
    expect(usePaletteStore.getState().library.palettes).toEqual([]);
  });
});
