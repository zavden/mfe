import { useEffect, useRef, useState } from 'react';
import { usePaletteImport, type ImportedPalette } from '../colors/usePaletteImport';
import { carriesType, useFileDrop } from '../fileDrop';
import { FileDropOverlay } from '../FileDropOverlay';
import { Modal } from '../project/Modal';
import { ownEscape } from '../project/modalStack';
import { HOST_NAME, startChromaHost, type ChromaHost } from './hostBridge';
import { upstream } from './snapshot.json';
import './chroma.css';

export interface ChromaLabDialogProps {
  onClose: () => void;
  /** A theme file entered the editor's library: the caller shows it there. */
  onImported: (palette: ImportedPalette) => void;
  onLibrary: () => void;
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" />
      <path
        d="M7 6.3v3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="7" cy="3.9" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Chroma owns its document, storage and undo. A theme reaches the editor's library in two ways,
 * both the user's own act. Chroma Lab's "Send to Manim Formula Editor" button hands it over
 * through the host bridge (`hostBridge.ts`): the dialog presents the editor to the frame and
 * imports what the frame sends, as it would a file. Or the theme downloaded in the frame as JSON
 * is chosen here, or dragged onto the dialog. The dialog takes a drag only when the browser
 * calls one of its files JSON: anything else (a picture for Chroma's extractor, a file whose
 * type the browser keeps to itself) stays Chroma's.
 *
 * The frame has the whole body of the dialog. What the editor adds is in the title bar: Import
 * palette…, Editor palettes…, and an information button whose panel tells how a theme reaches
 * the editor and links the notices of Chroma Lab. The panel closes on its button, on Escape, on a
 * press elsewhere and when the focus goes into the frame — whose presses this document never
 * hears, but its window loses the focus to it. */
export function ChromaLabDialog({ onClose, onImported, onLibrary }: ChromaLabDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const files = usePaletteImport({ onImported, onError: setError });
  const drop = useFileDrop({
    accepts: (data) => carriesType(data, 'application/json'),
    onFiles: files.importFiles,
  });
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<ChromaHost | null>(null);
  /** Chroma Lab has answered: its Send button is on its page. */
  const [connected, setConnected] = useState(false);
  /** The information panel is open. */
  const [info, setInfo] = useState(false);
  const infoArea = useRef<HTMLDivElement>(null);
  const infoButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!info) return;
    const close = () => setInfo(false);
    const onPress = (event: PointerEvent) => {
      if (!infoArea.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPress, true);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      window.removeEventListener('blur', close);
    };
  }, [info]);
  const importTheme = useRef(files.importTheme);
  useEffect(() => {
    importTheme.current = files.importTheme;
  });
  useEffect(() => {
    const host = startChromaHost({
      host: window,
      frame: () => frame.current?.contentWindow ?? null,
      onTheme: async (theme) => {
        await importTheme.current(theme);
        return { ok: true, message: 'The theme is in the editor’s palettes.' };
      },
      onReady: () => setConnected(true),
    });
    bridge.current = host;
    return () => {
      bridge.current = null;
      host.stop();
    };
  }, []);
  return (
    <Modal
      title="Chroma Lab"
      testId="chroma-lab-dialog"
      width="1440px"
      resizable
      allowHistory={false}
      onClose={onClose}
      headerTools={
        <>
          <button
            type="button"
            className="btn btn-small"
            data-testid="chroma-lab-import"
            aria-describedby="chroma-lab-transfer-help"
            onClick={files.pick}
          >
            Import palette…
          </button>
          <input {...files.input} data-testid="chroma-lab-import-input" />
          <button
            type="button"
            className="btn btn-small"
            data-testid="chroma-lab-library"
            onClick={onLibrary}
          >
            Editor palettes…
          </button>
          <div
            className="chroma-lab-info"
            ref={infoArea}
            {...ownEscape(info)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !info) return;
              // The panel's Escape: the dialog stays, and the focus goes back to the button.
              event.stopPropagation();
              setInfo(false);
              infoButton.current?.focus();
            }}
          >
            <button
              type="button"
              className="modal-header-button"
              aria-label="How a theme reaches the editor"
              title="How a theme reaches the editor"
              aria-expanded={info}
              aria-controls="chroma-lab-info-panel"
              data-testid="chroma-lab-info"
              ref={infoButton}
              onClick={() => setInfo(!info)}
            >
              <InfoIcon />
            </button>
            {/* Always in the document: Import palette… is described by its text. */}
            <div
              id="chroma-lab-info-panel"
              className="chroma-lab-info-panel"
              data-testid="chroma-lab-info-panel"
              hidden={!info}
            >
              <p id="chroma-lab-transfer-help">
                In Exploration, <strong>Send to {HOST_NAME}</strong> under “Use in your animation”
                puts the theme in the editor’s palettes; Seeds &amp; themes has the same button. A
                theme saved with <strong>JSON</strong> can be imported with Import palette…, or
                dragged onto this dialog. The general “Export palette” file does not contain colour
                roles.
              </p>
              <a
                href="./chroma-lab/vendor/README.md"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="chroma-lab-notices"
              >
                Chroma Lab {upstream.packageVersion} · Notices
              </a>
            </div>
          </div>
        </>
      }
      footer={
        <>
          <p className="chroma-lab-reminder" data-testid="chroma-lab-reminder">
            Send or export your theme before closing. Browser storage may be unavailable.
          </p>
          <button type="button" className="btn" data-testid="chroma-lab-done" onClick={onClose}>
            Close Chroma Lab
          </button>
        </>
      }
    >
      <div
        className="chroma-lab-host"
        data-testid="chroma-lab-host"
        data-bridge={connected ? 'ready' : 'waiting'}
        {...drop.area}
      >
        {error && (
          <p role="alert" className="chroma-lab-error" data-testid="chroma-lab-import-error">
            {error}
          </p>
        )}
        <iframe
          className="chroma-lab-frame"
          data-testid="chroma-lab-frame"
          title="Chroma Lab color studio"
          src="./chroma-lab/index.html"
          tabIndex={0}
          ref={frame}
          onLoad={(event) => {
            drop.watchFrame(event.currentTarget);
            bridge.current?.present();
          }}
        />
        {drop.over && (
          <FileDropOverlay testId="chroma-lab-drop">
            Drop the theme JSON to import it into the editor
          </FileDropOverlay>
        )}
      </div>
    </Modal>
  );
}
