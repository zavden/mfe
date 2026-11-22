/* Public API of the stores. */
export {
  history,
  HISTORY_LIMIT,
  loadProject,
  onProjectAmended,
  onProjectLoaded,
  projectLoads,
  useProjectStore,
  type ProjectState,
  type ProjectGesture,
} from './projectStore';
export {
  useRenderStore,
  type FormulaRenderEntry,
  type FormulaRenderStatus,
  type GlyphTransition,
  type RenderState,
} from './renderStore';
export { useUiStore, type Selection, type UiState } from './uiStore';
export { createVisualProjectSelector } from './visualProject';
export { startAttachSync } from './attachSync';
export { startTextPreparation } from './textPreparation';
export {
  CONFIDENCE_THRESHOLD,
  describeWarning,
  startRenderSync,
  refreshFormulaRender,
  useSyncWarnings,
  type SyncWarning,
} from './renderSync';
