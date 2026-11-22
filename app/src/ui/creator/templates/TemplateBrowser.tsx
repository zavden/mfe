/* A pop-up of the Templates tab: the templates that come with the editor, the user's own, or the
 * favourites among both — searched and filtered, under the headings of their categories, each
 * drawn with the default values of its placeholders. "Use" (or a double-click) goes on to the
 * template's values; the star keeps a template among the favourites. The editor's templates
 * cannot be changed: "Save a copy" puts one among the user's, which can. */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../../store';
import { DELETE_HOLD_MS, showDialog } from '../../project/dialogStore';
import { Modal } from '../../project/Modal';
import { ownEscape } from '../../project/modalStack';
import { notify } from '../../project/noticeStore';
import { StarIcon } from '../../StarIcon';
import { Icon } from '../../timeline/icons';
import {
  LEVEL_LABELS,
  TEMPLATE_LEVELS,
  templateLatex,
  type TemplateLevel,
  type TemplateLibrary,
} from './library';
import {
  browserSections,
  categoriesOf,
  viewItems,
  VIEW_TITLES,
  type BrowserItem,
  type ListedTemplate,
  type TemplateView,
} from './templateList';
import { exportTemplates, importTemplatesFile, pickTemplatesFile } from './templateFiles';
import { TemplatesStorageNote } from './TemplatesStorageNote';
import { useTemplatesUi } from './templatesUi';
import { TemplateThumb } from './TemplateThumb';
import { fieldsOf } from './userLibrary';
import { useTemplateLibrary } from './userLibraryStore';
import './templates.css';

interface TemplateBrowserProps {
  view: TemplateView;
  library: TemplateLibrary;
  onClose(): void;
  /** Go on to make a formula of `template`. */
  onUse(template: ListedTemplate): void;
}

const EMPTY: Readonly<Record<TemplateView, string>> = {
  default: '',
  mine: 'You have no templates of your own yet. New template writes one, “Save a copy” on a default template puts it here, and Import… reads a templates file.',
  favorites: 'No favorites yet. The star on a template keeps it here.',
};

/** Say what went wrong with a change to the library; the pop-up stays as it was. */
const failed = (title: string) => (error: unknown) => {
  notify({ kind: 'error', title, message: error instanceof Error ? error.message : String(error) });
};

export function TemplateBrowser({ view, library, onClose, onUse }: TemplateBrowserProps) {
  const background = useProjectStore((s) => s.project.meta.background);
  const user = useTemplateLibrary((s) => s.library);
  const store = useTemplateLibrary.getState();
  const filter = useTemplatesUi((s) => s.filters[view]);
  const setFilter = useTemplatesUi((s) => s.setFilter);
  /** The user's templates ticked for an export. */
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo(() => viewItems(view, library, user), [view, library, user]);
  const categories = useMemo(() => categoriesOf(items, library), [items, library]);
  // A category that left the list (its last template deleted) filters nothing any more.
  const category =
    filter.category !== null && categories.includes(filter.category) ? filter.category : null;
  const level = view === 'default' ? filter.level : null;
  const sections = useMemo(
    () => browserSections(items, { query: filter.query, category, level }, library),
    [items, filter.query, category, level, library],
  );
  const shown = sections.reduce((n, section) => n + section.items.length, 0);
  const selected = user.templates.filter((t) => ticked.has(t.id)).map((t) => t.id);

  // A new search or filter starts at the top of the list.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: 0 });
  }, [filter.query, category, level]);

  const saveCopy = (item: BrowserItem) => {
    store
      .createTemplate(fieldsOf(item.template))
      .then(() =>
        notify({
          kind: 'info',
          title: `“${item.template.name}” is now among your templates`,
          message: 'The copy is yours to change.',
          action: {
            label: 'Open My templates',
            run: () => useTemplatesUi.getState().open('mine'),
          },
        }),
      )
      .catch(failed(`Could not copy “${item.template.name}”`));
  };

  const remove = async (item: BrowserItem) => {
    const answer = await showDialog({
      title: `Delete the template “${item.template.name}”?`,
      message: 'It is deleted from your templates for good. Formulas made from it stay.',
      cancelId: 'cancel',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'confirm', label: 'Delete', tone: 'danger', holdMs: DELETE_HOLD_MS },
      ],
    });
    if (answer !== 'confirm') return;
    store.removeTemplates([item.id]).catch(failed(`Could not delete “${item.template.name}”`));
  };

  const importFile = async () => {
    const file = await pickTemplatesFile();
    if (file) await importTemplatesFile(file);
  };

  const tick = (id: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };

  return (
    <Modal
      title={VIEW_TITLES[view]}
      onClose={onClose}
      testId="templates-dialog"
      width="min(1040px, calc(100vw - 32px))"
      resizable
      sizeKey={`templates-${view}`}
      footer={view === 'mine' ? <TemplatesStorageNote /> : undefined}
    >
      <div className="template-browser" data-testid="template-browser" data-view={view}>
        <div className="template-browser-tools">
          <span className="creator-search-field">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search templates…"
              aria-label="Search templates"
              data-testid="template-search"
              value={filter.query}
              {...ownEscape(filter.query !== '')}
              onChange={(event) => setFilter(view, { query: event.target.value })}
              onKeyDown={(event) => {
                // Escape empties the search first; with nothing to empty it closes the pop-up.
                if (event.key === 'Escape' && filter.query) {
                  event.preventDefault();
                  event.stopPropagation();
                  setFilter(view, { query: '' });
                }
              }}
            />
          </span>
          {(view === 'default' || categories.length > 1) && (
            <select
              aria-label="Category"
              data-testid="template-category"
              value={category ?? ''}
              onChange={(event) => setFilter(view, { category: event.target.value || null })}
            >
              <option value="">All categories</option>
              {categories.map((name) => (
                <option
                  key={name}
                  value={name}
                  title={library.categories.find((c) => c.name === name)?.description}
                >
                  {name}
                </option>
              ))}
            </select>
          )}
          {view === 'default' && (
            <select
              aria-label="Level"
              data-testid="template-level"
              value={level ?? ''}
              onChange={(event) =>
                setFilter(view, { level: (event.target.value || null) as TemplateLevel | null })
              }
            >
              <option value="">All levels</option>
              {TEMPLATE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          )}
          <span className="template-count" data-testid="template-count">
            {shown === items.length ? `${items.length}` : `${shown} of ${items.length}`}
          </span>
          {view === 'mine' && (
            <span className="template-browser-files">
              <button
                type="button"
                className="btn btn-small btn-primary"
                data-testid="templates-new"
                title="Write a template of your own"
                onClick={() => useTemplatesUi.getState().write(null)}
              >
                New template
              </button>
              <button
                type="button"
                className="btn btn-small"
                data-testid="templates-import"
                title="Add the templates of a templates file to yours"
                onClick={() => void importFile()}
              >
                Import…
              </button>
              <button
                type="button"
                className="btn btn-small"
                data-testid="templates-export"
                disabled={user.templates.length === 0}
                title={
                  selected.length > 0
                    ? 'Download the ticked templates as a templates file'
                    : 'Download your templates and your favorites as a templates file'
                }
                onClick={() => exportTemplates(selected.length > 0 ? selected : undefined)}
              >
                {selected.length > 0 ? `Export ${selected.length} selected` : 'Export all'}
              </button>
            </span>
          )}
        </div>
        <ul
          ref={listRef}
          className="template-list"
          data-testid="template-list"
          aria-label={VIEW_TITLES[view]}
        >
          {sections.map((section) => (
            <Fragment key={section.heading}>
              <li className="template-heading" aria-hidden="true">
                {section.heading}
              </li>
              {section.items.map((item) => {
                const { template } = item;
                return (
                  <li
                    key={item.id}
                    className="template-item"
                    data-testid="template-item"
                    data-template-id={item.id}
                    data-origin={item.origin}
                    title={templateLatex(template)}
                    onDoubleClick={(event) => {
                      // On the card, not on one of its controls.
                      if (!(event.target as Element).closest('button, input')) onUse(template);
                    }}
                  >
                    <div className="template-row">
                      {view === 'mine' && (
                        <input
                          type="checkbox"
                          aria-label={`Select “${template.name}” for an export`}
                          data-testid="template-select"
                          checked={ticked.has(item.id)}
                          onChange={(event) => tick(item.id, event.target.checked)}
                        />
                      )}
                      <span className="template-name">{template.name}</span>
                      {template.level && (
                        <span className={`badge template-level is-${template.level}`}>
                          {LEVEL_LABELS[template.level]}
                        </span>
                      )}
                      {view === 'favorites' && item.origin === 'user' && (
                        <span className="badge template-level">Mine</span>
                      )}
                      <button
                        type="button"
                        className="template-star"
                        aria-pressed={item.favorite}
                        aria-label={
                          item.favorite
                            ? `Remove “${template.name}” from the favorites`
                            : `Add “${template.name}” to the favorites`
                        }
                        title={item.favorite ? 'Remove from the favorites' : 'Add to the favorites'}
                        data-testid="template-star"
                        onClick={() =>
                          void store
                            .setFavorite(item.id, !item.favorite)
                            .catch(failed('Could not change the favorites'))
                        }
                      >
                        <StarIcon on={item.favorite} />
                      </button>
                    </div>
                    <TemplateThumb template={template} background={background} />
                    {template.description && (
                      <p className="template-description">{template.description}</p>
                    )}
                    <div className="template-actions">
                      <button
                        type="button"
                        className="btn btn-small template-use"
                        data-testid="template-use"
                        title={`Make a formula of “${template.name}”`}
                        onClick={() => onUse(template)}
                      >
                        Use
                      </button>
                      {view === 'default' && (
                        <button
                          type="button"
                          className="btn btn-small"
                          data-testid="template-copy"
                          title="Put a copy among your templates, to change it there"
                          onClick={() => saveCopy(item)}
                        >
                          Save a copy
                        </button>
                      )}
                      {view === 'mine' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-small"
                            data-testid="template-edit"
                            onClick={() => {
                              const own = user.templates.find((t) => t.id === item.id);
                              if (own) useTemplatesUi.getState().write(own);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            data-testid="template-duplicate"
                            onClick={() =>
                              void store
                                .duplicateTemplate(item.id)
                                .catch(failed(`Could not duplicate “${template.name}”`))
                            }
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            data-testid="template-delete"
                            onClick={() => void remove(item)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </Fragment>
          ))}
          {shown === 0 && (
            <li
              className="placeholder creator-empty template-none"
              data-testid={items.length === 0 ? 'template-empty' : 'template-none'}
            >
              {items.length === 0 ? EMPTY[view] : 'No template matches the search.'}
            </li>
          )}
        </ul>
      </div>
    </Modal>
  );
}
