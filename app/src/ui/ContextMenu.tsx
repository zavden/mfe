/* A small menu at a point on screen: a right-click, or under the control that opened it. It is
 * rendered into document.body above the dialogs (a dialog's layout cannot clip or offset it) and
 * kept inside the window. Escape, Tab and a press outside close it, submenus and all; Up, Down,
 * Home and End move between the items of the panel that has the focus, the first of which takes
 * the focus once the menu is placed; the focus goes back where it was when the menu closes, and
 * with Tab (or Shift+Tab) it goes on from there to the next (or the previous) control, as the
 * menu pattern of the WAI-ARIA practices asks. The caller closes it after an action. Its entries
 * are `MenuItem`s (buttons with a `menuitem…` role and the `ctx-item` class, optionally led by an
 * icon) and `Submenu`s (an entry with a › chevron whose panel opens beside it on hover, click,
 * Enter, Space or →: to the right, or to the left near the window's edge, level with the entry —
 * `submenuSide.ts`; ← closes it and gives the focus back to its entry, and so does hovering
 * another entry of its menu); `ctx-header` and `ctx-sep` structure it, and a `ctx-note` after an
 * item says more about it. A text field of the menu (`data-ctx-field`: the Hex field of the
 * colours) is one of its stops — Up and Down reach it and leave it — and keeps Home and End for
 * its own text. */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { captureFocus, rovingIndex } from './focus';
import { placeSubmenu, type SubmenuPlace } from './submenuSide';

/** Free space kept between the menu and the window edges. */
const MARGIN = 8;
const ITEMS = '[role^="menuitem"]:not(:disabled), input[data-ctx-field]';

/** One level of a menu — the root panel or a submenu's — and which of its submenus is open. */
interface Level {
  open: string | null;
  setOpen(id: string | null): void;
  /** The root menu's id, carried by every panel of the menu (`data-ctx-root`): a submenu's
   * panel is rendered into document.body too, so what is inside the menu is told by this
   * attribute, not by DOM descent. */
  rootId: string;
}

const LevelContext = createContext<Level | null>(null);

function useLevel(): Level {
  const level = useContext(LevelContext);
  if (!level) throw new Error('A Submenu belongs inside a ContextMenu');
  return level;
}

/** Hovering anything of a panel that is not a submenu entry — another item, a header, a
 * separator, its padding — closes the submenu open at that level. What happens inside a
 * submenu's own panel is that level's business. */
function closeOnHover(level: Level) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target.closest('[role="menu"]') !== event.currentTarget) return;
    if (target.closest('[aria-haspopup]')) return;
    if (level.open !== null) level.setOpen(null);
  };
}

interface MenuItemProps {
  children: ReactNode;
  onClick(): void;
  testId?: string;
  disabled?: boolean;
  /** One of a group of choices (`menuitemradio`): whether it is the current one, shown ticked. */
  current?: boolean;
  /** A toggle (`menuitemcheckbox`): whether it is on, shown as a ticked box. */
  checked?: boolean;
  /** Deletes something: shown in the danger colour. */
  danger?: boolean;
  /** A small picture before the text (an `Icon`), decoration only: the text names the item. */
  icon?: ReactNode;
  /** The id of a line of the menu that says more about the item (a `ctx-note` after it): what
   * it would do, or why it cannot now. */
  describedBy?: string;
  /** The item's tooltip: what it does, or why it is disabled. */
  title?: string;
}

/** One entry of a ContextMenu. The caller closes the menu before or after acting, as it needs. */
export function MenuItem({
  children,
  onClick,
  testId,
  disabled,
  current,
  checked,
  danger,
  icon,
  describedBy,
  title,
}: MenuItemProps) {
  const radio = current !== undefined;
  const checkbox = checked !== undefined;
  const className = `ctx-item${current ? ' is-current' : ''}${danger ? ' is-danger' : ''}`;
  // A toggle is led by its box, in the place of an icon.
  const lead = checkbox ? (
    <span className={`ctx-checkbox${checked ? ' is-on' : ''}`}>{checked ? '✓' : ''}</span>
  ) : (
    icon
  );
  return (
    <button
      type="button"
      role={checkbox ? 'menuitemcheckbox' : radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={checkbox ? checked : radio ? current : undefined}
      aria-describedby={describedBy}
      className={lead ? `${className} has-icon` : className}
      disabled={disabled}
      title={title}
      data-testid={testId}
      onClick={onClick}
    >
      {lead && (
        <span className="ctx-icon" aria-hidden="true">
          {lead}
        </span>
      )}
      {children}
    </button>
  );
}

interface SubmenuProps {
  /** The entry's text, and the name of its panel. */
  label: string;
  /** The entry's `data-testid`; its panel gets `<testId>-submenu`. */
  testId?: string;
  /** A small picture before the label, decoration only. */
  icon?: ReactNode;
  /** Greyed out and not openable (nothing inside it could act now). */
  disabled?: boolean;
  /** The entry's tooltip: why it is disabled, for one. */
  title?: string;
  children: ReactNode;
}

/** The panel of an open submenu, rendered into document.body beside its entry: mounted while it
 * is open, so that its placement and its own open submenu start afresh each time. */
function SubmenuPanel({
  label,
  testId,
  rootId,
  entryRef,
  panelRef,
  focusFirst,
  onLeave,
  children,
}: {
  label: string;
  testId?: string;
  rootId: string;
  entryRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  /** Opened from the keyboard: the first enabled item takes the focus once the panel is placed. */
  focusFirst: boolean;
  /** ← inside the panel: close it, the focus going back to the entry. */
  onLeave(): void;
  children: ReactNode;
}) {
  const [place, setPlace] = useState<SubmenuPlace | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const level = useMemo<Level>(() => ({ open, setOpen, rootId }), [open, rootId]);

  // Measure the panel, then place it beside the entry, inside the window.
  useLayoutEffect(() => {
    const entry = entryRef.current;
    const panel = panelRef.current;
    if (!entry || !panel) return;
    const { width, height } = panel.getBoundingClientRect();
    setPlace(
      placeSubmenu(
        entry.getBoundingClientRect(),
        { width, height },
        { width: innerWidth, height: innerHeight },
      ),
    );
  }, [entryRef, panelRef]);

  // Until it is placed the panel is hidden, and a hidden element cannot be focused.
  const placed = place !== null;
  useEffect(() => {
    if (placed && focusFirst) panelRef.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [placed, focusFirst, panelRef]);

  return createPortal(
    <LevelContext.Provider value={level}>
      <div
        ref={panelRef}
        className={`ctx-menu ctx-submenu${place?.flipped ? ' is-flipped' : ''}`}
        role="menu"
        aria-label={label}
        data-testid={testId && `${testId}-submenu`}
        data-ctx-root={rootId}
        style={
          place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }
        }
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            event.stopPropagation();
            onLeave();
          }
        }}
        onMouseOver={closeOnHover(level)}
      >
        {children}
      </div>
    </LevelContext.Provider>,
    document.body,
  );
}

/** An entry of a ContextMenu that opens a panel of more entries beside it. */
export function Submenu({ label, testId, icon, disabled, title, children }: SubmenuProps) {
  const parent = useLevel();
  const id = useId();
  const open = parent.open === id;
  const entryRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Whether the open panel was asked for from the keyboard (its first item takes the focus).
  const [focusFirst, setFocusFirst] = useState(false);

  const openWith = (keyboard: boolean) => {
    if (open && keyboard) {
      panelRef.current?.querySelector<HTMLElement>(ITEMS)?.focus();
      return;
    }
    setFocusFirst(keyboard);
    parent.setOpen(id);
  };
  const close = (focusEntry: boolean) => {
    parent.setOpen(null);
    if (focusEntry) entryRef.current?.focus();
  };

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={`ctx-item ctx-sub-entry${icon ? ' has-icon' : ''}`}
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        ref={entryRef}
        onMouseEnter={() => {
          if (!disabled && !open) openWith(false);
        }}
        onClick={(event) => {
          // Enter and Space click with no pointer (`detail` 0): they go into the submenu.
          openWith(event.detail === 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            openWith(true);
          } else if (event.key === 'ArrowLeft' && open) {
            event.preventDefault();
            event.stopPropagation();
            close(false);
          }
        }}
      >
        {icon && (
          <span className="ctx-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="ctx-sub-label">{label}</span>
        <span className="ctx-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <SubmenuPanel
          label={label}
          testId={testId}
          rootId={parent.rootId}
          entryRef={entryRef}
          panelRef={panelRef}
          focusFirst={focusFirst}
          onLeave={() => close(true)}
        >
          {children}
        </SubmenuPanel>
      )}
    </>
  );
}

interface ContextMenuProps {
  /** Where it opens: its top-left corner (`start`) or top centre (`center`). */
  x: number;
  y: number;
  align?: 'start' | 'center';
  label: string;
  onClose(): void;
  testId?: string;
  children: ReactNode;
}

export function ContextMenu({
  x,
  y,
  align = 'start',
  label,
  onClose,
  testId,
  children,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const rootId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const level = useMemo<Level>(() => ({ open, setOpen, rootId }), [open, rootId]);

  // Measure, then keep the whole menu inside the window.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const left = align === 'center' ? x - width / 2 : x;
    setPlace({
      left: Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, innerHeight - height - MARGIN)),
    });
  }, [x, y, align]);

  // The first item takes the focus once the menu is placed: until then it is hidden, and a
  // hidden element cannot be focused.
  const placed = place !== null;
  useEffect(() => {
    if (placed) ref.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [placed]);

  useEffect(() => {
    const menu = ref.current;
    const restoreFocus = captureFocus();
    /** Tab has already given the focus back, and the browser has moved it on since. */
    let left = false;
    const inside = `[data-ctx-root="${rootId}"]`;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        // Tab leaves the menu. The focus goes back to what opened it right now, and the key is
        // left alone: the browser then moves the focus on from there, in the page's own order
        // and through a dialog's focus trap, which sees the key after this listener. Closing
        // must not bring the focus back a second time.
        restoreFocus();
        left = true;
        onCloseRef.current();
      } else if (menu) {
        // The items of the panel that has the focus: a submenu's, or the menu's own.
        const active =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // In a field of the menu, Home and End are the caret's.
        if (
          active?.matches('input[data-ctx-field]') &&
          (event.key === 'Home' || event.key === 'End')
        )
          return;
        const panel = active?.closest<HTMLElement>(inside) ?? menu;
        const items = [...panel.querySelectorAll<HTMLElement>(ITEMS)];
        const at = active ? items.indexOf(active) : -1;
        const next = rovingIndex(event.key, at, items.length, 'vertical');
        if (next === null) return;
        event.preventDefault();
        items[next]!.focus();
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(inside)) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      if (!left) restoreFocus();
    };
  }, [rootId]);

  return createPortal(
    <LevelContext.Provider value={level}>
      <div
        ref={ref}
        className="ctx-menu"
        role="menu"
        aria-label={label}
        data-testid={testId}
        data-ctx-root={rootId}
        style={place ?? { left: x, top: y, visibility: 'hidden' }}
        onContextMenu={(event) => event.preventDefault()}
        onMouseOver={closeOnHover(level)}
      >
        {children}
      </div>
    </LevelContext.Provider>,
    document.body,
  );
}
