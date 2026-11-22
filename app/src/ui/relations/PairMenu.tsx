/* The menu of some pairs of the relation (or Morph block) being edited: their style (one of the
 * choices, or the default of what holds them) and deleting them. Opened from a pair's badge on the
 * canvas, or by a right-click for the pairs of the selected glyphs. The editor applies the
 * choices. A single pair whose path was edited wears the mark of it (`EditedPathDot`) in the
 * menu's header, over its Edit path….
 *
 * A right-click with glyphs selected on both sides opens it with «Link as» on top (`linkAs.ts`):
 * the styles the new pair can be born with, the ones that cannot be shown disabled over their
 * reason. The pairs that already hold the selected glyphs follow; with none, the menu is the
 * link alone. */
import { Fragment } from 'react';
import type { FormulaSnapshot, GlyphPair, RelationStyle } from '../../model';
import { isStraightSpline } from '../../geom';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { EditedPathDot } from './EditedPathDot';
import type { LinkOffer } from './linkAs';
import { joinable, joinBlocker, splittable } from './pairShare';
import { describePair, wearsEditedPath } from './relationOps';
import { PAIR_STYLE_OPTIONS, styleLabel } from './styleOptions';

/** The menu that is open: which pairs, at a screen position. */
export interface PairMenuState {
  indices: number[];
  x: number;
  y: number;
  align: 'start' | 'center';
  /** What the selected glyphs can be linked as, named as a pair is ("a b → c"); none for a
   * menu opened from a badge, or when there is nothing to link. */
  link?: (LinkOffer & { label: string }) | null;
}

interface PairMenuProps {
  menu: PairMenuState;
  pairs: readonly GlyphPair[];
  /** The style of the relation (or Morph block), which "Inherit" means. */
  defaultStyle: RelationStyle;
  /** Its path arc: a pair's path that is that arc is no path of its own (`wearsEditedPath`). */
  pathArc: number;
  fromSnap: FormulaSnapshot | null;
  toSnap: FormulaSnapshot | null;
  onStyle(indices: number[], style: RelationStyle | null): void;
  onDelete(indices: number[]): void;
  /** Shape the custom path of one pair in the preview (the editor saves and closes first). */
  onEditPath?(index: number): void;
  /** The same current validation/lock reason that holds Save back. */
  editPathBlocked?: string | null;
  /** Drop the custom path of these pairs: they follow the holder's arc again. */
  onClearPath?(indices: number[]): void;
  /** Make the link `menu.link` offers, with this style (null: join the pair it lands on), as a
   * pair of its own when `separate`. */
  onLinkAs?(style: RelationStyle | null, separate: boolean): void;
  /** Take the pair apart, one pair per source, all onto its target. */
  onSplit?(index: number): void;
  /** Put the pairs that bring the pair's target into one. */
  onJoin?(index: number): void;
  onClose(): void;
  /** Prefix of the menu's test ids (default `rel`: `rel-style-menu`, `rel-style-menu-copy`…). */
  testIdPrefix?: string;
}

export function PairMenu({
  menu,
  pairs,
  defaultStyle,
  pathArc,
  fromSnap,
  toSnap,
  onStyle,
  onDelete,
  onEditPath,
  editPathBlocked,
  onClearPath,
  onLinkAs,
  onSplit,
  onJoin,
  onClose,
  testIdPrefix: id = 'rel',
}: PairMenuProps) {
  const link = onLinkAs ? (menu.link ?? null) : null;
  const none = menu.indices.length === 0;
  // With a link to offer and no pair to change, the menu is the link alone.
  const pairsShown = !link || !none;
  const one = menu.indices.length === 1 ? menu.indices[0]! : null;
  // A path of the pair, or of one of its routes (D167): what «Straight path» takes away.
  const custom = menu.indices.filter((i) => {
    const pair = pairs[i];
    if (!pair) return false;
    return (
      (pair.path !== undefined && !isStraightSpline(pair.path)) ||
      (pair.routes ?? []).some((route) => !isStraightSpline(route.path))
    );
  });
  // One pair of several sources onto one target can be taken apart; pairs that bring one target
  // can be put into one (D167).
  const canSplit = onSplit && one !== null && pairs[one] ? splittable(pairs[one]) : false;
  const canJoin = onJoin && one !== null ? joinable(pairs, one) : false;
  // Pairs that one pair could not play the same stay apart: the entry says why.
  const joinBlocked =
    canJoin && one !== null ? joinBlocker({ pairs: [...pairs], style: defaultStyle }, one) : null;
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      align={menu.align}
      label={
        link && none
          ? `Link ${link.label}`
          : menu.indices.length === 1
            ? `Pair ${menu.indices[0]! + 1}`
            : `Links of the selected glyphs`
      }
      testId={`${id}-style-menu`}
      onClose={onClose}
    >
      {link && (
        <>
          <div className="ctx-header" data-testid={`${id}-link-as-header`}>
            Link {link.label}
          </div>
          {link.choices.map((choice) => {
            const { key } = choice;
            // One reason for them all is said once, under the last of them.
            const note = link.refused ? null : (choice.blocked ?? choice.warning);
            const noteId = `${id}-link-as-${key}-note`;
            return (
              <Fragment key={key}>
                <MenuItem
                  disabled={choice.blocked !== null}
                  describedBy={note ? noteId : link.refused ? `${id}-link-as-refused` : undefined}
                  testId={`${id}-link-as-${key}`}
                  onClick={() => onLinkAs?.(choice.style, choice.separate)}
                >
                  {choice.label}
                </MenuItem>
                {note && (
                  <div className="ctx-note" id={noteId} data-testid={noteId}>
                    {choice.blocked ? note : `Warning: ${note}`}
                  </div>
                )}
              </Fragment>
            );
          })}
          {link.refused && (
            <div
              className="ctx-note"
              id={`${id}-link-as-refused`}
              data-testid={`${id}-link-as-refused`}
            >
              {link.refused}
            </div>
          )}
          {pairsShown && <hr className="ctx-sep" />}
        </>
      )}
      {pairsShown && (
        <div className="ctx-header" data-testid={`${id}-style-menu-header`}>
          {none
            ? 'The selected glyphs are not linked'
            : one !== null
              ? // Under a link of the same glyphs, the pair is told apart by its number.
                `${link ? `Pair ${one + 1}: ` : ''}${describePair(pairs[one]!, fromSnap, toSnap)}`
              : `${menu.indices.length} links of the selected glyphs`}
          {one !== null &&
            pairs[one] &&
            wearsEditedPath(pairs[one], { pathArc, style: defaultStyle }) && (
              <EditedPathDot testId={`${id}-style-menu-path-dot`} />
            )}
        </div>
      )}
      {pairsShown &&
        PAIR_STYLE_OPTIONS.map((o) => {
          const current =
            !none && menu.indices.every((i) => (pairs[i]?.style ?? 'inherit') === o.value);
          return (
            <MenuItem
              key={o.value}
              current={current}
              disabled={none}
              testId={`${id}-style-menu-${o.value}`}
              onClick={() =>
                onStyle(menu.indices, o.value === 'inherit' ? null : (o.value as RelationStyle))
              }
            >
              {o.value === 'inherit' ? `Inherit: ${styleLabel(defaultStyle)}` : o.label}
            </MenuItem>
          );
        })}
      {(canSplit || canJoin) && one !== null && (
        <>
          <hr className="ctx-sep" />
          {canSplit && (
            <MenuItem
              testId={`${id}-style-menu-split`}
              title="One pair per source, all onto the same target: each can have its own style and path."
              onClick={() => onSplit?.(one)}
            >
              Split into separate pairs
            </MenuItem>
          )}
          {canJoin && (
            <MenuItem
              testId={`${id}-style-menu-join`}
              disabled={joinBlocked !== null}
              describedBy={joinBlocked ? `${id}-style-menu-join-note` : undefined}
              title="The pairs that bring this target, as one pair of several sources."
              onClick={() => onJoin?.(one)}
            >
              Join into one pair
            </MenuItem>
          )}
          {joinBlocked && (
            <div
              className="ctx-note"
              id={`${id}-style-menu-join-note`}
              data-testid={`${id}-style-menu-join-note`}
            >
              {joinBlocked}
            </div>
          )}
        </>
      )}
      {(onEditPath || onClearPath) && !none && (
        <>
          <hr className="ctx-sep" />
          {onEditPath && one !== null && (
            <MenuItem
              testId={`${id}-style-menu-edit-path`}
              disabled={!!editPathBlocked}
              onClick={() => onEditPath(one)}
            >
              Edit path…
            </MenuItem>
          )}
          {onEditPath && editPathBlocked && (
            <div className="ctx-header" data-testid={`${id}-style-menu-path-blocked`}>
              {editPathBlocked}
            </div>
          )}
          {onClearPath && custom.length > 0 && (
            <MenuItem testId={`${id}-style-menu-clear-path`} onClick={() => onClearPath(custom)}>
              {custom.length > 1 ? `Straight paths (${custom.length})` : 'Straight path'}
            </MenuItem>
          )}
        </>
      )}
      {pairsShown && (
        <>
          <hr className="ctx-sep" />
          <MenuItem
            danger
            disabled={none}
            testId={`${id}-style-menu-delete`}
            onClick={() => onDelete(menu.indices)}
          >
            {menu.indices.length > 1 ? `Delete ${menu.indices.length} links…` : 'Delete link…'}
          </MenuItem>
        </>
      )}
    </ContextMenu>
  );
}
