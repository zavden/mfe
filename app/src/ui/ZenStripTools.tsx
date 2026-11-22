/* The tools of Zen mode's strip (D188): what one reaches for most in the Creator, a click away
 * while its panel is closed — the search of formulas, «+ New» with the menu of its kinds, the
 * two lists of templates one uses (My templates, Favorites) — and Undo and Redo. Each is the
 * action the Creator or the Edit menu has, called from here. */
import { useRef, useState } from 'react';
import { history } from '../store';
import { ContextMenu, MenuItem } from './ContextMenu';
import { createObject } from './creator/createObject';
import { DEFAULT_KIND, newObjectChoices } from './creator/newObject';
import { toggleFormulaSearch, useFormulaSearch } from './creator/search/formulaSearchStore';
import { useTemplatesUi } from './creator/templates/templatesUi';
import { keyHint } from './platform';
import { useHistoryState } from './project/useHistoryState';
import { StarIcon } from './StarIcon';
import { cancelTextCompositionForHistory } from './text/textCompositionStore';
import { Icon } from './timeline/icons';

export function ZenStripTools() {
  const searching = useFormulaSearch((state) => state.open);
  const { canUndo, canRedo } = useHistoryState();
  /** The menu of the «+ New ▸» arrow: one entry per kind of object. */
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  const newArrow = useRef<HTMLButtonElement>(null);
  const openNewMenu = () => {
    const rect = newArrow.current!.getBoundingClientRect();
    setNewMenu({ x: rect.left, y: rect.bottom + 2 });
  };
  const undo = () => {
    if (!cancelTextCompositionForHistory()) history.undo();
  };
  const redo = () => {
    if (!cancelTextCompositionForHistory()) history.redo();
  };
  return (
    <>
      <button
        type="button"
        className={searching ? 'zen-strip-tool is-on' : 'zen-strip-tool'}
        data-testid="zen-search"
        aria-pressed={searching}
        aria-label="Search formulas"
        title={`Search formulas, by name or LaTeX (${keyHint('Mod+F')})`}
        onClick={toggleFormulaSearch}
      >
        <Icon name="search" />
      </button>
      <div className="split-button zen-strip-new">
        <button
          type="button"
          className="btn btn-primary split-main"
          data-testid="zen-new"
          title="Create a formula (the arrow lists every kind of object)"
          onClick={() => createObject(DEFAULT_KIND)}
        >
          + New
        </button>
        <button
          type="button"
          className="btn btn-primary split-arrow"
          data-testid="zen-new-menu"
          aria-label="New object of another kind"
          aria-haspopup="menu"
          aria-expanded={newMenu !== null}
          ref={newArrow}
          onClick={openNewMenu}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              openNewMenu();
            }
          }}
        >
          <Icon name="chevron-down" />
        </button>
      </div>
      <button
        type="button"
        className="zen-strip-tool"
        data-testid="zen-my-templates"
        aria-haspopup="dialog"
        aria-label="My templates"
        title="My templates: the templates of your own"
        onClick={() => useTemplatesUi.getState().open('mine')}
      >
        <Icon name="folder" />
      </button>
      <button
        type="button"
        className="zen-strip-tool"
        data-testid="zen-favorites"
        aria-haspopup="dialog"
        aria-label="Favorite templates"
        title="Favorites: the templates with a star"
        onClick={() => useTemplatesUi.getState().open('favorites')}
      >
        <StarIcon />
      </button>
      <span className="zen-strip-sep" aria-hidden="true" />
      <button
        type="button"
        className="zen-strip-tool"
        data-testid="zen-undo"
        aria-label="Undo"
        title={`Undo (${keyHint('Mod+Z')})`}
        disabled={!canUndo}
        onClick={undo}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="zen-strip-tool"
        data-testid="zen-redo"
        aria-label="Redo"
        title={`Redo (${keyHint('Mod+Shift+Z')})`}
        disabled={!canRedo}
        onClick={redo}
      >
        <Icon name="redo" />
      </button>
      {newMenu && (
        <ContextMenu
          x={newMenu.x}
          y={newMenu.y}
          label="New object"
          testId="zen-new-kinds"
          onClose={() => setNewMenu(null)}
        >
          {newObjectChoices().map((choice) => (
            <MenuItem
              key={choice.id}
              testId={`zen-new-${choice.id}`}
              disabled={choice.kind === null}
              onClick={() => {
                setNewMenu(null);
                if (choice.kind) createObject(choice.kind);
              }}
            >
              {choice.label}
              {choice.kind === null && <span className="ctx-hint">coming next</span>}
            </MenuItem>
          ))}
        </ContextMenu>
      )}
    </>
  );
}
