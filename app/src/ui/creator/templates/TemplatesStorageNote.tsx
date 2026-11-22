import { hasDirectoryPicker } from '../../project/files';
import { refreshLibrary } from '../../project/libraryStore';
import { TEMPLATES_PATH, templatesFolder, useTemplatesFolder } from './templatesFolder';
import { useTemplateLibrary } from './userLibraryStore';

/** Where the user's templates are kept, under their list: in this browser, and in the synced
 * folder when there is one and the browser may write it — with what is wrong, when something
 * is, and the button that tries again. */
export function TemplatesStorageNote() {
  const warnings = useTemplateLibrary((s) => s.warnings);
  /** Nothing to keep yet: no file is made in the folder for an empty library. */
  const empty = useTemplateLibrary(
    (s) => s.library.templates.length + s.library.favorites.length === 0,
  );
  const folder = useTemplatesFolder();
  const name = folder.folderName ? `“${folder.folderName}”` : 'the synced folder';
  const retry = () => {
    // The folder listed again (its file read), then written, asking the browser if need be.
    void refreshLibrary(true).then(() => templatesFolder.writeNow());
  };

  let text: string;
  let action: string | null = null;
  if (folder.status === 'synced') {
    text = empty
      ? `They will be kept in this browser and in ${TEMPLATES_PATH} of the folder ${name}.`
      : `Kept in this browser and in ${TEMPLATES_PATH} of the folder ${name}.`;
  } else if (folder.status === 'pending') {
    text = `Kept in this browser. The copy in the folder ${name} is older.`;
    action = 'Write to the folder';
  } else if (folder.status === 'denied') {
    text = `Kept in this browser only: the browser was told not to write to the folder ${name}.`;
    action = 'Try again';
  } else if (folder.status === 'failed') {
    text = `Kept in this browser only. ${folder.message ?? ''}`;
    action = 'Try again';
  } else if (hasDirectoryPicker()) {
    text = `Kept in this browser. With a synced folder (File ▸ Sync folder…) they are also kept in its ${TEMPLATES_PATH}.`;
  } else {
    text =
      'Kept in this browser only: it cannot keep them in a folder. Export takes them elsewhere.';
  }

  return (
    <div className="template-storage" data-testid="template-storage" data-status={folder.status}>
      {warnings.map((warning) => (
        <p key={warning} className="template-storage-warning" role="alert">
          {warning}
        </p>
      ))}
      <p>
        {text}
        {action && (
          <button
            type="button"
            className="btn btn-small"
            data-testid="template-storage-retry"
            onClick={retry}
          >
            {action}
          </button>
        )}
      </p>
    </div>
  );
}
