import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { getEngine } from '../engine';
import { TARGET_NAMES } from '../model';
import { history, useProjectStore, useRenderStore, useUiStore } from '../store';
import { deleteFormula } from './creator/formulaActions';
import { openExportDialog, useExportDialog } from './export/exportStore';
import { rovingIndex, typeAheadIndex } from './focus';
import { openHelpDialog } from './help/helpStore';
import {
  newProject,
  openExample,
  renameProject,
  saveProject,
  saveProjectAs,
} from './project/actions';
import { recoverAutosave, recoverableAutosaves, timeAgo } from './project/autosave';
import { animationLabel } from './animations/catalogue';
import { ColorMatchDialogHost } from './colors/ColorMatchDialog';
import { useColorMatchDialog } from './colors/colorMatchDialogStore';
import { DefaultAnimationsDialog } from './project/DefaultAnimationsDialog';
import { ScaleStepDialog } from './project/ScaleStepDialog';
import { SplitSuffixDialog } from './project/SplitSuffixDialog';
import { StandardScaleDialog } from './project/StandardScaleDialog';
import { documentStatus, onDocumentReplaced, useDocumentStore } from './project/documentStore';
import { openProjectsDialog, syncFolder } from './project/libraryStore';
import { useHistoryState } from './project/useHistoryState';
import { cancelTextCompositionForHistory } from './text/textCompositionStore';
import { FOLDABLE_PANELS, usePanels } from './panelsStore';
import { toggleCameraView, toggleMulticamera } from './camera/cameraActions';
import {
  addCommentAtPlayhead,
  addPauseAtPlayhead,
  addPausesAfterAnimations,
  deleteEveryPause,
  keepWaitAtEveryPause,
  skipWaitAtEveryPause,
  toggleSlides,
} from './slides/slideActions';
import { usePreviewView } from './preview/viewStore';
import { isMac, keyHint } from './platform';
import { saveAsKeys, syncFolderKeys } from './project/shortcuts';
import { STARTER_EXAMPLES } from './project/starterExamples';
import { usePreferences } from './preferences';
import { preferencesMenuItems } from './preferencesMenu';
import type { Theme, ThemeChoice } from './theme';
import { rendererSummary, rendererTooltip } from './engineStatus';
import { companionTooltip, useCompanionState } from './useCompanion';
import { BrandMark } from './BrandMark';
import { MenuPopup } from './MenuPopup';
import {
  copyProperties,
  PASTE_GROUPS,
  pasteLabel,
  pasteProperties,
  usePropertyClipboard,
} from './preview/propertyClipboard';
import { startColourCopy, startColourPaste, useColourOrder } from './preview/colourOrder';
import { toggleLockedSymbolAlign, useSymbolAlign } from './preview/symbolAlign';
import { highlightedClipIds } from './selection';
import {
  ALIGN_ACTIONS,
  alignableSelection,
  alignSelection,
  DISTRIBUTE_ACTIONS,
  distributeSelection,
} from './preview/alignActions';
import type { MenuEntry } from './MenuPopup';
import { ChromaLabDialog } from './chroma/ChromaLabDialog';
import { PaletteLibraryDialog } from './colors/PaletteLibraryDialog';
import type { ImportedPalette } from './colors/usePaletteImport';
import { ApplyPaletteDialog } from './colors/ApplyPaletteDialog';
import { getActivePalette, usePaletteStore } from './colors/paletteStore';
import { Icon } from './timeline/icons';

function readApplyPalette() {
  const palette = getActivePalette();
  return palette
    ? {
        id: palette.id,
        revision: usePaletteStore.getState().revision,
        displayName: palette.displayName,
        colors: palette.source.colors,
      }
    : null;
}

interface MenuDef {
  id: string;
  label: string;
  items: MenuEntry[];
}

/** The `openId` of the Export… button's arrow: its popup lists every export. */
const EXPORT_QUICK = 'export-quick';

interface MenuBarProps {
  theme: Theme;
  themeChoice: ThemeChoice;
  onToggleTheme: () => void;
  onChooseTheme: (choice: ThemeChoice) => void;
  onOpenInspector: () => void;
  onOpenSettings: () => void;
}

/** View → Theme: the system's, or one of the two. */
const THEME_CHOICES: readonly { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

/** The project's name in the bar: click it to rename the project in place (Enter commits, Escape
 * cancels, and either gives the focus back to the name, as the renames of a track and of a
 * formula do; Project settings… has the same field). The name being typed is the name of the
 * document that was open when the field opened: another one that opens meanwhile keeps its own,
 * and the field closes with nothing written. */
function ProjectNameField({ name }: { name: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(
    () =>
      onDocumentReplaced(() => {
        cancelled.current = true;
        setDraft(null);
      }),
    [],
  );
  const nameRef = useRef<HTMLButtonElement>(null);
  /** Enter or Escape ended the edit: the focus goes back to the name. A blur — a click elsewhere,
   * Tab — took it somewhere already, and leaves it there. */
  const refocus = useRef(false);
  const editing = draft !== null;
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    nameRef.current?.focus();
  }, [editing]);
  if (draft === null) {
    return (
      <button
        type="button"
        ref={nameRef}
        className="project-name-text"
        data-testid="project-rename"
        title="Rename the project"
        onClick={() => {
          cancelled.current = false;
          setDraft(name);
        }}
      >
        {name}
      </button>
    );
  }
  const commit = () => {
    if (!cancelled.current) renameProject(draft);
    setDraft(null);
  };
  return (
    <input
      type="text"
      className="project-name-input"
      data-testid="project-rename-input"
      aria-label="Project name"
      value={draft}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          refocus.current = true;
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          refocus.current = true;
          cancelled.current = true;
          setDraft(null);
        }
      }}
    />
  );
}

export function MenuBar({
  theme,
  themeChoice,
  onToggleTheme,
  onChooseTheme,
  onOpenInspector,
  onOpenSettings,
}: MenuBarProps) {
  const companion = useCompanionState();
  const { canUndo, canRedo } = useHistoryState();
  const selection = useUiStore((state) => state.selection);
  const copied = usePropertyClipboard((state) => state.properties);
  const selectedClips = highlightedClipIds(selection).length;
  const prefer = useRenderStore((state) => state.prefer);
  const entries = useRenderStore((state) => state.entries);
  const formulas = useProjectStore((state) => state.project.formulas);
  const colorMatches = useProjectStore((state) => state.project.colorMatches);
  // The list kept by the last copy of colours in order: what its Paste gives out again.
  const keptColours = useColourOrder((state) => state.kept?.length ?? 0);
  const renderer = rendererSummary(
    formulas.map((f) => f.id),
    entries,
    prefer,
    companion,
  );
  const projectName = useProjectStore((state) => state.project.meta.name);
  const autoIntro = usePreferences((state) => state.autoIntro);
  const autoOutro = usePreferences((state) => state.autoOutro);
  const introKind = usePreferences((state) => state.intro.kind);
  const outroKind = usePreferences((state) => state.outro.kind);
  const autoSuggestMorphPairs = usePreferences((state) => state.autoSuggestMorphPairs);
  const snapObjects = usePreferences((state) => state.snapObjects);
  const guideColor = usePreferences((state) => state.guideColor);
  const guideWidth = usePreferences((state) => state.guideWidth);
  const pickColor = usePreferences((state) => state.pickColor);
  const grid = usePreferences((state) => state.grid);
  const gridStep = usePreferences((state) => state.gridStep);
  const gridAnchor = usePreferences((state) => state.gridAnchor);
  const scaleStep = usePreferences((state) => state.scaleStep);
  const splitSuffix = usePreferences((state) => state.splitSuffix);
  const standardScale = usePreferences((state) => state.standardScale);
  const keepHandles = usePreferences((state) => state.keepHandles);
  const lockedOpacity = usePreferences((state) => state.lockedOpacity);
  const cameraRoute = usePreferences((state) => state.cameraRoute);
  const cameraVeil = usePreferences((state) => state.cameraVeil);
  const zenMode = usePreferences((state) => state.zenMode);
  const multicamera = useProjectStore((state) => state.project.camera !== undefined);
  const cameraView = usePreviewView((state) => state.cameraView);
  const slides = useProjectStore((state) => state.project.slides !== undefined);
  const slidePauses = useProjectStore(
    (state) => state.project.slides?.marks.some((mark) => mark.kind === 'pause') ?? false,
  );
  const panelsFolded = usePanels((state) => state.collapsed);
  const panelHandles = usePanels((state) => state.handles);
  const lastTarget = useExportDialog((state) => state.lastTarget);
  const [animationsOpen, setAnimationsOpen] = useState(false);
  const [scaleStepOpen, setScaleStepOpen] = useState(false);
  const [standardScaleOpen, setStandardScaleOpen] = useState(false);
  const [splitSuffixOpen, setSplitSuffixOpen] = useState(false);
  const [chromaOpen, setChromaOpen] = useState(false);
  /** The Editor palettes dialog, and the palette Chroma Lab's import has just put in it. */
  const [palettes, setPalettes] = useState<{ imported?: ImportedPalette } | null>(null);
  const [applyPaletteOpen, setApplyPaletteOpen] = useState(false);
  const paletteLibrary = usePaletteStore((state) => state.library);
  const paletteRevision = usePaletteStore((state) => state.revision);
  const activePalette = paletteLibrary.palettes.find(
    (entry) => entry.id === paletteLibrary.activePaletteId,
  );
  const applyPalette = activePalette
    ? {
        id: activePalette.id,
        revision: paletteRevision,
        displayName: activePalette.displayName,
        colors: activePalette.source.colors,
      }
    : null;
  const dirty = useDocumentStore((state) => state.dirty);
  const fileName = useDocumentStore((state) => state.fileName);
  const baseline = useDocumentStore((state) => state.baseline);
  const doc = documentStatus({ dirty, fileName, baseline });
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  const close = useCallback(() => setOpenId(null), []);
  // Where the focus goes in the popup that opens next: into it when the keyboard opened it,
  // nowhere when the pointer did.
  const [focusOnOpen, setFocusOnOpen] = useState<'first' | 'last' | null>(null);
  const openWithKeyboard = useCallback((id: string, where: 'first' | 'last') => {
    setFocusOnOpen(where);
    setOpenId(id);
  }, []);
  const openWithPointer = useCallback((id: string) => {
    setFocusOnOpen(null);
    setOpenId(id);
  }, []);
  // What the Align and Distribute items can act on: measured when the Edit menu opens.
  const alignable = openId === 'edit' ? alignableSelection().items.length : 0;
  // The autosaves of tabs that are gone (project/autosave.ts): read when the File menu opens.
  const recoverable = openId === 'file' ? recoverableAutosaves() : [];

  const setPrefer = useRenderStore.getState().setPrefer;
  /** What the arrow of the Export… button lists: every export. */
  const exportItems: MenuEntry[] = [
    {
      type: 'item',
      id: 'export-ce',
      label: 'Python — ManimCE…',
      onSelect: () => openExportDialog({ kind: 'python', target: 'ce' }),
    },
    {
      type: 'item',
      id: 'export-gl',
      label: 'Python — ManimGL…',
      onSelect: () => openExportDialog({ kind: 'python', target: 'gl' }),
    },
    {
      type: 'item',
      id: 'export-video',
      label: 'Video…',
      onSelect: () => openExportDialog({ kind: 'video' }),
    },
    {
      type: 'item',
      id: 'export-image',
      label: 'Image…',
      onSelect: () => openExportDialog({ kind: 'image' }),
    },
    {
      type: 'item',
      id: 'export-audio',
      label: 'Audio…',
      onSelect: () => openExportDialog({ kind: 'audio' }),
    },
    {
      type: 'item',
      id: 'export-html',
      label: 'HTML…',
      onSelect: () => openExportDialog({ kind: 'html' }),
    },
  ];
  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          type: 'item',
          id: 'new',
          label: 'New',
          // Not Mod+N: the browser keeps it for a window of its own.
          shortcut: keyHint('Mod+Alt+N'),
          onSelect: () => void newProject(),
        },
        {
          type: 'item',
          id: 'open',
          label: 'Open…',
          shortcut: keyHint('Mod+O'),
          onSelect: openProjectsDialog,
        },
        {
          type: 'item',
          id: 'sync-folder',
          label: 'Sync folder…',
          shortcut: keyHint(syncFolderKeys(isMac())),
          onSelect: () => void syncFolder(),
        },
        {
          type: 'submenu',
          id: 'recover',
          label: 'Recover autosave',
          items:
            recoverable.length === 0
              ? [{ type: 'item', id: 'none', label: 'No autosave of another tab', disabled: true }]
              : recoverable.map((entry): MenuEntry => ({
                  type: 'item',
                  id: `session-${entry.session}`,
                  label: `${entry.fileName ?? entry.name}${entry.dirty ? ' (unsaved changes)' : ''} · ${timeAgo(entry.savedAt)}`,
                  onSelect: () => void recoverAutosave(entry.session),
                })),
        },
        { type: 'separator', id: 'sep-1' },
        {
          type: 'item',
          id: 'save',
          label: 'Save',
          shortcut: keyHint('Mod+S'),
          onSelect: () => void saveProject(),
        },
        {
          type: 'item',
          id: 'save-as',
          label: 'Save As…',
          shortcut: keyHint(saveAsKeys(isMac())),
          onSelect: () => void saveProjectAs(),
        },
        { type: 'separator', id: 'sep-2' },
        { type: 'item', id: 'settings', label: 'Project settings…', onSelect: onOpenSettings },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          type: 'item',
          id: 'undo',
          label: 'Undo',
          shortcut: keyHint('Mod+Z'),
          disabled: !canUndo,
          onSelect: () => {
            if (!cancelTextCompositionForHistory()) history.undo();
          },
        },
        {
          type: 'item',
          id: 'redo',
          label: 'Redo',
          shortcut: keyHint('Mod+Shift+Z'),
          disabled: !canRedo,
          onSelect: () => {
            if (!cancelTextCompositionForHistory()) history.redo();
          },
        },
        { type: 'separator', id: 'sep-1' },
        {
          type: 'item',
          id: 'delete-formula',
          label: 'Delete formula',
          shortcut: 'Del',
          disabled: selection.kind !== 'formula',
          onSelect: () => {
            if (selection.kind === 'formula') void deleteFormula(selection.id);
          },
        },
        { type: 'separator', id: 'sep-properties' },
        // The clips selected in the preview: Copy takes the state of the single selected clip,
        // Paste gives all of it, or one group, to every selected clip that can be edited now.
        {
          type: 'item',
          id: 'copy-properties',
          label: 'Copy properties',
          icon: 'copy-properties',
          disabled: selectedClips !== 1,
          onSelect: () => copyProperties(),
        },
        {
          type: 'submenu',
          id: 'paste-properties',
          label: 'Paste properties',
          icon: 'paste-properties',
          disabled: copied === null || selectedClips === 0,
          items: PASTE_GROUPS.map((group) => ({
            type: 'item',
            id: group.id,
            label: copied ? `${group.label} (${pasteLabel(copied, group.id)})` : group.label,
            onSelect: () => pasteProperties(group.id),
          })),
        },
        { type: 'separator', id: 'sep-align' },
        // On the clips selected in the preview; Shift while choosing aligns to the frame.
        {
          type: 'submenu',
          id: 'align',
          label: 'Align',
          items: ALIGN_ACTIONS.flatMap((action): MenuEntry[] => [
            ...(action.edge === 'top' ? [{ type: 'separator', id: 'sep-axis' } as const] : []),
            {
              type: 'item',
              id: action.id.slice('align-'.length),
              label: action.short,
              icon: action.icon,
              shortcut: keyHint(action.keys),
              disabled: alignable === 0,
              onSelect: (event) => alignSelection(action.edge, event.shiftKey),
            },
          ]).concat([
            { type: 'separator', id: 'sep-symbol' },
            {
              type: 'item',
              id: 'symbol',
              label: 'By symbol…',
              icon: 'align-symbol',
              shortcut: keyHint('Alt+G'),
              onSelect: () => useSymbolAlign.getState().toggle(),
            },
            {
              type: 'item',
              id: 'symbol-locked',
              label: 'By symbol of a locked formula…',
              icon: 'align-symbol',
              shortcut: keyHint('Shift+Alt+G'),
              onSelect: () => toggleLockedSymbolAlign(),
            },
          ]),
        },
        {
          type: 'submenu',
          id: 'distribute',
          label: 'Distribute',
          items: DISTRIBUTE_ACTIONS.map((action): MenuEntry => ({
            type: 'item',
            id: action.id.slice('distribute-'.length),
            label: action.short,
            icon: action.icon,
            shortcut: keyHint(action.keys),
            disabled: alignable < 3,
            onSelect: () => distributeSelection(action.axis),
          })),
        },
        { type: 'separator', id: 'sep-match' },
        {
          type: 'item',
          id: 'apply-palette',
          label: 'Apply palette…',
          disabled: !activePalette,
          onSelect: () => setApplyPaletteOpen(true),
        },
        // The match colour lists of the project (D55): create one, or open one to edit it.
        {
          type: 'submenu',
          id: 'match-colors',
          label: 'Match colors',
          items: [
            {
              type: 'item',
              id: 'create',
              label: 'Create match colors…',
              onSelect: () => useColorMatchDialog.getState().openNew(),
            },
            {
              type: 'item',
              id: 'from-palette',
              label: 'New from active palette…',
              disabled: !activePalette,
              onSelect: () => useColorMatchDialog.getState().openNewFromPalette(),
            },
            ...(colorMatches.length > 0 ? [{ type: 'separator', id: 'sep-lists' } as const] : []),
            ...colorMatches.map((match): MenuEntry => ({
              type: 'item',
              id: `list-${match.id}`,
              label: `${match.name}…`,
              onSelect: () => useColorMatchDialog.getState().open(match.id),
            })),
          ],
        },
        // Colours in order (D129): a mode of the preview, click by click. Under one entry: two
        // more lines with their shortcuts would widen the menu, which a narrow window has no
        // room for.
        {
          type: 'submenu',
          id: 'colours-order',
          label: 'Colours in order',
          items: [
            {
              type: 'item',
              id: 'copy',
              label: 'Copy…',
              shortcut: keyHint('Shift+C'),
              onSelect: () => startColourCopy(),
            },
            {
              type: 'item',
              id: 'paste',
              label: keptColours > 0 ? `Paste (${keptColours})` : 'Paste',
              shortcut: keyHint('Shift+V'),
              disabled: keptColours === 0,
              onSelect: () => startColourPaste(),
            },
          ],
        },
        { type: 'separator', id: 'sep-2' },
        // Editor preferences for clips and Morph blocks created from now on (ui/preferences.ts).
        {
          type: 'item',
          id: 'auto-intro',
          label: `Always add intro (${animationLabel(introKind)})`,
          checked: autoIntro,
          checkbox: true,
          onSelect: () => usePreferences.getState().set({ autoIntro: !autoIntro }),
        },
        {
          type: 'item',
          id: 'auto-outro',
          label: `Always add outro (${animationLabel(outroKind)})`,
          checked: autoOutro,
          checkbox: true,
          onSelect: () => usePreferences.getState().set({ autoOutro: !autoOutro }),
        },
        {
          type: 'item',
          id: 'default-animations',
          label: 'Default intro & outro…',
          onSelect: () => setAnimationsOpen(true),
        },
        {
          type: 'item',
          id: 'auto-suggest-morph-pairs',
          label: 'Suggest morph pairs',
          checked: autoSuggestMorphPairs,
          checkbox: true,
          onSelect: () =>
            usePreferences.getState().set({ autoSuggestMorphPairs: !autoSuggestMorphPairs }),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { type: 'item', id: 'toggle-theme', label: 'Toggle theme', onSelect: onToggleTheme },
        {
          type: 'submenu',
          id: 'theme',
          label: 'Theme',
          items: THEME_CHOICES.map(({ id, label }) => ({
            type: 'item',
            id,
            label,
            checked: themeChoice === id,
            onSelect: () => onChooseTheme(id),
          })),
        },
        {
          type: 'submenu',
          id: 'panels',
          label: 'Panels',
          items: FOLDABLE_PANELS.map(({ id, label, key }) => ({
            type: 'item',
            id,
            label,
            shortcut: key,
            // Each panel folds on its own: a toggle, not one choice among three.
            checkbox: true,
            checked: !panelsFolded[id],
            // Nothing to fold in the stacked layout of a narrow window.
            disabled: panelHandles[id] === undefined,
            onSelect: () => usePanels.getState().toggle(id),
          })),
        },
        {
          type: 'item',
          id: 'multicamera',
          label: 'Multicamera',
          shortcut: keyHint('Alt+M'),
          // The scene's camera (D190): a toggle of the project. It stays on while it has target
          // cameras or moves — chosen then, a notice says so (`toggleMulticamera`).
          checkbox: true,
          checked: multicamera,
          onSelect: () => toggleMulticamera(),
        },
        {
          type: 'item',
          id: 'camera-view',
          label: 'Camera view',
          shortcut: 'V',
          // The Preview through the scene's camera, as the video is; a view of the Preview, not a
          // change of the project. Only a scene with a camera has it.
          checkbox: true,
          checked: multicamera && cameraView,
          disabled: !multicamera,
          onSelect: () => toggleCameraView(),
        },
        {
          type: 'item',
          id: 'slides',
          label: 'Slides',
          // The Slides mode (D200): a toggle of the project, as the multicamera is. It stays on
          // while it has pauses or comments — chosen then, a notice says so (`toggleSlides`).
          checkbox: true,
          checked: slides,
          onSelect: () => toggleSlides(),
        },
        {
          type: 'item',
          id: 'slides-add-pause',
          label: 'Add pause at the playhead',
          shortcut: 'P',
          // Where the scene rests; elsewhere a notice says what runs there.
          disabled: !slides,
          onSelect: () => void addPauseAtPlayhead(),
        },
        {
          type: 'item',
          id: 'slides-add-comment',
          label: 'Add comment at the playhead…',
          shortcut: keyHint('Shift+P'),
          disabled: !slides,
          onSelect: () => void addCommentAtPlayhead(),
        },
        {
          type: 'item',
          id: 'slides-add-pauses',
          label: 'Add a pause after every animation',
          // For a long scene: every place a talk could stop, at once; the ones not wanted are
          // then deleted.
          disabled: !slides,
          onSelect: () => void addPausesAfterAnimations(),
        },
        {
          type: 'item',
          id: 'slides-skip-every',
          label: 'Skip the wait at every pause',
          // D202: where the page or the rehearsal stops at a pause, it goes on where the next
          // animation starts; a pause with no wait to skip is left as it is, and a notice says so.
          // Greyed out, as the two rows under it, while the scene has no pause (D204).
          disabled: !slidePauses,
          onSelect: () => void skipWaitAtEveryPause(),
        },
        {
          type: 'item',
          id: 'slides-keep-every',
          label: 'Keep the wait at every pause',
          disabled: !slidePauses,
          onSelect: () => void keepWaitAtEveryPause(),
        },
        {
          type: 'item',
          id: 'slides-delete-pauses',
          label: 'Delete every pause…',
          // It asks first; the comments stay, and one undo step brings the pauses back.
          disabled: !slidePauses,
          onSelect: () => void deleteEveryPause(),
        },
        { type: 'separator', id: 'sep-1' },
        {
          type: 'item',
          id: 'prefer-auto',
          label: 'Glyph source: Automatic',
          checked: prefer === 'auto',
          onSelect: () => setPrefer('auto'),
        },
        {
          type: 'item',
          id: 'prefer-mathjax',
          label: 'Glyph source: MathJax',
          checked: prefer === 'mathjax',
          onSelect: () => setPrefer('mathjax'),
        },
        {
          type: 'item',
          id: 'prefer-latex',
          label: 'Glyph source: LaTeX (companion)',
          checked: prefer === 'latex',
          onSelect: () => setPrefer('latex'),
        },
      ],
    },
    {
      id: 'preferences',
      label: 'Preferences',
      items: preferencesMenuItems(
        {
          snapObjects,
          guideColor,
          guideWidth,
          pickColor,
          grid,
          gridStep,
          gridAnchor,
          scaleStep,
          splitSuffix,
          keepHandles,
          standardScale,
          lockedOpacity,
          cameraRoute,
          cameraVeil,
          zenMode,
        },
        usePreferences.getState().set,
        () => setScaleStepOpen(true),
        () => setStandardScaleOpen(true),
        () => setSplitSuffixOpen(true),
      ).concat([
        { type: 'separator', id: 'sep-palettes' },
        {
          type: 'item',
          id: 'chroma-lab',
          label: 'Chroma Lab…',
          onSelect: () => setChromaOpen(true),
        },
        {
          type: 'item',
          id: 'editor-palettes',
          label: 'Editor palettes…',
          onSelect: () => setPalettes({}),
        },
      ]),
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          type: 'item',
          id: 'shortcuts',
          label: 'Keyboard shortcuts…',
          shortcut: '?',
          onSelect: () => openHelpDialog('shortcuts'),
        },
        {
          type: 'submenu',
          id: 'examples',
          label: 'Examples',
          items: STARTER_EXAMPLES.map((example) => ({
            type: 'item',
            id: example.id,
            label: example.name,
            onSelect: () => void openExample(example),
          })),
        },
        {
          type: 'item',
          id: 'engine-inspector',
          label: 'Engine inspector…',
          onSelect: onOpenInspector,
        },
        {
          type: 'item',
          id: 'licenses',
          label: 'Third-party licenses…',
          onSelect: () => openHelpDialog('licenses'),
        },
        { type: 'item', id: 'about', label: 'About', onSelect: () => openHelpDialog('about') },
      ],
    },
  ];

  // Close on outside pointer press and on Escape (restoring focus to the menu button).
  useEffect(() => {
    if (openId === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        buttonRefs.current.get(openId)?.focus();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openId, close]);

  /** The menubar pattern on a menu's button: ↓/↑ open its menu on the first or last item,
   * ←/→, Home and End move along the bar (and the open menu with them), a letter goes to the
   * next menu with that initial. */
  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const menu = menus[index]!;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openWithKeyboard(menu.id, event.key === 'ArrowDown' ? 'first' : 'last');
      return;
    }
    const { key } = event;
    let at = rovingIndex(key, index, menus.length, 'horizontal');
    if (
      at === null &&
      key.length === 1 &&
      key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      at = typeAheadIndex(
        menus.map((m) => m.label),
        index,
        key,
      );
    }
    if (at === null) return;
    event.preventDefault();
    const next = menus[at];
    if (!next) return;
    buttonRefs.current.get(next.id)?.focus();
    if (openId !== null) openWithKeyboard(next.id, 'first');
  };

  /** Inside an open menu: ←/→ change menu (a submenu takes them first), Tab leaves it. */
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const menu = menus[index]!;
    if (openId !== menu.id || event.defaultPrevented) return;
    if (event.target === buttonRefs.current.get(menu.id)) return; // the button's own keys
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const at = (index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
      const next = menus[at]!;
      buttonRefs.current.get(next.id)?.focus();
      openWithKeyboard(next.id, 'first');
    } else if (event.key === 'Tab') {
      // Close, and let Tab go on from the menu's button.
      buttonRefs.current.get(menu.id)?.focus();
      close();
    }
  };

  return (
    <>
      {/* The bar: the title, the menubar, the project's name and state, the renderer and the
          theme. The menubar holds the menus and Export… alone (B5-04: a menubar owns menu items
          only); a press outside the whole bar closes an open menu. */}
      <div className="menu-bar" data-testid="menu-bar" ref={barRef}>
        <span className="app-title">
          <BrandMark />
          <span className="app-title-text">Manim Formula Editor</span>
        </span>
        <div className="menu-bar-menus" role="menubar" aria-label="Main menu">
          {menus.map((menu, index) => {
            const isOpen = openId === menu.id;
            return (
              <div
                className="menu"
                key={menu.id}
                onKeyDown={(event) => onMenuKeyDown(event, index)}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="menu-button"
                  data-testid={`menu-${menu.id}`}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  ref={(element) => {
                    if (element) buttonRefs.current.set(menu.id, element);
                    else buttonRefs.current.delete(menu.id);
                  }}
                  onClick={(event) => {
                    // Enter and Space click with no pointer (`detail` 0): the menu opens on its
                    // first item, as ↓ does.
                    if (isOpen) close();
                    else if (event.detail === 0) openWithKeyboard(menu.id, 'first');
                    else openWithPointer(menu.id);
                  }}
                  onMouseEnter={() => {
                    if (openId !== null) openWithPointer(menu.id);
                  }}
                  onKeyDown={(event) => onButtonKeyDown(event, index)}
                >
                  {menu.label}
                </button>
                {isOpen && (
                  <MenuPopup
                    label={menu.label}
                    items={menu.items}
                    testPrefix={`menu-item-${menu.id}`}
                    focusOnOpen={focusOnOpen}
                    onChoose={(item, event) => {
                      // The item disappears with the menu: give the focus to the menu's button
                      // first, so that a dialog the item opens returns it there.
                      buttonRefs.current.get(menu.id)?.focus();
                      close();
                      item.onSelect?.(event);
                    }}
                  />
                )}
              </div>
            );
          })}
          {/* Export… beside the menus (D62): Python for the last target used; the arrow, the menu.
            An item of the menubar that acts at once, as an item without a submenu may. */}
          <div className="menu export-split split-button">
            <button
              type="button"
              role="menuitem"
              className="btn btn-primary btn-small split-main"
              data-testid="export-button"
              title={`Export the scene as Python for ${TARGET_NAMES[lastTarget]} (the arrow has every export)`}
              onClick={() => openExportDialog({ kind: 'python', target: lastTarget })}
            >
              Export…
            </button>
            <button
              type="button"
              role="menuitem"
              className="btn btn-primary btn-small split-arrow"
              data-testid="export-button-menu"
              aria-label="Export options"
              aria-haspopup="menu"
              aria-expanded={openId === EXPORT_QUICK}
              ref={(element) => {
                if (element) buttonRefs.current.set(EXPORT_QUICK, element);
                else buttonRefs.current.delete(EXPORT_QUICK);
              }}
              onClick={(event) => {
                if (openId === EXPORT_QUICK) close();
                else if (event.detail === 0) openWithKeyboard(EXPORT_QUICK, 'first');
                else openWithPointer(EXPORT_QUICK);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  openWithKeyboard(EXPORT_QUICK, event.key === 'ArrowDown' ? 'first' : 'last');
                }
              }}
            >
              <Icon name="chevron-down" />
            </button>
            {openId === EXPORT_QUICK && (
              <MenuPopup
                label="Export"
                items={exportItems}
                testPrefix="export-button"
                focusOnOpen={focusOnOpen}
                onChoose={(item, event) => {
                  buttonRefs.current.get(EXPORT_QUICK)?.focus();
                  close();
                  item.onSelect?.(event);
                }}
              />
            )}
          </div>
        </div>
        <div className="menu-spacer" />
        <span
          className="project-name"
          data-testid="project-name"
          data-dirty={dirty}
          // The whole name (it may be cut short), then where it is saved.
          title={
            `${projectName}\n` +
            (fileName ? `File: ${fileName}` : 'Not saved to a file yet') +
            (doc.recovered ? "\nRecovered from this browser's autosave: save it to keep it." : '')
          }
        >
          <ProjectNameField name={projectName} />
          {fileName && (
            <span className="doc-file" data-testid="doc-file">
              {fileName}
            </span>
          )}
          <span
            className="doc-status"
            data-testid="doc-status"
            data-recovered={doc.recovered}
            role="status"
          >
            {doc.text}
          </span>
        </span>
        {/* The renderer the formulas really use; the companion's state is in the tooltip. */}
        <span
          className="status"
          data-testid="engine-status"
          role="status"
          data-renderer={renderer.label}
          data-companion={companion.status}
          title={`${rendererTooltip(renderer, prefer)}\n\n${companionTooltip(companion, getEngine().client.baseUrl)}`}
        >
          Renderer: {renderer.label}
        </span>
        <button
          type="button"
          className="theme-toggle"
          data-testid="theme-toggle"
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={onToggleTheme}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {animationsOpen && <DefaultAnimationsDialog onClose={() => setAnimationsOpen(false)} />}
      <ColorMatchDialogHost />
      {scaleStepOpen && <ScaleStepDialog onClose={() => setScaleStepOpen(false)} />}
      {standardScaleOpen && <StandardScaleDialog onClose={() => setStandardScaleOpen(false)} />}
      {splitSuffixOpen && <SplitSuffixDialog onClose={() => setSplitSuffixOpen(false)} />}
      {chromaOpen && (
        <ChromaLabDialog
          onClose={() => setChromaOpen(false)}
          onImported={(imported) => setPalettes({ imported })}
          onLibrary={() => setPalettes({})}
        />
      )}
      {palettes && (
        // Keyed by the import: one that ends with the dialog already open (the library was busy,
        // and Editor palettes… was pressed meanwhile) opens it afresh on the new palette.
        <PaletteLibraryDialog
          key={palettes.imported?.id ?? 'library'}
          imported={palettes.imported}
          onClose={() => setPalettes(null)}
        />
      )}
      {applyPaletteOpen && (
        <ApplyPaletteDialog
          palette={applyPalette}
          readPalette={readApplyPalette}
          onClose={() => setApplyPaletteOpen(false)}
        />
      )}
    </>
  );
}
