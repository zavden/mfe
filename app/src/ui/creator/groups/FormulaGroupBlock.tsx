/* A group of formulas in the block view of the Creator's list: a block with the button that
 * opens it, the tag colours of its first formulas, its name and how many it has; the renderings
 * of its first formulas are in its tooltip (GroupTooltip). Open, the blocks of its formulas come
 * right after it, each marked as one of a group. Selected, walked,
 * renamed (F2), right-clicked and dropped on like the group's row in the list view
 * (FormulaGroupRow); Enter opens and closes it, ← and → being the grid's. */
import { useRef } from 'react';
import {
  GROUP_THUMBS,
  GroupRename,
  GroupToggle,
  groupCount,
  groupKeyDown,
  useFormulaDrop,
  useGroupRename,
  type FormulaGroupRowProps,
} from './FormulaGroupRow';
import { useGroupUi } from './groupUiStore';

const GRID_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ']);

type FormulaGroupBlockProps = Omit<FormulaGroupRowProps, 'entries' | 'background'>;

export function FormulaGroupBlock(props: FormulaGroupBlockProps) {
  const { row, highlight } = props;
  const { group, members, open } = row;
  const itemRef = useRef<HTMLLIElement>(null);
  const rename = useGroupRename(group, itemRef);
  const drop = useFormulaDrop(group.id);

  return (
    <li
      ref={itemRef}
      className={`formula-block formula-group formula-group-block formula-${highlight}${drop.over ? ' is-drop' : ''}`}
      data-testid="formula-group"
      data-group-id={group.id}
      data-name={group.name}
      data-open={open}
      data-drop={drop.over || undefined}
      data-selected={highlight === 'selected'}
      data-linked={highlight === 'linked'}
      {...drop.handlers}
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
      onKeyDown={(event) => groupKeyDown(event, GRID_KEYS, row, props, rename.start)}
    >
      <div className="formula-block-head">
        <GroupToggle row={row} />
        <span className="formula-group-dots" aria-hidden="true">
          {members.slice(0, GROUP_THUMBS).map((formula) => (
            <span
              key={formula.id}
              className="formula-tag-dot"
              style={{ background: formula.tag.color }}
            />
          ))}
        </span>
      </div>
      {rename.renaming ? (
        <GroupRename group={group} onDone={rename.done} />
      ) : (
        <span className="formula-block-name" data-testid="formula-group-name">
          {group.name}
        </span>
      )}
      <div className="formula-block-foot">
        <span className="badge formula-group-count" data-testid="formula-group-count">
          {groupCount(row)}
        </span>
      </div>
    </li>
  );
}
