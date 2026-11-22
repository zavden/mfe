/* The Templates tab of the Creator: formulas to start from. Its entries open pop-ups — the
 * templates that come with the editor, the user's own, the form that writes one (TemplateForm),
 * the favourites (TemplateBrowser) — and "Use" on a template adds a formula to the project: at
 * once when the template has no placeholders, else after its values were given
 * (UseTemplateDialog). It mounts the first time the tab opens.
 *
 * The pop-ups are drawn in the document's body, not in the panel: the panel is a size container,
 * which in some browsers holds what is fixed inside it. They go in a layer put before the app,
 * so that a question the app asks (DialogHost: "Discard this template?") comes over the pop-up
 * that asked it, whatever the level of that pop-up. */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../timeline/icons';
import { StarIcon } from '../../StarIcon';
import { templateLatex, templateLibrary, type TemplateLibrary } from './library';
import {
  templateCounts,
  VIEW_TITLES,
  type ListedTemplate,
  type TemplateView,
} from './templateList';
import { TemplateBrowser } from './TemplateBrowser';
import { TemplateForm } from './TemplateForm';
import { useTemplatesUi } from './templatesUi';
import { UseTemplateDialog } from './UseTemplateDialog';
import { useTemplateLibrary } from './userLibraryStore';
import './templates.css';

/** The library, or why it could not be read (malformed data: the unit tests guard against it). */
function readLibrary(): { library: TemplateLibrary } | { error: string } {
  try {
    return { library: templateLibrary() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

interface TemplatesTabProps {
  /** Add a formula to the project: the LaTeX and packages of `template`, under `formulaName` or
   * else a name made from the template's. */
  onCreate(
    template: { name: string; latex: string; packages: readonly string[] },
    formulaName?: string,
  ): void;
}

const many = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** The layer of the body the pop-ups are drawn in, made the first time it is asked for. */
function dialogLayer(): HTMLElement {
  const known = document.getElementById('template-dialogs');
  if (known) return known;
  const layer = document.createElement('div');
  layer.id = 'template-dialogs';
  document.body.prepend(layer);
  return layer;
}

/** An entry of the tab: what it is called, and what it opens. */
interface Entry {
  key: TemplateView | 'create';
  title: string;
  icon: ReactNode;
  hint: string;
  open(): void;
}

export function TemplatesTab({ onCreate }: TemplatesTabProps) {
  const [read] = useState(readLibrary);
  const [layer] = useState(dialogLayer);
  const user = useTemplateLibrary((s) => s.library);
  const view = useTemplatesUi((s) => s.view);
  const using = useTemplatesUi((s) => s.using);
  const form = useTemplatesUi((s) => s.form);
  const ui = useTemplatesUi.getState();

  if (!('library' in read)) {
    return (
      <p className="placeholder creator-empty" data-testid="template-error">
        Could not read the templates: {read.error}
      </p>
    );
  }
  const { library } = read;
  const counts = templateCounts(library, user);

  const onUse = (template: ListedTemplate) => {
    if (template.placeholders.length > 0) return ui.use(template);
    ui.closeAll();
    onCreate({ ...template, latex: templateLatex(template) });
  };

  const list = (entry: TemplateView, icon: ReactNode, hint: string): Entry => ({
    key: entry,
    title: VIEW_TITLES[entry],
    icon,
    hint,
    open: () => ui.open(entry),
  });
  const entries: Entry[] = [
    list(
      'default',
      <Icon name="view-grid" />,
      `${counts.default} formulas, from high school to university`,
    ),
    list(
      'mine',
      <Icon name="folder" />,
      counts.mine > 0
        ? `${many(counts.mine, 'template')} of your own`
        : 'None yet: create one, or save a copy of a default one',
    ),
    {
      key: 'create',
      title: 'Create template',
      icon: <Icon name="plus" />,
      hint: 'Write a formula with #1, #2… where a value goes',
      open: () => ui.write(null),
    },
    list(
      'favorites',
      <StarIcon />,
      counts.favorites > 0
        ? `${many(counts.favorites, 'template')} with a star`
        : 'A star on a template keeps it here',
    ),
  ];

  return (
    <>
      <div className="template-entries" data-testid="template-entries">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="template-entry"
            data-testid={`templates-open-${entry.key}`}
            aria-haspopup="dialog"
            onClick={entry.open}
          >
            <span className="template-entry-icon">{entry.icon}</span>
            <span className="template-entry-text">
              <span className="template-entry-title">{entry.title}</span>
              <span className="template-entry-hint">{entry.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {createPortal(
        <>
          {view && (
            <TemplateBrowser view={view} library={library} onClose={ui.close} onUse={onUse} />
          )}
          {using && (
            <UseTemplateDialog
              template={using}
              level={view ? 'top' : 'base'}
              onClose={ui.close}
              onCreate={(formula) => {
                ui.closeAll();
                onCreate({ ...using, latex: formula.latex }, formula.name);
              }}
            />
          )}
          {form && (
            <TemplateForm
              editing={form.editing}
              level={view ? 'top' : 'base'}
              library={library}
              onClose={ui.close}
              onSaved={() => {
                // Back to the list it was opened from; written from the tab, to the list it is in.
                ui.close();
                if (!view) ui.open('mine');
              }}
            />
          )}
        </>,
        layer,
      )}
    </>
  );
}
