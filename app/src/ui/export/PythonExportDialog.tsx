/* Export → Python: the generated ManimCE / ManimGL scene, what it cannot guarantee (issues) and
 * a read-only preview of the code, with Copy and Download. The code is regenerated whenever the
 * options, the project or the formula renders change; while a formula still waits for its first
 * render the dialog says so instead of exporting a partial scene (empty formulas are not waited
 * for: their clips are left out, and the issues say so). A font text the editor cannot vouch for
 * (no companion to compare this machine's fonts with its own, or fonts that changed) is one more
 * issue, never a reason to hold the export back (D82): the scene checks it when it runs. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getEngine, pangoState } from '../../engine';
import { effectiveSceneName, generatePython, isValidSceneName, sceneClassName } from '../../export';
import { TARGET_NAMES, type Issue, type Target } from '../../model';
import { createVisualProjectSelector, useProjectStore, useRenderStore } from '../../store';
import { downloadBlob } from '../project/files';
import { IssueList } from '../animations/IssueList';
import { Modal } from '../project/Modal';
import { pythonReadiness, textVerification, textVerificationNotes } from './readiness';
import { useCompanionState } from '../useCompanion';
import './PythonExportDialog.css';

export function PythonExportDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const hasAudio = useProjectStore((state) => state.project.audioClips.length > 0);
  const id = useId();
  const [selectProject] = useState(() => createVisualProjectSelector());
  const project = useProjectStore(selectProject);
  // The generator is given the project with its sound, and takes the visual part itself: the
  // marks of the Slides mode stand in the tail where only sound plays too, and the header says
  // when the editor's own video, which lasts until the sound ends, is longer than the scene.
  const whole = useProjectStore((state) => state.project);
  const resolved = useRenderStore((s) => s.resolved);
  const entries = useRenderStore((s) => s.entries);
  const companion = useCompanionState();
  // The name the class takes: the project's, unless the scene cannot be called that (a name its
  // camera uses), which the note under the field says.
  const projectClass = sceneClassName(project.meta.name);
  const [sceneName, setSceneName] = useState(() => effectiveSceneName(project, projectClass));
  const [positional, setPositional] = useState(false);
  const [comments, setComments] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const { pending, unwritten } = useMemo(
    () => pythonReadiness(project, entries, resolved),
    [project, resolved, entries],
  );
  // Of the ones the generator leaves out: the formulas whose current source fails (the Creator
  // has the error), and the font texts settled as boxes whose glyphs nothing counts, which
  // have no error to look up and which nothing renders by itself.
  const uncounted = unwritten.filter(
    (formula) => formula.kind === 'text' && entries[formula.id]?.status === 'ok',
  );
  const failing = unwritten.filter((formula) => !uncounted.includes(formula));
  // What the editor cannot say of the font texts now: listed with the generator's issues.
  // The comparison needs the companion's text worker of the export's library, which may not be
  // the project's: asked for when there is a text to compare and nothing has started it.
  const textWorker = pangoState(companion, target);
  const verification = useMemo(
    () => textVerification(project, resolved, companion, target),
    [project, resolved, companion, target],
  );
  const comparable = verification.unknown.length > 0;
  useEffect(() => {
    if (comparable && textWorker === 'unused') getEngine().prepareText(target);
  }, [comparable, textWorker, target]);
  const textIssues = useMemo(
    () =>
      textVerificationNotes(verification, target, true, textWorker).map((message): Issue => ({
        severity: 'warning',
        code: 'export-text-fonts',
        message,
        path: ['formulas'],
      })),
    [verification, target, textWorker],
  );

  const nameValid = isValidSceneName(project, sceneName);
  /** What the field could hold instead of a name the scene cannot take. */
  const suggested = effectiveSceneName(project, sceneClassName(sceneName));
  const renamed =
    projectClass !== sceneName && effectiveSceneName(project, projectClass) === sceneName;
  // The generator runs while the dialog draws: what it throws at is said here, in the dialog — a
  // failure of the export must not take the app, and the project in it, to the crash screen.
  const written = useMemo(() => {
    if (pending.length > 0) return null;
    try {
      return {
        result: generatePython(whole, resolved, {
          target,
          sceneName: nameValid ? sceneName : suggested,
          indexing: positional ? 'positional' : 'auto',
          comments,
        }),
        failure: null,
      };
    } catch (error) {
      return { result: null, failure: error instanceof Error ? error.message : String(error) };
    }
  }, [
    pending.length,
    whole,
    resolved,
    target,
    sceneName,
    nameValid,
    suggested,
    positional,
    comments,
  ]);
  const result = written?.result ?? null;
  const failure = written?.failure ?? null;
  const ready = result !== null && nameValid && unwritten.length === 0;
  // The dialog's own notes first: the list scrolls, and they are about the whole export.
  const issues = result ? [...textIssues, ...result.issues] : [];

  const copy = async () => {
    if (!result || !ready) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <Modal
      title={`Export Python — ${TARGET_NAMES[target]}`}
      onClose={onClose}
      testId="export-python"
      width="820px"
      footer={
        <>
          <span className="py-copy-state" role="status">
            {copyState === 'copied'
              ? 'Copied to the clipboard.'
              : copyState === 'failed'
                ? 'Could not copy.'
                : ''}
          </span>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="export-python-cancel"
          >
            Close
          </button>
          <button
            type="button"
            className="btn"
            disabled={!ready}
            onClick={() => void copy()}
            data-testid="export-python-copy"
          >
            Copy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            onClick={() =>
              result &&
              downloadBlob(
                `${result.sceneName}.py`,
                new Blob([result.code], { type: 'text/x-python' }),
              )
            }
            data-testid="export-python-download"
          >
            Download {nameValid ? `${sceneName}.py` : ''}
          </button>
        </>
      }
    >
      <div className="py-export">
        <div className="form-grid py-options">
          <label htmlFor={`${id}-scene`}>Scene name</label>
          <div className="field-stack">
            <input
              id={`${id}-scene`}
              type="text"
              value={sceneName}
              spellCheck={false}
              onChange={(event) => setSceneName(event.target.value.trim())}
              aria-invalid={!nameValid}
              data-testid="export-python-scene-name"
            />
            {!nameValid && (
              <span className="py-field-error">
                Use a Python class name that is not reserved by the generated code: letters, digits
                and underscores, not starting with a digit (e.g. {suggested}).
              </span>
            )}
            {renamed && (
              <span className="py-hint" data-testid="export-python-scene-renamed">
                The project’s name would make it {projectClass}, a name the scene’s camera uses: the
                class, and the file, are {sceneName}.
              </span>
            )}
          </div>
          <span className="form-label">Glyph indices</span>
          <label className="py-check">
            <input
              type="checkbox"
              checked={positional}
              onChange={(event) => setPositional(event.target.checked)}
              data-testid="export-python-indexing"
            />
            Always use the positional helper
            <span className="py-hint">
              Matches glyphs by position when the scene runs, also for formulas rendered exactly.
              More robust across Manim versions and TeX templates.
            </span>
          </label>
          <span className="form-label">Code</span>
          <label className="py-check">
            <input
              type="checkbox"
              checked={comments}
              onChange={(event) => setComments(event.target.checked)}
              data-testid="export-python-comments"
            />
            Comments (formulas, timing)
          </label>
        </div>

        {failure !== null ? (
          <p className="py-field-error" role="alert" data-testid="export-python-failure">
            The scene could not be written as Python ({failure}). This is a fault of the editor, not
            of the scene: if the project has problems, fixing them may get around it. The project
            itself is as it was; save it before going on.
          </p>
        ) : result === null ? (
          <p className="py-waiting" data-testid="export-python-waiting">
            Waiting for {pending.length === 1 ? 'a formula' : `${pending.length} formulas`} to
            render ({pending.map((f) => f.name).join(', ')})…
          </p>
        ) : (
          <>
            {failing.length > 0 && (
              <p className="py-field-error" data-testid="export-python-stale">
                {failing.map((f) => f.name).join(', ')} {failing.length === 1 ? 'has' : 'have'} no
                render of the current source (see the Creator for the error). Copy and Download are
                off until it renders.
              </p>
            )}
            {uncounted.length > 0 && (
              <p className="py-field-error" data-testid="export-python-uncounted">
                {uncounted.map((f) => f.name).join(', ')}: font text whose glyphs nothing counts as{' '}
                {uncounted.length === 1 ? 'it stands' : 'they stand'} (the saved appearance is not
                at hand, and the text changed since). Refresh appearance, in{' '}
                {uncounted.length === 1 ? 'its' : 'their'} editor, shapes{' '}
                {uncounted.length === 1 ? 'it' : 'them'} again, which needs the companion. Copy and
                Download are off until then.
              </p>
            )}
            {hasAudio && (
              <p className="field-hint" data-testid="python-audio-note">
                Audio is omitted from Manim exports.
              </p>
            )}
            <IssueList
              issues={issues}
              testId="export-python-issues"
              className="an-issues py-issues"
            >
              {issues.length === 0 && (
                <li className="an-issue py-no-issues">
                  {/* Ticked, the generator writes no "matched by position" notes: every formula
                      is, and the line must not promise exact indices. */}
                  {positional
                    ? 'The scene reproduces the preview: glyphs matched by position when it runs, whole frames.'
                    : 'The scene reproduces the preview: exact glyph indices, whole frames.'}
                </li>
              )}
            </IssueList>
            <pre
              className="py-code"
              tabIndex={0}
              aria-label="Generated Python code"
              data-testid="export-python-code"
            >
              <code>{result.code}</code>
            </pre>
          </>
        )}
      </div>
    </Modal>
  );
}
