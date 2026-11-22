/* A small accessible modal: backdrop, title bar, Escape / backdrop / × to close (Escape in a
 * field that marks itself with `ownEscape` takes back the field's edit instead), focus moved
 * into the dialog and kept there, focus restored on close. Modals stack: only the top-most one
 * reacts to Escape and Tab. Never use window.alert / confirm / prompt (they block automation).
 *
 * A `resizable` modal can be maximized (title bar button or double-click) and resized from its
 * bottom-right corner (double-click the corner for the default size). It stays centred, so the
 * corner moves twice as fast as the size changes on each side. Its size is remembered for the
 * session, per `testId` — or per `sizeKey`, for a dialog that has two shapes and keeps a size for
 * each (the dialog of an animation block: the formula beside its fields, or its fields alone).
 *
 * `headerTools` puts controls of the dialog in its title bar, between the title and the window
 * buttons, for a dialog whose body is all one thing (Chroma Lab's frame) and should keep its room.
 * The first of them takes the focus when the dialog opens, as the first control of a body does —
 * unless a control of the dialog marks itself with `data-autofocus`: then that one takes it (the
 * search field of a dialog that starts with other controls). A control that is disabled when the
 * dialog opens is passed over, and a dialog with no control to focus takes the focus itself: the
 * focus is never left behind the dialog, where the keys would act on what opened it. */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { captureFocus } from '../focus';
import { isMainClick, trackPointer } from '../pointer';
import { fieldOwnsEscape, historyModals, modalStack as stack } from './modalStack';
import './project.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), math-field, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  /** CSS width of the dialog (default 480 px). */
  width?: string;
  /** Close when the backdrop is pressed (default true). */
  closeOnBackdrop?: boolean;
  /** What a press on the backdrop does when `closeOnBackdrop` is on (default `onClose`). */
  onBackdrop?: () => void;
  /** Dialogs opened from another modal sit above it. */
  level?: 'base' | 'top';
  /** Can be maximized and resized (see above). */
  resizable?: boolean;
  /** The name its size is remembered under (default: `testId`). */
  sizeKey?: string;
  /** Controls shown in the title bar (see above). */
  headerTools?: ReactNode;
  /** While it is the top modal, Ctrl/⌘+Z and redo act on the project (its edits are project
   * edits, each an undo step). Default false: global shortcuts stay quiet. */
  allowHistory?: boolean;
}

interface Layout {
  /** Explicit size in px, or null for the default (`width`, height of the content). */
  size: { width: number; height: number } | null;
  maximized: boolean;
}

const DEFAULT_LAYOUT: Layout = { size: null, maximized: false };
const MIN_WIDTH = 420;
const MIN_HEIGHT = 300;
/** Free space kept around a resized or maximized dialog. */
const MARGIN = 16;
/** Sizes chosen this session, by `sizeKey` (a dialog's testId unless it names another). */
const remembered = new Map<string, Layout>();

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function MaximizeIcon({ maximized }: { maximized: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {maximized ? (
        <>
          <rect x="1.5" y="3.5" width="7" height="7" fill="none" stroke="currentColor" />
          <path d="M3.5 3.5V1.5h7v7h-2" fill="none" stroke="currentColor" />
        </>
      ) : (
        <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" />
      )}
    </svg>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  testId,
  width = '480px',
  closeOnBackdrop = true,
  onBackdrop,
  level = 'base',
  resizable = false,
  sizeKey = testId,
  headerTools,
  allowHistory = false,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [layout, setLayoutState] = useState<Layout>(
    () => (resizable && sizeKey && remembered.get(sizeKey)) || DEFAULT_LAYOUT,
  );
  const setLayout = (next: Layout) => {
    setLayoutState(next);
    if (sizeKey) remembered.set(sizeKey, next);
  };
  const toggleMaximized = () => setLayout({ ...layout, maximized: !layout.maximized });

  /** Drag the bottom-right corner: the dialog stays centred, so each side moves half. */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMainClick(event) || !dialogRef.current) return;
    event.preventDefault();
    const rect = dialogRef.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    const grip = event.currentTarget;
    grip.setPointerCapture?.(event.pointerId);
    const onMove = (e: PointerEvent) => {
      const width = clamp(start.width + 2 * (e.clientX - start.x), MIN_WIDTH, innerWidth - MARGIN);
      const height = clamp(
        start.height + 2 * (e.clientY - start.y),
        MIN_HEIGHT,
        innerHeight - MARGIN,
      );
      setLayout({
        size: { width: Math.round(width), height: Math.round(height) },
        maximized: false,
      });
    };
    // Escape stays the dialog's: it closes it, as it does when nothing is being resized.
    trackPointer(event.pointerId, { move: onMove, end: () => {} }, { escape: false });
  };

  const sized = resizable && (layout.maximized || layout.size !== null);
  const style = !resizable
    ? { width }
    : layout.maximized
      ? {
          width: `calc(100vw - ${MARGIN}px)`,
          height: `calc(100vh - ${MARGIN}px)`,
          maxWidth: 'none',
          maxHeight: 'none',
        }
      : layout.size
        ? {
            width: layout.size.width,
            height: layout.size.height,
            maxWidth: `calc(100vw - ${MARGIN}px)`,
            maxHeight: `calc(100vh - ${MARGIN}px)`,
          }
        : { width };
  const onCloseRef = useRef(onClose);
  /** Fixed for the life of the modal (it registers once, when it opens). */
  const allowHistoryRef = useRef(allowHistory);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const token = Symbol('modal');
    stack.push(token);
    if (allowHistoryRef.current) historyModals.add(token);
    const dialog = dialogRef.current;
    const restoreFocus = captureFocus();
    // Focus the control that asks for it, else the first control of the dialog's own (a tool of
    // the title bar, a control of the body: not the window buttons), else the dialog itself. A
    // control that is disabled is passed over: it takes no focus, which would stay behind the
    // dialog, on what opened it, where the keys would go on acting.
    const enabled = (selector: string) =>
      [...(dialog?.querySelectorAll<HTMLElement>(selector) ?? [])].find(
        (control) => !control.matches(':disabled'),
      );
    const first =
      enabled('[data-autofocus]') ??
      enabled(
        '.modal-header-tools button, .modal-body input:not([type=hidden]), .modal-body textarea, .modal-body select, .modal-body button, .modal-footer button',
      );
    (first ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        // A field with an edit to take back uses Escape for that; the next Escape closes.
        if (fieldOwnsEscape(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || !dialog.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !dialog.contains(active))) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      historyModals.delete(token);
      restoreFocus();
    };
  }, []);

  return (
    <div
      className={level === 'top' ? 'modal-backdrop modal-top' : 'modal-backdrop'}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) (onBackdrop ?? onClose)();
      }}
    >
      <div
        className={`modal${sized ? ' is-sized' : ''}${layout.maximized && resizable ? ' is-maximized' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        style={style}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header
          className="modal-header"
          onDoubleClick={(event) => {
            // On the bar or its title: not on what the bar holds (a button, what a tool opens).
            const target = event.target as Element;
            const onBar =
              target === event.currentTarget ||
              target.closest('h2') !== null ||
              target.classList.contains('modal-header-tools');
            if (resizable && onBar) toggleMaximized();
          }}
        >
          <h2 id={titleId}>{title}</h2>
          {headerTools && <div className="modal-header-tools">{headerTools}</div>}
          {resizable && (
            <button
              type="button"
              className="modal-maximize"
              aria-label={layout.maximized ? 'Restore size' : 'Maximize'}
              title={layout.maximized ? 'Restore size' : 'Maximize (or double-click the title bar)'}
              aria-pressed={layout.maximized}
              data-testid={testId ? `${testId}-maximize` : undefined}
              onClick={toggleMaximized}
            >
              <MaximizeIcon maximized={layout.maximized} />
            </button>
          )}
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            data-testid={testId ? `${testId}-close` : undefined}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
        {resizable && !layout.maximized && (
          <div
            className="modal-resize"
            aria-hidden="true"
            title="Drag to resize (double-click: default size)"
            data-testid={testId ? `${testId}-resize` : undefined}
            onPointerDown={startResize}
            onDoubleClick={() => setLayout(DEFAULT_LAYOUT)}
          />
        )}
      </div>
    </div>
  );
}
