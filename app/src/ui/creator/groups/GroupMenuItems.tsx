/* What the menu of the selected formulas (CreatorPanel) says about groups: «Group» makes one of
 * them; «Add to group ›» puts them into one there is, while one of them is in none; «Remove
 * from group» frees those that are in one. Opened on the row of a group, the menu has that
 * group's «Rename group» and «Ungroup» instead of the last two. The panel closes the menu
 * (`onDone`) before each acts. Nothing is rendered when there is nothing to offer. */
import type { FormulaGroup, FormulaId, Project } from '../../../model';
import { MenuItem, Submenu } from '../../ContextMenu';
import {
  addSelectedToGroup,
  groupSelectedFormulas,
  removeSelectedFromGroups,
  ungroup,
} from './groupActions';
import { groupChoices } from './groupRows';
import { useGroupUi } from './groupUiStore';

interface GroupMenuItemsProps {
  project: Pick<Project, 'formulaGroups'>;
  /** The selected formulas, which the menu acts on. */
  selected: readonly FormulaId[];
  /** The group whose row the menu was opened on, if it was one. */
  group: FormulaGroup | null;
  /** Close the menu. */
  onDone(): void;
}

export function GroupMenuItems({ project, selected, group, onDone }: GroupMenuItemsProps) {
  const choices = groupChoices(project, selected);
  const addTo = group ? [] : choices.addTo;
  const remove = !group && choices.remove;
  if (!choices.group && !group && addTo.length === 0 && !remove) return null;
  return (
    <>
      <hr className="ctx-sep" />
      {choices.group && (
        <MenuItem
          testId="formula-menu-group"
          onClick={() => {
            onDone();
            groupSelectedFormulas();
          }}
        >
          Group
        </MenuItem>
      )}
      {addTo.length > 0 && (
        <Submenu label="Add to group" testId="formula-menu-add-to-group">
          {addTo.map((target) => (
            <MenuItem
              key={target.id}
              testId={`formula-menu-add-to-group-${target.id}`}
              onClick={() => {
                onDone();
                addSelectedToGroup(target.id);
              }}
            >
              {target.name}
            </MenuItem>
          ))}
        </Submenu>
      )}
      {remove && (
        <MenuItem
          testId="formula-menu-remove-from-group"
          onClick={() => {
            onDone();
            removeSelectedFromGroups();
          }}
        >
          Remove from group
        </MenuItem>
      )}
      {group && (
        <>
          <MenuItem
            testId="formula-menu-rename-group"
            onClick={() => {
              onDone();
              // Once the menu is gone and has given the focus back: the field then takes it.
              setTimeout(() => useGroupUi.getState().startRename(group.id), 0);
            }}
          >
            Rename group
          </MenuItem>
          <MenuItem
            testId="formula-menu-ungroup"
            onClick={() => {
              onDone();
              ungroup(group.id);
            }}
          >
            Ungroup
          </MenuItem>
        </>
      )}
    </>
  );
}
