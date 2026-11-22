import { useEffect, useId, useRef } from 'react';
import type { Project } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { addToTimeline } from '../creator/formulaActions';
import { BlockDialogHost } from './BlockDialog';
import { PanelFrame } from '../PanelFrame';
import { RelationChainHost } from '../relations/RelationChainHost';
import { PathPickerHost } from '../relations/PathPickerDialog';
import { RelationProperties } from '../relations/RelationProperties';
import { relatable } from '../relations/relationOps';
import { CreateRelation, RelationsSection } from '../relations/RelationsSection';
import { isCameraSelection, selectedBlock } from '../selection';
import { deleteClipsAsking } from '../timeline/clipActions';
import { editableClips } from '../timeline/clipOps';
import { regionLabel } from '../timeline/region';
import { useTimelineStore } from '../timeline/timelineStore';
import { BlockProperties } from './BlockProperties';
import { GlyphsDialogHost } from './GlyphsDialog';
import { ClipProperties } from './ClipProperties';
import { ColourOrderStrip } from './ColourOrderStrip';
import './animations.css';
import { formulaContext } from './context';
import { PropertiesHeader } from './PropertiesHeader';
import { AudioProperties } from '../audio/AudioProperties';
import { CameraProperties } from '../camera/CameraProperties';
import { SplitBlockHost } from './SplitBlockDialog';

/** The drawing of the empty panel: a card of glass that plays, tilted, with two more behind it,
 * over a line of three keyframes whose middle one is on. Drawn with the theme's tokens
 * (animations.css), decorative only. */
function EmptyArt() {
  const id = useId();
  return (
    <svg className="an-empty-art" viewBox="0 0 132 92" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop className="an-empty-glass-from" offset="0" />
          <stop className="an-empty-glass-to" offset="1" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop className="an-empty-sheen-from" offset="0" />
          <stop className="an-empty-sheen-to" offset="0.55" />
        </linearGradient>
      </defs>
      <g transform="skewY(-5)">
        <rect className="an-empty-back" x="43" y="21" width="76" height="50" rx="8" opacity="0.3" />
        <rect
          className="an-empty-back"
          x="32"
          y="17"
          width="78"
          height="51"
          rx="8"
          opacity="0.55"
        />
        <rect
          className="an-empty-card"
          x="21"
          y="13"
          width="80"
          height="52"
          rx="8"
          fill={`url(#${id}-glass)`}
        />
        <rect
          className="an-empty-sheen"
          x="22"
          y="14"
          width="78"
          height="50"
          rx="7"
          fill={`url(#${id}-sheen)`}
        />
        <path
          className="an-empty-play"
          d="M55 31.5v15a1.6 1.6 0 0 0 2.4 1.4l12.4-7.5a1.6 1.6 0 0 0 0-2.8L57.4 30.1A1.6 1.6 0 0 0 55 31.5Z"
        />
      </g>
      <line className="an-empty-track" x1="12" y1="82" x2="110" y2="82" />
      <rect
        className="an-empty-key"
        x="8.5"
        y="78.5"
        width="7"
        height="7"
        transform="rotate(45 12 82)"
      />
      <rect
        className="an-empty-key"
        x="106.5"
        y="78.5"
        width="7"
        height="7"
        transform="rotate(45 110 82)"
      />
      <rect
        className="an-empty-key is-on"
        x="56.5"
        y="77.5"
        width="9"
        height="9"
        rx="1"
        transform="rotate(45 61 82)"
      />
    </svg>
  );
}

/** Whether the clip `id` can take part in a relation: a formula or a text. */
function relatableId(project: Project, id: string): boolean {
  const clip = project.clips.find((c) => c.id === id);
  return clip !== undefined && relatable(project, clip);
}

/** Nothing to edit: the drawing, and the sentence that says what to do. */
function EmptyState() {
  return (
    <div className="an-empty">
      <EmptyArt />
      <p className="placeholder an-empty-text" data-testid="animations-empty">
        Select a clip on the timeline to edit its animations.
      </p>
    </div>
  );
}

/** The clips of a formula selected in the Creator, each with its relations. */
function FormulaRelations({ formulaId }: { formulaId: string }) {
  const project = useProjectStore((s) => s.project);
  const select = useUiStore((s) => s.select);
  /** The region marked on the timeline (D180): «Add to the timeline» puts the clip in it. */
  const region = useTimelineStore((s) => s.region);
  const formula = project.formulas.find((f) => f.id === formulaId);
  const clips = project.clips.filter((c) => c.formulaId === formulaId);
  if (!formula) return null;
  return (
    <div className="an-clip" data-testid="formula-relations">
      <PropertiesHeader
        context={formulaContext(project, formula)}
        color={formula.tag.color}
        titleTestId="formula-title"
        title={`${formula.tag.icon ? `${formula.tag.icon} ` : ''}${formula.name}`}
      />
      {clips.length === 0 && (
        <div className="an-hint" data-testid="formula-no-clips" style={{ padding: '8px 10px' }}>
          <p>
            This formula is not on the timeline yet. Drag it there, or add it{' '}
            {region
              ? `in the region marked on the timeline (${regionLabel(region)})`
              : 'at the playhead'}
            , to animate it and relate it to other formulas.
          </p>
          <button
            type="button"
            className="an-small-button"
            data-testid="formula-add-to-timeline"
            onClick={() => addToTimeline([formula.id])}
          >
            Add to the timeline
          </button>
        </div>
      )}
      {clips.map((clip) => {
        const track = project.tracks.find((t) => t.id === clip.trackId);
        return (
          <section key={clip.id} className="rel-clip-card" data-testid={`formula-clip-${clip.id}`}>
            <header>
              <h3>
                {track?.name ?? '?'} · {clip.start.toFixed(1)}–{clip.end.toFixed(1)} s
              </h3>
              <button
                type="button"
                className="an-small-button"
                onClick={() => select({ kind: 'clips', ids: [clip.id] })}
              >
                Select clip
              </button>
            </header>
            <div className="an-section-body">
              <RelationsSection clipId={clip.id} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function AnimationsPanel() {
  const selection = useUiStore((s) => s.selection);
  const viewRef = useRef<HTMLDivElement>(null);
  /** The last element focused in the panel. */
  const lastFocused = useRef<HTMLElement | null>(null);
  // A button that changes the view (Select clip, a block row, Delete clip…) disappears with it
  // and the focus falls to the page: hand it to the new view's title instead.
  useEffect(() => {
    const last = lastFocused.current;
    if (!last || last.isConnected) return;
    lastFocused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    viewRef.current?.querySelector<HTMLElement>('h2[tabindex]')?.focus();
  }, [selection]);
  const project = useProjectStore((s) => s.project);
  const ids =
    selection.kind === 'clips'
      ? selection.ids.filter((id) => project.clips.some((c) => c.id === id))
      : [];
  const audioIds =
    selection.kind === 'clips'
      ? selection.ids.filter((id) => project.audioClips.some((clip) => clip.id === id))
      : [];
  const block = selectedBlock(selection, project.clips);

  return (
    <PanelFrame
      title={audioIds.length ? (ids.length ? 'Properties' : 'Audio') : 'Animations'}
      icon="film"
      testId="panel-animations"
      fold="animations"
      bodyClassName="animations-body"
    >
      <div
        className="an-view"
        ref={viewRef}
        onFocusCapture={(e) => (lastFocused.current = e.target as HTMLElement)}
      >
        <ColourOrderStrip />
        {audioIds.length > 0 && <AudioProperties ids={audioIds} />}
        {block && <BlockProperties clipId={block.clip.id} actionId={block.action.id} />}
        {isCameraSelection(selection) && <CameraProperties selection={selection} />}
        {!block &&
          ids.length === 0 &&
          audioIds.length === 0 &&
          (selection.kind === 'none' ||
            selection.kind === 'clips' ||
            selection.kind === 'action') && <EmptyState />}
        {ids.length === 0 && selection.kind === 'formula' && (
          <FormulaRelations formulaId={selection.id} />
        )}
        {ids.length === 0 && selection.kind === 'formulas' && (
          <p className="placeholder" data-testid="animations-formulas">
            {selection.ids.length} formulas selected. Right-click one of them in the Creator to edit
            them together or delete them.
          </p>
        )}
        {ids.length === 0 &&
          selection.kind === 'relation' &&
          (project.relations.some((r) => r.id === selection.id) ? (
            <RelationProperties relationId={selection.id} />
          ) : (
            <EmptyState />
          ))}
        {ids.length === 1 && <ClipProperties clipId={ids[0]!} />}
        {ids.length > 1 && (
          <div className="an-multi" data-testid="animations-multi">
            <p>
              <strong>{ids.length} clips selected</strong>
            </p>
            {ids.length === 2 && ids.every((id) => relatableId(project, id)) && (
              <div className="an-multi-pair" data-testid="animations-pair">
                <p className="an-hint">Relate these two clips:</p>
                <CreateRelation clipId={ids[0]!} otherId={ids[1]!} />
              </div>
            )}
            <button
              type="button"
              className="an-small-button"
              data-testid="animations-delete-selected"
              onClick={() => {
                const doomed = new Set(editableClips(project, ids).map((c) => c.id));
                if (doomed.size === 0) return;
                void deleteClipsAsking(doomed);
              }}
            >
              Delete {ids.length} clips
            </button>
            <p className="an-hint">Select a single clip to edit its animations.</p>
          </div>
        )}
        <RelationChainHost />
        <BlockDialogHost />
        <SplitBlockHost />
        <PathPickerHost />
        <GlyphsDialogHost />
      </div>
    </PanelFrame>
  );
}
