/* "Create template", and "Edit" on one of the user's: a template written as LaTeX, with `#1`,
 * `#2`… where a value goes. Each number of the text gets a row for its default value and what
 * to call it, and the formula those values make is drawn as it is written. Saved, it is one of
 * the user's templates. */
import { Fragment, useId, useMemo, useState } from 'react';
import { useProjectStore } from '../../../store';
import { showDialog } from '../../project/dialogStore';
import { Modal } from '../../project/Modal';
import { PackagePicker } from '../PackagePicker';
import type { TemplateLibrary } from './library';
import { defaultValues, instantiateTemplate, placeholderRows } from './placeholders';
import type { TemplatePlaceholder } from './placeholders';
import { TemplateArt } from './TemplateArt';
import { renderThumb } from './thumbs';
import { useLiveThumb } from './useLiveThumb';
import { TEMPLATE_FIELD_LIMITS, type TemplateFields, type UserTemplate } from './userLibrary';
import { useTemplateLibrary } from './userLibraryStore';
import './templates.css';

interface TemplateFormProps {
  /** The template being changed; null for a new one. */
  editing: UserTemplate | null;
  /** Over another dialog (the list it was opened from). */
  level?: 'base' | 'top';
  library: TemplateLibrary;
  onClose(): void;
  /** The template was saved, under this id. */
  onSaved(id: string): void;
}

const EMPTY: TemplateFields = {
  name: '',
  category: '',
  description: '',
  latex: '',
  placeholders: [],
  packages: [],
};

/** What stands in the drawing for a placeholder that has no value yet. */
const BLANK = '\\square';

export function TemplateForm({
  editing,
  level = 'base',
  library,
  onClose,
  onSaved,
}: TemplateFormProps) {
  const id = useId();
  const background = useProjectStore((s) => s.project.meta.background);
  const own = useTemplateLibrary((s) => s.library.templates);
  const [fields, setFields] = useState<TemplateFields>(() =>
    editing ? fieldsOnly(editing) : EMPTY,
  );
  /** Every placeholder given a value or a label so far, the ones the LaTeX no longer names too:
   * written again, a number has what it had. */
  const [known, setKnown] = useState<readonly TemplatePlaceholder[]>(
    () => editing?.placeholders ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const rows = useMemo(() => placeholderRows(fields.latex, known), [fields.latex, known]);
  const drawn = useMemo(
    () =>
      instantiateTemplate(
        fields.latex.trim(),
        defaultValues(rows.map((row) => ({ ...row, value: row.value.trim() || BLANK }))),
      ),
    [fields.latex, rows],
  );
  const { art, stale } = useLiveThumb({ latex: drawn, packages: fields.packages });
  const categories = useMemo(
    () => [
      ...new Set([
        ...library.categories.map((c) => c.name),
        ...own.map((t) => t.category).filter(Boolean),
      ]),
    ],
    [library, own],
  );

  const blank = rows.find((row) => row.value.trim() === '');
  const broken = fields.latex.trim() !== '' && !stale && art !== undefined && !art.ok;
  /** What keeps the template from being saved, said under the form. */
  const problem =
    fields.name.trim() === ''
      ? 'Give the template a name.'
      : fields.latex.trim() === ''
        ? 'Write the LaTeX of the template.'
        : blank
          ? `Give #${blank.n} a default value.`
          : broken
            ? `This LaTeX cannot be drawn: ${art.message}`
            : refusal;

  const set = (patch: Partial<TemplateFields>) => {
    setFields({ ...fields, ...patch });
    setRefusal(null);
  };
  const setRow = (n: number, patch: Partial<TemplatePlaceholder>) => {
    const row = rows.find((r) => r.n === n)!;
    setKnown([...known.filter((p) => p.n !== n), { ...row, ...patch }]);
    setRefusal(null);
  };

  const dirty =
    JSON.stringify({ ...fields, placeholders: rows }) !==
    JSON.stringify(editing ? fieldsOnly(editing) : EMPTY);
  const close = async () => {
    if (dirty) {
      const answer = await showDialog({
        title: editing ? 'Discard the changes to this template?' : 'Discard this template?',
        message: 'What you wrote here is not saved.',
        cancelId: 'keep',
        buttons: [
          { id: 'keep', label: 'Keep editing' },
          { id: 'discard', label: 'Discard', tone: 'danger' },
        ],
      });
      if (answer !== 'discard') return;
    }
    onClose();
  };

  const save = async () => {
    if (saving || fields.name.trim() === '' || fields.latex.trim() === '' || blank) return;
    setSaving(true);
    try {
      // What is drawn can be of a moment ago: a template is saved of what compiles now.
      const made = await renderThumb({ latex: drawn, packages: fields.packages });
      if (!made.ok) return;
      const template = { ...fields, placeholders: rows };
      const store = useTemplateLibrary.getState();
      const saved = editing
        ? await store.updateTemplate(editing.id, template).then(() => editing.id)
        : await store.createTemplate(template);
      onSaved(saved);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit template: ${editing.name}` : 'Create template'}
      onClose={() => void close()}
      testId="template-form"
      width="832px"
      level={level}
      resizable
      closeOnBackdrop={false}
      footer={
        <>
          <span className="template-form-problem" data-testid="template-form-problem">
            {problem && (
              <span className="field-error" role="alert">
                {problem}
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => void close()}
            data-testid="template-form-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || (problem !== null && problem !== refusal)}
            onClick={() => void save()}
            data-testid="template-form-save"
          >
            {editing ? 'Save' : 'Save template'}
          </button>
        </>
      }
    >
      <form
        className="template-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="form-grid">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            type="text"
            maxLength={TEMPLATE_FIELD_LIMITS.name}
            value={fields.name}
            placeholder="Commutative sum"
            data-testid="template-form-name"
            onChange={(event) => set({ name: event.target.value })}
          />
          <label htmlFor={`${id}-category`}>Category</label>
          <div className="field-stack">
            <input
              id={`${id}-category`}
              type="text"
              list={`${id}-categories`}
              maxLength={TEMPLATE_FIELD_LIMITS.category}
              value={fields.category}
              placeholder="Any name, or one of the list"
              data-testid="template-form-category"
              onChange={(event) => set({ category: event.target.value })}
            />
            <datalist id={`${id}-categories`}>
              {categories.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <label htmlFor={`${id}-description`}>Description</label>
          <input
            id={`${id}-description`}
            type="text"
            maxLength={TEMPLATE_FIELD_LIMITS.description}
            value={fields.description}
            placeholder="What the formula says, in a line"
            data-testid="template-form-description"
            onChange={(event) => set({ description: event.target.value })}
          />
          <label htmlFor={`${id}-latex`}>LaTeX</label>
          <div className="field-stack">
            <textarea
              id={`${id}-latex`}
              className="template-latex-input"
              rows={3}
              spellCheck={false}
              autoCapitalize="off"
              maxLength={TEMPLATE_FIELD_LIMITS.latex}
              value={fields.latex}
              placeholder="{#1}+{#2}={#2}+{#1}"
              data-testid="template-form-latex"
              onChange={(event) => set({ latex: event.target.value })}
            />
            <span className="field-hint">
              Write <code>#1</code>, <code>#2</code>… where a value goes; the braces around a number
              are yours: <code>x^{'{#2}'}</code> takes <code>m+1</code> whole.
            </span>
          </div>
        </div>

        <div className="template-form-placeholders" data-testid="template-form-placeholders">
          <div className="template-form-heading">Placeholders</div>
          {rows.length === 0 ? (
            <p className="field-hint">
              None yet: without a <code>#1</code> the template makes the same formula every time.
            </p>
          ) : (
            <div className="template-form-rows">
              <span className="template-form-column" aria-hidden="true" />
              <span className="template-form-column" aria-hidden="true">
                Default value
              </span>
              <span className="template-form-column" aria-hidden="true">
                What it is (optional)
              </span>
              {rows.map((row) => (
                <Fragment key={row.n}>
                  <span className="template-slot">#{row.n}</span>
                  <input
                    type="text"
                    className="template-latex-input"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    aria-label={`Default value of #${row.n}`}
                    aria-invalid={row.value.trim() === ''}
                    value={row.value}
                    placeholder="a"
                    data-testid={`template-form-value-${row.n}`}
                    onChange={(event) => setRow(row.n, { value: event.target.value })}
                  />
                  <input
                    type="text"
                    aria-label={`What #${row.n} is`}
                    maxLength={40}
                    value={row.label ?? ''}
                    placeholder="base, exponent, angle…"
                    data-testid={`template-form-label-${row.n}`}
                    onChange={(event) => setRow(row.n, { label: event.target.value })}
                  />
                </Fragment>
              ))}
            </div>
          )}
        </div>

        <TemplateArt
          art={fields.latex.trim() === '' ? undefined : art}
          latex={drawn}
          background={background}
          stale={stale}
          testId="template-form-preview"
          className="use-template-preview template-form-preview"
        />

        <details className="template-form-packages">
          <summary data-testid="template-form-packages">
            LaTeX packages
            <span className="field-hint">
              {fields.packages.length === 0 ? 'none' : fields.packages.join(', ')}
            </span>
          </summary>
          <PackagePicker packages={fields.packages} onChange={(packages) => set({ packages })} />
        </details>
        {/* Enter in a field of one line saves (the button lives in the footer). */}
        <input type="submit" hidden />
      </form>
    </Modal>
  );
}

/** The fields of a template, without what the library adds to them. */
function fieldsOnly(template: UserTemplate): TemplateFields {
  return {
    name: template.name,
    category: template.category,
    description: template.description,
    latex: template.latex,
    placeholders: template.placeholders,
    packages: template.packages,
  };
}
