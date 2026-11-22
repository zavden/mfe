/* One block of the formula list's block view (R3): a square with the formula's tag, its name,
 * how many clips use it, its kind and render status, and a warning mark; no rendering — the
 * tooltip beside the block the pointer is on (FormulaTooltip) has it. Its actions show on hover and focus.
 * Selected, dragged, edited, renamed and walked like the row (FormulaItem), ← and → included.
 *
 * Too narrow for all that, the block shows its compact face (blockFace.ts; the stylesheet
 * chooses it by the block's own width): a pane of glass tinted with its tag's colour, with the
 * name alone, and the rest in its corners while the pointer is on it. */
import { useRef, type CSSProperties } from 'react';
import { kindOf } from '../../model';
import { describeWarning } from '../../store';
import { FormulaActions, startFormulaDrag, useFormulaName } from './FormulaCardParts';
import { cardKeyDown, StatusBadge, type FormulaCardProps } from './FormulaItem';

const GRID_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ']);

export function FormulaBlock(props: FormulaCardProps) {
  const { formula, entry, warning, highlight, clipCount } = props;
  const itemRef = useRef<HTMLLIElement>(null);
  const name = useFormulaName({
    formula,
    formulas: props.formulas,
    onRename: props.onRename,
    itemRef,
    className: 'formula-block-name',
    renameOnDoubleClick: false,
  });

  return (
    <li
      ref={itemRef}
      className={`formula-block is-formula formula-${highlight}${props.groupId ? ' is-grouped' : ''}`}
      // The tag's colour, which tints the compact face.
      style={{ '--tag': formula.tag.color } as CSSProperties}
      data-testid="formula-block"
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
      onKeyDown={(event) => cardKeyDown(event, GRID_KEYS, props, name.startRename)}
    >
      <div className="formula-block-face" data-testid="formula-block-face">
        <div className="formula-block-head">
          <span className="formula-tag" data-testid="formula-tag" aria-hidden="true">
            <span className="formula-tag-dot" style={{ background: formula.tag.color }} />
            {formula.tag.icon && <span className="formula-tag-icon">{formula.tag.icon}</span>}
          </span>
          {clipCount > 0 && (
            <span
              className="badge badge-clips"
              data-testid="formula-clips"
              title={`${clipCount} clip(s) on the timeline`}
            >
              ▭ {clipCount}
            </span>
          )}
          {warning && (
            <span
              className="formula-block-warning"
              data-testid="formula-warning"
              title={describeWarning(warning)}
            >
              ⚠
            </span>
          )}
        </div>
        {name.element}
        <div className="formula-block-foot">
          <span
            className="badge badge-kind"
            data-testid="formula-kind"
            data-kind={formula.kind}
            title={kindOf(formula).label}
          >
            {kindOf(formula).mark}
          </span>
          <StatusBadge entry={entry} formula={formula} />
        </div>
        <FormulaActions
          formula={formula}
          className="formula-block-actions"
          onEdit={props.onEdit}
          onDuplicate={props.onDuplicate}
          onDelete={props.onDelete}
        />
      </div>
    </li>
  );
}
