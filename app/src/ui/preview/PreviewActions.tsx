/* The bar in the preview's top-left corner while two or more clips are selected (D62): the align
 * and distribute actions of the right-click menu and the Edit menu as icon buttons, and Paste
 * properties ▾ and Match colors ▾ as small menus. It never measures the clips itself — an action
 * does, when it runs, and says what it left alone (`alignActions.ts`): Align needs two selected
 * clips, Distribute three. */
import { useState, type MouseEvent } from 'react';
import { useProjectStore, useUiStore } from '../../store';
import { applyColorMatch } from '../colors/applyColorMatch';
import { formulasOfSelection } from '../colors/colorMatchActions';
import { useColorMatchDialog } from '../colors/colorMatchDialogStore';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { keyHint } from '../platform';
import { Icon } from '../timeline/icons';
import {
  ALIGN_ACTIONS,
  alignSelection,
  DISTRIBUTE_ACTIONS,
  distributeSelection,
} from './alignActions';
import {
  PASTE_GROUPS,
  pasteLabel,
  pasteProperties,
  usePropertyClipboard,
} from './propertyClipboard';
import { ColorMatchLabel } from '../colors/ColorMatchLabel';

interface PreviewActionsProps {
  /** Selected clips. */
  count: number;
}

type Menu = { kind: 'paste' | 'match'; x: number; y: number };

export function PreviewActions({ count }: PreviewActionsProps) {
  const copied = usePropertyClipboard((state) => state.properties);
  const matches = useProjectStore((state) => state.project.colorMatches);
  const [menu, setMenu] = useState<Menu | null>(null);
  const close = () => setMenu(null);
  const openMenu = (kind: Menu['kind'], event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind, x: rect.left, y: rect.bottom + 2 });
  };
  return (
    <div
      className="preview-actions"
      role="toolbar"
      aria-label="Selected clips"
      data-testid="preview-actions"
    >
      <span className="preview-actions-count" data-testid="preview-actions-count">
        {count} clips
      </span>
      {ALIGN_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className="preview-tool"
          aria-label={action.label}
          title={`${action.label} (${keyHint(action.keys)})`}
          data-testid={`preview-actions-${action.id}`}
          onClick={() => alignSelection(action.edge)}
        >
          <Icon name={action.icon} />
        </button>
      ))}
      <span className="preview-tools-sep" aria-hidden="true" />
      {DISTRIBUTE_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className="preview-tool"
          aria-label={action.label}
          title={`${action.label} (${keyHint(action.keys)}): needs three selected clips`}
          data-testid={`preview-actions-${action.id}`}
          disabled={count < 3}
          onClick={() => distributeSelection(action.axis)}
        >
          <Icon name={action.icon} />
        </button>
      ))}
      <span className="preview-tools-sep" aria-hidden="true" />
      <button
        type="button"
        className="preview-tool preview-actions-menu"
        aria-label="Paste properties"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'paste'}
        title={
          copied
            ? 'Paste the copied properties onto the selected clips'
            : 'Copy properties from a clip first (its right-click menu)'
        }
        data-testid="preview-actions-paste"
        disabled={copied === null}
        onClick={(event) => openMenu('paste', event)}
      >
        <Icon name="paste-properties" />
        <span aria-hidden="true">▾</span>
      </button>
      <button
        type="button"
        className="preview-tool preview-actions-menu"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'match'}
        title="Colour the formulas of the selected clips with a match colours list"
        data-testid="preview-actions-match"
        onClick={(event) => openMenu('match', event)}
      >
        Match colors <span aria-hidden="true">▾</span>
      </button>
      {menu?.kind === 'paste' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Paste properties"
          testId="preview-actions-paste-menu"
          onClose={close}
        >
          {PASTE_GROUPS.map((group) => (
            <MenuItem
              key={group.id}
              testId={`preview-actions-paste-${group.id}`}
              icon={<Icon name="paste-properties" />}
              onClick={() => {
                close();
                pasteProperties(group.id);
              }}
            >
              {copied ? `${group.label} (${pasteLabel(copied, group.id)})` : group.label}
            </MenuItem>
          ))}
        </ContextMenu>
      )}
      {menu?.kind === 'match' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Apply match colors"
          testId="preview-actions-match-menu"
          onClose={close}
        >
          {matches.length === 0 ? (
            <MenuItem
              testId="preview-actions-match-create"
              onClick={() => {
                close();
                useColorMatchDialog.getState().openNew();
              }}
            >
              Create match colors…
            </MenuItem>
          ) : (
            matches.map((match) => (
              <MenuItem
                key={match.id}
                testId={`preview-actions-match-${match.id}`}
                onClick={() => {
                  close();
                  const { project } = useProjectStore.getState();
                  const { selection } = useUiStore.getState();
                  void applyColorMatch(formulasOfSelection(project, selection), match.id);
                }}
              >
                <ColorMatchLabel match={match} />
              </MenuItem>
            ))
          )}
        </ContextMenu>
      )}
    </div>
  );
}
