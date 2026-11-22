/* The entries of a menu-bar menu: items (led by a colour swatch or an icon when they have one),
 * separators and submenus. A submenu opens to the right of its entry (to the left when the window
 * has no room) on hover, click, Enter, Space or ArrowRight; ArrowLeft or Escape closes just that
 * submenu, and so does hovering or focusing another entry of the menu it belongs to.
 * ArrowUp/ArrowDown/Home/End move between the entries of a popup, a letter to the next entry
 * with that initial. `MenuBar` owns which top-level menu is open, what choosing an item does
 * (`onChoose`), and the keys that change menu. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { rovingIndex, typeAheadIndex } from './focus';
import { MENU_MARGIN, submenuSide } from './submenuSide';
import { Icon, type IconName } from './timeline/icons';

export interface MenuItemDef {
  type: 'item';
  id: string;
  label: string;
  /** Display hint, e.g. "Ctrl+S". */
  shortcut?: string;
  disabled?: boolean;
  /** Radio items: whether this one is the current choice. With `checkbox`, whether it is on. */
  checked?: boolean;
  /** A toggle (`menuitemcheckbox`) rather than one of a group of radio choices. */
  checkbox?: boolean;
  /** A colour ('#rrggbb') shown as a small square before the label (a choice of colours). */
  swatch?: string;
  /** An icon shown before the label, in the same place as a swatch (decoration only). */
  icon?: IconName;
  /** The click that chose it (a keyboard activation gives a click too): `shiftKey` is read by
   * the items that act differently with Shift held. */
  onSelect?: (event: MouseEvent) => void;
}

export interface SeparatorDef {
  type: 'separator';
  id: string;
}

export interface SubmenuDef {
  type: 'submenu';
  id: string;
  label: string;
  /** An icon shown before the label (decoration only). */
  icon?: IconName;
  /** Greyed out and not openable (nothing inside it could act now). */
  disabled?: boolean;
  items: MenuEntry[];
}

export type MenuEntry = MenuItemDef | SeparatorDef | SubmenuDef;

interface MenuPopupProps {
  /** The menu's name, for assistive technology. */
  label: string;
  items: MenuEntry[];
  /** The `data-testid` of its entries is `<testPrefix>-<entry id>`. */
  testPrefix: string;
  /** A submenu's popup: positioned beside its entry. */
  submenu?: boolean;
  /** Whether to flip to the left of the entry (a submenu that would leave the window). */
  flipped?: boolean;
  /** Opened from the keyboard: the focus goes to the first or the last enabled entry. */
  focusOnOpen?: 'first' | 'last' | null;
  onChoose: (item: MenuItemDef, event: MouseEvent) => void;
}

const ENTRIES = '[role^="menuitem"]:not(:disabled)';

/** The enabled entries that belong to `popup` itself, not to a submenu inside it. */
function ownEntries(popup: HTMLElement): HTMLElement[] {
  return [...popup.querySelectorAll<HTMLElement>(ENTRIES)].filter(
    (entry) => entry.closest('[role="menu"]') === popup,
  );
}

function ItemButton({
  item,
  testId,
  onChoose,
  onEnter,
}: {
  item: MenuItemDef;
  testId: string;
  onChoose: MenuPopupProps['onChoose'];
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      role={
        item.checkbox
          ? 'menuitemcheckbox'
          : item.checked === undefined
            ? 'menuitem'
            : 'menuitemradio'
      }
      aria-checked={item.checked}
      className="menu-item"
      data-testid={testId}
      disabled={item.disabled ?? !item.onSelect}
      onFocus={onEnter}
      onClick={(event) => onChoose(item, event)}
    >
      <span className="menu-check" aria-hidden="true">
        {item.checked ? '✓' : ''}
      </span>
      {item.swatch && (
        <span className="menu-swatch" aria-hidden="true" style={{ background: item.swatch }} />
      )}
      {item.icon && (
        <span className="menu-icon" aria-hidden="true">
          <Icon name={item.icon} />
        </span>
      )}
      <span className="menu-label">{item.label}</span>
      {item.shortcut && (
        <span className="menu-shortcut" aria-hidden="true">
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

function SubmenuEntry({
  entry,
  testId,
  open,
  onOpen,
  onClose,
  onChoose,
}: {
  entry: SubmenuDef;
  testId: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChoose: MenuPopupProps['onChoose'];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [flipped, setFlipped] = useState(false);
  const focusFirst = useRef(false);

  // Keep the popup inside the window: on the other side of its entry when it would overflow.
  useLayoutEffect(() => {
    if (!open) return;
    const popup = wrapRef.current?.querySelector<HTMLElement>('.menu-submenu');
    const wrap = wrapRef.current;
    if (!popup || !wrap) return;
    const { left, right } = wrap.getBoundingClientRect();
    setFlipped(submenuSide(left, right, popup.offsetWidth, innerWidth) === 'left');
    if (focusFirst.current) {
      focusFirst.current = false;
      ownEntries(popup)[0]?.focus();
    }
  }, [open]);

  const openWithKeyboard = () => {
    focusFirst.current = true;
    onOpen();
  };

  return (
    <div className="menu-sub" ref={wrapRef}>
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={entry.disabled}
        ref={buttonRef}
        onMouseEnter={onOpen}
        onClick={(event) => {
          // Enter and Space click with no pointer (`detail` 0): they go into the submenu.
          if (event.detail === 0) openWithKeyboard();
          else onOpen();
        }}
        onKeyDown={(event) => {
          // The focus is on the entry when the submenu has nothing enabled to take it.
          if (open && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            openWithKeyboard();
          }
        }}
      >
        <span className="menu-check" aria-hidden="true" />
        {entry.icon && (
          <span className="menu-icon" aria-hidden="true">
            <Icon name={entry.icon} />
          </span>
        )}
        <span className="menu-label">{entry.label}</span>
        <span className="menu-shortcut menu-chevron" aria-hidden="true">
          ▸
        </span>
      </button>
      {open && (
        <MenuPopup
          label={entry.label}
          items={entry.items}
          testPrefix={testId}
          submenu
          flipped={flipped}
          onChoose={onChoose}
          onLeave={() => {
            onClose();
            buttonRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export function MenuPopup({
  label,
  items,
  testPrefix,
  submenu,
  flipped,
  focusOnOpen,
  onChoose,
  onLeave,
}: MenuPopupProps & { onLeave?: () => void }) {
  const [openSub, setOpenSub] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // A top-level popup that would leave the window on the right (a narrow window) hangs from
  // the right edge of its button instead.
  const [alignRight, setAlignRight] = useState(false);
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (submenu || !popup) return;
    setAlignRight(popup.getBoundingClientRect().right > innerWidth - MENU_MARGIN);
  }, [submenu]);

  useEffect(() => {
    if (!focusOnOpen || !popupRef.current) return;
    const entries = ownEntries(popupRef.current);
    (focusOnOpen === 'first' ? entries[0] : entries[entries.length - 1])?.focus();
  }, [focusOnOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (submenu && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
      // Close just this submenu (the Escape that would close the whole menu stops here).
      event.preventDefault();
      event.stopPropagation();
      onLeave?.();
      return;
    }
    const entries = ownEntries(event.currentTarget);
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const { key } = event;
    let next = rovingIndex(key, at, entries.length, 'vertical');
    if (
      next === null &&
      key.length === 1 &&
      key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      // A letter: the next entry whose label starts with it.
      const labels = entries.map((entry) => entry.querySelector('.menu-label')?.textContent ?? '');
      next = typeAheadIndex(labels, at, key);
    }
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    entries[next]?.focus();
  };

  return (
    <div
      ref={popupRef}
      className={`menu-popup${submenu ? ' menu-submenu' : ''}${flipped ? ' is-flipped' : ''}${alignRight ? ' is-right-aligned' : ''}`}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      // Hovering anything of this popup that is not a submenu (another entry, a disabled one —
      // `pointer-events: none` lets the pointer through to the popup — a separator) closes the
      // open submenu.
      onMouseOver={(event) => {
        if (!(event.target as Element).closest('.menu-sub')) setOpenSub(null);
      }}
    >
      {items.map((entry) => {
        const testId = `${testPrefix}-${entry.id}`;
        if (entry.type === 'separator') {
          return <div className="menu-separator" role="separator" key={entry.id} />;
        }
        if (entry.type === 'submenu') {
          return (
            <SubmenuEntry
              key={entry.id}
              entry={entry}
              testId={testId}
              open={openSub === entry.id}
              onOpen={() => setOpenSub(entry.id)}
              onClose={() => setOpenSub(null)}
              onChoose={onChoose}
            />
          );
        }
        return (
          <ItemButton
            key={entry.id}
            item={entry}
            testId={testId}
            onChoose={onChoose}
            onEnter={() => setOpenSub(null)}
          />
        );
      })}
    </div>
  );
}
