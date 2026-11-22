/* The search of formulas (D131): a panel in the Preview's place — over it: the Preview stays
 * mounted underneath and keeps its view — that the magnifier of the Creator and Ctrl/⌘+F open. A
 * field (what is typed is looked for in names and sources), a tab per kind of object with the
 * number it finds, and the results of the tab as cards with their rendering (SearchResultCard).
 * A result is a card of the Creator list in what it does: a click selects it (Ctrl/⌘ and Shift
 * for several), a double-click or Enter opens its editor, a right-click the menu of the selected
 * formulas (FormulaSelectionMenu), and it is dragged onto the timeline. A rectangle dragged from
 * the empty space of the results selects the cards it touches (Shift: adds them, Ctrl/⌘: takes
 * them out; ../useRegionSelect.ts, which the Creator's list uses too). It is no dialog: the rest
 * of the app stays in use, and the search stays where it is until its button or Escape closes
 * it. `formulaSearch.ts` says what matches; `formulaSearchStore.ts` keeps the tab and the text. */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { formulaListOrder } from '../../../model';
import { useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { rovingIndex } from '../../focus';
import { highlightedClipIds, selectedFormulaIds } from '../../selection';
import { Icon } from '../../timeline/icons';
import { formulaUsage } from '../formulaActions';
import { openFormulaEditor } from '../formulaEditorStore';
import type { RowHighlight } from '../FormulaItem';
import { clickRow, navigateRows, type ListKey, type ListRow } from '../formulaSelection';
import { FormulaSelectionMenu } from '../FormulaSelectionMenu';
import { boxStyle } from '../regionSelect';
import { useRegionSelect, type RegionOptions } from '../useRegionSelect';
import { emptyMessage, searchFormulas, SEARCH_TABS, type SearchTab } from './formulaSearch';
import { closeFormulaSearch, returnSearchFocus, useFormulaSearch } from './formulaSearchStore';
import { SearchResultCard } from './SearchResultCard';
import { useFormulaSearchKeys } from './useFormulaSearchKeys';
import './search.css';

/** A result card, by the formula it shows (`data-formula-id`): what a region selects, and the one
 * thing of the results whose press is its own. */
const CARD = '[data-testid="formula-search-result"]';
const REGION: RegionOptions = { cards: CARD, items: CARD };

/** The search, while it is open: mounted beside the Preview panel, which it covers. */
export function FormulaSearchPanel() {
  const open = useFormulaSearch((state) => state.open);
  // Closed: the focus the panel had goes back to what had it before (the Preview, under the
  // panel, takes the focus again only once the panel is gone).
  useEffect(() => {
    if (!open) returnSearchFocus();
  }, [open]);
  return open ? <SearchPanel /> : null;
}

function SearchPanel() {
  const project = useProjectStore((state) => state.project);
  const entries = useRenderStore((state) => state.entries);
  const selection = useUiStore((state) => state.selection);
  const tab = useFormulaSearch((state) => state.tab);
  const query = useFormulaSearch((state) => state.query);
  const requests = useFormulaSearch((state) => state.requests);
  const { setTab, setQuery } = useFormulaSearch.getState();
  const base = useId();
  const field = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** The scrolling area of the results: a region dragged on its empty space selects cards. */
  const resultsRef = useRef<HTMLDivElement>(null);
  const tabButtons = useRef(new Map<SearchTab, HTMLButtonElement>());
  /** The menu of the selected formulas, at a screen position. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** The result a Shift+click range starts from. */
  const anchor = useRef<string | null>(null);
  /** The focused result: the results' tab stop (roving tabindex). */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useFormulaSearchKeys();

  // Each request for the search — the one that opened it too — is for its field, with what was
  // typed before selected: typing replaces it.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [requests]);

  const { formulas, formulaGroups } = project;
  const results = useMemo(
    () => searchFormulas({ formulas, formulaGroups }, query),
    [formulas, formulaGroups, query],
  );
  /** The formulas in the order the Creator list has them: the order of a selection. */
  const order = useMemo(
    () => formulaListOrder({ formulas, formulaGroups }),
    [formulas, formulaGroups],
  );
  const region = useRegionSelect(resultsRef, order, REGION);
  const shown = results[tab];
  const rows = useMemo<ListRow[]>(
    () => shown.map(({ formula }) => ({ key: formula.id, ids: [formula.id] })),
    [shown],
  );
  /** The columns of the grid of results, read from it: ↑/↓ move a row. */
  const columns = () =>
    listRef.current ? getComputedStyle(listRef.current).gridTemplateColumns.split(' ').length : 1;

  const linked = useMemo(() => {
    // A selected clip (or a block of it) marks its formula, as in the Creator list.
    const ids = new Set(highlightedClipIds(selection));
    return new Set(project.clips.filter((c) => ids.has(c.id)).map((c) => c.formulaId));
  }, [selection, project.clips]);
  const selectedIds = new Set(selectedFormulaIds(selection));
  const highlightOf = (id: string): RowHighlight =>
    selectedIds.has(id) ? 'selected' : linked.has(id) ? 'linked' : 'none';

  // The results' tab stop: the focused one, else the first selected, else the first.
  const tabStop =
    (focusedId !== null && rows.some((row) => row.key === focusedId) ? focusedId : null) ??
    rows.find((row) => selectedIds.has(row.key))?.key ??
    rows[0]?.key ??
    null;

  const onTabKey = (event: KeyboardEvent) => {
    const index = SEARCH_TABS.findIndex((entry) => entry.id === tab);
    const next = rovingIndex(event.key, index, SEARCH_TABS.length, 'horizontal');
    if (next === null) return;
    event.preventDefault();
    const { id } = SEARCH_TABS[next]!;
    setTab(id);
    tabButtons.current.get(id)?.focus();
  };

  const message = emptyMessage(project, tab, results, query);

  return (
    <section
      className="panel-frame formula-search"
      data-testid="formula-search"
      data-formula-search=""
      aria-label="Search formulas"
    >
      <header className="panel-header">
        <span className="panel-icon">
          <Icon name="search" />
        </span>
        <h2 className="panel-title">Search</h2>
        <button
          type="button"
          className="formula-search-close"
          data-testid="formula-search-close"
          aria-label="Close the search"
          title="Close the search: the Preview is back (Esc)"
          onClick={closeFormulaSearch}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="panel-body formula-search-body">
        <div className="formula-search-bar">
          <span className="creator-search-field">
            <Icon name="search" />
            <input
              ref={field}
              type="search"
              placeholder="Search name or LaTeX…"
              aria-label="Search formulas"
              data-testid="formula-search-input"
              value={query}
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </div>
        <div
          className="tabs-list formula-search-tabs"
          role="tablist"
          aria-label="Kind of object"
          onKeyDown={onTabKey}
        >
          {SEARCH_TABS.map((entry) => {
            const active = entry.id === tab;
            const count = results[entry.id].length;
            return (
              <button
                key={entry.id}
                ref={(element) => {
                  if (element) tabButtons.current.set(entry.id, element);
                  else tabButtons.current.delete(entry.id);
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${entry.id}`}
                aria-selected={active}
                aria-controls={`${base}-results`}
                aria-label={`${entry.label}, ${count} found`}
                tabIndex={active ? 0 : -1}
                className={active ? 'tabs-tab is-active' : 'tabs-tab'}
                data-testid={`formula-search-tab-${entry.id}`}
                data-count={count}
                onClick={() => setTab(entry.id)}
              >
                <span className="tabs-tab-label">{entry.label}</span>
                <span className="formula-search-count" data-testid="formula-search-count">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div
          ref={resultsRef}
          className="formula-search-results"
          role="tabpanel"
          id={`${base}-results`}
          aria-labelledby={`${base}-tab-${tab}`}
          data-testid="formula-search-results"
          data-tab={tab}
          onPointerDown={region.onPointerDown}
        >
          {region.box && (
            <div
              className="marquee-box"
              data-testid="formula-search-region"
              style={boxStyle(region.box)}
            />
          )}
          {message !== null ? (
            <p className="placeholder formula-search-empty" data-testid="formula-search-empty">
              {message}
            </p>
          ) : (
            <ul
              ref={listRef}
              className="formula-search-grid"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Results"
            >
              {shown.map(({ formula, group }) => {
                const onSelect = (modifiers?: { toggle: boolean; range: boolean }) => {
                  const ui = useUiStore.getState();
                  ui.select(
                    clickRow(ui.selection, formula.id, {
                      order,
                      rows,
                      anchor: anchor.current,
                      toggle: modifiers?.toggle ?? false,
                      range: modifiers?.range ?? false,
                    }),
                  );
                  if (!modifiers?.range) anchor.current = formula.id;
                };
                const onNavigate = (key: ListKey, modifiers: { shift: boolean; ctrl: boolean }) => {
                  const ui = useUiStore.getState();
                  const next = navigateRows(ui.selection, formula.id, key, modifiers, {
                    order,
                    rows,
                    anchor: anchor.current,
                    columns: columns(),
                  });
                  if (!next) return;
                  if (next.selection) ui.select(next.selection);
                  anchor.current = next.anchor;
                  setFocusedId(next.focus);
                  listRef.current
                    ?.querySelector<HTMLElement>(`[data-formula-id="${CSS.escape(next.focus)}"]`)
                    ?.focus();
                };
                return (
                  <SearchResultCard
                    key={formula.id}
                    formula={formula}
                    group={group}
                    entry={entries[formula.id]}
                    background={project.meta.background}
                    highlight={highlightOf(formula.id)}
                    clipCount={formulaUsage(project, formula.id).clips.length}
                    tabStop={formula.id === tabStop}
                    onSelect={onSelect}
                    onNavigate={onNavigate}
                    onFocused={() => setFocusedId(formula.id)}
                    onEdit={() => {
                      useUiStore.getState().select({ kind: 'formula', id: formula.id });
                      openFormulaEditor(formula.id);
                    }}
                    onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
                      event.preventDefault();
                      // A result outside the selection becomes the selection first.
                      if (!selectedIds.has(formula.id)) {
                        useUiStore.getState().select({ kind: 'formula', id: formula.id });
                        anchor.current = formula.id;
                      }
                      setMenu({ x: event.clientX, y: event.clientY });
                    }}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {menu && <FormulaSelectionMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </section>
  );
}
