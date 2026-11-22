/* Development-only handle on the app state for end-to-end tests and debugging
 * (`window.__mfe` in `npm run dev`; absent from production builds). */
import { parseProject } from './model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from './store';
import { usePreferences } from './ui/preferences';
import { useDocumentStore } from './ui/project/documentStore';
import { useLibraryStore } from './ui/project/libraryStore';
import { collectMedia } from './ui/project/mediaCollection';
import { useMorphEditorStore } from './ui/morph/morphEditorStore';
import { usePathEdit } from './ui/preview/pathEdit';

export const devtools = {
  parseProject,
  loadProject,
  history,
  useProjectStore,
  useRenderStore,
  useUiStore,
  usePreferences,
  useDocumentStore,
  useLibraryStore,
  useMorphEditorStore,
  usePathEdit,
  collectMedia,
};

declare global {
  interface Window {
    __mfe?: typeof devtools;
  }
}

export function installDevtools(): void {
  window.__mfe = devtools;
}
