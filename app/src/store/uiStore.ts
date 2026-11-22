/* Editor UI state that is not part of the project file and is not undoable. */
import { create } from 'zustand';
import type {
  ActionId,
  CameraMoveId,
  CameraTargetId,
  ClipId,
  FormulaId,
  RelationId,
} from '../model';

export type Selection =
  | { kind: 'none' }
  | { kind: 'formula'; id: FormulaId }
  /** Two or more formulas of the Creator list (Ctrl/⌘+click, Shift+click). */
  | { kind: 'formulas'; ids: FormulaId[] }
  | { kind: 'clips'; ids: ClipId[] }
  | { kind: 'relation'; id: RelationId }
  /** One animation block (clip action) on the timeline. */
  | { kind: 'action'; clipId: ClipId; actionId: ActionId }
  /** A move of the scene's camera: a block of the timeline's Camera row (D190). */
  | { kind: 'cameraMove'; id: CameraMoveId }
  /** A target camera of the scene. */
  | { kind: 'targetCamera'; id: CameraTargetId }
  /** The scene's camera itself: the frame it rests in at the playhead. */
  | { kind: 'camera' };

export interface UiState {
  selection: Selection;
  /** Playhead position, seconds. */
  time: number;
  playing: boolean;
  select(selection: Selection): void;
  setTime(time: number): void;
  setPlaying(playing: boolean): void;
}

export const useUiStore = create<UiState>()((set) => ({
  selection: { kind: 'none' },
  time: 0,
  playing: false,
  select: (selection) => set({ selection }),
  setTime: (time) => set({ time: Math.max(0, time) }),
  setPlaying: (playing) => set({ playing }),
}));
