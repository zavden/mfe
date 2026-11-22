/* "Use" on a template that has placeholders: one LaTeX field for each, with the template's own
 * value in it, the formula they make drawn as they are typed, and the name the formula will
 * have. The formula is made only from here, with its LaTeX already final: its glyphs are made
 * once, of what it is, and nothing has to be matched again afterwards. */
import { Fragment, useId, useMemo, useState } from 'react';
import { useProjectStore } from '../../../store';
import { Modal } from '../../project/Modal';
import { formulaNameFrom, validateFormulaName } from '../formulaActions';
import type { TemplateSource } from './library';
import { defaultValues, instantiateTemplate, placeholderRows } from './placeholders';
import { TemplateArt } from './TemplateArt';
import { renderThumb } from './thumbs';
import { useLiveThumb } from './useLiveThumb';
import './templates.css';

/** The formula a template makes, as the Creator adds it. */
export interface TemplateFormula {
  name: string;
  latex: string;
  packages: string[];
}

interface UseTemplateDialogProps {
  template: TemplateSource & { name: string };
  /** Over another dialog (the list the template was picked from). */
  level?: 'base' | 'top';
  onClose(): void;
  onCreate(formula: TemplateFormula): void;
}

export function UseTemplateDialog({
  template,
  level = 'base',
  onClose,
  onCreate,
}: UseTemplateDialogProps) {
  const id = useId();
  const formulas = useProjectStore((s) => s.project.formulas);
  const background = useProjectStore((s) => s.project.meta.background);
  const rows = useMemo(
    () => placeholderRows(template.latex, template.placeholders),
    [template.latex, template.placeholders],
  );
  const defaults = useMemo(() => defaultValues(rows), [rows]);
  const [values, setValues] = useState(defaults);
  const [name, setName] = useState(() => formulaNameFrom(template.name, formulas));
  const [checking, setChecking] = useState(false);

  const latex = useMemo(() => instantiateTemplate(template.latex, values), [template, values]);
  const { art, stale } = useLiveThumb({ latex, packages: template.packages });
  const nameError = validateFormulaName(name, formulas, null);
  /** The LaTeX as it is now is known not to compile. */
  const broken = !stale && art !== undefined && !art.ok;
  const changed = rows.some((row) => values.get(row.n) !== row.value);

  const create = async () => {
    if (nameError || checking) return;
    // What is drawn can be of a moment ago: the formula is made of what compiles now.
    setChecking(true);
    const made = await renderThumb({ latex, packages: template.packages });
    setChecking(false);
    if (made.ok) onCreate({ name, latex, packages: [...template.packages] });
  };

  return (
    <Modal
      title={`Use template: ${template.name}`}
      onClose={onClose}
      testId="use-template"
      width="728px"
      level={level}
      resizable
      footer={
        <>
          <button
            type="button"
            className="btn use-template-reset"
            disabled={!changed}
            onClick={() => setValues(defaults)}
            data-testid="use-template-reset"
            title="Put back the values the template comes with"
          >
            Reset values
          </button>
          <button type="button" className="btn" onClick={onClose} data-testid="use-template-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={nameError !== null || broken || checking}
            onClick={() => void create()}
            data-testid="use-template-create"
          >
            Create formula
          </button>
        </>
      }
    >
      <form
        className="use-template"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <TemplateArt
          art={art}
          latex={latex}
          background={background}
          stale={stale}
          testId="use-template-preview"
          className="use-template-preview"
        />
        <code className="use-template-latex" data-testid="use-template-latex">
          {latex}
        </code>
        {broken && (
          <span className="field-error" role="alert" data-testid="use-template-error">
            This LaTeX cannot be drawn: {art.message}
          </span>
        )}
        <div className="form-grid use-template-fields">
          {rows.map((row) => (
            <Fragment key={row.n}>
              <label htmlFor={`${id}-${row.n}`}>
                <span className="template-slot">#{row.n}</span>{' '}
                {row.label && <span className="template-slot-label">{row.label}</span>}
              </label>
              <input
                id={`${id}-${row.n}`}
                type="text"
                className="template-latex-input"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                placeholder={row.value}
                value={values.get(row.n) ?? ''}
                data-testid={`use-template-value-${row.n}`}
                onChange={(event) => setValues(new Map(values).set(row.n, event.target.value))}
              />
            </Fragment>
          ))}
          {rows.length > 0 && <div className="use-template-rule" aria-hidden="true" />}
          <label htmlFor={`${id}-name`} className="use-template-name-label">
            Formula name
          </label>
          <div className="field-stack use-template-name">
            <input
              id={`${id}-name`}
              type="text"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              value={name}
              aria-invalid={nameError !== null}
              data-testid="use-template-name"
              onChange={(event) => setName(event.target.value)}
            />
            {nameError && (
              <span className="field-error" role="alert" data-testid="use-template-name-error">
                {nameError}
              </span>
            )}
          </div>
        </div>
        {/* Enter in a field creates the formula (the button lives in the footer). */}
        <input type="submit" hidden />
      </form>
    </Modal>
  );
}
