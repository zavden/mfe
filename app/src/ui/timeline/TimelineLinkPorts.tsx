import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Clip, Project } from '../../model';
import { relatable } from '../relations/relationOps';
import { linkPortCenter, type TracksLayout } from './trackLayout';
import type { LinkState } from './useClipLinking';

interface TimelineLinkPortsProps {
  project: Project;
  layout: TracksLayout;
  pxPerSecond: number;
  /** Shift is held (useClipLinking). */
  shift: boolean;
  /** The link being made, if any: then only its source keeps its port. */
  link: LinkState | null;
  onLinkStart(e: ReactPointerEvent<HTMLElement>, clip: Clip): void;
}

/** The link ports of the clips while Shift is held (useClipLinking), in a layer of their own over
 * the clips and the relation windows: in the lower half of each clip, so they never cover its
 * animation blocks, and under the track headers when the timeline scrolls. Clips of locked tracks
 * have none, nor have braces, shapes and lines: a relation is between formulas and texts. */
export function TimelineLinkPorts({
  project,
  layout,
  pxPerSecond: px,
  shift,
  link,
  onLinkStart,
}: TimelineLinkPortsProps) {
  if (!shift && !link) return null;
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const names = new Map(project.formulas.map((f) => [f.id, f.name]));
  return (
    <div className="tl-link-ports" data-testid="timeline-link-ports">
      {project.clips.map((clip) => {
        if (locked.has(clip.trackId) || (link && link.from !== clip.id)) return null;
        if (!relatable(project, clip)) return null;
        const row = layout.rowOf(clip.trackId);
        if (!row) return null;
        const [left, top] = linkPortCenter(clip, row, px);
        const name = names.get(clip.formulaId) ?? '(missing formula)';
        return (
          <div
            key={clip.id}
            className="tl-link-port"
            data-testid={`clip-${clip.id}-link`}
            // Pointer-only (and only while Shift is held): "Create relation…" in the Animations
            // panel is the accessible way.
            aria-hidden="true"
            title={`Relate ${name} to another clip: click, then click the target (or drag onto it)`}
            style={{ left, top }}
            onPointerDown={(e) => onLinkStart(e, clip)}
          />
        );
      })}
    </div>
  );
}
