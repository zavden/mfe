/* The right-click menu of the selected formulas: what a card of the Creator list opens, and a
 * result of the search of formulas (search/). Every action on one formula or on several — edit
 * (together, when they are several whose kinds colour glyphs), add to the timeline, the groups of
 * formulas (groups/GroupMenuItems), Apply match colors, duplicate, delete — acts on the
 * selection: whoever opens the menu selects first what it was opened on. Opened on the row of a
 * group (`groupId`), it has the entries of the group too. Nothing while no formula is selected. */
import { formulaGroupsOf, kindOf, type FormulaGroupId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { applyColorMatch, takesMatchColors } from '../colors/applyColorMatch';
import { useColorMatchDialog } from '../colors/colorMatchDialogStore';
import { ContextMenu, MenuItem, Submenu } from '../ContextMenu';
import { selectedFormulaIds } from '../selection';
import { addToTimeline, deleteFormulas } from './formulaActions';
import { duplicateSelectedFormulas } from './formulaCommands';
import { openFormulaEditor } from './formulaEditorStore';
import { GroupMenuItems } from './groups/GroupMenuItems';
import { useMultiEdit } from './multiEditStore';
import { ColorMatchLabel } from '../colors/ColorMatchLabel';

interface FormulaSelectionMenuProps {
  /** Where it opens, in the window. */
  x: number;
  y: number;
  /** The group whose row it was opened on. */
  groupId?: FormulaGroupId;
  onClose(): void;
}

export function FormulaSelectionMenu({ x, y, groupId, onClose }: FormulaSelectionMenuProps) {
  const project = useProjectStore((state) => state.project);
  const selection = useUiStore((state) => state.selection);
  const ids = selectedFormulaIds(selection);
  if (ids.length === 0) return null;
  const chosen = new Set(ids);
  const selected = project.formulas.filter((f) => chosen.has(f.id));
  // What the selected objects' kinds allow (KINDS): glyph colours for Edit together…, LaTeX
  // patterns on coloured glyphs for Apply match colors.
  const canEditGlyphs = selected.every((f) => kindOf(f).glyphColors);
  const canMatchColors = selected.every(takesMatchColors);
  const group =
    (groupId !== undefined
      ? formulaGroupsOf(project).find((entry) => entry.id === groupId)
      : undefined) ?? null;
  /** Close, then act: the menu is gone before a dialog or a question comes up. */
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <ContextMenu x={x} y={y} label="Selected formulas" testId="formula-menu" onClose={onClose}>
      <div className="ctx-header" data-testid="formula-menu-header">
        {group && `${group.name} · `}
        {ids.length === 1 && !group
          ? (selected[0]?.name ?? '')
          : ids.length === 1
            ? '1 formula'
            : `${ids.length} formulas`}
      </div>
      {ids.length === 1 ? (
        <MenuItem testId="formula-menu-edit" onClick={run(() => openFormulaEditor(ids[0]!))}>
          Edit…
        </MenuItem>
      ) : (
        canEditGlyphs && (
          <MenuItem
            testId="formula-menu-edit-together"
            onClick={run(() => useMultiEdit.getState().open(ids))}
          >
            Edit together…
          </MenuItem>
        )
      )}
      <MenuItem testId="formula-menu-add-to-timeline" onClick={run(() => addToTimeline(ids))}>
        Add to the timeline
      </MenuItem>
      <GroupMenuItems project={project} selected={ids} group={group} onDone={onClose} />
      {canMatchColors && (
        <>
          <hr className="ctx-sep" />
          <Submenu label="Apply match colors" testId="formula-menu-match">
            {project.colorMatches.length === 0 ? (
              <MenuItem
                testId="formula-menu-match-create"
                onClick={run(() => useColorMatchDialog.getState().openNew())}
              >
                Create match colors…
              </MenuItem>
            ) : (
              project.colorMatches.map((match) => (
                <MenuItem
                  key={match.id}
                  testId={`formula-menu-match-${match.id}`}
                  onClick={run(() => void applyColorMatch(ids, match.id))}
                >
                  <ColorMatchLabel match={match} />
                </MenuItem>
              ))
            )}
          </Submenu>
        </>
      )}
      <hr className="ctx-sep" />
      <MenuItem testId="formula-menu-duplicate" onClick={run(duplicateSelectedFormulas)}>
        Duplicate
      </MenuItem>
      <MenuItem
        testId="formula-menu-delete"
        danger
        onClick={run(() => void deleteFormulas(selected.map((f) => f.id)))}
      >
        {ids.length === 1 ? 'Delete…' : `Delete ${ids.length} formulas…`}
      </MenuItem>
    </ContextMenu>
  );
}
