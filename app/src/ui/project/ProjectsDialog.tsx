/* File → Open… (Ctrl/⌘+O): the projects of the synced folder (D38), with thumbnails of their
 * first formulas; a click opens one. "Sync folder…" (also Ctrl/⌘+Shift+S here) picks the folder
 * (again); "Other file…" is the browser's own file picker. The projects are cards in as many
 * columns as the dialog has room for (D153; `project.css`), and a search field keeps the ones
 * whose name or file name has what is typed (`filterEntries`): it has the focus when the dialog
 * opens over a listed folder, and Escape empties it before it closes the dialog. The star of a
 * card keeps the project among the favorites of its folder (`projectFavorites.ts`), which
 * "Favorites" lists alone; the search looks in what is listed. */
import { useEffect, useState } from 'react';
import { FormulaThumb } from '../creator/FormulaThumb';
import { isMac } from '../platform';
import { SegmentedControl } from '../SegmentedControl';
import { StarIcon } from '../StarIcon';
import { Icon } from '../timeline/icons';
import { openLibraryEntry, openProject } from './actions';
import { useDocumentStore } from './documentStore';
import {
  describeEntry,
  displayFileName,
  filterEntries,
  formatModified,
  type LibraryEntry,
  unopenedTitle,
} from './library';
import {
  closeProjectsDialog,
  refreshLibrary,
  syncFolder,
  useLibraryStore,
  type LibraryFolder,
  type LibraryStatus,
} from './libraryStore';
import { useThumbs } from './libraryThumbs';
import { Modal } from './Modal';
import { ownEscape } from './modalStack';
import { projectFavoritesOf, setProjectFavorite, useProjectFavorites } from './projectFavorites';
import { commandForKey } from './shortcuts';

/** Formulas shown per project. */
const THUMBS = 3;

/** What the dialog lists: every project of the folder, or the starred ones. */
type View = 'all' | 'favorites';

function EntryRow({
  entry,
  current,
  favorite,
  onOpen,
  onFavorite,
}: {
  entry: LibraryEntry;
  current: boolean;
  favorite: boolean;
  onOpen: () => void;
  /** Give the project its star, or take it away. */
  onFavorite: () => void;
}) {
  const thumbs = useThumbs(entry.project, THUMBS, entry.textGeometry);
  const { formulas, meta } = entry.project;
  return (
    <li>
      <button
        type="button"
        className="projects-entry"
        data-testid="projects-entry"
        aria-current={current ? 'true' : undefined}
        title={entry.fileName}
        onClick={onOpen}
      >
        <span className="projects-thumbs" aria-hidden="true">
          {formulas.slice(0, THUMBS).map((formula, i) => (
            <FormulaThumb
              key={formula.id}
              formula={formula}
              resolved={thumbs[i] ?? null}
              background={meta.background}
            />
          ))}
          {formulas.length === 0 && <span className="projects-no-thumbs">no formulas</span>}
        </span>
        <span className="projects-text">
          <span className="projects-title">
            <span className="projects-name" data-testid="projects-entry-name">
              {entry.name}
            </span>
            <span className="projects-file" data-testid="projects-entry-file">
              {displayFileName(entry.fileName)}
            </span>
          </span>
          <span className="projects-details">{describeEntry(entry)}</span>
        </span>
      </button>
      <button
        type="button"
        className="projects-star"
        aria-pressed={favorite}
        aria-label={
          favorite
            ? `Remove “${entry.name}” (${entry.fileName}) from the favorites`
            : `Add “${entry.name}” (${entry.fileName}) to the favorites`
        }
        title={favorite ? 'Remove from the favorites' : 'Add to the favorites'}
        data-testid="projects-star"
        onClick={onFavorite}
      >
        <StarIcon on={favorite} />
      </button>
    </li>
  );
}

/** What the line above the list says about the folder. */
function folderText(folder: LibraryFolder | null, status: LibraryStatus): string {
  if (!folder) {
    return 'No folder synced. Sync a folder once: its projects are listed here and a click opens one.';
  }
  switch (status) {
    case 'loading':
      return `Listing ${folder.name}…`;
    case 'blocked':
      return `The browser did not allow reading ${folder.name}.`;
    case 'missing':
      return `The folder ${folder.name} is no longer there (moved, renamed or deleted).`;
    default:
      return folder.kind === 'snapshot'
        ? `${folder.name}, as of ${formatModified(folder.takenAt)}. Sync the folder again to refresh.`
        : folder.name;
  }
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const { folder, status, entries, unopened, skipped } = useLibraryStore();
  const currentFile = useDocumentStore((state) => state.fileName);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const favorites = useProjectFavorites((state) => state.favorites);
  const starred = projectFavoritesOf(favorites, folder?.name);
  const starredEntries = entries.filter((entry) => starred.has(entry.fileName));
  const listed = filterEntries(view === 'favorites' ? starredEntries : entries, query);

  // The global shortcuts stay quiet under a modal: Sync folder is taken here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || commandForKey(event, isMac()) !== 'sync-folder') return;
      event.preventDefault();
      void syncFolder();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const open = async (entry: LibraryEntry) => {
    if (await openLibraryEntry(entry)) closeProjectsDialog();
  };
  const other = () => {
    closeProjectsDialog();
    void openProject();
  };

  return (
    <Modal
      title="Projects"
      onClose={onClose}
      testId="projects-dialog"
      width="1040px"
      resizable
      footer={
        <>
          <button type="button" className="btn" onClick={other} data-testid="projects-other">
            Other file…
          </button>
          <button type="button" className="btn" onClick={onClose} data-testid="projects-close">
            Close
          </button>
        </>
      }
    >
      <div className="projects-folder">
        <span className="projects-folder-icon" aria-hidden="true">
          <Icon name="folder" />
        </span>
        <p className="projects-folder-text" data-testid="projects-folder">
          {folder && status === 'ready' && <span className="projects-folder-label">Folder </span>}
          {folderText(folder, status)}
        </p>
        {status === 'blocked' && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void refreshLibrary(true)}
            data-testid="projects-allow"
          >
            Allow
          </button>
        )}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void syncFolder()}
          data-testid="projects-sync"
        >
          Sync folder…
        </button>
      </div>
      {entries.length === 0 && status !== 'loading' && (
        <div className="projects-blank">
          <span className="projects-art" aria-hidden="true">
            <Icon name="folder" />
          </span>
          {status === 'ready' && (
            <p className="placeholder projects-empty" data-testid="projects-empty">
              {unopened.length > 0
                ? `No project of ${folder?.name} opens here.`
                : `No projects in ${folder?.name}.`}
            </p>
          )}
        </div>
      )}
      {entries.length > 0 && (
        <div className="projects-library">
          <div className="projects-tools">
            <span className="projects-search">
              <Icon name="search" />
              <input
                type="search"
                placeholder="Search by name or file…"
                aria-label="Search projects"
                data-testid="projects-search"
                data-autofocus=""
                value={query}
                {...ownEscape(query !== '')}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Escape empties the search first; with nothing to empty it closes the dialog.
                  if (event.key === 'Escape' && query) {
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery('');
                  }
                }}
              />
            </span>
            <SegmentedControl<View>
              label="Show"
              value={view}
              options={[
                {
                  value: 'all',
                  label: (
                    <>
                      All <span className="projects-count">{entries.length}</span>
                    </>
                  ),
                  title: 'All the projects of the folder',
                },
                {
                  value: 'favorites',
                  label: (
                    <>
                      <StarIcon on /> Favorites{' '}
                      <span className="projects-count">{starredEntries.length}</span>
                    </>
                  ),
                  title: 'The projects with a star',
                },
              ]}
              onChange={setView}
              testId="projects-view"
            />
          </div>
          {listed.length > 0 ? (
            <ul className="projects-list" data-testid="projects-list">
              {listed.map((entry) => (
                <EntryRow
                  key={entry.fileName}
                  entry={entry}
                  current={entry.fileName === currentFile}
                  favorite={starred.has(entry.fileName)}
                  onOpen={() => void open(entry)}
                  onFavorite={() => {
                    if (folder) {
                      setProjectFavorite(folder.name, entry.fileName, !starred.has(entry.fileName));
                    }
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="placeholder projects-none" data-testid="projects-none">
              {view === 'favorites' && starredEntries.length === 0
                ? 'No favorites yet. The star on a project keeps it here.'
                : `No ${view === 'favorites' ? 'favorite' : 'project'} matches “${query.trim()}”.`}
            </p>
          )}
        </div>
      )}
      {status === 'ready' && unopened.length > 0 && (
        <div className="projects-unopened" data-testid="projects-unopened">
          <p className="projects-unopened-title">{unopenedTitle(unopened.length)}</p>
          <ul>
            {unopened.map((file) => (
              <li key={file.fileName} data-testid="projects-unopened-file">
                <span className="projects-unopened-name">{file.fileName}</span>
                <span className="projects-unopened-reason">{file.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status === 'ready' && skipped > 0 && (
        <p className="placeholder projects-skipped" data-testid="projects-skipped">
          {skipped === 1
            ? 'One other .json file in the folder is not a project.'
            : `${skipped} other .json files in the folder are not projects.`}
        </p>
      )}
    </Modal>
  );
}
