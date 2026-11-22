/* One row of the formula list: tag, name, kind, render status, a small rendering of the formula
 * and the row actions. Draggable onto the timeline (FORMULA_MIME). The block view of the list
 * (FormulaBlock, R3) shows the same formula without the rendering. */
import { useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { kindOf, type Formula } from '../../model';
import { listKeyOf, type ListKey } from './formulaSelection';
import type { FormulaRenderEntry } from '../../store';
import { describeWarning, useProjectStore, type SyncWarning } from '../../store';
import { statusMark } from './blockFace';
import { FormulaActions, startFormulaDrag, useFormulaName } from './FormulaCardParts';
import { companionTextNote, formulaStatus, type FormulaStatus } from './formulaStatus';
import { FormulaThumb } from './FormulaThumb';
import { useCompanionState } from '../useCompanion';
import { describeRenderError } from './renderErrors';
import { isMac } from '../platform';

export type RowHighlight = 'none' | 'selected' | 'linked';

const LIST_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

export interface FormulaCardProps {
  formula: Formula;
  formulas: readonly Formula[];
  entry: FormulaRenderEntry | undefined;
  warning: SyncWarning | undefined;
  highlight: RowHighlight;
  /** Number of timeline clips of this formula. */
  clipCount: number;
  /** A click (`toggle`: Ctrl/⌘ held; `range`: Shift held), or the start of a drag. */
  onSelect: (modifiers?: { toggle: boolean; range: boolean }) => void;
  /** The list's one tab stop (roving tabindex): the focused card, else a selected one. */
  tabStop: boolean;
  /** The open group of formulas the card is shown under (groups/), if it is in one. */
  groupId?: string;
  /** A listbox key on the card: ↑ ↓ Home End Space (← → in the block view), with Shift and
   * Ctrl/⌘. */
  onNavigate: (key: ListKey, modifiers: { shift: boolean; ctrl: boolean }) => void;
  onFocused: () => void;
  onEdit: () => void;
  /** A right-click on the item (its menu: edit, edit together). */
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void;
  onRename: (name: string) => string | null;
  onDuplicate: () => void;
  onDelete: () => void;
  onDismissWarning: () => void;
}

interface FormulaItemProps extends FormulaCardProps {
  background: string;
}

/** What the Creator says of the render of `formula`, for the project's library. */
function useFormulaStatus(entry: FormulaRenderEntry | undefined, formula: Formula): FormulaStatus {
  const target = useProjectStore((state) => state.project.meta.target);
  return formulaStatus(entry, formula, target);
}

/** The render status of a formula as a badge: shared by the row and the block. `data-mark` is the
 * one character the compact face of a block shows of it (`blockFace.ts`). */
export function StatusBadge({
  entry,
  formula,
}: {
  entry: FormulaRenderEntry | undefined;
  formula: Formula;
}) {
  const status = useFormulaStatus(entry, formula);
  const target = useProjectStore((state) => state.project.meta.target);
  const companion = useCompanionState();
  const kind = status.status === 'ok' ? (status.exact ? 'exact' : 'approx') : status.status;
  // A text that needs the companion also says what the one that is running lacks, if any is.
  const note = status.needsCompanion ? companionTextNote(companion, target) : null;
  return (
    <span
      className={`badge badge-${kind}`}
      data-testid="formula-status"
      data-status={status.status}
      data-exact={status.status === 'ok' ? status.exact : undefined}
      data-needs-companion={status.needsCompanion || undefined}
      data-mark={statusMark(status)}
      title={note ? `${status.title} ${note}` : (status.title ?? status.label)}
    >
      {status.label}
    </span>
  );
}

/** The keys of a card of the list: the listbox keys go to `onNavigate` (⌘+Return among them on a
 * Mac, `listKeyOf`), Enter edits, F2 renames.
 * `keys` says which keys the view walks with (the block view adds ← and →). */
export function cardKeyDown(
  event: KeyboardEvent<HTMLLIElement>,
  keys: ReadonlySet<string>,
  props: Pick<FormulaCardProps, 'onNavigate' | 'onEdit'>,
  startRename: () => void,
): void {
  // Not for keys an open menu already took (its items are not inside the card).
  if (event.target !== event.currentTarget || event.defaultPrevented) return;
  const listKey = listKeyOf(event, keys, isMac());
  if (listKey) {
    event.preventDefault();
    props.onNavigate(listKey.key, listKey.modifiers);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    props.onEdit();
  } else if (event.key === 'F2') {
    event.preventDefault();
    startRename();
  }
}

export function FormulaItem(props: FormulaItemProps) {
  const { formula, entry, warning, background, highlight, clipCount } = props;
  // "needs the companion" is the one badge too long for the row: it gets a line of its own.
  const { needsCompanion } = useFormulaStatus(entry, formula);
  const itemRef = useRef<HTMLLIElement>(null);
  const name = useFormulaName({
    formula,
    formulas: props.formulas,
    onRename: props.onRename,
    itemRef,
    className: 'formula-name',
    renameOnDoubleClick: true,
  });

  return (
    <li
      ref={itemRef}
      className={`formula-item formula-${highlight}${props.groupId ? ' is-grouped' : ''}`}
      data-testid="formula-item"
      data-formula-id={formula.id}
      data-in-group={props.groupId}
      data-name={formula.name}
      data-selected={highlight === 'selected'}
      data-linked={highlight === 'linked'}
      draggable={!name.renaming}
      role="option"
      aria-selected={highlight === 'selected'}
      tabIndex={props.tabStop ? 0 : -1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onFocused();
      }}
      aria-label={`${kindOf(formula).label} ${formula.name}${highlight === 'linked' ? ', used by the selected clip' : ''}`}
      onClick={(event) =>
        props.onSelect({ toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })
      }
      onDoubleClick={props.onEdit}
      onContextMenu={props.onContextMenu}
      onDragStart={(event) => {
        startFormulaDrag(event, formula);
        props.onSelect();
      }}
      onKeyDown={(event) => cardKeyDown(event, LIST_KEYS, props, name.startRename)}
    >
      <div className="formula-row">
        {/* The tag: a small dot of its colour (and its icon, if any) — it identifies the
            formula, it does not colour its glyphs. */}
        <span className="formula-tag" data-testid="formula-tag" aria-hidden="true">
          <span className="formula-tag-dot" style={{ background: formula.tag.color }} />
          {formula.tag.icon && <span className="formula-tag-icon">{formula.tag.icon}</span>}
        </span>
        {name.element}
        <span
          className="badge badge-kind"
          data-testid="formula-kind"
          data-kind={formula.kind}
          title={kindOf(formula).label}
        >
          {kindOf(formula).mark}
        </span>
        {!needsCompanion && <StatusBadge entry={entry} formula={formula} />}
        {clipCount > 0 && (
          <span className="badge badge-clips" title={`${clipCount} clip(s) on the timeline`}>
            ▭ {clipCount}
          </span>
        )}
        <FormulaActions
          formula={formula}
          onEdit={props.onEdit}
          onDuplicate={props.onDuplicate}
          onDelete={props.onDelete}
        />
      </div>
      <FormulaThumb formula={formula} resolved={entry?.resolved ?? null} background={background} />
      {needsCompanion && (
        <div className="formula-needs">
          <StatusBadge entry={entry} formula={formula} />
        </div>
      )}
      {entry?.status === 'error' && entry.error && (
        <div className="formula-error" data-testid="formula-error">
          {describeRenderError(entry.error, formula)}
        </div>
      )}
      {warning && (
        <div
          className="formula-warning"
          data-testid="formula-warning"
          onClick={(e) => e.stopPropagation()}
        >
          <span title={describeWarning(warning)}>⚠ Check glyph colours, pairs and blocks</span>
          <button
            type="button"
            tabIndex={-1}
            className="icon-btn"
            aria-label="Dismiss warning"
            data-testid="formula-warning-dismiss"
            onClick={props.onDismissWarning}
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
}
