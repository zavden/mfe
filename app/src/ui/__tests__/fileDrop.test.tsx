import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { carriesFiles, carriesType, guardFileDrops, useFileDrop } from '../fileDrop';
import { FileDropOverlay } from '../FileDropOverlay';

/** What a browser shows of a drag before the drop: the kinds, and each file's type. */
const drag = (...types: string[]) => ({
  types: ['Files'],
  items: types.map((type) => ({ kind: 'file', type })),
  dropEffect: 'none',
});
const textDrag = { types: ['text/plain'], items: [{ kind: 'string', type: 'text/plain' }] };
const json = () => drag('application/json');

function Area({
  accepts,
  onFiles,
}: {
  accepts?: (data: DataTransfer) => boolean;
  onFiles(files: File[]): void;
}) {
  const drop = useFileDrop({ accepts, onFiles });
  return (
    <div data-testid="area" {...drop.area}>
      <button type="button">Inside</button>
      <iframe title="child" data-testid="frame" onLoad={(e) => drop.watchFrame(e.currentTarget)} />
      {drop.over && <FileDropOverlay testId="overlay">Drop it here</FileDropOverlay>}
    </div>
  );
}

/** A drag event as the browser sends it, on `target`; the event comes back to be asked. */
function send(type: string, target: Element, data: unknown = json()): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: data });
  fireEvent(target, event);
  return event as unknown as DragEvent;
}
const inside = () => screen.getByText('Inside');
const overlay = () => screen.queryByTestId('overlay');

describe('what a drag tells before the drop', () => {
  it('knows a drag of files from a drag of text', () => {
    expect(carriesFiles(drag('application/json'))).toBe(true);
    expect(carriesFiles(textDrag)).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });

  it('finds a file of a type only when the browser names it', () => {
    expect(carriesType(drag('image/png', 'application/json'), 'application/json')).toBe(true);
    expect(carriesType(drag('image/png'), 'application/json')).toBe(false);
    // A type the system does not know is empty, and a browser may hide the list altogether.
    expect(carriesType(drag(''), 'application/json')).toBe(false);
    expect(carriesType({ types: ['Files'] }, 'application/json')).toBe(false);
    expect(
      carriesType(
        { types: ['text/plain'], items: [{ kind: 'string', type: 'application/json' }] },
        'application/json',
      ),
    ).toBe(false);
  });
});

describe('useFileDrop', () => {
  it('raises the overlay when files enter the area, and takes them when they are dropped', () => {
    const onFiles = vi.fn();
    render(<Area onFiles={onFiles} />);
    expect(overlay()).toBeNull();
    expect(send('dragenter', inside(), textDrag).defaultPrevented).toBe(false);
    expect(overlay()).toBeNull();
    // Accepting the drag as it enters is what lets a drop follow with no move in between.
    const enter = send('dragenter', inside());
    expect(enter.defaultPrevented).toBe(true);
    expect(enter.dataTransfer!.dropEffect).toBe('copy');
    expect(overlay()).toHaveTextContent('Drop it here');
    send('dragenter', overlay()!);
    send('dragleave', inside());
    expect(overlay()).toBeVisible();
    const over = send('dragover', overlay()!);
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer!.dropEffect).toBe('copy');
    const file = new File(['{}'], 'theme.json', { type: 'application/json' });
    const dropped = send('drop', overlay()!, { ...json(), files: [file] });
    expect(dropped.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([file]);
    expect(overlay()).toBeNull();
  });

  it('lowers the overlay when the drag leaves the overlay', () => {
    render(<Area onFiles={vi.fn()} />);
    send('dragenter', inside());
    send('dragenter', overlay()!);
    send('dragleave', inside());
    send('dragleave', overlay()!);
    expect(overlay()).toBeNull();
  });

  it('lowers the overlay when the drag leaves before the browser ever looked at the overlay', () => {
    // The drag clips an edge of the area, or is cancelled without another move: what the
    // browser leaves is the element it had entered, and the overlay hears nothing of its own.
    const onFiles = vi.fn();
    render(<Area onFiles={onFiles} />);
    send('dragenter', inside());
    expect(overlay()).toBeVisible();
    send('dragleave', inside());
    expect(overlay()).toBeNull();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('takes a drop on the element the drag had entered, the overlay never having been hit', () => {
    const onFiles = vi.fn();
    render(<Area onFiles={onFiles} />);
    send('dragenter', inside());
    const file = new File(['{}'], 'theme.json', { type: 'application/json' });
    const dropped = send('drop', inside(), { ...json(), files: [file] });
    expect(dropped.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([file]);
    expect(overlay()).toBeNull();
  });

  it('lowers a raised overlay at the first press or key: no drag is under way by then', () => {
    render(<Area onFiles={vi.fn()} />);
    send('dragenter', inside());
    fireEvent.pointerDown(overlay()!);
    expect(overlay()).toBeNull();
    send('dragenter', inside());
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(overlay()).toBeNull();
    // A drop somewhere else in the page ends the drag too.
    send('dragenter', inside());
    send('drop', document.body);
    expect(overlay()).toBeNull();
  });

  it('leaves alone the drags its area does not take', () => {
    const onFiles = vi.fn();
    render(<Area accepts={(data) => carriesType(data, 'application/json')} onFiles={onFiles} />);
    const picture = send('dragenter', screen.getByTestId('area'), drag('image/png'));
    expect(picture.defaultPrevented).toBe(false);
    expect(send('dragover', inside(), drag('image/png')).defaultPrevented).toBe(false);
    expect(send('drop', inside(), drag('image/png')).defaultPrevented).toBe(false);
    expect(overlay()).toBeNull();
    expect(onFiles).not.toHaveBeenCalled();
    send('dragenter', screen.getByTestId('area'));
    expect(overlay()).toBeVisible();
  });

  describe('with a frame inside the area', () => {
    function frameBody() {
      const frame = screen.getByTestId<HTMLIFrameElement>('frame');
      fireEvent.load(frame);
      return frame.contentDocument!.body;
    }

    it('raises the overlay for a drag that enters the frame first, and keeps it on the way out to it', () => {
      render(<Area accepts={(data) => carriesType(data, 'application/json')} onFiles={vi.fn()} />);
      const body = frameBody();
      expect(send('dragenter', body, drag('image/png')).defaultPrevented).toBe(false);
      expect(overlay()).toBeNull();
      const enter = send('dragenter', body);
      expect(enter.defaultPrevented).toBe(true);
      expect(overlay()).toBeVisible();
      // The overlay now covers the frame: the browser enters it and leaves the frame's element.
      send('dragenter', overlay()!);
      send('dragleave', body);
      expect(overlay()).toBeVisible();
    });

    it('lowers the overlay when the drag leaves the frame without reaching the overlay', () => {
      render(<Area onFiles={vi.fn()} />);
      const body = frameBody();
      send('dragenter', body);
      expect(overlay()).toBeVisible();
      send('dragleave', body);
      expect(overlay()).toBeNull();
    });

    it('takes a drop inside the frame, and guards the frame against the files nobody takes', () => {
      const onFiles = vi.fn();
      render(<Area accepts={(data) => carriesType(data, 'application/json')} onFiles={onFiles} />);
      const body = frameBody();
      send('dragenter', body);
      const over = send('dragover', body);
      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer!.dropEffect).toBe('copy');
      const file = new File(['{}'], 'theme.json', { type: 'application/json' });
      expect(send('drop', body, { ...json(), files: [file] }).defaultPrevented).toBe(true);
      expect(onFiles).toHaveBeenCalledExactlyOnceWith([file]);
      expect(overlay()).toBeNull();
      // A picture dropped beside the frame's own drop zones opens nothing.
      const stray = send('dragover', body, { ...drag('image/png'), dropEffect: 'copy' });
      expect(stray.defaultPrevented).toBe(true);
      expect(stray.dataTransfer!.dropEffect).toBe('none');
      expect(onFiles).toHaveBeenCalledOnce();
    });
  });
});

describe('guardFileDrops', () => {
  const send = (type: 'dragover' | 'drop', target: Element, data: unknown) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { dataTransfer: data });
    target.dispatchEvent(event);
    return event as unknown as DragEvent;
  };

  it('refuses a file dropped where nothing takes it, so the browser does not open it', () => {
    const stop = guardFileDrops();
    const over = send('dragover', document.body, {
      ...drag('application/json'),
      dropEffect: 'copy',
    });
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer!.dropEffect).toBe('none');
    expect(send('drop', document.body, drag('application/json')).defaultPrevented).toBe(true);
    stop();
    expect(send('drop', document.body, drag('application/json')).defaultPrevented).toBe(false);
  });

  it('leaves alone other drags, the places that take files and a file field', () => {
    const stop = guardFileDrops();
    expect(send('dragover', document.body, textDrag).defaultPrevented).toBe(false);
    const zone = document.createElement('div');
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      (event as DragEvent).dataTransfer!.dropEffect = 'copy';
    });
    const field = document.createElement('input');
    field.type = 'file';
    document.body.append(zone, field);
    const taken = send('dragover', zone, { ...drag('image/png'), dropEffect: 'none' });
    expect(taken.dataTransfer!.dropEffect).toBe('copy');
    expect(send('dragover', field, drag('image/png')).defaultPrevented).toBe(false);
    expect(send('drop', field, drag('image/png')).defaultPrevented).toBe(false);
    zone.remove();
    field.remove();
    stop();
  });
});
