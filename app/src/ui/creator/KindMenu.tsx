/* The key of the Creator's toolbar that selects every object of a kind (D183, in the place of the
 * three keys of D155): ∑ with a small arrow, lit while some kind is all selected. The pointer
 * resting on it drops a menu under it — a row per kind with its mark and its name, ticked while
 * that kind is all selected and off while the project has none; choosing a row does what its key
 * did (kindSelection.ts), and the menu stays open for the next. It goes when the pointer has been
 * off the key and the menu for a moment, on Escape, on a press elsewhere and when the window
 * changes size (`hoverMenu.ts` has when). A click, a tap, Enter, Space or ↓ opens it too, the
 * focus going to its first row (↑ to its last); ↑ and ↓ walk the rows, Enter and Space choose,
 * Escape and Tab give the focus back to the key; a second click closes a menu a press opened.
 * The menu hangs from the document, as the app's menus do (the panel clips and scrolls what is
 * inside it), and exists only while it is open: while it does, it is a menu of the document for
 * whoever asks (`inOpenMenu`, the timeline's Escape). */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { KINDS, type FormulaId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { rovingIndex } from '../focus';
import { Icon } from '../timeline/icons';
import { createHoverMenu, placeHoverMenu, type HoverMenu, type HoverMenuOpen } from './hoverMenu';
import {
  anyKindAll,
  kindRows,
  SELECT_KIND_LABEL,
  toggleKindSelection,
  type KindRow,
  type SelectKind,
} from './kindSelection';

/** The rows that can take the focus. */
const ROWS = '[role="menuitemcheckbox"]:not(:disabled)';

/** A pointer that hovers: a mouse. A touch and a pen open the menu by their tap. */
const hovers = (event: ReactPointerEvent) => event.pointerType === 'mouse';

/** Which row takes the focus when a press opens the menu. */
type Entry = 'first' | 'last';

function focusRow(menu: HTMLElement | null, entry: Entry): void {
  const rows = menu ? [...menu.querySelectorAll<HTMLElement>(ROWS)] : [];
  (entry === 'first' ? rows[0] : rows.at(-1))?.focus();
}

export function KindMenu({ order }: { order: readonly FormulaId[] }) {
  const selection = useUiStore((state) => state.selection);
  const formulas = useProjectStore((state) => state.project.formulas);
  const rows = kindRows(selection, formulas);
  const [open, setOpen] = useState<HoverMenuOpen | null>(null);
  const keyRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  /** The row to focus once the menu is placed, when a press opened it. */
  const entryRef = useRef<Entry | null>(null);
  const [menu] = useState(() => createHoverMenu(setOpen));
  useEffect(() => () => menu.stop(), [menu]);
  const menuId = useId();

  /** Into the menu from the keyboard (or a press): its row `at` takes the focus, now if the menu
   * is placed already, else once it is. */
  const enter = (at: Entry) => {
    const pop = popRef.current;
    if (pop?.dataset.placed === 'true') focusRow(pop, at);
    else entryRef.current = at;
  };

  const choose = (kind: SelectKind) => {
    const ui = useUiStore.getState();
    ui.select(toggleKindSelection(ui.selection, formulas, order, kind));
  };

  return (
    <>
      <button
        ref={keyRef}
        type="button"
        className={`icon-btn creator-kinds-key${anyKindAll(rows) ? ' is-on' : ''}`}
        data-testid="creator-kinds"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open !== null ? menuId : undefined}
        aria-label={SELECT_KIND_LABEL}
        // No tooltip over the open menu.
        title={open === null ? SELECT_KIND_LABEL : undefined}
        onPointerEnter={(event) => {
          if (hovers(event) && event.buttons === 0) menu.enter('key');
        }}
        onPointerLeave={(event) => {
          if (hovers(event)) menu.leave('key');
        }}
        onClick={() => {
          if (menu.press() === 'opened') enter('first');
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          event.stopPropagation();
          menu.show();
          enter(event.key === 'ArrowDown' ? 'first' : 'last');
        }}
      >
        <span className="creator-kind-mark" aria-hidden="true">
          {KINDS.math.mark}
        </span>
        <Icon name="chevron-down" />
      </button>
      {open !== null && (
        <KindMenuPopup
          id={menuId}
          rows={rows}
          keyRef={keyRef}
          popRef={popRef}
          entryRef={entryRef}
          menu={menu}
          onChoose={choose}
        />
      )}
    </>
  );
}

function KindMenuPopup({
  id,
  rows,
  keyRef,
  popRef,
  entryRef,
  menu,
  onChoose,
}: {
  id: string;
  rows: readonly KindRow[];
  keyRef: RefObject<HTMLButtonElement | null>;
  popRef: RefObject<HTMLDivElement | null>;
  entryRef: RefObject<Entry | null>;
  menu: HoverMenu;
  onChoose(kind: SelectKind): void;
}) {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  // Measure, then hang the menu under the key, inside the window. As it closes, whatever closed
  // it, the focus that was in it goes back to the key — before the menu leaves the document with
  // it (a layout effect's cleanup comes first).
  useLayoutEffect(() => {
    const key = keyRef.current;
    const pop = popRef.current;
    if (!key || !pop) return;
    const { width, height } = pop.getBoundingClientRect();
    setPlace(
      placeHoverMenu(
        key.getBoundingClientRect(),
        { width, height },
        { width: innerWidth, height: innerHeight },
      ),
    );
    return () => {
      if (pop.contains(document.activeElement)) key.focus();
    };
  }, [keyRef, popRef]);

  // A press opened it: its row takes the focus once it is placed (hidden, it could not).
  const placed = place !== null;
  useEffect(() => {
    if (!placed || entryRef.current === null) return;
    focusRow(popRef.current, entryRef.current);
    entryRef.current = null;
  }, [placed, entryRef, popRef]);

  // Escape anywhere, a press outside the key and the menu, the window resized: closed.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      menu.close();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (popRef.current?.contains(target) || keyRef.current?.contains(target))) return;
      menu.close();
    };
    const onResize = () => menu.close();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [menu, keyRef, popRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // Tab leaves the menu: the focus goes back to the key now, and the browser moves it on from
      // there — to the key after it, or with Shift to the one before.
      keyRef.current?.focus();
      menu.close();
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ROWS)];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = rovingIndex(event.key, at, items.length, 'vertical');
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    items[next]!.focus();
  };

  return createPortal(
    // The frame begins at the foot of the key with a strip of nothing above the panel: the pointer
    // going down from the key is always on one of the two.
    <div
      ref={popRef}
      className="creator-kinds-pop"
      data-placed={placed ? 'true' : undefined}
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
      onPointerEnter={(event) => {
        if (hovers(event)) menu.enter('menu');
      }}
      onPointerLeave={(event) => {
        if (hovers(event)) menu.leave('menu');
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        id={id}
        className="ctx-menu creator-kinds-menu"
        role="menu"
        aria-label={SELECT_KIND_LABEL}
        data-testid="creator-kinds-menu"
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => (
          <button
            key={row.info.kind}
            type="button"
            role="menuitemcheckbox"
            aria-checked={row.state.all}
            className={`ctx-item creator-kind-row${row.state.all ? ' is-on' : ''}`}
            data-testid={`creator-select-all-${row.info.kind}`}
            disabled={row.state.total === 0}
            title={row.title}
            onClick={() => onChoose(row.info.kind)}
          >
            <span className="creator-kind-check" aria-hidden="true">
              {row.state.all ? '✓' : ''}
            </span>
            <span className="creator-kind-mark" aria-hidden="true">
              {row.mark}
            </span>
            <span className="creator-kind-name">{row.info.name}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
