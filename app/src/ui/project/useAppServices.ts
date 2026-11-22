/* Application-wide background services, started once by the layout: session tracking (the
 * editing sessions that live outside the project stay on their document, sessionTracking.ts), the
 * render sync (formula renders and snapshots), the text preparation (the companion's text worker,
 * asked for when the project has font text), the attach sync (objects pegged to glyphs of other
 * clips), the mode of the preview that ends with what it works on (the colours pasted in
 * order), the word a clip that starts empty gets when an edit leaves it with nothing to show
 * (startsEmptyNotice.ts), unsaved-changes tracking, the ownership of the project's originals,
 * autosave, the collection of originals nothing needs any more, the watch on recordings whose
 * original is missing, the project library synced before, the templates kept in that folder
 * (templatesFolder.ts), the word on what a browser without access to files cannot do
 * (fileAccess.ts), the window title, the global keyboard shortcuts, the menu key where the
 * browser has none (contextMenuKey.ts) and the Control key, which tells a pinch of the trackpad
 * from a wheel (pinch.ts).
 *
 * A service that listens is a `start…(): () => void` whose result stops it, run from an effect.
 * No module listens to a store by being imported: a listener that nothing can stop outlives a hot
 * reload and runs in every test that imports the module. */
import { useEffect } from 'react';
import { startColourOrderTracking } from '../preview/colourOrder';
import {
  startAttachSync,
  startRenderSync,
  startTextPreparation,
  useProjectStore,
} from '../../store';
import { startStartsEmptyNotice } from '../animations/startsEmptyNotice';
import { startSlideGuard } from '../slides/slideGuard';
import { startMissingMedia } from '../audio/missingMedia';
import { startContextMenuKey } from '../contextMenuKey';
import { startControlKey } from '../pinch';
import { startTemplatesFolder } from '../creator/templates/templatesFolder';
import { startAutosave } from './autosave';
import { useDocumentStore, useDocumentTracking } from './documentStore';
import { startFileAccessNotice } from './fileAccess';
import { restoreLibrary } from './libraryStore';
import { useGlobalShortcuts } from './shortcuts';
import { startMediaCollection } from './mediaCollection';
import { startMediaOwnership } from './mediaOwnership';
import { startSessionTracking } from './sessionTracking';

const APP_NAME = 'Manim Formula Editor';

export function useAppServices(): void {
  // The sessions first: a change reaches them before the syncs, which may amend the project in
  // answer to it.
  useEffect(() => startSessionTracking(), []);
  useEffect(() => startRenderSync(), []);
  useEffect(() => startTextPreparation(), []);
  useEffect(() => startAttachSync(), []);
  useEffect(() => startColourOrderTracking(), []);
  useEffect(() => startStartsEmptyNotice(), []);
  useEffect(() => startSlideGuard(), []);
  useDocumentTracking();
  useEffect(() => startMediaOwnership(), []);
  useEffect(() => startAutosave(), []);
  useEffect(() => startMediaCollection(), []);
  useEffect(() => startMissingMedia(), []);
  useEffect(() => {
    void restoreLibrary();
  }, []);
  useEffect(() => startTemplatesFolder(), []);
  useEffect(() => startFileAccessNotice(), []);
  useGlobalShortcuts();
  useEffect(() => startContextMenuKey(), []);
  useEffect(() => startControlKey(), []);

  const name = useProjectStore((state) => state.project.meta.name);
  const dirty = useDocumentStore((state) => state.dirty);
  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${name} — ${APP_NAME}`;
  }, [name, dirty]);
}
