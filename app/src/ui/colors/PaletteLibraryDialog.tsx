import { useEffect, useRef, useState } from 'react';
import { downloadText } from '../project/files';
import { useFileDrop } from '../fileDrop';
import { FileDropOverlay } from '../FileDropOverlay';
import { MANIM_COLORS } from '../project/colors';
import { HexColorField } from '../project/HexColorField';
import { Modal } from '../project/Modal';
import { PALETTE_ROLES, type PaletteRole } from './palette';
import { PaletteCustomRoles } from './PaletteCustomRoles';
import { PALETTE_LIBRARY_LIMIT, type PaletteEntry } from './paletteLibrary';
import { PaletteSample, PaletteStrip } from './PaletteSample';
import { usePaletteStore } from './paletteStore';
import { usePaletteImport, type ImportedPalette } from './usePaletteImport';
import './palettes.css';

interface PaletteSelection {
  id: string;
  /** The source as JSON, for a palette that may come back under another id (an import another
   * tab stored first). A palette made here keeps its id and needs none. */
  sourceSignature: string | null;
}

const selectionFor = (entry: PaletteEntry): PaletteSelection => ({
  id: entry.id,
  sourceSignature: JSON.stringify(entry.source),
});

/** What the editor does with each role: the color a new object is born with
 * (`paletteRoleForKind`), or the Match colors list made from the active palette. Every role is
 * also offered wherever a color is chosen. */
const ROLE_USES: Readonly<Record<PaletteRole, string>> = {
  background: 'New projects',
  formula: 'New formulas',
  variable: 'Match colors lists',
  constant: 'Match colors lists',
  operator: 'Match colors lists',
  result: 'Match colors lists',
  text: 'New texts',
  muted: 'New braces',
  rectangle: 'New boxes and underlines',
  circle: 'New circles',
  arrow: 'New lines, arrows, crosses and cross lines',
};

interface PaletteLibraryDialogProps {
  onClose(): void;
  /** A palette imported just before the dialog opened (from Chroma Lab): it opens selected, with
   * what its import warned about. */
  imported?: ImportedPalette;
}

export function PaletteLibraryDialog({ onClose, imported }: PaletteLibraryDialogProps) {
  const {
    library,
    busy,
    unsaved,
    damaged,
    warnings,
    activate,
    rename,
    remove,
    createPalette,
    duplicate,
    recolor,
    changeCustomRole,
    retrySave,
    resetLibrary,
  } = usePaletteStore();
  const [selection, setSelection] = useState<PaletteSelection | null>(() => {
    if (imported) return { id: imported.id, sourceSignature: imported.sourceSignature };
    const entry =
      library.palettes.find((item) => item.id === library.activePaletteId) ?? library.palettes[0];
    return entry ? selectionFor(entry) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>(imported?.warnings ?? []);
  const files = usePaletteImport({
    onImported: (palette) => {
      setSelection({ id: palette.id, sourceSignature: palette.sourceSignature });
      setImportWarnings(palette.warnings);
    },
    onError: setError,
  });
  const drop = useFileDrop({ onFiles: files.importFiles });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A failed local import may acquire another tab's durable ID when retry deduplicates it.
  const selected = selection
    ? (library.palettes.find((entry) => entry.id === selection.id) ??
      library.palettes.find((entry) => JSON.stringify(entry.source) === selection.sourceSignature))
    : null;
  // The selection follows what it found: the id the palette goes by now, and its colors as they
  // are (a recolored palette is no longer the source it was selected with).
  if (selection && selected) {
    const found = selectionFor(selected);
    if (found.id !== selection.id || found.sourceSignature !== selection.sourceSignature)
      setSelection(found);
  }
  const run = (operation: () => Promise<unknown>) => {
    setError(null);
    void operation().catch((reason: unknown) => {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  /** Add a palette of the editor's own and show it. */
  const add = (make: () => Promise<string>) =>
    run(async () => {
      const id = await make();
      if (!mounted.current) return;
      setSelection({ id, sourceSignature: null });
      setImportWarnings([]);
    });
  const full = library.palettes.length >= PALETTE_LIBRARY_LIMIT;
  return (
    <Modal
      title="Editor palettes"
      onClose={onClose}
      testId="palette-library"
      width="820px"
      resizable
      allowHistory={false}
      level="top"
      footer={
        <button type="button" className="btn" data-testid="palette-library-done" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="palette-library-drop" {...drop.area}>
        <p className="palette-help">
          Activation sets the colours offered by the editor and used for new objects and projects.
          Use Edit → Apply palette… to recolour existing content.
        </p>
        <div className="palette-library-toolbar">
          <button
            type="button"
            className="btn"
            data-testid="palette-import"
            disabled={busy}
            onClick={files.pick}
          >
            Import palette…
          </button>
          <input {...files.input} data-testid="palette-import-input" />
          <button
            type="button"
            className="btn"
            data-testid="palette-new"
            // Not turned off while a save is under way: a browser takes the focus from a
            // button that is, and the changes are saved in order anyway.
            disabled={full}
            onClick={() => add(createPalette)}
          >
            New palette
          </button>
          <span>
            {library.palettes.length} / {PALETTE_LIBRARY_LIMIT} palettes
          </span>
        </div>
        {full && (
          <p className="palette-help" data-testid="palette-full">
            The library is full. Delete a palette to add another.
          </p>
        )}
        <p className="palette-help">
          New palette starts from the editor’s own colours. In Chroma Lab, export a theme as JSON
          from Seeds &amp; themes, then import that file here: with the button, or by dragging it
          onto this dialog. The general palette export has no named roles and cannot be imported.
        </p>
        {error && (
          <p role="alert" className="palette-error" data-testid="palette-library-error">
            {error}
          </p>
        )}
        {(unsaved || warnings.length > 0) && (
          <div role="status" className="palette-warning" data-testid="palette-storage-status">
            {unsaved && (
              <strong>
                Not saved to this browser. Keep this tab open or export your palettes.
              </strong>
            )}
            {warnings.map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
            {(unsaved || damaged) && (
              <div className="palette-library-toolbar">
                {unsaved && (
                  <button
                    type="button"
                    className="btn"
                    data-testid="palette-retry-save"
                    disabled={busy}
                    onClick={() => run(retrySave)}
                  >
                    Retry saving
                  </button>
                )}
                {damaged && (
                  <button
                    type="button"
                    className="btn"
                    data-testid="palette-reset-library"
                    disabled={busy}
                    onClick={() => run(resetLibrary)}
                  >
                    Reset library
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {importWarnings.length > 0 && (
          <div role="status" data-testid="palette-import-warnings">
            {importWarnings.map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
          </div>
        )}
        <div className="palette-library-layout">
          <div className="palette-library-list" role="listbox" aria-label="Editor palettes">
            <button
              type="button"
              role="option"
              aria-selected={selection === null}
              className="palette-card"
              data-testid="palette-defaults"
              onClick={() => setSelection(null)}
            >
              <span className="palette-card-name">
                Manim defaults
                <ActiveMark on={library.activePaletteId === null} />
              </span>
              <PaletteStrip colors={MANIM_COLORS.map((color) => color.hex)} />
            </button>
            {library.palettes.map((entry) => (
              <button
                type="button"
                role="option"
                aria-selected={entry.id === selected?.id}
                key={entry.id}
                className="palette-card"
                data-testid={`palette-entry-${entry.id}`}
                onClick={() => setSelection(selectionFor(entry))}
              >
                <span className="palette-card-name">
                  {entry.displayName}
                  <ActiveMark on={library.activePaletteId === entry.id} />
                </span>
                <PaletteStrip
                  colors={[
                    ...PALETTE_ROLES.map((role) => entry.source.colors[role]),
                    ...(entry.source.customRoles ?? []).map((role) => role.color),
                  ]}
                />
              </button>
            ))}
          </div>
          <div className="palette-library-detail">
            {selected ? (
              <>
                <PaletteName
                  key={`${selected.id}:${selected.displayName}`}
                  name={selected.displayName}
                  disabled={busy}
                  onRename={(name) => run(() => rename(selected.id, name))}
                />
                <div className="palette-library-toolbar">
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="palette-activate"
                    disabled={busy || library.activePaletteId === selected.id}
                    onClick={() => run(() => activate(selected.id))}
                  >
                    Activate
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-testid="palette-duplicate"
                    disabled={full}
                    onClick={() => add(() => duplicate(selected.id))}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-testid="palette-export"
                    onClick={() =>
                      downloadText(
                        `${selected.displayName.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'theme'}.manim-palette.json`,
                        JSON.stringify(selected.source, null, 2),
                      )
                    }
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-testid="palette-delete"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await remove(selected.id);
                        if (mounted.current) setSelection(null);
                      })
                    }
                  >
                    Delete palette
                  </button>
                </div>
                {!selected.authored && (
                  <p className="palette-help">Source name: {selected.source.name || '(unnamed)'}</p>
                )}
                <PaletteSample colors={selected.source.colors} />
                <div
                  className="palette-roles"
                  role="group"
                  aria-label="Colours by role"
                  data-testid="palette-role-preview"
                >
                  {PALETTE_ROLES.map((role) => (
                    <div key={role} className="palette-role-row">
                      <span className="palette-role-name">{role}</span>
                      <HexColorField
                        value={selected.source.colors[role]}
                        label={`${role} colour`}
                        testId={`palette-color-${role}`}
                        roles={false}
                        onCommit={(color) => run(() => recolor(selected.id, role, color))}
                      />
                      <span className="palette-role-use">{ROLE_USES[role]}</span>
                    </div>
                  ))}
                </div>
                <PaletteCustomRoles
                  key={selected.id}
                  roles={selected.source.customRoles ?? []}
                  onChange={(change) => run(() => changeCustomRole(selected.id, change))}
                />
                <p className="palette-help">
                  A colour or a role changed here is saved at once and is the palette’s from then
                  on; use Duplicate first to keep the palette as it is.
                  {library.activePaletteId === selected.id
                    ? ' This palette is active: new objects and colour choices follow it. What the project already has keeps its colours.'
                    : ''}
                </p>
                {library.activePaletteId === selected.id && (
                  <p className="palette-help">
                    Deleting this active palette switches future creations to Manim defaults.
                    Existing objects keep their colours.
                  </p>
                )}
              </>
            ) : selection ? (
              <p role="status" data-testid="palette-selection-missing">
                This palette was removed from the library. Select another palette or Manim defaults.
              </p>
            ) : (
              <>
                <h3>Manim defaults</h3>
                <p>Use the editor’s standard colours for new content.</p>
                <button
                  type="button"
                  className="btn"
                  data-testid="palette-activate-defaults"
                  disabled={busy || library.activePaletteId === null}
                  onClick={() => run(() => activate(null))}
                >
                  Use Manim defaults
                </button>
              </>
            )}
          </div>
        </div>
        {drop.over && (
          <FileDropOverlay testId="palette-drop">Drop the theme JSON to import it</FileDropOverlay>
        )}
      </div>
    </Modal>
  );
}

/** " · Active" after the name of the palette in use. */
function ActiveMark({ on }: { on: boolean }) {
  return on ? (
    <>
      {' · '}
      <span className="palette-active">Active</span>
    </>
  ) : null;
}

function PaletteName({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled: boolean;
  onRename(name: string): void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <form
      className="palette-library-toolbar palette-name-form"
      onSubmit={(event) => {
        event.preventDefault();
        onRename(draft);
      }}
    >
      <label>
        Display name{' '}
        <input
          type="text"
          value={draft}
          maxLength={120}
          disabled={disabled}
          data-testid="palette-name"
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn"
        data-testid="palette-rename"
        disabled={disabled || !draft.trim() || draft.trim() === name}
      >
        Rename
      </button>
    </form>
  );
}
