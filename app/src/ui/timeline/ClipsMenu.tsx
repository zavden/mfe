/* The right-click menu of several selected clips (a single clip gets the Add animation menu):
 * what the Creator offers a selection of formulas — editing them together, applying a match
 * colour list, in a submenu — on the formulas of those clips; one brace over them all, when none
 * of them is a brace (D123), and one shape around them all, when none is a brace or a shape
 * (D126); the copied shape of a path for the lines among them (D151); a part of the copied
 * timing for them all («Timing ›», D150); «Unlink formula (make a copy)» for the formulas and texts
 * among them, one copy per formula, shared by its selected clips (`unlinkClips.ts`); and the
 * clips' own duplicate and delete (the clips, not their formulas: as the Delete key does, at once
 * and as one undo step). */
import { BRACE_SIDE_DEGREES, type ClipId, type FormulaId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { BraceMenuItems, ShapeMenuItems } from '../animations/BlockMenus';
import { addBraceOverClips, planSpanningBrace } from '../animations/braceActions';
import { addShapeOverClips, planSpanningShape } from '../animations/shapeActions';
import { applyColorMatch } from '../colors/applyColorMatch';
import { useColorMatchDialog } from '../colors/colorMatchDialogStore';
import { ContextMenu, MenuItem, Submenu } from '../ContextMenu';
import { openFormulaEditor } from '../creator/formulaEditorStore';
import { useMultiEdit } from '../creator/multiEditStore';
import {
  describePathShape,
  pasteLineShape,
  useLineShapeClipboard,
  withPathShape,
} from '../preview/lineCurve';
import {
  deleteClipsAsking,
  duplicateClipsById,
  setPreviewLock,
  unlinkClipsById,
} from './clipActions';
import { audioEditable } from './audioCommands';
import { editableClips } from './clipOps';
import { TimingMenuItems } from './TimingMenuItems';
import { planUnlink, unlinkEntry } from './unlinkClips';
import { splitAtPlayhead, splitEntry } from './splitActions';
import { usePreferences } from '../preferences';
import { ColorMatchLabel } from '../colors/ColorMatchLabel';

interface ClipsMenuProps {
  x: number;
  y: number;
  clipIds: readonly ClipId[];
  onClose(): void;
}

/** The formulas of `clipIds`, each once, in the project's order. */
export function formulasOfClips(
  project: {
    clips: readonly { id: ClipId; formulaId: FormulaId }[];
    formulas: readonly { id: FormulaId }[];
  },
  clipIds: readonly ClipId[],
): FormulaId[] {
  const wanted = new Set(clipIds);
  const used = new Set(project.clips.filter((c) => wanted.has(c.id)).map((c) => c.formulaId));
  return project.formulas.filter((f) => used.has(f.id)).map((f) => f.id);
}

export function ClipsMenu({ x, y, clipIds, onClose }: ClipsMenuProps) {
  const project = useProjectStore((state) => state.project);
  const time = useUiStore((state) => state.time);
  const formulaIds = formulasOfClips(project, clipIds);
  const spanning = planSpanningBrace(project, clipIds, time);
  const spanningShape = planSpanningShape(project, clipIds, time);
  const visual = editableClips(project, clipIds);
  const audio = project.audioClips.filter(
    (clip) => clipIds.includes(clip.id) && audioEditable(project, clip),
  );
  const editable = [...visual, ...audio];
  /** The line objects of the clips that can be edited, and the ones the copied path would change. */
  const copiedShape = useLineShapeClipboard((state) => state.copied);
  const lineIds = new Set(visual.map((clip) => clip.formulaId));
  const lines = project.formulas.filter((f) => f.kind === 'line' && lineIds.has(f.id));
  const taking = copiedShape
    ? lines.filter((f) => f.kind === 'line' && withPathShape(f.curve, copiedShape.curve) !== null)
    : [];
  /** Every formula's clip among them is locked in the preview: the entry unlocks them. */
  const allLocked = visual.length > 0 && visual.every((clip) => clip.previewLocked === true);
  /** «Unlink formula (make a copy)», when formulas or texts are among them. */
  const unlink = unlinkEntry(project, planUnlink(project, clipIds), 'selection');
  /** «Split at playhead (S)», when clips of the scene are among them. */
  const suffix = usePreferences((state) => state.splitSuffix);
  const split = splitEntry(project, clipIds, time, suffix);
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return (
    <ContextMenu x={x} y={y} label="Selected clips" testId="clips-menu" onClose={onClose}>
      <div className="ctx-header" data-testid="clips-menu-header">
        {plural(clipIds.length, 'clip')} · {plural(formulaIds.length, 'formula')}
      </div>
      {formulaIds.length === 1 ? (
        <MenuItem
          testId="clips-menu-edit"
          onClick={act(() =>
            openFormulaEditor(formulaIds[0]!, false, clipIds.length === 1 ? clipIds[0] : undefined),
          )}
        >
          Edit…
        </MenuItem>
      ) : (
        <MenuItem
          testId="clips-menu-edit-together"
          disabled={formulaIds.length === 0}
          onClick={act(() => useMultiEdit.getState().open(formulaIds))}
        >
          Edit together…
        </MenuItem>
      )}
      <hr className="ctx-sep" />
      {spanning && (
        <BraceMenuItems
          testIdPrefix="clips-menu-brace"
          dialog={false}
          disabled={!spanning.ok}
          title={spanning.ok ? 'One brace over the selected clips' : spanning.reason}
          onChoose={(choice) => {
            onClose();
            if (choice !== 'glyphs') addBraceOverClips(clipIds, BRACE_SIDE_DEGREES[choice]);
          }}
        />
      )}
      {spanningShape && (
        <ShapeMenuItems
          testIdPrefix="clips-menu-shape"
          dialog={false}
          disabled={!spanningShape.ok}
          title={spanningShape.ok ? 'One shape around the selected clips' : spanningShape.reason}
          onChoose={(choice) => {
            onClose();
            if (choice !== 'glyphs') addShapeOverClips(clipIds, choice);
          }}
        />
      )}
      <Submenu label="Apply match colors" testId="clips-menu-match">
        {project.colorMatches.length === 0 ? (
          <MenuItem
            testId="clips-menu-match-create"
            onClick={act(() => useColorMatchDialog.getState().openNew())}
          >
            Create match colors…
          </MenuItem>
        ) : (
          project.colorMatches.map((match) => (
            <MenuItem
              key={match.id}
              testId={`clips-menu-match-${match.id}`}
              onClick={act(() => void applyColorMatch(formulaIds, match.id))}
            >
              <ColorMatchLabel match={match} />
            </MenuItem>
          ))
        )}
      </Submenu>
      {lines.length > 0 && (
        <MenuItem
          testId="clips-menu-paste-shape"
          disabled={taking.length === 0}
          onClick={act(() => void pasteLineShape(lines.map((f) => f.id)))}
        >
          Paste path shape
          <span className="ctx-hint">
            {copiedShape
              ? `${describePathShape(copiedShape.curve)}, of ${copiedShape.from}`
              : 'nothing copied'}
          </span>
        </MenuItem>
      )}
      <TimingMenuItems clipIds={clipIds} testIdPrefix="clips-menu" onClose={onClose} />
      {unlink && (
        <MenuItem
          testId="clips-menu-unlink"
          disabled={unlink.disabled}
          title={unlink.title}
          onClick={act(() => void unlinkClipsById(clipIds))}
        >
          {unlink.label}
        </MenuItem>
      )}
      {split && (
        <MenuItem
          testId="clips-menu-split"
          disabled={split.disabled}
          title={split.title}
          onClick={act(() => void splitAtPlayhead(clipIds))}
        >
          {split.label}
        </MenuItem>
      )}
      <hr className="ctx-sep" />
      <MenuItem
        testId="clips-menu-preview-lock"
        disabled={visual.length === 0}
        onClick={act(() =>
          setPreviewLock(
            visual.map((clip) => clip.id),
            !allLocked,
          ),
        )}
      >
        {allLocked ? 'Unlock in the preview' : 'Lock in the preview'}
      </MenuItem>
      <MenuItem
        testId="clips-menu-duplicate"
        disabled={editable.length === 0}
        onClick={act(() => duplicateClipsById(clipIds))}
      >
        {editable.length === clipIds.length
          ? 'Duplicate'
          : `Duplicate ${plural(editable.length, 'clip')} (the others are locked)`}
      </MenuItem>
      <MenuItem
        testId="clips-menu-delete"
        danger
        disabled={editable.length === 0}
        onClick={act(() => void deleteClipsAsking(new Set(editable.map((c) => c.id))))}
      >
        {editable.length === clipIds.length
          ? `Delete ${plural(clipIds.length, 'clip')}`
          : `Delete ${plural(editable.length, 'clip')} (the others are locked)`}
      </MenuItem>
    </ContextMenu>
  );
}
