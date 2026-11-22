/* Global keyboard shortcuts: undo/redo, file commands (Open is the Projects dialog, Sync folder
 * the project library's folder, New Ctrl/⌘+Alt+N; Save As is Ctrl+Alt+S and Sync folder
 * Ctrl+Shift+S, and on a Mac ⇧⌘S and ⌥⌘S, `saveAsKeys`), Select all (the clips on screen at the playhead), Align and
 * Distribute the selected clips (the Figma set: Alt+A/H/D left, centre, right, Alt+W/V/S top,
 * middle, bottom, with Shift to the frame; Ctrl+Alt+H/V distribute, with the Control key itself on
 * a Mac), the preview's grid
 * (Ctrl/⌘+' shows it, Alt+↑/↓ make it denser or sparser), Alt+G for align by symbol, S for the
 * preview's circle selector (unless it splits the selected clips: `timeline/splitActions.ts`),
 * Shift+C / Shift+V for colours in order, Ctrl/⌘+F for the search of formulas, C and A for the
 * Creator and the Animations panel (D191), Alt+M for the multicamera (D190), P and Shift+P for a
 * pause and a comment of the Slides mode at the playhead (D200), deleting the selected formula and
 * "?" for the shortcut sheet.
 *
 * Key events coming from text inputs, textareas, selects, contenteditable elements and
 * `math-field` are left alone (they have their own undo and editing) — but Ctrl/⌘+F, which no
 * field uses —, and so is everything while a modal is open, but undo / redo under a modal that
 * allows them (the formula editor). A key pressed in an open menu is the menu's (`inOpenMenu`):
 * no command acts under it. While the search of formulas covers the Preview, what acts on the
 * scene waits (`previewCover.ts`). The timeline handles Delete for clips; this handles formulas. */
import { useEffect } from 'react';
import { history, useProjectStore, useUiStore } from '../../store';
import { deleteFormula } from '../creator/formulaActions';
import { openFormulaSearch } from '../creator/search/formulaSearchStore';
import { inOpenMenu } from '../focus';
import { focusedByKeyboard } from '../focusOrigin';
import { openHelpDialog } from '../help/helpStore';
import { isMac, letterOf, placeLetter } from '../platform';
import {
  ALIGN_ACTIONS,
  alignSelection,
  DISTRIBUTE_ACTIONS,
  distributeSelection,
} from '../preview/alignActions';
import { toggleCameraView, toggleMulticamera } from '../camera/cameraActions';
import { addCommentAtPlayhead, addPauseAtPlayhead } from '../slides/slideActions';
import { stepGrid } from '../preview/grid';
import { clipsOnScreen } from '../preview/interaction';
import { isPreviewCovered } from '../preview/previewCover';
import { previewLockedIds } from '../preview/previewLock';
import { startColourCopy, startColourPaste } from '../preview/colourOrder';
import { toggleLockedSymbolAlign, useSymbolAlign } from '../preview/symbolAlign';
import { announce } from '../announcer';
import { usePanels } from '../panelsStore';
import { usePreferences } from '../preferences';
import { splitKeyApplies } from '../timeline/splitActions';
import { newProject, saveProject, saveProjectAs } from './actions';
import { openProjectsDialog, syncFolder } from './libraryStore';
import { isModalOpen, topModalAllowsHistory } from './modalStack';

/** Elements that consume keystrokes themselves. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('math-field')) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    // Buttons, checkboxes, colour pickers… do not take text.
    return !['button', 'checkbox', 'radio', 'color', 'range', 'file', 'submit', 'reset'].includes(
      type,
    );
  }
  return target instanceof HTMLElement && target.isContentEditable === true;
}

/** Controls that Space operates, so that it must not play: text fields, checkboxes, radios, menu
 * items, options, tabs, <summary>, and buttons that got the focus from the keyboard. A button
 * that only kept the focus after a click does not count: Space plays — and so does one marked
 * `data-space-plays` (the timeline's clips and blocks, which Space never operates). */
export function spaceOperates(target: EventTarget | null): boolean {
  if (isTextEntryTarget(target)) return true;
  if (!(target instanceof Element)) return false;
  if (target.hasAttribute('data-space-plays')) return false;
  if (
    target.matches(
      'input[type="checkbox"], input[type="radio"], summary, [role^="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]',
    )
  ) {
    return true;
  }
  return target.matches('button, [role="button"], a[href]') && focusedByKeyboard(target);
}

type AlignName = (typeof ALIGN_ACTIONS)[number]['id'];

/** The align commands, each also in its "to the frame" form (Shift held). */
type AlignCommand = AlignName | `${AlignName}-frame`;

/** Alt+<letter> aligns, by the letter's place on the keyboard (the Figma set). */
const ALIGN_LETTERS: Record<string, AlignName> = {
  a: 'align-left',
  h: 'align-center',
  d: 'align-right',
  w: 'align-top',
  v: 'align-middle',
  s: 'align-bottom',
};

/** Ctrl+Alt+<letter> distributes (the Control key on a Mac too: `commandForKey`). */
const DISTRIBUTE_LETTERS: Record<string, (typeof DISTRIBUTE_ACTIONS)[number]['id']> = {
  h: 'distribute-h',
  v: 'distribute-v',
};

export type ShortcutCommand =
  | AlignCommand
  | (typeof DISTRIBUTE_ACTIONS)[number]['id']
  | 'undo'
  | 'redo'
  | 'save'
  | 'save-as'
  | 'open'
  | 'sync-folder'
  | 'new'
  | 'select-all'
  | 'delete-formula'
  | 'shortcuts'
  | 'toggle-grid'
  | 'grid-denser'
  | 'grid-sparser'
  | 'align-symbol'
  | 'align-symbol-locked'
  | 'circle-select'
  | 'copy-colours-order'
  | 'paste-colours-order'
  | 'search-formulas'
  | 'toggle-creator'
  | 'toggle-animations'
  | 'toggle-multicamera'
  | 'toggle-camera-view'
  | 'add-pause'
  | 'add-comment';

/** The commands a text field leaves to the app: the keys of the others are the field's. */
const FROM_A_FIELD: ReadonlySet<ShortcutCommand> = new Set(['search-formulas']);

/** The commands a key runs once, however long it is held. */
const HELD_ONCE: ReadonlySet<ShortcutCommand> = new Set([
  'circle-select',
  'toggle-creator',
  'toggle-animations',
  'toggle-multicamera',
  'toggle-camera-view',
  'add-pause',
  'add-comment',
]);

/** The commands that are not about the scene in the Preview: every other one waits while
 * something covers it (`previewCover.ts`), as nothing it does would be seen. */
const BESIDE_THE_PREVIEW: ReadonlySet<ShortcutCommand> = new Set([
  'undo',
  'redo',
  'save',
  'save-as',
  'open',
  'sync-folder',
  'new',
  'delete-formula',
  'shortcuts',
  'search-formulas',
  'toggle-creator',
  'toggle-animations',
  // The marks of the Slides mode are on the timeline's ruler.
  'add-pause',
  'add-comment',
]);

/** Whether a command acts on the scene the Preview shows (align, the grid, the modes of the
 * preview, Select all). */
export const actsOnPreview = (command: ShortcutCommand): boolean =>
  !BESIDE_THE_PREVIEW.has(command);

/** The keys of Save As and of Sync folder, as `keyHint` reads them. A Mac has them the other way
 * round: ⇧⌘S is "Save As" in every app there (Apple's guidelines list it), so Sync folder takes
 * ⌥⌘S, the key Save As has elsewhere. */
export const saveAsKeys = (mac: boolean): string => (mac ? 'Mod+Shift+S' : 'Mod+Alt+S');
export const syncFolderKeys = (mac: boolean): string => (mac ? 'Mod+Alt+S' : 'Mod+Shift+S');

/** Which command a key event stands for, if any (pure; `mac` selects ⌘ instead of Ctrl). Its
 * letters are read by `letterOf`, so that a layout of another script (Russian, Greek…) has them
 * at the places of a Latin keyboard, and a Latin layout keeps its own (Dvorak, AZERTY). */
export function commandForKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'> & {
    code?: string;
  },
  mac: boolean,
): ShortcutCommand | null {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();
  const letter = letterOf(event);
  // Distribute is Ctrl+Alt+H and V on every system: the Control key itself on a Mac (⌃⌥H, ⌃⌥V,
  // the keys Figma has there). With ⌘ they would be ⌥⌘H, which hides the other apps, and ⌥⌘V,
  // which pastes a style: the system's, which an app does not take.
  if (mac && event.ctrlKey && event.altKey && !event.metaKey) {
    return !event.shiftKey && letter ? (DISTRIBUTE_LETTERS[letter] ?? null) : null;
  }
  if (mod && event.altKey) {
    // With Option held, macOS reports the composed character ("ß" for Option+S, a dead key for
    // Option+N), and AltGr layouts do the same on Windows: `letterOf` reads the place of the key
    // then. Save As (Sync folder on a Mac) and New answer to the place of S and of N too,
    // whatever a Latin layout has there. New is not Ctrl/⌘+N, which the browser keeps for a
    // window of its own.
    if (event.shiftKey) return null;
    const place = placeLetter(event);
    // Ctrl+Alt+S is Save As; on a Mac, where Save As is ⇧⌘S, ⌥⌘S is Sync folder.
    if (letter === 's' || place === 's') return mac ? 'sync-folder' : 'save-as';
    if (letter === 'n' || place === 'n') return 'new';
    return !mac && letter ? (DISTRIBUTE_LETTERS[letter] ?? null) : null;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (!event.shiftKey && key === 'arrowup') return 'grid-denser';
    if (!event.shiftKey && key === 'arrowdown') return 'grid-sparser';
    if (letter === 'g') return event.shiftKey ? 'align-symbol-locked' : 'align-symbol';
    if (letter === 'm') return event.shiftKey ? null : 'toggle-multicamera';
    const align = letter ? ALIGN_LETTERS[letter] : undefined;
    return align ? (event.shiftKey ? `${align}-frame` : align) : null;
  }
  if (mod) {
    if (letter === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (letter === 'y' && !mac) return 'redo';
    // Ctrl+Shift+S is Sync folder; on a Mac ⇧⌘S is Save As, as in every app there.
    if (letter === 's') return event.shiftKey ? (mac ? 'save-as' : 'sync-folder') : 'save';
    if (letter === 'o' && !event.shiftKey) return 'open';
    if (letter === 'a' && !event.shiftKey) return 'select-all';
    if (key === "'" && !event.shiftKey) return 'toggle-grid';
    if (letter === 'f' && !event.shiftKey) return 'search-formulas';
    return null;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    // "?" needs Shift on most layouts, so Shift is not checked for it.
    if (key === '?') return 'shortcuts';
    if (!event.shiftKey && (key === 'delete' || key === 'backspace')) return 'delete-formula';
    if (!event.shiftKey && letter === 's') return 'circle-select';
    if (event.shiftKey && letter === 'c') return 'copy-colours-order';
    if (event.shiftKey && letter === 'v') return 'paste-colours-order';
    if (!event.shiftKey && letter === 'c') return 'toggle-creator';
    if (!event.shiftKey && letter === 'a') return 'toggle-animations';
    if (!event.shiftKey && letter === 'v') return 'toggle-camera-view';
    if (letter === 'p') return event.shiftKey ? 'add-comment' : 'add-pause';
  }
  return null;
}

function run(command: ShortcutCommand): boolean {
  // Covered, the Preview takes no command: the key is spent (Ctrl/⌘+A would select the page's
  // text) — but S, which stays the timeline's for a selected audio clip.
  if (isPreviewCovered() && actsOnPreview(command)) return command !== 'circle-select';
  switch (command) {
    case 'undo':
      history.undo();
      return true;
    case 'redo':
      history.redo();
      return true;
    case 'save':
      void saveProject();
      return true;
    case 'save-as':
      void saveProjectAs();
      return true;
    case 'open':
      openProjectsDialog();
      return true;
    case 'sync-folder':
      void syncFolder();
      return true;
    case 'new':
      void newProject();
      return true;
    case 'select-all': {
      // Every clip on screen at the playhead that the preview does not leave alone
      // (previewLock.ts); nothing on screen leaves the selection as it is.
      const { project } = useProjectStore.getState();
      const locked = previewLockedIds(project);
      const ids = clipsOnScreen(project, useUiStore.getState().time).filter(
        (id) => !locked.has(id),
      );
      if (ids.length > 0) useUiStore.getState().select({ kind: 'clips', ids });
      return true;
    }
    case 'delete-formula': {
      const selection = useUiStore.getState().selection;
      if (selection.kind !== 'formula') return false;
      void deleteFormula(selection.id);
      return true;
    }
    case 'shortcuts':
      openHelpDialog('shortcuts');
      return true;
    case 'toggle-grid': {
      const preferences = usePreferences.getState();
      preferences.set({ grid: !preferences.grid });
      return true;
    }
    case 'align-symbol':
      useSymbolAlign.getState().toggle();
      return true;
    case 'align-symbol-locked':
      toggleLockedSymbolAlign();
      return true;
    case 'copy-colours-order':
      startColourCopy();
      return true;
    case 'paste-colours-order':
      startColourPaste();
      return true;
    case 'search-formulas':
      openFormulaSearch();
      return true;
    // Open or close the panel: its fold in the usual layout, its half of the drawer over the
    // Preview in Zen mode (`panelsStore`). Taken even where there is nothing to fold (the stacked
    // layout of a narrow window): the key is the panel's.
    case 'toggle-creator':
      usePanels.getState().toggle('creator');
      return true;
    case 'toggle-animations':
      usePanels.getState().toggle('animations');
      return true;
    // Taken even when the multicamera stays on (a notice says why): the key is the camera's.
    case 'toggle-multicamera':
      toggleMulticamera();
      return true;
    // The key is the camera's while the scene has one; else it is nobody's.
    case 'toggle-camera-view':
      return toggleCameraView();
    // The keys are the Slides mode's while it is on (a notice says why nothing is added where
    // something animates); else they are nobody's.
    case 'add-pause':
      if (!useProjectStore.getState().project.slides) return false;
      addPauseAtPlayhead();
      return true;
    case 'add-comment':
      if (!useProjectStore.getState().project.slides) return false;
      void addCommentAtPlayhead();
      return true;
    case 'circle-select': {
      // S is also what splits the selected clips at the playhead (useTimelineKeys, which hears
      // the key after this): while it does (`splitKeyApplies`), the key is left to it. Asked of
      // the project before a drag that runs, which the split gives up: S does what it does with
      // no drag held, wherever the drag has taken the clip so far.
      const project = history.projectBeforeGesture();
      const { selection, time } = useUiStore.getState();
      if (splitKeyApplies(project, selection, time)) return false;
      const preferences = usePreferences.getState();
      const on = !preferences.circleSelect;
      preferences.set({ circleSelect: on });
      announce(on ? 'Circle selector on' : 'Circle selector off');
      return true;
    }
    case 'grid-denser':
    case 'grid-sparser': {
      // Like the bar's − / + buttons: only while the grid is shown.
      const preferences = usePreferences.getState();
      if (!preferences.grid) return false;
      preferences.set({
        gridStep: stepGrid(preferences.gridStep, command === 'grid-denser' ? 1 : -1),
      });
      return true;
    }
    case 'distribute-h':
    case 'distribute-v':
      // Taken even when nothing moves: Alt+V and Alt+S open menus in some browsers.
      distributeSelection(DISTRIBUTE_ACTIONS.find((a) => a.id === command)!.axis);
      return true;
    default: {
      const toFrame = command.endsWith('-frame');
      const id = toFrame ? command.slice(0, -'-frame'.length) : command;
      alignSelection(ALIGN_ACTIONS.find((a) => a.id === id)!.edge, toFrame);
      return true;
    }
  }
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    // A drag can keep focus in the field used just before it. Its uncommitted project gesture
    // owns the first history command; idle text fields retain native editing and undo.
    const cancelActive = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !history.isGesturing()) return;
      const command = commandForKey(event, isMac());
      if (command !== 'undo' && command !== 'redo') return;
      run(command);
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = commandForKey(event, isMac());
      if (!command) return;
      if (isTextEntryTarget(event.target) && !FROM_A_FIELD.has(command)) return;
      // A key pressed in an open menu is the menu's (`inOpenMenu`): no command acts under it, and
      // nor does what the browser would do with the key (Ctrl/⌘+S, O or F; Alt+D).
      if (inOpenMenu(event.target)) {
        event.preventDefault();
        return;
      }
      const undoRedo = command === 'undo' || command === 'redo';
      if (isModalOpen() && !(undoRedo && topModalAllowsHistory())) {
        // A draft dialog owns its edits. Do not let native Undo reach the last text field in
        // an underlying dialog when a non-text control has focus here.
        if (undoRedo) event.preventDefault();
        return;
      }
      // A key held after it split a clip must not go on to switch the selector, nor one held
      // after it opened a panel to close it again.
      if (event.repeat && HELD_ONCE.has(command)) {
        event.preventDefault();
        return;
      }
      if (run(command)) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', cancelActive, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', cancelActive, true);
    };
  }, []);
}
