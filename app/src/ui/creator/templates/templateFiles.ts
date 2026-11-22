/* The user's templates as a file to take elsewhere (D121): Export downloads the library, or the
 * chosen templates of it, as a templates file; Import reads one and adds what it holds — asking
 * first when a template of the file is one of the library's with other content. */
import { showDialog } from '../../project/dialogStore';
import { downloadText } from '../../project/files';
import { notify } from '../../project/noticeStore';
import { libraryOf, planImport, readLibrary, serializeLibrary } from './userLibrary';
import { useTemplateLibrary } from './userLibraryStore';

export const TEMPLATES_EXPORT_NAME = 'mfe-templates.json';

/** How many names of clashing templates the question lists. */
const NAMED = 8;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Download the library, or only its templates `ids` (with their stars), as a file. */
export function exportTemplates(ids?: readonly string[]): void {
  const { library } = useTemplateLibrary.getState();
  downloadText(TEMPLATES_EXPORT_NAME, serializeLibrary(ids ? libraryOf(library, ids) : library));
}

/** Ask for a templates file with a throw-away file input; null when the dialog is cancelled. */
export function pickTemplatesFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.setAttribute('data-testid', 'templates-import-input');
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Add the templates and the stars of `file` to the library. A template of the file that the
 * library has with other content is asked about: replace the library's, keep both, or leave the
 * library's. Says what was done; resolves to whether the library took anything in. */
export async function importTemplatesFile(file: Pick<File, 'name' | 'text'>): Promise<boolean> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    notify({
      kind: 'error',
      title: `Could not read ${file.name}`,
      details: [String(error)],
    });
    return false;
  }
  const read = readLibrary(text);
  if (!read.ok) {
    notify({ kind: 'error', title: `Could not import ${file.name}`, message: read.message });
    return false;
  }
  const store = useTemplateLibrary.getState();
  const plan = planImport(store.library, read.library);
  const stars = plan.favorites.filter((id) => !store.library.favorites.includes(id)).length;
  const leftOut =
    read.skipped > 0
      ? [`${count(read.skipped, 'entry', 'entries')} of the file left out: not a template.`]
      : [];
  if (plan.fresh.length + plan.clashes.length + stars === 0) {
    notify({
      kind: 'info',
      title: 'Nothing to import',
      message:
        plan.same > 0
          ? `Your library has the ${count(plan.same, 'template')} of ${file.name} already.`
          : `${file.name} holds no templates.`,
      details: leftOut,
    });
    return false;
  }
  let clashes: 'replace' | 'copy' | 'skip' = 'skip';
  if (plan.clashes.length > 0) {
    const names = plan.clashes.map((t) => t.name);
    const answer = await showDialog({
      title: 'Some templates are already in your library',
      message: `${count(plan.clashes.length, 'template')} of ${file.name} ${
        plan.clashes.length === 1 ? 'is' : 'are'
      } in your library with other content:`,
      details: [
        ...names.slice(0, NAMED),
        ...(names.length > NAMED ? [`and ${names.length - NAMED} more`] : []),
      ],
      cancelId: 'cancel',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'skip', label: 'Keep mine' },
        { id: 'copy', label: 'Keep both' },
        { id: 'replace', label: 'Replace mine', tone: 'primary' },
      ],
    });
    if (answer !== 'skip' && answer !== 'copy' && answer !== 'replace') return false;
    clashes = answer;
  }
  try {
    await store.importLibrary(plan, clashes);
  } catch (error) {
    notify({
      kind: 'error',
      title: `Could not import ${file.name}`,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  const added = plan.fresh.length + (clashes === 'copy' ? plan.clashes.length : 0);
  const done = [
    ...(added > 0 ? [`${count(added, 'template')} added`] : []),
    ...(clashes === 'replace' ? [`${count(plan.clashes.length, 'template')} replaced`] : []),
    ...(stars > 0 ? [`${count(stars, 'favorite')} added`] : []),
  ];
  notify({
    kind: 'info',
    title: `Imported ${file.name}`,
    message: done.length > 0 ? `${done.join(', ')}.` : 'Your library stays as it was.',
    details: [
      ...(clashes === 'skip' && plan.clashes.length > 0
        ? [
            `${count(plan.clashes.length, 'template')} of yours kept as ${
              plan.clashes.length === 1 ? 'it was' : 'they were'
            }.`,
          ]
        : []),
      ...(plan.same > 0
        ? [`${count(plan.same, 'template')} ${plan.same === 1 ? 'was' : 'were'} there already.`]
        : []),
      ...leftOut,
    ],
  });
  return true;
}
