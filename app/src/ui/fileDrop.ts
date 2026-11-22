/* Files dragged from the desktop onto a part of the app. `useFileDrop` makes an area take them:
 * while such a drag is over it an overlay (`FileDropOverlay`) covers it, and a drop anywhere in
 * the area hands the files over. `guardFileDrops` keeps a file dropped anywhere else from
 * replacing the app, which is what a browser does with a file nobody takes: it opens it in the
 * tab.
 *
 * Until the drop a browser tells only that files are dragged and the type of each one, never a
 * name or a content, so what an area accepts is decided on that. */
import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';

/** What a drag shows of itself before the drop. */
interface DraggedData {
  readonly types: ArrayLike<string>;
  readonly items?: ArrayLike<{ readonly kind: string; readonly type: string }>;
}

/** Whether a drag carries files (and not a text, a link or something of the app's own). */
export function carriesFiles(data: DraggedData | null | undefined): boolean {
  return !!data && Array.from(data.types).includes('Files');
}

/** Whether the browser names a dragged file of this MIME type. A type the system does not know is
 * empty, and a browser may hide the list during the drag: neither is a file of the type. */
export function carriesType(data: DraggedData, type: string): boolean {
  return Array.from(data.items ?? []).some((item) => item.kind === 'file' && item.type === type);
}

type Listening = Pick<Document, 'addEventListener' | 'removeEventListener'>;

/** Refuse the files dropped where nothing takes them, on `target` (the window, or the document
 * of a same-origin frame). A place that takes files has cancelled the event by the time it
 * bubbles here and is left alone, and so is a file field, which takes a drop by itself. Returns
 * the cleanup. */
export function guardFileDrops(target: Listening = window): () => void {
  const refuse = (event: Event) => {
    const data = (event as DragEvent).dataTransfer;
    if (event.defaultPrevented || !data || !carriesFiles(data)) return;
    // `matches` and not `instanceof`: an element of a frame belongs to another realm.
    const element = event.target as Partial<Element> | null;
    if (element?.matches?.('input[type="file"]')) return;
    event.preventDefault();
    data.dropEffect = 'none';
  };
  target.addEventListener('dragover', refuse);
  target.addEventListener('drop', refuse);
  return () => {
    target.removeEventListener('dragover', refuse);
    target.removeEventListener('drop', refuse);
  };
}

interface FileDropOptions {
  /** Which drags of files the area takes (default: all of them). */
  accepts?(data: DataTransfer): boolean;
  onFiles(files: File[]): void;
}

export interface FileDrop {
  /** A drag the area takes is over it: draw the overlay (`FileDropOverlay`), inside the area. */
  over: boolean;
  /** For the area's element. Its handlers take the drag wherever in the area the browser says it
   * is, the overlay included, which needs none of its own. */
  area: {
    onDragEnter(event: ReactDragEvent): void;
    onDragOver(event: ReactDragEvent): void;
    onDragLeave(event: ReactDragEvent): void;
    onDrop(event: ReactDragEvent): void;
  };
  /** Call it when a same-origin frame inside the area has loaded: the frame's document takes the
   * drag like the area does (a drag can enter the frame without crossing the area, and the
   * overlay then covers the frame), and gets the guard of `guardFileDrops`. */
  watchFrame(frame: HTMLIFrameElement): void;
}

/** A drag event of React or of a document, as far as the area reads it. */
interface DragLike {
  readonly target: EventTarget | null;
  readonly dataTransfer: DataTransfer | null;
  preventDefault(): void;
}

export function useFileDrop(options: FileDropOptions): FileDrop {
  const [over, setOver] = useState(false);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  /** The element the drag entered last, in the area or in a watched frame. A browser enters the
   * next element before it leaves the previous one, so leaving this one is leaving the area: for
   * outside it, or because the drag was cancelled. The overlay cannot tell that by itself: it
   * hears nothing until the browser has looked under the pointer again, which a drag that clips
   * an edge, or stops and is released, never makes it do. */
  const entered = useRef<EventTarget | null>(null);
  const lower = () => {
    entered.current = null;
    setOver(false);
  };

  const taken = (event: DragLike): DataTransfer | null => {
    const data = event.dataTransfer;
    return data && carriesFiles(data) && (latest.current.accepts?.(data) ?? true) ? data : null;
  };
  /** Say yes to the drag: on entering too, so that a drop may follow with no move in between. */
  const accept = (event: DragLike): boolean => {
    const data = taken(event);
    if (!data) return false;
    event.preventDefault();
    data.dropEffect = 'copy';
    return true;
  };
  const onEnter = (event: DragLike) => {
    if (!accept(event)) return;
    entered.current = event.target;
    setOver(true);
  };
  const onLeave = (event: DragLike) => {
    if (event.target === entered.current) lower();
  };
  const onDrop = (event: DragLike) => {
    const data = taken(event);
    if (!data) return;
    event.preventDefault();
    lower();
    latest.current.onFiles([...data.files]);
  };

  // What is left of an overlay once no drag is under way (the browser did not say the drag left:
  // its element went away meanwhile, say) goes at the first press, key or drop anywhere. None of
  // them happens while files are being dragged over the page.
  //
  // A press or a key is heard on its way down, whatever stops it later. The end of a drag is
  // heard on its way back up, once the page has had it: the drop on the area lands on the overlay,
  // and an overlay taken away before the area's handlers ran would take the drop with it. A
  // browser renders between the listeners of an event it delivers, and React hands an event to
  // no one once its target has left the page.
  useEffect(() => {
    if (!over) return;
    const done = () => {
      entered.current = null;
      setOver(false);
    };
    const signs = [
      ['pointerdown', true],
      ['keydown', true],
      ['drop', false],
      ['dragend', false],
    ] as const;
    for (const [sign, down] of signs) window.addEventListener(sign, done, down);
    return () => {
      for (const [sign, down] of signs) window.removeEventListener(sign, done, down);
    };
  }, [over]);

  return {
    over,
    area: { onDragEnter: onEnter, onDragOver: accept, onDragLeave: onLeave, onDrop },
    watchFrame: (frame) => {
      let inside: Document | null = null;
      try {
        inside = frame.contentDocument;
      } catch {
        // Another origin: its drags are its own.
      }
      if (!inside) return;
      // These go away with the document, when the frame is closed or loads another page. The
      // guard comes last: it leaves alone what the area has just accepted.
      inside.addEventListener('dragenter', onEnter);
      inside.addEventListener('dragover', accept);
      inside.addEventListener('dragleave', onLeave);
      inside.addEventListener('drop', onDrop);
      guardFileDrops(inside);
    },
  };
}
