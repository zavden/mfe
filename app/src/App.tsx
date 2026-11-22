import { useEffect, useState } from 'react';
import { AppLayout } from './ui/AppLayout';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { initializeNewEditorProject, restoreDocumentHandle } from './ui/project/actions';
import { restoreAutosave } from './ui/project/autosave';
import { watchPaletteLibrary } from './ui/colors/paletteStore';
import { watchTemplateLibrary } from './ui/creator/templates/userLibraryStore';
import { guardFileDrops } from './ui/fileDrop';

export default function App() {
  // Bring back the autosaved project before anything renders (a page reload keeps the work),
  // then its file handle, so that Save writes the same file again.
  useState(() => {
    const restored = restoreAutosave();
    if (restored) void restoreDocumentHandle();
    else initializeNewEditorProject();
    return restored;
  });
  useEffect(watchPaletteLibrary, []);
  useEffect(watchTemplateLibrary, []);
  // A file dropped beside the places that take one must not open in place of the editor.
  useEffect(() => guardFileDrops(), []);
  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  );
}
