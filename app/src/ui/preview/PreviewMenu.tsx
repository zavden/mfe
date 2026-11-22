/* The preview's right-click menu: copy the properties of the clip under the pointer, and, each
 * section in a submenu beside its entry (R1): paste them, all or one group, onto the selection
 * (`propertyClipboard.ts`); align and distribute the selected clips (`alignActions.ts`); add a
 * brace or a shape on the clip under the pointer (D66, D71) — on its glyphs picked with Alt when
 * there are some, which «On some glyphs…» starts from (D74); a shape takes a brace on the whole
 * of it and no shape, and when the clip is one of several selected, none of them a brace, the
 * brace goes over them all (D123), as the shape goes around them all when none is a brace or a
 * shape (D126) — or a label at its tip, when it is a brace (D69); the clip's
 * own entries (`ObjectMenuItems`, D118, D120:
 * intro, outro, Remove animations and, by its kind, Remove relations and Unlink formula or colour,
 * a brace's direction and Detach); apply a match colour list to the formulas of the selected clips
 * (`colors/applyColorMatch.ts`). Items that
 * cannot act on the selection now are disabled; the Edit menu's items are the same and also
 * align to the frame with Shift held. */
import { BRACE_SIDE_DEGREES, type ClipId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import {
  BraceMenuItems,
  LabelMenuItems,
  LineMenuItems,
  ShapeMenuItems,
} from '../animations/BlockMenus';
import {
  addBrace,
  addBraceLabel,
  addBraceOverClips,
  isBraceClip,
  planSpanningBrace,
} from '../animations/braceActions';
import { openBraceDialog, openShapeDialog } from '../animations/glyphsDialogStore';
import { ObjectMenuItems } from '../animations/ObjectMenuItems';
import {
  addShape,
  addShapeOverClips,
  isShapeClip,
  planSpanningShape,
} from '../animations/shapeActions';
import { applyColorMatch } from '../colors/applyColorMatch';
import { formulasOfSelection } from '../colors/colorMatchActions';
import { useColorMatchDialog } from '../colors/colorMatchDialogStore';
import { ContextMenu, MenuItem, Submenu } from '../ContextMenu';
import { Icon } from '../timeline/icons';
import {
  ALIGN_ACTIONS,
  alignableSelection,
  alignSelection,
  DISTRIBUTE_ACTIONS,
  distributeSelection,
  editableSelection,
} from './alignActions';
import {
  copyProperties,
  PASTE_GROUPS,
  pasteLabel,
  pasteProperties,
  usePropertyClipboard,
} from './propertyClipboard';
import { pickedGlyphsOf, pickedTargetOf } from './glyphActions';
import { singlePart } from './glyphPick';
import { useGlyphPick } from './glyphPickStore';
import { startLineDraw } from './lineDraw';
import { startRetarget } from './shapeRetarget';
import { useSymbolAlign } from './symbolAlign';
import { startColourCopy, startColourPaste, useColourOrder } from './colourOrder';
import { ColorMatchLabel } from '../colors/ColorMatchLabel';

interface PreviewMenuProps {
  x: number;
  y: number;
  /** The clip under the pointer when the menu opened. */
  clipId: ClipId;
  onClose(): void;
}

/** The formulas of the selected clips, each once. */
const selectedFormulaIds = () =>
  formulasOfSelection(useProjectStore.getState().project, useUiStore.getState().selection);

export function PreviewMenu({ x, y, clipId, onClose }: PreviewMenuProps) {
  // What Align and Distribute move, and what a paste writes to (an attached object too).
  const count = alignableSelection().items.length;
  const pasteable = editableSelection().items.length;
  const copied = usePropertyClipboard((state) => state.properties);
  // The list kept by the last copy of colours in order (D129).
  const keptColours = useColourOrder((state) => state.kept?.length ?? 0);
  const matches = useProjectStore((state) => state.project.colorMatches);
  const onBrace = useProjectStore((state) => isBraceClip(state.project, clipId));
  const onShape = useProjectStore((state) => isShapeClip(state.project, clipId));
  // The glyphs picked on this clip, and on no other (D74): a brace or a shape goes on them, the
  // dialog starts from them.
  const pick = useGlyphPick((state) => state.pick);
  const picked = singlePart(pick)?.clipId === clipId ? pickedGlyphsOf(clipId) : undefined;
  const target = picked ? (pickedTargetOf(clipId) ?? 'all') : 'all';
  const onPicked = picked ? ' · on the selected glyphs' : '';
  // The clip is one of several selected, with no glyphs picked: one brace over them all, the
  // clip under the pointer first (D123). Null when the selection takes none (a brace in it).
  const project = useProjectStore((state) => state.project);
  const selection = useUiStore((state) => state.selection);
  const time = useUiStore((state) => state.time);
  const several =
    !picked && selection.kind === 'clips' && selection.ids.includes(clipId)
      ? [clipId, ...selection.ids.filter((id) => id !== clipId)]
      : [];
  const spanning = planSpanningBrace(project, several, time);
  // And one shape around them all, when they are formulas and texts (D126).
  const spanningShape = planSpanningShape(project, several, time);
  return (
    <ContextMenu x={x} y={y} label="Clip actions" testId="preview-menu" onClose={onClose}>
      <MenuItem
        testId="preview-menu-copy-properties"
        icon={<Icon name="copy-properties" />}
        onClick={() => {
          onClose();
          copyProperties(clipId);
        }}
      >
        Copy properties
      </MenuItem>
      <Submenu
        label="Paste properties"
        testId="preview-menu-paste"
        icon={<Icon name="paste-properties" />}
      >
        {PASTE_GROUPS.map((group) => (
          <MenuItem
            key={group.id}
            testId={`preview-menu-paste-${group.id}`}
            icon={<Icon name="paste-properties" />}
            disabled={copied === null || pasteable === 0}
            onClick={() => {
              onClose();
              pasteProperties(group.id);
            }}
          >
            {copied ? `${group.label} (${pasteLabel(copied, group.id)})` : group.label}
          </MenuItem>
        ))}
      </Submenu>
      <hr className="ctx-sep" />
      <Submenu label="Align" testId="preview-menu-align">
        {ALIGN_ACTIONS.map((action) => (
          <MenuItem
            key={action.id}
            testId={`preview-menu-${action.id}`}
            icon={<Icon name={action.icon} />}
            disabled={count === 0}
            onClick={() => {
              onClose();
              alignSelection(action.edge);
            }}
          >
            {action.label}
          </MenuItem>
        ))}
        <MenuItem
          testId="preview-menu-align-symbol"
          icon={<Icon name="align-symbol" />}
          onClick={() => {
            onClose();
            useSymbolAlign.getState().toggle();
          }}
        >
          Align by symbol…
        </MenuItem>
      </Submenu>
      <Submenu label="Distribute" testId="preview-menu-distribute">
        {DISTRIBUTE_ACTIONS.map((action) => (
          <MenuItem
            key={action.id}
            testId={`preview-menu-${action.id}`}
            icon={<Icon name={action.icon} />}
            disabled={count < 3}
            onClick={() => {
              onClose();
              distributeSelection(action.axis);
            }}
          >
            {action.label}
          </MenuItem>
        ))}
      </Submenu>
      <hr className="ctx-sep" />
      {onBrace && (
        <LabelMenuItems
          testIdPrefix="preview-menu-label"
          onChoose={(kind) => {
            onClose();
            addBraceLabel(clipId, kind);
          }}
        />
      )}
      {!onBrace && (
        <>
          {spanning ? (
            <BraceMenuItems
              testIdPrefix="preview-menu-brace"
              header={`Add brace · on the ${several.length} selected clips`}
              dialog={false}
              disabled={!spanning.ok}
              title={spanning.ok ? undefined : spanning.reason}
              onChoose={(choice) => {
                onClose();
                if (choice !== 'glyphs') addBraceOverClips(several, BRACE_SIDE_DEGREES[choice]);
              }}
            />
          ) : (
            <BraceMenuItems
              testIdPrefix="preview-menu-brace"
              header={`Add brace${onPicked}`}
              // A shape is one piece: the brace goes on the whole of it.
              dialog={!onShape}
              onChoose={(choice) => {
                onClose();
                if (choice === 'glyphs') openBraceDialog(clipId, picked);
                else addBrace(clipId, target, BRACE_SIDE_DEGREES[choice]);
              }}
            />
          )}
          {onShape && (
            // Its Transform to surround something else: chosen here, in the preview (D123).
            <MenuItem
              testId="preview-menu-retarget"
              onClick={() => {
                onClose();
                startRetarget(clipId);
              }}
            >
              Transform to another formula or glyphs…
            </MenuItem>
          )}
          {spanningShape ? (
            <ShapeMenuItems
              testIdPrefix="preview-menu-shape"
              header={`Add shape · on the ${several.length} selected clips`}
              dialog={false}
              disabled={!spanningShape.ok}
              title={spanningShape.ok ? undefined : spanningShape.reason}
              onChoose={(choice) => {
                onClose();
                if (choice !== 'glyphs') addShapeOverClips(several, choice);
              }}
            />
          ) : (
            !onShape && (
              <ShapeMenuItems
                testIdPrefix="preview-menu-shape"
                header={`Add shape${onPicked}`}
                onChoose={(choice) => {
                  onClose();
                  if (choice === 'glyphs') openShapeDialog(clipId, picked);
                  else addShape(clipId, target, choice);
                }}
              />
            )
          )}
          <LineMenuItems
            testIdPrefix="preview-menu-line"
            onChoose={(line) => {
              onClose();
              // It starts on this clip: on its picked glyphs, when there are some.
              startLineDraw(line, { clipId, glyphs: target });
            }}
          />
          <hr className="ctx-sep" />
        </>
      )}
      {/* The clip's own: its intro and outro, Remove animations, and what its kind adds. */}
      <ObjectMenuItems clipId={clipId} testIdPrefix="preview-menu" onClose={onClose} />
      <hr className="ctx-sep" />
      <Submenu label="Apply match colors" testId="preview-menu-match">
        {matches.length === 0 ? (
          <MenuItem
            testId="preview-menu-match-create"
            onClick={() => {
              onClose();
              useColorMatchDialog.getState().openNew();
            }}
          >
            Create match colors…
          </MenuItem>
        ) : (
          matches.map((match) => (
            <MenuItem
              key={match.id}
              testId={`preview-menu-match-${match.id}`}
              onClick={() => {
                onClose();
                void applyColorMatch(selectedFormulaIds(), match.id);
              }}
            >
              <ColorMatchLabel match={match} />
            </MenuItem>
          ))
        )}
      </Submenu>
      {/* Colours in order (D129), with the other colours of the menu. */}
      <MenuItem
        testId="preview-menu-copy-colours-order"
        onClick={() => {
          onClose();
          startColourCopy();
        }}
      >
        Copy colours in order…
      </MenuItem>
      <MenuItem
        testId="preview-menu-paste-colours-order"
        disabled={keptColours === 0}
        onClick={() => {
          onClose();
          startColourPaste();
        }}
      >
        {keptColours > 0 ? `Paste colours in order (${keptColours})` : 'Paste colours in order'}
      </MenuItem>
    </ContextMenu>
  );
}
