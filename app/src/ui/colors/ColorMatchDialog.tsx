/* Edit → Match colors: the match colour lists of the project (D55). On the left the lists
 * (+ New); on the right the shown list's name, its entries — a LaTeX pattern as typed, with the
 * Manim palette or a colour of your own — to add with "+ Add pattern", reorder (a lower entry
 * wins where patterns overlap), remove, and the list's Duplicate and Delete (held). Every edit is
 * one undo step on the project, and Ctrl/⌘+Z works while the dialog is open; a text field
 * commits when it loses the focus or on Enter (Escape takes the edit back). "Apply to …" colours
 * the formulas the selection stands for (`applyColorMatch`), as the right-click menus do. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { FormulaEngine } from '../../engine';
import type { ColorMatch, ColorMatchId, FormulaId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { ContextMenu } from '../ContextMenu';
import { HoldButton } from '../HoldButton';
import { MANIM_COLORS } from '../project/colors';
import { DELETE_HOLD_MS } from '../project/dialogStore';
import { HexColorField } from '../project/HexColorField';
import { Modal } from '../project/Modal';
import { ownEscape } from '../project/modalStack';
import { applyColorMatch } from './applyColorMatch';
import {
  addColorMatchEntry,
  deleteColorMatchList,
  duplicateColorMatchList,
  entryIssues,
  formulasOfSelection,
  moveColorMatchEntry,
  removeColorMatchEntry,
  renameColorMatchList,
  updateColorMatchEntry,
} from './colorMatchActions';
import { useColorMatchDialog } from './colorMatchDialogStore';
import { MatchPreview } from './MatchPreview';
import './colors.css';
import { PaletteRoleChoices } from './PaletteRoleChoices';
import { usePaletteStore } from './paletteStore';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A text field that commits when it loses the focus or on Enter; Escape takes the edit back. */
function CommitField({
  value,
  onCommit,
  testId,
  label,
  className,
  placeholder,
  autoFocus,
}: {
  value: string;
  onCommit(next: string): void;
  testId: string;
  label: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      setDraft(value);
    }
  };
  return (
    <input
      type="text"
      className={className}
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      spellCheck={false}
      autoFocus={autoFocus}
      data-testid={testId}
      {...ownEscape(draft !== value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

/** The Manim palette under an entry's colour chip. */
function PaletteMenu({
  x,
  y,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  onPick(hex: string): void;
  onClose(): void;
}) {
  return (
    <ContextMenu x={x} y={y} label="Manim colours" testId="match-colors-palette" onClose={onClose}>
      <div className="ctx-swatches" role="group" aria-label="Colour">
        {MANIM_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            role="menuitem"
            className="ctx-swatch"
            style={{ background: color.hex }}
            title={`${color.name} ${color.hex}`}
            aria-label={`Colour ${color.name}`}
            data-testid={`match-colors-palette-${color.name}`}
            onClick={() => {
              onClose();
              onPick(color.hex);
            }}
          />
        ))}
      </div>
      <div className="palette-role-popup">
        <PaletteRoleChoices
          testIdPrefix="match-colors-palette"
          menu
          named
          onPick={(hex) => {
            onClose();
            onPick(hex);
          }}
        />
      </div>
    </ContextMenu>
  );
}

function ListEditor({
  match,
  previewId,
  onPickPreview,
  engine,
}: {
  match: ColorMatch;
  previewId: FormulaId | null;
  onPickPreview(id: FormulaId): void;
  engine?: Pick<FormulaEngine, 'render'>;
}) {
  const issues = entryIssues(match);
  const [palette, setPalette] = useState<{ index: number; x: number; y: number } | null>(null);
  /** The entry whose pattern field takes the focus: the one just added. */
  const focusIndex = useRef<number | null>(null);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (focusIndex.current === null) return;
    const field = document.querySelector<HTMLInputElement>(
      `[data-testid="match-colors-pattern-${focusIndex.current}"]`,
    );
    focusIndex.current = null;
    field?.focus();
  });
  const add = () => {
    focusIndex.current = addColorMatchEntry(match.id);
    rerender((n) => n + 1);
  };
  return (
    <section className="cm-editor" data-testid="match-colors-editor">
      <div className="form-grid">
        <span className="form-label">Name</span>
        <CommitField
          value={match.name}
          onCommit={(name) => renameColorMatchList(match.id, name)}
          testId="match-colors-name"
          label="Name"
          className="cm-name"
        />
      </div>
      <div className="cm-toolbar">
        <button
          type="button"
          className="btn btn-small"
          data-testid="match-colors-duplicate"
          onClick={() => {
            const id = duplicateColorMatchList(match.id);
            if (id) useColorMatchDialog.getState().open(id);
          }}
        >
          Duplicate
        </button>
        <HoldButton
          holdMs={DELETE_HOLD_MS}
          className="btn btn-danger btn-small"
          testId="match-colors-delete"
          onActivate={() => deleteColorMatchList(match.id)}
        >
          Delete
        </HoldButton>
      </div>
      <h3 className="cm-heading">Patterns</h3>
      <p className="field-hint">
        LaTeX as typed (<code>x</code>, <code>\frac{'{a}{b}'}</code>, <code>\sin</code>): every
        occurrence takes the colour. Where patterns overlap, the lower entry wins.
      </p>
      {match.entries.length > 0 && (
        <ol className="cm-entries" data-testid="match-colors-entries">
          {match.entries.map((entry, i) => (
            <li key={i} className="cm-entry" data-testid={`match-colors-entry-${i}`}>
              <span className="cm-entry-index">{i + 1}</span>
              <CommitField
                value={entry.pattern}
                onCommit={(pattern) => updateColorMatchEntry(match.id, i, { pattern })}
                testId={`match-colors-pattern-${i}`}
                label={`Pattern ${i + 1}`}
                className="cm-pattern"
                placeholder="LaTeX, e.g. x or \frac{a}{b}"
              />
              <button
                type="button"
                className="cm-chip"
                style={{ background: entry.color }}
                title="Manim colours"
                aria-label={`Colour of pattern ${i + 1}: Manim palette`}
                data-testid={`match-colors-chip-${i}`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPalette({ index: i, x: rect.left, y: rect.bottom + 4 });
                }}
              />
              <HexColorField
                value={entry.color}
                onCommit={(color) => updateColorMatchEntry(match.id, i, { color })}
                label={`Colour of pattern ${i + 1}`}
                testId={`match-colors-color-${i}`}
              />
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Move pattern ${i + 1} up`}
                data-testid={`match-colors-up-${i}`}
                disabled={i === 0}
                onClick={() => moveColorMatchEntry(match.id, i, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Move pattern ${i + 1} down`}
                data-testid={`match-colors-down-${i}`}
                disabled={i === match.entries.length - 1}
                onClick={() => moveColorMatchEntry(match.id, i, 1)}
              >
                ▼
              </button>
              <button
                type="button"
                className="btn btn-small cm-remove"
                aria-label={`Remove pattern ${i + 1}`}
                data-testid={`match-colors-remove-${i}`}
                onClick={() => removeColorMatchEntry(match.id, i)}
              >
                ×
              </button>
              {issues[i] && (
                <span
                  className="field-error cm-entry-issue"
                  data-testid={`match-colors-issue-${i}`}
                >
                  {issues[i]}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div>
        <button type="button" className="btn" data-testid="match-colors-add" onClick={add}>
          + Add pattern
        </button>
      </div>
      <MatchPreview match={match} formulaId={previewId} onPick={onPickPreview} engine={engine} />
      {palette && (
        <PaletteMenu
          x={palette.x}
          y={palette.y}
          onPick={(color) => updateColorMatchEntry(match.id, palette.index, { color })}
          onClose={() => setPalette(null)}
        />
      )}
    </section>
  );
}

export function ColorMatchDialog({
  shown,
  onClose,
  engine,
}: {
  shown: ColorMatchId;
  onClose(): void;
  /** The engine of the preview's labelled renders (tests); the app's by default. */
  engine?: Pick<FormulaEngine, 'render'>;
}) {
  const lists = useProjectStore((state) => state.project.colorMatches);
  const clips = useProjectStore((state) => state.project.clips);
  const formulas = useProjectStore((state) => state.project.formulas);
  const selection = useUiStore((state) => state.selection);
  // The shown list may be gone (deleted, undone away): show the first one, or nothing.
  const match = lists.find((m) => m.id === shown) ?? lists[0] ?? null;
  const targets = formulasOfSelection({ clips }, selection);
  // The formula the preview draws: the one picked, else the first selected one, else the first.
  const [picked, setPicked] = useState<FormulaId | null>(null);
  const previewId =
    (picked !== null && formulas.some((f) => f.id === picked) ? picked : null) ??
    targets[0] ??
    formulas[0]?.id ??
    null;
  const canApply =
    match !== null && targets.length > 0 && entryIssues(match).some((issue) => issue === null);
  const { open, openNew } = useColorMatchDialog.getState();
  const hasPalette = usePaletteStore((state) => state.library.activePaletteId !== null);
  const focusFirstPattern = useColorMatchDialog((state) => state.focusFirstPattern);
  useEffect(() => {
    if (!focusFirstPattern || match?.id !== shown) return;
    document.querySelector<HTMLInputElement>('[data-testid="match-colors-pattern-0"]')?.focus();
    useColorMatchDialog.setState({ focusFirstPattern: false });
  }, [focusFirstPattern, match?.id, shown]);
  return (
    <Modal
      title="Match colors"
      onClose={onClose}
      testId="match-colors"
      width="780px"
      allowHistory
      footer={
        <>
          <span className="cm-footer-hint" data-testid="match-colors-targets">
            {targets.length === 0
              ? 'Select formulas in the Creator (or clips in the preview) to apply a list.'
              : `${plural(targets.length, 'formula')} selected.`}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canApply}
            data-testid="match-colors-apply"
            onClick={() => {
              if (match) void applyColorMatch(targets, match.id);
            }}
          >
            {targets.length > 0 ? `Apply to ${plural(targets.length, 'formula')}` : 'Apply'}
          </button>
          <button type="button" className="btn" onClick={onClose} data-testid="match-colors-done">
            Close
          </button>
        </>
      }
    >
      <div className="cm-layout">
        <aside className="cm-lists">
          <button type="button" className="btn" data-testid="match-colors-new" onClick={openNew}>
            + New
          </button>
          <button
            type="button"
            className="btn"
            data-testid="match-colors-from-palette"
            disabled={!hasPalette}
            onClick={() => useColorMatchDialog.getState().openNewFromPalette()}
          >
            New from active palette…
          </button>
          <ul className="cm-list" role="listbox" aria-label="Match colour lists">
            {lists.map((list) => (
              <li key={list.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  className="cm-list-item"
                  aria-selected={match?.id === list.id}
                  data-testid={`match-colors-list-${list.id}`}
                  onClick={() => open(list.id)}
                >
                  <span className="cm-list-name">{list.name}</span>
                  <span className="cm-list-count">{list.entries.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        {match ? (
          <ListEditor
            key={match.id}
            match={match}
            previewId={previewId}
            onPickPreview={setPicked}
            engine={engine}
          />
        ) : (
          <div className="cm-empty-box">
            <span className="cm-art" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <p className="cm-empty" data-testid="match-colors-empty">
              No match colours yet. Press <strong>+ New</strong> to make a list of LaTeX patterns
              and their colours, then apply it to formulas from their right-click menu.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Mounts the dialog while a list is shown (`useColorMatchDialog`). */
export function ColorMatchDialogHost() {
  const shown = useColorMatchDialog((state) => state.shown);
  const close = useColorMatchDialog((state) => state.close);
  return shown === null ? null : <ColorMatchDialog shown={shown} onClose={close} />;
}
