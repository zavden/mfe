/* A result of the search of formulas (FormulaSearchPanel): the object's rendering on the
 * project's background, its tag and name, how many clips use it, the group of formulas it is in
 * and a line of its source — what the search looks at. A card of the Creator list in what it does:
 * selected with a click, opened with a double-click or Enter, dragged onto the timeline
 * (FORMULA_MIME), walked with the arrows. */
import type { MouseEvent } from 'react';
import { kindOf, type Formula, type FormulaGroup } from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { Icon } from '../../timeline/icons';
import { startFormulaDrag } from '../FormulaCardParts';
import type { RowHighlight } from '../FormulaItem';
import { listKeyOf, type ListKey } from '../formulaSelection';
import { FormulaThumb } from '../FormulaThumb';
import { isMac } from '../../platform';

const GRID_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ']);

export interface SearchResultCardProps {
  formula: Formula;
  /** The group of formulas it is in, if any. */
  group: FormulaGroup | null;
  entry: FormulaRenderEntry | undefined;
  /** The project's background: what the rendering is drawn on. */
  background: string;
  highlight: RowHighlight;
  /** Number of timeline clips of this object. */
  clipCount: number;
  /** The results' one tab stop (roving tabindex). */
  tabStop: boolean;
  /** A click (`toggle`: Ctrl/⌘ held; `range`: Shift held), or the start of a drag. */
  onSelect(modifiers?: { toggle: boolean; range: boolean }): void;
  onNavigate(key: ListKey, modifiers: { shift: boolean; ctrl: boolean }): void;
  onFocused(): void;
  onEdit(): void;
  onContextMenu(event: MouseEvent<HTMLLIElement>): void;
}

export function SearchResultCard(props: SearchResultCardProps) {
  const { formula, group, highlight, clipCount } = props;
  return (
    <li
      className={`search-card formula-${highlight}`}
      data-testid="formula-search-result"
      data-formula-id={formula.id}
      data-name={formula.name}
      data-selected={highlight === 'selected'}
      data-linked={highlight === 'linked'}
      draggable
      role="option"
      aria-selected={highlight === 'selected'}
      tabIndex={props.tabStop ? 0 : -1}
      aria-label={`${kindOf(formula).label} ${formula.name}${group ? `, in the group ${group.name}` : ''}${highlight === 'linked' ? ', used by the selected clip' : ''}`}
      title="Drag onto the timeline · double-click to edit"
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onFocused();
      }}
      onClick={(event) =>
        props.onSelect({ toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })
      }
      onDoubleClick={props.onEdit}
      onContextMenu={props.onContextMenu}
      onDragStart={(event) => {
        startFormulaDrag(event, formula);
        props.onSelect();
      }}
      onKeyDown={(event) => {
        // Not for keys an open menu already took (its items are not inside the card).
        if (event.target !== event.currentTarget || event.defaultPrevented) return;
        const listKey = listKeyOf(event, GRID_KEYS, isMac());
        if (listKey) {
          event.preventDefault();
          props.onNavigate(listKey.key, listKey.modifiers);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          props.onEdit();
        }
      }}
    >
      <FormulaThumb
        formula={formula}
        resolved={props.entry?.resolved ?? null}
        background={props.background}
      />
      <div className="search-card-row">
        <span className="formula-tag" aria-hidden="true">
          <span className="formula-tag-dot" style={{ background: formula.tag.color }} />
          {formula.tag.icon && <span className="formula-tag-icon">{formula.tag.icon}</span>}
        </span>
        <span className="search-card-name" data-testid="formula-search-name">
          {formula.name}
        </span>
        {clipCount > 0 && (
          <span
            className="badge badge-clips"
            data-testid="formula-search-clips"
            title={`${clipCount} clip(s) on the timeline`}
          >
            ▭ {clipCount}
          </span>
        )}
      </div>
      <div className="search-card-source" data-testid="formula-search-source">
        {formula.source}
      </div>
      {group && (
        <div
          className="search-card-group"
          data-testid="formula-search-group"
          title={`In the group “${group.name}”`}
        >
          <Icon name="folder" />
          <span>{group.name}</span>
        </div>
      )}
    </li>
  );
}
