/* Export ▸ HTML…: the scene as a page a browser opens from disk — the live animation, with its
 * controls, stopping at each pause of the Slides mode. A folder, to work on and to embed, or one
 * file, to send or to present from; with the scene's sound when it has one. There is no size, no
 * frame rate and no encoder to choose: the page is drawn as it plays. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  exportedFolder,
  exportedSingle,
  exportedZip,
  marksSummary,
  type ExportedSound,
  type MarksSummary,
} from '../../export/html/exportHtml';
import { sceneName } from '../../export/html/packDeck';
import { RUNTIME_ASSETS } from '../../export/html/runtimeAssets';
import { markCoverName, markName, sceneDuration } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { Modal } from '../project/Modal';
import { downloadBlob } from '../project/files';
import { notify } from '../project/noticeStore';
import { mainPlayback } from '../transport/mainPlayback';
import {
  canWriteFolders,
  folderNotice,
  mixPageSound,
  pageSoundBytesPerSecond,
  pageSoundProblem,
  pickExportParent,
  writeExportFolder,
} from './htmlExportRun';
import { pythonReadiness } from './readiness';
import { useAacSupport } from './useAacSupport';
import './PythonExportDialog.css';

type Form = 'folder' | 'single';

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** What the «Slides» line says of the pauses: that the page stops at them, and how many of them
 * skip the wait after them (D202). */
function pausesWords({ pauses, skipping }: MarksSummary): string {
  if (pauses === 0) return 'No pause: the page plays through.';
  const one = pauses === 1;
  const stops = `${pauses} ${one ? 'pause' : 'pauses'}: the page stops at ${one ? 'it' : 'each'} until its reader goes on`;
  if (skipping === 0) return `${stops}.`;
  if (skipping === pauses) return `${stops}, then skips the wait after ${one ? 'it' : 'each'}.`;
  return `${stops}; ${skipping} of them ${skipping === 1 ? 'skips the wait after it' : 'skip the wait after them'}.`;
}

export function HtmlExportDialog({ onClose }: { onClose(): void }) {
  const id = useId();
  const project = useProjectStore((state) => state.project);
  const resolved = useRenderStore((state) => state.resolved);
  const entries = useRenderStore((state) => state.entries);
  const [form, setForm] = useState<Form>('folder');
  const hasSound = project.audioClips.length > 0;
  const [withSound, setWithSound] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const aac = useAacSupport();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const { pending } = useMemo(
    () => pythonReadiness(project, entries, resolved),
    [project, entries, resolved],
  );
  const marks = useMemo(() => marksSummary(project), [project]);
  const name = sceneName(project);
  const soundProblem = hasSound ? pageSoundProblem(project) : null;
  const sounding = hasSound && withSound && soundProblem === null;
  const soundSize = pageSoundBytesPerSecond(aac === true) * sceneDuration(project);
  const folders = canWriteFolders();
  const ready = pending.length === 0 && busy === null && (!sounding || aac !== null);

  /** The scene's sound when it goes in the page, mixed now. */
  const sound = async (): Promise<ExportedSound | null> => {
    if (!sounding) return null;
    setBusy('Mixing the sound…');
    abort.current = new AbortController();
    return mixPageSound(project, aac === true, abort.current.signal);
  };

  const run = async (how: 'folder' | 'zip' | 'single') => {
    if (!ready) return;
    mainPlayback.pause();
    setFailure(null);
    try {
      // The folder is asked for first: the browser wants the click that asks to be this one.
      const parent = how === 'folder' ? await pickExportParent() : null;
      if (how === 'folder' && !parent) return;
      const input = { project, resolved, assets: RUNTIME_ASSETS, sound: await sound() };
      setBusy('Writing…');
      if (how === 'folder') {
        const written = await writeExportFolder(parent!, name, exportedFolder(input), {
          onChecking: () => setBusy('Checking the folder…'),
        });
        // A sound that stayed is something to do: the folder still carries it.
        notify({
          kind: written.left.length > 0 ? 'warning' : 'info',
          ...folderNotice(written, parent!.name),
        });
      } else {
        const file = how === 'zip' ? exportedZip(input) : exportedSingle(input);
        downloadBlob(
          file.path,
          new Blob([file.bytes], { type: how === 'zip' ? 'application/zip' : 'text/html' }),
        );
      }
      onClose();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Export HTML"
      onClose={onClose}
      testId="export-html"
      width="620px"
      closeOnBackdrop={busy === null}
      footer={
        <>
          <span className="py-copy-state" role="status" data-testid="export-html-status">
            {busy ?? ''}
          </span>
          <button type="button" className="btn" onClick={onClose} data-testid="export-html-cancel">
            Close
          </button>
          {form === 'folder' ? (
            <>
              <button
                type="button"
                className={folders ? 'btn' : 'btn btn-primary'}
                disabled={!ready}
                onClick={() => void run('zip')}
                data-testid="export-html-zip"
              >
                Download {name}.zip
              </button>
              {folders && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!ready}
                  onClick={() => void run('folder')}
                  data-testid="export-html-folder"
                >
                  Choose where…
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready}
              onClick={() => void run('single')}
              data-testid="export-html-single"
            >
              Download {name}.html
            </button>
          )}
        </>
      }
    >
      <div className="py-export html-export">
        <p className="py-hint" data-testid="export-html-about">
          The page is the animation itself, drawn as it plays: sharp at any size, with controls, and
          it opens from disk without a server.
        </p>
        <div className="form-grid py-options">
          <span className="form-label">Export as</span>
          <div className="field-stack" role="radiogroup" aria-label="Export as">
            <label className="py-check">
              <input
                type="radio"
                name={`${id}-form`}
                checked={form === 'folder'}
                onChange={() => setForm('folder')}
                data-testid="export-html-form-folder"
              />
              A folder
              <span className="py-hint">
                To work on the scene by hand or with an agent, and to embed it in another page: the
                scene, its look and its engine are files of their own, with a guide (AGENTS.md).{' '}
                {folders
                  ? `It is written as “${name}” inside the folder you choose; exported again over it, custom.js, player.css and index.html are kept as they are, and the sound of the earlier export is removed when this one does not use it.`
                  : 'This browser cannot write a folder: it is downloaded as a zip.'}
              </span>
            </label>
            <label className="py-check">
              <input
                type="radio"
                name={`${id}-form`}
                checked={form === 'single'}
                onChange={() => setForm('single')}
                data-testid="export-html-form-single"
              />
              One file
              <span className="py-hint">
                To send to someone or to present from: the same page, with everything inside it.
              </span>
            </label>
          </div>
          {hasSound && (
            <>
              <span className="form-label">Sound</span>
              <label className="py-check">
                <input
                  type="checkbox"
                  checked={withSound && soundProblem === null}
                  disabled={soundProblem !== null}
                  onChange={(event) => setWithSound(event.target.checked)}
                  data-testid="export-html-sound"
                />
                The scene’s sound
                <span className="py-hint" data-testid="export-html-sound-note">
                  {soundProblem ??
                    (aac === null
                      ? 'Asking the browser how it can encode it…'
                      : `About ${megabytes(soundSize)}, as ${
                          aac
                            ? 'AAC (audio.m4a)'
                            : 'uncompressed audio (audio.wav): this browser does not encode AAC'
                        }${form === 'single' ? ', inside the page' : ''}. It plays with the scene and stops at its pauses.`)}
                </span>
              </label>
            </>
          )}
          <span className="form-label">Slides</span>
          <div className="field-stack" data-testid="export-html-marks">
            <span>
              {pausesWords(marks)}{' '}
              {marks.comments === 0
                ? ''
                : `${marks.comments} ${marks.comments === 1 ? 'comment' : 'comments'}: notes of the page, and tasks for whoever works on the scene next.`}
            </span>
            {marks.leftOut.length > 0 && (
              <ul className="py-issues" data-testid="export-html-left-out">
                {marks.leftOut.map(({ mark, standing }) => (
                  <li key={mark.id} className="py-issue-warning">
                    {markName(mark)} is left out: it is{' '}
                    {standing === 'outside'
                      ? 'past the end of the scene'
                      : `where ${markCoverName(project, mark.time)} runs`}
                    .
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {pending.length > 0 && (
          <p className="py-waiting" data-testid="export-html-waiting">
            Waiting for {pending.length === 1 ? 'a formula' : `${pending.length} formulas`} to be
            rendered…
          </p>
        )}
        {failure !== null && (
          <p className="py-field-error" role="alert" data-testid="export-html-failure">
            The page could not be exported: {failure}
          </p>
        )}
      </div>
    </Modal>
  );
}
