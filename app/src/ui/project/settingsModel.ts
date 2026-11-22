/* Project settings: the editable draft and its validation (ranges follow model/schema.ts). */
import type { ProjectMeta, Target } from '../../model';

export const RESOLUTION_PRESETS = [
  { id: '1920x1080', label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
  { id: '1280x720', label: '1280 × 720 (HD)', width: 1280, height: 720 },
  { id: '3840x2160', label: '3840 × 2160 (4K)', width: 3840, height: 2160 },
] as const;

export const FPS_PRESETS = [24, 25, 30, 60] as const;

export interface Draft {
  name: string;
  target: Target;
  resolution: string; // preset id or 'custom'
  width: string;
  height: string;
  fps: string; // preset value or 'custom'
  customFps: string;
  background: string;
  preamble: string;
  durationMode: 'auto' | 'fixed';
  duration: string;
}

export function toDraft(meta: ProjectMeta): Draft {
  const preset = RESOLUTION_PRESETS.find((p) => p.width === meta.width && p.height === meta.height);
  const fpsPreset = (FPS_PRESETS as readonly number[]).includes(meta.fps);
  return {
    name: meta.name,
    target: meta.target,
    resolution: preset ? preset.id : 'custom',
    width: String(meta.width),
    height: String(meta.height),
    fps: fpsPreset ? String(meta.fps) : 'custom',
    customFps: String(meta.fps),
    background: meta.background,
    preamble: meta.preamble,
    durationMode: meta.duration === null ? 'auto' : 'fixed',
    duration: String(meta.duration ?? 5),
  };
}

type Parsed = { ok: true; meta: ProjectMeta } | { ok: false; errors: Record<string, string> };

function parseInteger(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

/** Validate a draft against the schema's ranges (see model/schema.ts). */
export function parseDraft(draft: Draft): Parsed {
  const errors: Record<string, string> = {};
  const preset = RESOLUTION_PRESETS.find((p) => p.id === draft.resolution);
  const width = preset ? preset.width : parseInteger(draft.width, 16, 7680);
  const height = preset ? preset.height : parseInteger(draft.height, 16, 4320);
  if (width === null) errors.width = 'Width: a whole number from 16 to 7680.';
  if (height === null) errors.height = 'Height: a whole number from 16 to 4320.';
  const fps = draft.fps === 'custom' ? parseInteger(draft.customFps, 1, 240) : Number(draft.fps);
  if (fps === null) errors.fps = 'Frame rate: a whole number from 1 to 240.';
  let duration: number | null = null;
  if (draft.durationMode === 'fixed') {
    const n = Number(draft.duration);
    if (!Number.isFinite(n) || n <= 0 || n > 36000) errors.duration = 'Duration: seconds, above 0.';
    else duration = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    meta: {
      name: draft.name.trim() || 'Untitled',
      target: draft.target,
      width: width!,
      height: height!,
      fps: fps!,
      background: draft.background,
      preamble: draft.preamble,
      duration,
    },
  };
}
