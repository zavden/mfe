/* The bar in the preview's top-left corner while glyphs are picked with Alt (D74): what is
 * picked; Colour ▾ — the Creator's glyph menu: the Manim palette, Clear colour, Copy and Paste
 * colour sequence (`ColourSequenceItems.tsx`, D92), «Copy colour to clipboard» for a single
 * glyph (`CopyColourItem.tsx`, D130), Hide / Show at the start — on the picked
 * glyphs; Add brace ▾ and Add shape ▾ — the groups of the clip's menu — on them, «On some
 * glyphs…» opening the dialog with them picked; and a button that clears the pick (so does Esc).
 * Glyphs picked in several formulas (D117) have the palette and Clear colour in Colour ▾, and
 * one brace or one shape over them all in Add brace ▾ and Add shape ▾: hiding, the colour
 * sequence and the glyph dialogs are of one formula. The actions are `glyphActions.ts`. */
import { useState, type MouseEvent } from 'react';
import { useProjectStore } from '../../store';
import { BraceMenuItems, ShapeMenuItems } from '../animations/BlockMenus';
import { ContextMenu } from '../ContextMenu';
import { GlyphMenu } from '../creator/GlyphMenu';
import { Icon } from '../timeline/icons';
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
import { useGlyphPick } from './glyphPickStore';

type Menu = { kind: 'color' | 'brace' | 'shape'; x: number; y: number };

export function GlyphPickBar({ pick }: { pick: GlyphPick }) {
  const project = useProjectStore((state) => state.project);
  const [menu, setMenu] = useState<Menu | null>(null);
  const only = singlePart(pick);
  const clip = only && project.clips.find((c) => c.id === only.clipId);
  const formula = clip ? project.formulas.find((f) => f.id === clip.formulaId) : undefined;
  if (only && !formula) return null;
  const glyphs = only ? pickedGlyphs(only) : [];
  const header = describePick(project, pick);
  const close = () => setMenu(null);
  const openMenu = (kind: Menu['kind'], event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind, x: rect.left, y: rect.bottom + 2 });
  };
  const menuButton = (kind: Menu['kind'], label: string, title: string) => (
    <button
      type="button"
      className="preview-tool preview-actions-menu"
      aria-haspopup="menu"
      aria-expanded={menu?.kind === kind}
      title={title}
      data-testid={`glyph-pick-${kind}`}
      onClick={(event) => openMenu(kind, event)}
    >
      {label} <span aria-hidden="true">▾</span>
    </button>
  );
  return (
    <div
      className="preview-actions"
      role="toolbar"
      aria-label="Selected glyphs"
      data-testid="glyph-pick"
    >
      <span className="preview-actions-count" data-testid="glyph-pick-count">
        {header}
      </span>
      {menuButton(
        'color',
        'Colour',
        formula
          ? 'Colour the selected glyphs, or hide them at the start'
          : 'Colour the selected glyphs',
      )}
      {menuButton(
        'brace',
        'Brace',
        formula
          ? 'A brace on the selected glyphs'
          : 'One brace over the selected glyphs of all the formulas',
      )}
      {menuButton(
        'shape',
        'Shape',
        formula
          ? 'A box, a circle, an underline, a cross or a highlight on the selected glyphs'
          : 'One box, circle, underline, cross or highlight over the selected glyphs of all the formulas',
      )}
      <button
        type="button"
        className="preview-tool"
        aria-label="Clear the glyph selection"
        title="Clear the glyph selection (Esc)"
        data-testid="glyph-pick-clear"
        onClick={() => useGlyphPick.getState().clear()}
      >
        <Icon name="close" />
      </button>
      {menu?.kind === 'color' && formula && (
        <GlyphMenu
          x={menu.x}
          y={menu.y}
          header={header}
          testIdPrefix="glyph-pick-color-menu"
          {...pickColourState(formula, glyphs)}
          onColor={(color) => colourPickedGlyphs(color, pick)}
          onHidden={(hidden) => hidePickedGlyphs(hidden, pick)}
          onClose={close}
          afterColour={
            <>
              {glyphs.length === 1 && (
                <CopyColourItem
                  formula={formula}
                  glyph={glyphs[0]!}
                  testIdPrefix="glyph-pick-color-menu"
                  onClose={close}
                />
              )}
              <ColourSequenceItems
                pick={pick}
                formula={formula}
                glyphs={glyphs}
                testIdPrefix="glyph-pick-color-menu"
                onClose={close}
              />
            </>
          }
        />
      )}
      {menu?.kind === 'color' && !formula && (
        <GlyphMenu
          x={menu.x}
          y={menu.y}
          header={header}
          testIdPrefix="glyph-pick-color-menu"
          canClearColor={pickHasColour(project, pick)}
          onColor={(color) => colourPickedGlyphs(color, pick)}
          onClose={close}
        />
      )}
      {menu?.kind === 'brace' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Add brace"
          testId="glyph-pick-brace-menu"
          onClose={close}
        >
          <BraceMenuItems
            testIdPrefix="glyph-pick-brace"
            flat
            dialog={formula !== undefined}
            onChoose={(choice) => {
              close();
              if (choice === 'glyphs') openPickedGlyphsDialog('brace', pick);
              else braceOnPickedGlyphs(choice, pick);
            }}
          />
        </ContextMenu>
      )}
      {menu?.kind === 'shape' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Add shape"
          testId="glyph-pick-shape-menu"
          onClose={close}
        >
          <ShapeMenuItems
            testIdPrefix="glyph-pick-shape"
            flat
            dialog={formula !== undefined}
            onChoose={(choice) => {
              close();
              if (choice === 'glyphs') openPickedGlyphsDialog('shape', pick);
              else shapeOnPickedGlyphs(choice, pick);
            }}
          />
        </ContextMenu>
      )}
    </div>
  );
}
