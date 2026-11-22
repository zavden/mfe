import { useEffect, useRef, useState } from 'react';
import { inspectAudio } from '../../audio';
import { discardImportedMedia, importAudioOriginal } from '../../media';
import type { AudioAsset } from '../../model';
import { onProjectLoaded, useProjectStore } from '../../store';
import { AUDIO_MIME } from '../dnd';
import { useFileDrop } from '../fileDrop';
import { FileDropOverlay } from '../FileDropOverlay';
import { audioNamePrompt, audioNameTaken } from './audioNames';
import { CommitInput } from './CommitInput';
import { useDocumentStore } from '../project/documentStore';
import { confirmDelete, promptDialog } from '../project/dialogStore';
import { syncCurrentMediaOwnership } from '../project/mediaOwnership';
import { notify } from '../project/noticeStore';
import { addAudioToTimeline } from '../timeline/audioCommands';
import { Icon } from '../timeline/icons';
import './audioCreator.css';
import { refreshAudioMedia } from '../audio/audioRuntime';
import { useMissingMedia, useOriginalAvailable } from '../audio/missingMedia';

function AssetRow({ asset }: { asset: AudioAsset }) {
  const project = useProjectStore((state) => state.project);
  const [sourceStart, setSourceStart] = useState(0);
  const [sourceEnd, setSourceEnd] = useState(Math.min(asset.duration, 3600));
  const available = useOriginalAvailable(asset);
  const clips = project.audioClips.filter((clip) => clip.assetId === asset.id);
  const locked = clips.some(
    (clip) => project.tracks.find((track) => track.id === clip.trackId)?.locked,
  );
  const valid =
    [sourceStart, sourceEnd].every(Number.isFinite) &&
    sourceStart >= 0 &&
    sourceEnd > sourceStart &&
    sourceEnd <= asset.duration &&
    sourceEnd - sourceStart <= 3600;
  const remove = async () => {
    const session = useDocumentStore.getState().session;
    if (
      clips.length &&
      !(await confirmDelete({
        what: 'audio',
        title: 'Delete audio?',
        message: `Delete “${asset.name}” and its ${clips.length} timeline clip(s)?`,
        details: ['Undo restores the original recording and all clip edits.'],
      }))
    )
      return;
    if (useDocumentStore.getState().session !== session) return;
    useProjectStore.getState().update((draft) => {
      if (
        draft.audioClips.some(
          (clip) =>
            clip.assetId === asset.id &&
            draft.tracks.find((track) => track.id === clip.trackId)?.locked,
        )
      )
        return;
      draft.audioClips = draft.audioClips.filter((clip) => clip.assetId !== asset.id);
      draft.audioAssets = draft.audioAssets.filter((item) => item.id !== asset.id);
    });
  };
  return (
    <li className="audio-asset" data-testid={`audio-asset-${asset.id}`} data-audio-id={asset.id}>
      <div className="audio-asset-title">
        <span className="audio-asset-icon" aria-hidden="true">
          <Icon name="waveform" />
        </span>
        {/* The name is typed freely, emptied included, and kept on Enter or on leaving the field:
            one undo step, and never an empty name. */}
        <CommitInput
          label="Audio name"
          testId={`audio-name-${asset.id}`}
          value={asset.name}
          normalize={(name) => name.trim()}
          validate={(name) => (name.trim() ? null : 'A recording needs a name.')}
          onCommit={(name) =>
            useProjectStore.getState().update((draft) => {
              const target = draft.audioAssets.find((item) => item.id === asset.id);
              if (target) target.name = name;
            })
          }
        />
        <button
          type="button"
          className="btn audio-delete"
          data-testid={`audio-delete-${asset.id}`}
          disabled={locked}
          title={locked ? 'A locked track uses this audio' : 'Delete audio'}
          aria-label={`Delete ${asset.name}`}
          onClick={() => void remove()}
        >
          ×
        </button>
      </div>
      <p className="audio-asset-meta">
        {asset.duration < 60
          ? `${+asset.duration.toFixed(2)} s`
          : `${Math.floor(asset.duration / 60)}:${String(Math.floor(asset.duration % 60)).padStart(2, '0')}`}{' '}
        · {(asset.sampleRate / 1000).toFixed(1)} kHz · {clips.length} use
        {clips.length === 1 ? '' : 's'}
      </p>
      {available === false && (
        <p className="audio-missing" role="status">
          Original unavailable. Reimport the original file or open its portable project.
        </p>
      )}
      <div className="audio-source-range">
        <label>
          From (s)
          <input
            type="number"
            data-testid={`audio-add-from-${asset.id}`}
            min={0}
            max={asset.duration}
            step={0.01}
            value={sourceStart}
            onChange={(event) => setSourceStart(event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          To (s)
          <input
            type="number"
            data-testid={`audio-add-to-${asset.id}`}
            min={sourceStart}
            max={asset.duration}
            step={0.01}
            value={sourceEnd}
            onChange={(event) => setSourceEnd(event.currentTarget.valueAsNumber)}
          />
        </label>
      </div>
      {asset.duration > 3600 && (
        <p className="audio-help">Choose up to 60 minutes of this recording for each placement.</p>
      )}
      <button
        type="button"
        className="btn audio-add"
        data-testid={`audio-add-${asset.id}`}
        disabled={!valid || available === false}
        draggable={valid && available !== false}
        onDragStart={(event) => {
          event.dataTransfer.setData(
            AUDIO_MIME,
            JSON.stringify({ assetId: asset.id, sourceStart, sourceEnd }),
          );
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => addAudioToTimeline(asset.id, sourceStart, sourceEnd)}
      >
        Add to timeline
      </button>
    </li>
  );
}

export function AudioTab() {
  const assets = useProjectStore((state) => state.project.audioAssets);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  /** The files still to import, in the order they were given. */
  const waiting = useRef<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** Stop the import under way and forget the files that wait for it. */
  const cancel = () => {
    waiting.current = [];
    active.current?.abort();
  };
  useEffect(() => {
    const off = onProjectLoaded(cancel);
    return () => {
      off();
      cancel();
    };
  }, []);
  /** Import `files` one after another. Files given while an import is under way (dropped on the
   * tab) wait for their turn in it; Cancel, or another project, drops the ones still waiting. */
  const importFiles = async (files: File[]) => {
    waiting.current.push(...files);
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const session = useDocumentStore.getState().session;
    while (!controller.signal.aborted) {
      const file = waiting.current.shift();
      if (!file) break;
      setStatus(`Preparing ${file.name}…`);
      let published = false;
      try {
        const imported = await importAudioOriginal(
          file,
          (blob, signal) => inspectAudio(blob, { signal }),
          {
            signal: controller.signal,
            onProgress: (done, total) =>
              setStatus(
                `Importing ${file.name} · ${Math.round((done / Math.max(1, total)) * 100)}%`,
              ),
          },
        );
        if (controller.signal.aborted || useDocumentStore.getState().session !== session) {
          // Another document: what waited was meant for the one that is gone.
          if (!controller.signal.aborted) waiting.current = [];
          await discardImportedMedia(imported.lease, [imported.asset.contentHash]);
          break;
        }
        const assets = useProjectStore.getState().project.audioAssets;
        const known = assets.find((item) => item.contentHash === imported.asset.contentHash);
        // The same file imported again: it repairs a recording the project had lost.
        const repaired =
          !!known && useMissingMedia.getState().missing.has(imported.asset.contentHash);
        let asset = imported.asset;
        if (!known && audioNameTaken(assets, asset.name)) {
          // Another recording under a name in use: it gets a name of its own, or stays out.
          const name = await promptDialog(audioNamePrompt(assets, asset.name, file.name));
          const replaced = useDocumentStore.getState().session !== session;
          if (name === null || replaced || controller.signal.aborted) {
            if (replaced) waiting.current = [];
            await discardImportedMedia(imported.lease, [asset.contentHash]);
            if (replaced || controller.signal.aborted) break;
            continue;
          }
          asset = { ...asset, name };
        }
        useProjectStore.getState().update((draft) => {
          if (!draft.audioAssets.some((item) => item.contentHash === asset.contentHash))
            draft.audioAssets.push(asset);
        });
        published = true;
        if (repaired) useDocumentStore.getState().noteMediaReturned(asset.contentHash);
        else if (known)
          notify({
            kind: 'info',
            title: `${file.name} is already in this project`,
            message: `It is the recording “${known.name}”.`,
          });
        // Availability is independent of other missing originals blocking recovery ownership.
        refreshAudioMedia();
        await syncCurrentMediaOwnership();
        await imported.lease.release();
      } catch (error) {
        if (!controller.signal.aborted)
          notify({
            kind: published ? 'warning' : 'error',
            title: published
              ? 'Audio imported; recovery needs attention'
              : `Could not import ${file.name}`,
            message: error instanceof Error ? error.message : String(error),
          });
      }
    }
    active.current = null;
    setStatus(null);
    // Files given after a cancel, while the cancelled import was still winding down.
    if (waiting.current.length) void importFiles([]);
  };
  const drop = useFileDrop({ onFiles: (files) => void importFiles(files) });
  const visible = assets.filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="audio-library" data-testid="creator-audio" {...drop.area}>
      <div className="audio-library-toolbar">
        <span className="creator-search-field">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search audio…"
            aria-label="Search audio"
            data-testid="audio-search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </span>
        <button
          type="button"
          className="btn"
          data-testid="audio-import"
          disabled={status !== null}
          onClick={() => input.current?.click()}
        >
          Import audio…
        </button>
        <input
          type="file"
          hidden
          ref={input}
          multiple
          accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm"
          data-testid="audio-file-input"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void importFiles(files);
          }}
        />
      </div>
      {status && (
        <div className="audio-import-status" role="status">
          {status}
          <button type="button" className="btn" data-testid="audio-import-cancel" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {assets.length === 0 && (
        <p className="placeholder">
          Import MP3, WAV or other supported audio, or drop the files here. Add a source interval to
          an audio track, then edit its volume curve in the timeline.
        </p>
      )}
      <ul className="audio-asset-list">
        {visible.map((asset) => (
          <AssetRow key={asset.id} asset={asset} />
        ))}
      </ul>
      {drop.over && <FileDropOverlay testId="audio-drop">Drop audio to import it</FileDropOverlay>}
    </div>
  );
}
