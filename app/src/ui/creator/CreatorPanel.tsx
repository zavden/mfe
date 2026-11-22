/* Creator: three tabs. Formulas, the project's formula list — rows with their rendering, or
 * blocks in a grid whose tooltip has it (R3; the view is an editor preference — one key of the
 * toolbar switches it, viewToggle.ts, D179 —, and so is the size of each view's previews, one key
 * «+/−» in the toolbar, PreviewSizeKey.tsx, D173, D183): search (the
 * magnifier shows the search of formulas in the Preview's place, search/; the list itself is not
 * filtered), select (Ctrl/⌘+click and Shift+click for several; a rectangle dragged from the empty
 * space of the list, or with Alt from a row, selects the formulas it touches, useRegionSelect.ts;
 * the menu of the kinds left of «+ New» adds every formula, LaTeX text or font text,
 * KindMenu.tsx), create («+ New» makes
 * a formula; its arrow lists every kind of object, the announced ones greyed out), rename,
 * duplicate, delete (one, or the selection from its right-click menu, FormulaSelectionMenu, which
 * has every action on several formulas), edit (modal) and drag a formula onto the
 * timeline; selecting a clip in the preview highlights its formula here. Templates:
 * ready-made formulas to start from (templates/). Editor requests are mounted independently of
 * the responsive panels by CreatorEditorHost (formulaEditorStore, multiEditStore). */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent } from 'react';
import { formulaListOrder, type FormulaGroupId } from '../../model';
import { useProjectStore, useRenderStore, useSyncWarnings, useUiStore } from '../../store';
import { clearSelectionOnBackground } from '../background';
import { PanelFrame } from '../PanelFrame';
import { keyHint } from '../platform';
import { usePreferences } from '../preferences';
import { openExample } from '../project/actions';
import { openProjectsDialog, syncFolder, useLibraryStore } from '../project/libraryStore';
import { FIRST_EXAMPLE } from '../project/starterExamples';
import {
  createFormulaFromTemplate,
  deleteFormula,
  duplicateFormula,
  formulaUsage,
  renameFormula,
} from './formulaActions';
import { openFormulaEditor } from './formulaEditorStore';
import { clickRow, navigateRows, type ListKey } from './formulaSelection';
import { FormulaGroupBlock } from './groups/FormulaGroupBlock';
import { FormulaGroupRow } from './groups/FormulaGroupRow';
import { groupRowElement } from './groups/groupActions';
import { creatorRows, groupOfRowKey, rowHighlight, rowOfFormula } from './groups/groupRows';
import { useGroupUi } from './groups/groupUiStore';
import { toggleFormulaSearch, useFormulaSearch } from './search/formulaSearchStore';
import { createObject } from './createObject';
import { DEFAULT_KIND, newObjectChoices } from './newObject';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { highlightedClipIds, selectedFormulaIds } from '../selection';
import { Tabs } from '../Tabs';
import { Icon } from '../timeline/icons';
import { FormulaBlock } from './FormulaBlock';
import { FormulaItem, type FormulaCardProps, type RowHighlight } from './FormulaItem';
import { FormulaSelectionMenu } from './FormulaSelectionMenu';
import { FormulaTooltip } from './FormulaTooltip';
import { KindMenu } from './KindMenu';
import { listPreviewHeights } from './previewSize';
import { PreviewSizeKey, usePreviewScale } from './PreviewSizeKey';
import { boxStyle } from './regionSelect';
import { TemplatesTab } from './templates/TemplatesTab';
import { useTemplatesUi } from './templates/templatesUi';
import { useRegionSelect, type RegionOptions } from './useRegionSelect';
import { otherView, viewToggle } from './viewToggle';
import './creator.css';
import { AudioTab } from './AudioTab';

type CreatorTab = 'formulas' | 'templates' | 'audio';

/** A region over the list (D172) selects the rows and blocks of formulas it touches — not the row
 * of a group, nor the formulas of a closed one, which are not drawn —; a press on any row is the
 * row's own, unless Alt is held. */
const REGION: RegionOptions = {
  cards: '[data-testid="formula-item"], [data-testid="formula-block"]',
  items: '[role="option"]',
  altOnItems: true,
};

/** The row or block of formula `id` in the list, to focus it or bring it into view. */
const formulaItemElement = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-testid="formula-list"] [data-formula-id="${CSS.escape(id)}"]`,
  );
const scrollToFormula = (id: string) =>
  formulaItemElement(id)?.scrollIntoView?.({ block: 'nearest' });
/** The element of a row of the list, by its key: a formula's, or the row of a group. */
const rowElement = (key: string) => {
  const group = groupOfRowKey(key);
  return group === null ? formulaItemElement(key) : groupRowElement(group);
};

export function CreatorPanel() {
  const project = useProjectStore((state) => state.project);
  const libraryFolder = useLibraryStore((state) => state.folder !== null);
  const entries = useRenderStore((state) => state.entries);
  const warnings = useSyncWarnings((state) => state.warnings);
  const selection = useUiStore((state) => state.selection);
  /** The search of formulas is up, in the Preview's place: its button is pressed. */
  const searching = useFormulaSearch((state) => state.open);
  /** The right-click menu of the selected formulas (FormulaSelectionMenu), at a screen position;
   * `groupId` when it was opened on the row of a group, whose own entries it then has too. */
  const [itemMenu, setItemMenu] = useState<{
    x: number;
    y: number;
    groupId?: FormulaGroupId;
  } | null>(null);
  /** The menu of the «+ New ▸» arrow: one entry per kind of object. */
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  const newArrow = useRef<HTMLButtonElement>(null);
  const openNewMenu = () => {
    const rect = newArrow.current!.getBoundingClientRect();
    setNewMenu({ x: rect.left, y: rect.bottom + 2 });
  };
  const [tab, setTab] = useState<CreatorTab>('formulas');
  /** Rows or blocks (R3), an editor preference; one key of the toolbar switches it (D179). */
  const view = usePreferences((state) => state.creatorView);
  const setPreferences = usePreferences((state) => state.set);
  const viewKey = viewToggle(view);
  /** How tall the renderings of the list view are (D173; the block view's are in its tooltip). */
  const previews = listPreviewHeights(usePreviewScale('list'));
  const listRef = useRef<HTMLUListElement>(null);
  /** The columns of the block view, read from its grid (1 in the list view): ↑/↓ move a row. */
  const columns = () =>
    view === 'grid' && listRef.current
      ? getComputedStyle(listRef.current).gridTemplateColumns.split(' ').length
      : 1;
  /** The Templates tab mounts (and loads its library) the first time it opens, then stays. It is
   * there too while one of its lists is asked for from elsewhere — Zen mode's strip opens My
   * templates and Favorites with the tab unseen (D188) —, since the lists are drawn by it. */
  const [templatesOpened, setTemplatesOpened] = useState(false);
  const templatesAsked = useTemplatesUi(
    (state) => state.view !== null || state.using !== null || state.form !== null,
  );
  const openTab = (next: CreatorTab) => {
    if (next === 'templates') setTemplatesOpened(true);
    setTab(next);
  };

  /** The groups of formulas the view has open (groups/). */
  const openGroups = useGroupUi((state) => state.open);
  // The rows of the list: formulas, and groups of formulas with theirs after them (rows in the
  // list view, blocks in the block view).
  const { formulas, formulaGroups } = project;
  const rows = useMemo(
    () => creatorRows({ formulas, formulaGroups }, { open: openGroups }),
    [formulas, formulaGroups, openGroups],
  );
  /** The formulas in the order the list has them: the order of a selection. */
  const order = useMemo(
    () => formulaListOrder({ formulas, formulaGroups }),
    [formulas, formulaGroups],
  );
  const region = useRegionSelect(listRef, order, REGION);

  const linked = useMemo(() => {
    // A selected animation block highlights the formula of its clip, like the clip itself.
    const ids = new Set(highlightedClipIds(selection));
    return new Set(project.clips.filter((c) => ids.has(c.id)).map((c) => c.formulaId));
  }, [selection, project.clips]);

  const selectedIds = new Set(selectedFormulaIds(selection));
  const highlightOf = (id: string): RowHighlight =>
    selectedIds.has(id) ? 'selected' : linked.has(id) ? 'linked' : 'none';
  /** The row a Shift+click range starts from (its key: a formula's id, or a group's row). */
  const anchor = useRef<string | null>(null);
  /** The focused row: the list's tab stop (roving tabindex). */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Bring the formula of a selected clip into view: its row, or the row of its closed group.
  const firstLinked = project.formulas.find((f) => linked.has(f.id))?.id;
  const linkedRow = firstLinked === undefined ? undefined : rowOfFormula(rows, firstLinked)?.key;
  useEffect(() => {
    if (linkedRow !== undefined) rowElement(linkedRow)?.scrollIntoView?.({ block: 'nearest' });
  }, [linkedRow]);

  const create = createObject;

  /** "Use" on a template: the new formula, selected, in view in the Formulas tab. */
  const applyTemplate: ComponentProps<typeof TemplatesTab>['onCreate'] = (template, name) => {
    const id = createFormulaFromTemplate(template, name);
    setTab('formulas');
    requestAnimationFrame(() => scrollToFormula(id));
  };

  // The list's tab stop: the focused row, else the first selected one, else the first.
  const tabStop =
    (focusedId !== null && rows.some((row) => row.key === focusedId) ? focusedId : null) ??
    rows.find((row) => rowHighlight(row, selectedIds, linked) === 'selected')?.key ??
    rows[0]?.key ??
    null;
  const formulasTab = (
    <>
      <div className="creator-toolbar">
        {/* The search is a panel of its own, in the Preview's place (search/). */}
        <button
          type="button"
          className={`icon-btn creator-search-open${searching ? ' is-on' : ''}`}
          data-testid="creator-search-open"
          aria-pressed={searching}
          aria-label="Search formulas"
          title={`Search formulas, by name or LaTeX (${keyHint('Mod+F')})`}
          onClick={toggleFormulaSearch}
        >
          <Icon name="search" />
        </button>
        {/* One key for the view (D179): it shows the other view's icon, and a press switches to
            it (viewToggle.ts); `data-view` is the view shown. */}
        <button
          type="button"
          className="icon-btn creator-view-toggle"
          data-testid="creator-view-toggle"
          data-view={view}
          aria-label={viewKey.label}
          title={viewKey.title}
          onClick={() =>
            setPreferences({ creatorView: otherView(usePreferences.getState().creatorView) })
          }
        >
          <Icon name={viewKey.icon} />
        </button>
        {/* The menu of the kinds (D183): every object of a kind, added to the selection; chosen
            again, taken out of it. Then the key of the size of the previews of the view (D173,
            D183). A line of their own where the panel is too narrow for one. */}
        <div className="creator-kinds-line">
          <KindMenu order={order} />
          <PreviewSizeKey view={view} />
        </div>
        <div className="split-button">
          <button
            type="button"
            className="btn btn-primary split-main"
            onClick={() => create(DEFAULT_KIND)}
            data-testid="creator-new"
            title="Create a formula (the arrow lists every kind of object)"
          >
            + New
          </button>
          <button
            type="button"
            className="btn btn-primary split-arrow"
            data-testid="creator-new-menu"
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
      </div>
      {newMenu && (
        <ContextMenu
          x={newMenu.x}
          y={newMenu.y}
          label="New object"
          testId="creator-new-kinds"
          onClose={() => setNewMenu(null)}
        >
          {newObjectChoices().map((choice) => (
            <MenuItem
              key={choice.id}
              testId={`creator-new-${choice.id}`}
              disabled={choice.kind === null}
              onClick={() => {
                setNewMenu(null);
                if (choice.kind) create(choice.kind);
              }}
            >
              {choice.label}
              {choice.kind === null && <span className="ctx-hint">coming next</span>}
            </MenuItem>
          ))}
        </ContextMenu>
      )}
      <ul
        ref={listRef}
        className={view === 'grid' ? 'formula-grid' : 'formula-list'}
        data-testid="formula-list"
        data-view={view}
        aria-label="Formulas"
        role="listbox"
        aria-multiselectable="true"
        style={{
          ['--row-preview-height' as string]: `${previews.row}px`,
          ['--group-preview-height' as string]: `${previews.group}px`,
        }}
        onPointerDown={region.onPointerDown}
      >
        {rows.map((row) => {
          // A row is selected and walked as what it stands for: a formula, or those of a group.
          const onNavigate = (key: ListKey, modifiers: { shift: boolean; ctrl: boolean }) => {
            const ui = useUiStore.getState();
            const next = navigateRows(ui.selection, row.key, key, modifiers, {
              order,
              rows,
              anchor: anchor.current,
              columns: columns(),
            });
            if (!next) return;
            if (next.selection) ui.select(next.selection);
            anchor.current = next.anchor;
            setFocusedId(next.focus);
            rowElement(next.focus)?.focus();
          };
          const onSelect = (modifiers?: { toggle: boolean; range: boolean }) => {
            const ui = useUiStore.getState();
            ui.select(
              clickRow(ui.selection, row.key, {
                order,
                rows,
                anchor: anchor.current,
                toggle: modifiers?.toggle ?? false,
                range: modifiers?.range ?? false,
              }),
            );
            if (!modifiers?.range) anchor.current = row.key;
          };
          if (row.kind === 'group') {
            const group = {
              row,
              highlight: rowHighlight(row, selectedIds, linked),
              tabStop: row.key === tabStop,
              onFocused: () => setFocusedId(row.key),
              onNavigate,
              onSelect,
              onContextMenu: (event: MouseEvent<HTMLLIElement>) => {
                event.preventDefault();
                // The menu of a group is the menu of its formulas: they are the selection.
                onSelect();
                setItemMenu({ x: event.clientX, y: event.clientY, groupId: row.group.id });
              },
            };
            return view === 'grid' ? (
              <FormulaGroupBlock key={row.key} {...group} />
            ) : (
              <FormulaGroupRow
                key={row.key}
                {...group}
                entries={entries}
                background={project.meta.background}
              />
            );
          }
          const { formula } = row;
          const card: FormulaCardProps = {
            formula,
            formulas: project.formulas,
            entry: entries[formula.id],
            warning: warnings[formula.id],
            highlight: highlightOf(formula.id),
            clipCount: formulaUsage(project, formula.id).clips.length,
            tabStop: formula.id === tabStop,
            groupId: row.group?.id,
            onFocused: () => setFocusedId(formula.id),
            onNavigate,
            onSelect,
            onEdit: () => {
              useUiStore.getState().select({ kind: 'formula', id: formula.id });
              openFormulaEditor(formula.id);
            },
            onContextMenu: (event) => {
              event.preventDefault();
              // A formula outside the selection becomes the selection first.
              if (!selectedIds.has(formula.id)) {
                useUiStore.getState().select({ kind: 'formula', id: formula.id });
                anchor.current = formula.id;
              }
              setItemMenu({ x: event.clientX, y: event.clientY });
            },
            onRename: (name) => renameFormula(formula.id, name),
            onDuplicate: () => duplicateFormula(formula.id),
            onDelete: () => void deleteFormula(formula.id),
            onDismissWarning: () => useSyncWarnings.getState().dismiss(formula.id),
          };
          return view === 'grid' ? (
            <FormulaBlock key={formula.id} {...card} />
          ) : (
            <FormulaItem key={formula.id} {...card} background={project.meta.background} />
          );
        })}
        {/* The rectangle of a region, in the list's content: it scrolls with the rows. */}
        {region.box && (
          <li
            className="marquee-box"
            data-testid="creator-region"
            aria-hidden="true"
            style={boxStyle(region.box)}
          />
        )}
      </ul>
      {/* The list view has the rendering in the row; a block's is in its tooltip. */}
      {view === 'grid' && <FormulaTooltip listRef={listRef} />}
      {project.formulas.length === 0 && (
        <div className="placeholder creator-empty creator-start" data-testid="creator-empty">
          <EmptyArt />
          <p className="creator-start-title">No formulas yet</p>
          <p className="creator-start-hint">
            Press <strong>+ New</strong> to write one, then drag it onto the timeline.
          </p>
          <p className="creator-start-open">
            <Icon name="folder" />
            <span>Or open a project:</span>{' '}
            <span className="creator-start-ways">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void openExample(FIRST_EXAMPLE)}
                data-testid="creator-example"
              >
                Try an example
              </button>
              {libraryFolder ? (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={openProjectsDialog}
                  data-testid="creator-projects"
                >
                  Projects…
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => void syncFolder()}
                  data-testid="creator-sync-folder"
                >
                  Sync folder…
                </button>
              )}
            </span>
          </p>
        </div>
      )}
    </>
  );

  return (
    <PanelFrame
      title="Creator"
      icon="layers"
      testId="panel-creator"
      fold="creator"
      bodyClassName="creator-body"
      // A press in the menu of the kinds, which hangs from the document, comes up through the
      // panel too: it is not one on the panel's background.
      onPointerDown={(event) =>
        clearSelectionOnBackground(event, '.formula-item, .audio-asset, .creator-kinds-pop')
      }
    >
      <Tabs<CreatorTab>
        label="Creator"
        testId="creator"
        active={tab}
        onChange={openTab}
        tabs={[
          { id: 'formulas', label: 'Formulas', icon: 'sigma', content: formulasTab },
          {
            id: 'templates',
            label: 'Templates',
            icon: 'view-grid',
            content:
              templatesOpened || templatesAsked ? <TemplatesTab onCreate={applyTemplate} /> : null,
          },
          { id: 'audio', label: 'Audio', icon: 'waveform', content: <AudioTab /> },
        ]}
      />
      {itemMenu && (
        <FormulaSelectionMenu
          x={itemMenu.x}
          y={itemMenu.y}
          groupId={itemMenu.groupId}
          onClose={() => setItemMenu(null)}
        />
      )}
    </PanelFrame>
  );
}

/** The picture of an empty Formulas tab: a tilted card of glass with a sigma, two more behind
 * it. Drawn by creator.css in the theme's colours; decoration only. */
function EmptyArt() {
  return (
    <span className="creator-art" aria-hidden="true">
      <span className="creator-art-card is-back" />
      <span className="creator-art-card is-middle" />
      <span className="creator-art-card is-front">
        <Icon name="sigma" />
      </span>
    </span>
  );
}
