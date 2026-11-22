import { useEffect, useState } from 'react';
import { audioSourceEnd } from '../../model';
import { onProjectLoaded, useProjectStore } from '../../store';
import { AudioClipEditor } from '../timeline/AudioClipEditor';
import { splitAtPlayhead } from '../timeline/splitActions';
import { useMissingMedia } from './missingMedia';

export function AudioProperties({ ids }: { ids: readonly string[] }) {
  const project = useProjectStore((state) => state.project);
  const missing = useMissingMedia((state) => state.missing);
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => onProjectLoaded(() => setEditing(null)), []);
  const clips = project.audioClips.filter((clip) => ids.includes(clip.id));
  if (!clips.length) return null;
  // The panel's own look (animations.css): the header bar, then a card for each clip.
  return (
    <section className="an-audio" data-testid="audio-properties">
      <header className="an-props-header">
        <h2 tabIndex={-1}>{clips.length === 1 ? 'Audio clip' : `${clips.length} audio clips`}</h2>
      </header>
      {clips.slice(0, 20).map((clip) => {
        const asset = project.audioAssets.find((item) => item.id === clip.assetId);
        const track = project.tracks.find((item) => item.id === clip.trackId);
        return (
          <div key={clip.id} className="an-section an-audio-card">
            <div className="an-section-body">
              <strong className="an-audio-name">{asset?.name ?? 'Missing audio'}</strong>
              <p className="an-audio-times">
                {clip.start.toFixed(2)}–{clip.end.toFixed(2)} s · {track?.name}
              </p>
              <p className="audio-help">
                Source {clip.sourceStart.toFixed(2)}–{audioSourceEnd(clip).toFixed(2)} s
                {track?.muted ? ' · Muted' : ''}
                {track?.locked ? ' · Locked' : ''}
              </p>
              {asset && missing.has(asset.contentHash) && (
                <p className="audio-missing" role="status">
                  Missing media: the clip is silent. Import “{asset.originalName || asset.name}”
                  again in the Audio tab to restore it.
                </p>
              )}
              <button
                type="button"
                className="btn btn-small"
                data-testid={`audio-properties-edit-${clip.id}`}
                onClick={() => setEditing(clip.id)}
              >
                Volume, fades and trim…
              </button>
            </div>
          </div>
        );
      })}
      {clips.length > 20 && (
        <p className="audio-help an-audio-more">
          Select fewer clips to edit their individual properties.
        </p>
      )}
      <div className="an-audio-actions">
        <button
          type="button"
          className="btn"
          data-testid="audio-properties-split"
          onClick={() => void splitAtPlayhead()}
        >
          Split selected audio at playhead
        </button>
      </div>
      {editing && (
        <AudioClipEditor key={editing} clipId={editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
