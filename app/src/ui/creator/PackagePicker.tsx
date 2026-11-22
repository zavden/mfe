/* Package list of a formula: chips, a searchable catalog, a quick-access row and free text for
 * names the catalog does not know (ported from the manim-formulas-gui prototype). */
import { useId, useMemo, useState } from 'react';
import { ownEscape } from '../project/modalStack';
import { PACKAGE_CATALOG, PACKAGE_NAME } from './packageCatalog';
import { hasMacroPreview, mathJaxNote } from './packageMacros';

interface PackagePickerProps {
  packages: readonly string[];
  onChange: (packages: string[]) => void;
}

const MAX_RESULTS = 12;

export function PackagePicker({ packages, onChange }: PackagePickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const text = query.trim();

  const matches = useMemo(() => {
    const q = text.toLowerCase();
    if (!q) return [];
    return PACKAGE_CATALOG.filter(
      (e) => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q),
    )
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, MAX_RESULTS);
  }, [text]);

  const add = (name: string) => {
    if (!PACKAGE_NAME.test(name) || packages.includes(name)) return;
    onChange([...packages, name]);
    setQuery('');
  };

  const remove = (name: string) => onChange(packages.filter((p) => p !== name));
  const notes = packages.map((p) => [p, mathJaxNote(p)] as const).filter(([, note]) => note);
  const validText = PACKAGE_NAME.test(text);

  return (
    <div className="package-picker" data-testid="package-picker">
      <ul className="package-chips" data-testid="package-chips">
        {packages.length === 0 && <li className="field-hint">No extra packages</li>}
        {packages.map((name) => (
          <li
            key={name}
            className={mathJaxNote(name) ? 'package-chip no-mathjax' : 'package-chip'}
            data-testid={`package-chip-${name}`}
            title={
              mathJaxNote(name) ??
              (hasMacroPreview(name) ? 'Previewed with approximated macros' : undefined)
            }
          >
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              data-testid={`package-remove-${name}`}
              onClick={() => remove(name)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="package-search">
        <label htmlFor={inputId} className="visually-hidden">
          Search packages
        </label>
        <input
          id={inputId}
          type="text"
          placeholder="Search packages, or type any name…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          {...ownEscape(query !== '')}
          data-testid="package-search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (validText) add(text);
            } else if (event.key === 'Escape' && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!validText || packages.includes(text)}
          onClick={() => add(text)}
          data-testid="package-add"
        >
          Add
        </button>
      </div>

      {text && (
        <ul className="package-results" data-testid="package-results">
          {matches.length === 0 && (
            <li className="field-hint">
              {validText
                ? 'No catalog matches: press Add to use the name as typed.'
                : 'Package names use letters, digits, "-" and "_".'}
            </li>
          )}
          {matches.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                className={
                  packages.includes(entry.name) ? 'package-result added' : 'package-result'
                }
                onClick={() => add(entry.name)}
                disabled={packages.includes(entry.name)}
                data-testid={`package-result-${entry.name}`}
              >
                <span className="package-name">{entry.name}</span>
                {hasMacroPreview(entry.name) && <span className="package-tag">preview</span>}
                <span className="package-desc">{entry.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="package-quick" data-testid="package-quick">
        <span className="field-hint">Common:</span>
        {PACKAGE_CATALOG.filter((e) => e.common).map((entry) => (
          <button
            key={entry.name}
            type="button"
            className="btn btn-small"
            title={entry.desc}
            disabled={packages.includes(entry.name)}
            data-testid={`package-quick-${entry.name}`}
            onClick={() => add(entry.name)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      {notes.length > 0 && (
        <ul className="package-notes" data-testid="package-notes">
          {notes.map(([name, note]) => (
            <li key={name}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
