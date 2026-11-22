/* The row of a group of formulas in the Creator's list (model/formulaGroups.ts): a button that
 * opens it onto its formulas, its name — renamed in place with F2 or a double-click on it —, how
 * many formulas it has and, while it is closed, the renderings of the first of them. Selecting
 * the row selects its formulas (formulaSelection.ts): the group is acted on as they are, from
 * their menu, which the row adds «Rename group» and «Ungroup» to. It is walked with the list's
 * keys like a formula's row; Enter opens and closes it, and so do → and ←. It is not dragged:
 * a group goes to the timeline with «Add to the timeline». A formula dragged from the list and
 * dropped on the row goes into the group. */
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { validateFormulaGroupName, type FormulaGroup, type FormulaId } from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { FORMULA_MIME } from '../../dnd';
import type { RowHighlight } from '../FormulaItem';
import { FormulaThumb } from '../FormulaThumb';
import { listKeyOf, type ListKey } from '../formulaSelection';
import { dropFormulaOnGroup, renameGroup } from './groupActions';
import type { GroupRow } from './groupRows';
import { useGroupUi } from './groupUiStore';
import './groups.css';
import { isMac } from '../../platform';

/** How many of a closed group's formulas show their rendering in its row. */
export const GROUP_THUMBS = 3;

const LIST_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

export interface FormulaGroupRowProps {
  row: GroupRow;
  /** The renders of the project's formulas, for the renderings of the first ones. */
  entries: Readonly<Record<FormulaId, FormulaRenderEntry | undefined>>;
  background: string;
  highlight: RowHighlight;
  /** The list's one tab stop (roving tabindex). */
  tabStop: boolean;
  /** A click (`toggle`: Ctrl/⌘ held; `range`: Shift held). */
  onSelect: (modifiers: { toggle: boolean; range: boolean }) => void;
  /** A listbox key on the row: ↑ ↓ Home End Space, with Shift and Ctrl/⌘. */
  onNavigate: (key: ListKey, modifiers: { shift: boolean; ctrl: boolean }) => void;
  onFocused: () => void;
  /** A right-click on the row: the menu of its formulas, with the group's own entries. */
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void;
}

/** What makes the row of a group a place to drop a formula dragged from the list (FORMULA_MIME):
 * the handlers of the row, and whether one is over it now. */
export function useFormulaDrop(groupId: string) {
  const [over, setOver] = useState(false);
  const carriesFormula = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.types.includes(FORMULA_MIME);
  return {
    over,
    handlers: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!carriesFormula(event)) return;
        event.preventDefault();
        // The drag of a formula allows a copy (it is what the timeline makes of it).
        event.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        const to = event.relatedTarget;
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) setOver(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setOver(false);
        const id = event.dataTransfer.getData(FORMULA_MIME);
        if (!id) return;
        event.preventDefault();
        dropFormulaOnGroup(groupId, id);
      },
    },
  };
}

/** "3 formulas": how many a group has. */
export function groupCount(row: Pick<GroupRow, 'members'>): string {
  const all = row.members.length;
  return all === 1 ? '1 formula' : `${all} formulas`;
}

/** The chevron of the button that opens a group: it points down while the group is open. */
export function GroupChevron() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 3.5 10.5 8 6 12.5"
      />
    </svg>
  );
}

/** The field a group is renamed in: Enter takes the name (one that cannot be used keeps the
 * field open with the reason), Escape leaves it, and so does leaving the field with a name that
 * cannot be used. `onDone(refocus)`: the rename ended, by a key when `refocus`. */
export function GroupRename({
  group,
  onDone,
}: {
  group: FormulaGroup;
  onDone: (refocus: boolean) => void;
}) {
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  /** A key ended the rename: the field going away must not take the name on its way out. */
  const ended = useRef(false);
  return (
    <span className="formula-rename">
      <input
        type="text"
        autoFocus
        aria-label="Rename group"
        data-testid="formula-group-rename-input"
        value={name}
        spellCheck={false}
        onChange={(event) => {
          setName(event.target.value);
          setError(validateFormulaGroupName(event.target.value));
        }}
        onFocus={(event) => event.target.select()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onBlur={() => {
          if (ended.current) return;
          renameGroup(group.id, name);
          onDone(false);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            const problem = renameGroup(group.id, name);
            if (problem) return setError(problem);
            ended.current = true;
            onDone(true);
          } else if (event.key === 'Escape') {
            ended.current = true;
            onDone(true);
          }
        }}
      />
      {error && (
        <span className="field-error" role="alert" data-testid="formula-group-rename-error">
          {error}
        </span>
      )}
    </span>
  );
}

/** What a group's row and its block share: whether it is being renamed, and how that ends (the
 * focus going back to the row when a key ended it). */
export function useGroupRename(group: FormulaGroup, itemRef: RefObject<HTMLElement | null>) {
  const renaming = useGroupUi((state) => state.renaming === group.id);
  const refocus = useRef(false);
  useEffect(() => {
    if (renaming || !refocus.current) return;
    refocus.current = false;
    itemRef.current?.focus();
  }, [renaming, itemRef]);
  return {
    renaming,
    start: () => useGroupUi.getState().startRename(group.id),
    done: (byKey: boolean) => {
      if (byKey) refocus.current = true;
      useGroupUi.getState().stopRename();
    },
  };
}

/** The keys of a group's row or block: the list's keys go to `onNavigate`, Enter opens or closes
 * the group, F2 renames it; where ← and → are not the list's (the rows), → opens and ← closes. */
export function groupKeyDown(
  event: KeyboardEvent<HTMLLIElement>,
  keys: ReadonlySet<string>,
  row: GroupRow,
  props: Pick<FormulaGroupRowProps, 'onNavigate'>,
  startRename: () => void,
): void {
  if (event.target !== event.currentTarget || event.defaultPrevented) return;
  const { setOpen, toggle } = useGroupUi.getState();
  const listKey = listKeyOf(event, keys, isMac());
  if (listKey) {
    event.preventDefault();
    props.onNavigate(listKey.key, listKey.modifiers);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    toggle(row.group.id);
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    setOpen(row.group.id, event.key === 'ArrowRight');
  } else if (event.key === 'F2') {
    event.preventDefault();
    startRename();
  }
}

/** The button that opens a group onto its formulas, or closes it. */
export function GroupToggle({ row }: { row: GroupRow }) {
  const { group, open } = row;
  return (
    <button
      type="button"
      tabIndex={-1}
      className="icon-btn formula-group-toggle"
      data-testid="formula-group-toggle"
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} the formulas of ${group.name}`}
      title={open ? 'Hide its formulas' : 'Show its formulas'}
      onClick={(event) => {
        event.stopPropagation();
        useGroupUi.getState().toggle(group.id);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <GroupChevron />
    </button>
  );
}

export function FormulaGroupRow(props: FormulaGroupRowProps) {
  const { row, entries, background, highlight } = props;
  const { group, members, open } = row;
  const itemRef = useRef<HTMLLIElement>(null);
  const rename = useGroupRename(group, itemRef);
  const drop = useFormulaDrop(group.id);
  const first = members.slice(0, GROUP_THUMBS);
  const more = members.length - first.length;

  return (
    <li
      ref={itemRef}
      className={`formula-item formula-group formula-${highlight}${drop.over ? ' is-drop' : ''}`}
      data-testid="formula-group"
      data-drop={drop.over || undefined}
      {...drop.handlers}
      data-group-id={group.id}
      data-name={group.name}
      data-open={open}
      data-selected={highlight === 'selected'}
      data-linked={highlight === 'linked'}
      role="option"
      aria-selected={highlight === 'selected'}
      tabIndex={props.tabStop ? 0 : -1}
      aria-label={`Group ${group.name}, ${groupCount(row)}, ${open ? 'open' : 'closed'}`}
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onFocused();
      }}
      onClick={(event) =>
        props.onSelect({ toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })
      }
      onDoubleClick={() => useGroupUi.getState().toggle(group.id)}
      onContextMenu={props.onContextMenu}
      onKeyDown={(event) => groupKeyDown(event, LIST_KEYS, row, props, rename.start)}
    >
      <div className="formula-row">
        <GroupToggle row={row} />
        {rename.renaming ? (
          <GroupRename group={group} onDone={rename.done} />
        ) : (
          <span
            className="formula-name"
            data-testid="formula-group-name"
            title="Double-click to rename"
            onDoubleClick={(event) => {
              event.stopPropagation();
              rename.start();
            }}
          >
            {group.name}
          </span>
        )}
        <span className="badge formula-group-count" data-testid="formula-group-count">
          {groupCount(row)}
        </span>
      </div>
      {!open && (
        <div className="formula-group-thumbs" data-testid="formula-group-thumbs">
          {first.map((formula) => (
            <FormulaThumb
              key={formula.id}
              formula={formula}
              resolved={entries[formula.id]?.resolved ?? null}
              background={background}
            />
          ))}
          {more > 0 && (
            <span className="formula-group-more" data-testid="formula-group-more">
              +{more}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
