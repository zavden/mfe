/* The right-click menu on a picked glyph of the preview (D74): the
 * Creator's glyph menu — the Manim palette and Clear colour in «Colour ›», Copy and Paste colour
 * sequence (`ColourSequenceItems.tsx`, D92), «Copy colour to clipboard» for a single glyph
 * (`CopyColourItem.tsx`, D130), Hide / Show at the start — on the picked glyphs,
 * then «Add brace ›» (a side) and «Add shape ›» on them (`glyphActions.ts`), «On some glyphs…»
 * opening the dialog with them picked. On glyphs picked in several formulas (D117): «Colour ›»,
 * and one brace or one shape over them all, without what is of one formula. A right-click
 * elsewhere on the clip opens the clip's own menu. */
import { useProjectStore } from '../../store';
import { BraceMenuItems, ShapeMenuItems } from '../animations/BlockMenus';
import { GlyphMenu } from '../creator/GlyphMenu';
import { ColourSequenceItems } from './ColourSequenceItems';
import { CopyColourItem } from './CopyColourItem';
import {
  braceOnPickedGlyphs,
  colourPickedGlyphs,
  hidePickedGlyphs,
  pickColourState,
  pickHasColour,
  openPickedGlyphsDialog,
  shapeOnPickedGlyphs,
} from './glyphActions';
import { describePick, pickedGlyphs, singlePart, type GlyphPick } from './glyphPick';

interface GlyphPickMenuProps {
  x: number;
  y: number;
  pick: GlyphPick;
  onClose(): void;
}

export function GlyphPickMenu({ x, y, pick, onClose }: GlyphPickMenuProps) {
  const project = useProjectStore((state) => state.project);
  const only = singlePart(pick);
  const clip = only && project.clips.find((c) => c.id === only.clipId);
  const formula = clip ? project.formulas.find((f) => f.id === clip.formulaId) : undefined;
  /** «Add brace ›» and «Add shape ›» on the pick; the glyph dialogs with `dialog`. */
  const attachItems = (dialog: boolean) => (
    <>
      <hr className="ctx-sep" />
      <BraceMenuItems
        testIdPrefix="glyph-pick-menu-brace"
        dialog={dialog}
        onChoose={(choice) => {
          onClose();
          if (choice === 'glyphs') openPickedGlyphsDialog('brace', pick);
          else braceOnPickedGlyphs(choice, pick);
        }}
      />
      <ShapeMenuItems
        testIdPrefix="glyph-pick-menu-shape"
        dialog={dialog}
        onChoose={(choice) => {
          onClose();
          if (choice === 'glyphs') openPickedGlyphsDialog('shape', pick);
          else shapeOnPickedGlyphs(choice, pick);
        }}
      />
    </>
  );
  if (!only) {
    return (
      <GlyphMenu
        x={x}
        y={y}
        header={describePick(project, pick)}
        testIdPrefix="glyph-pick-menu"
        colorSubmenu
        canClearColor={pickHasColour(project, pick)}
        onColor={(color) => colourPickedGlyphs(color, pick)}
        onClose={onClose}
      >
        {attachItems(false)}
      </GlyphMenu>
    );
  }
  if (!formula) return null;
  const glyphs = pickedGlyphs(only);
  const colours = pickColourState(formula, glyphs);
  return (
    <GlyphMenu
      x={x}
      y={y}
      header={describePick(project, pick)}
      testIdPrefix="glyph-pick-menu"
      colorSubmenu
      canClearColor={colours.canClearColor}
      canHide={colours.canHide}
      canShow={colours.canShow}
      onColor={(color) => colourPickedGlyphs(color, pick)}
      onHidden={(hidden) => hidePickedGlyphs(hidden, pick)}
      onClose={onClose}
      afterColour={
        <>
          {glyphs.length === 1 && (
            <CopyColourItem
              formula={formula}
              glyph={glyphs[0]!}
              testIdPrefix="glyph-pick-menu"
              onClose={onClose}
            />
          )}
          <ColourSequenceItems
            pick={pick}
            formula={formula}
            glyphs={glyphs}
            testIdPrefix="glyph-pick-menu"
            onClose={onClose}
          />
        </>
      }
    >
      {attachItems(true)}
    </GlyphMenu>
  );
}
