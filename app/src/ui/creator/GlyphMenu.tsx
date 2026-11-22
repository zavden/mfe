/* The right-click menu of selected glyphs (in one formula or several): the Manim palette, Clear
 * colour, Hide / Show at the start. The caller applies the actions; the menu closes after one.
 * The preview's glyph pick (D74) opens it too, under its own test ids, with the palette and Clear
 * colour in a «Colour ›» submenu (`colorSubmenu`, R1), its colour sequence items after them
 * (`afterColour`, D92) and its brace and shape submenus after these items (`children`) — and
 * without Hide / Show at the start for glyphs picked in several formulas (no `onHidden`, D117). */
import type { ReactNode } from 'react';
import { ContextMenu, MenuItem, Submenu } from '../ContextMenu';
import { ColourSwatches } from '../colors/ColourSwatches';

interface GlyphMenuProps {
  x: number;
  y: number;
  /** What the actions apply to, e.g. "3 glyphs: 0, 1, 2". */
  header: string;
  canClearColor: boolean;
  canHide?: boolean;
  canShow?: boolean;
  onColor(hex: string | null): void;
  /** Hide the glyphs at the start, or show them; absent, the two items are not offered. */
  onHidden?(hidden: boolean): void;
  onClose(): void;
  /** The test ids' prefix: `glyph-menu` unless the caller has its own. */
  testIdPrefix?: string;
  /** The palette and Clear colour in a «Colour ›» submenu (entry `<prefix>-color`) rather than
   * at the top level: a menu that has more sections after them. */
  colorSubmenu?: boolean;
  /** More colour items, after the palette and Clear colour (the caller closes the menu after
   * one). */
  afterColour?: ReactNode;
  /** More items, after Show at the start (the caller closes the menu after one). */
  children?: ReactNode;
}

export function GlyphMenu(props: GlyphMenuProps) {
  const ids = props.testIdPrefix ?? 'glyph-menu';
  const { onHidden } = props;
  const act = (action: () => void) => () => {
    action();
    props.onClose();
  };
  const colour = (
    <>
      <ColourSwatches
        testIdPrefix={`${ids}-color`}
        onPick={(hex) => act(() => props.onColor(hex))()}
      />
      <MenuItem
        disabled={!props.canClearColor}
        testId={`${ids}-clear-color`}
        onClick={act(() => props.onColor(null))}
      >
        Clear colour
      </MenuItem>
    </>
  );
  return (
    <ContextMenu
      x={props.x}
      y={props.y}
      label="Selected glyphs"
      testId={ids}
      onClose={props.onClose}
    >
      <div className="ctx-header" data-testid={`${ids}-header`}>
        {props.header}
      </div>
      {props.colorSubmenu ? (
        <Submenu label="Colour" testId={`${ids}-color`}>
          {colour}
        </Submenu>
      ) : (
        colour
      )}
      {props.afterColour && (
        <>
          {!props.colorSubmenu && <hr className="ctx-sep" />}
          {props.afterColour}
        </>
      )}
      {onHidden && (
        <>
          <hr className="ctx-sep" />
          <MenuItem
            disabled={!props.canHide}
            testId={`${ids}-hide`}
            onClick={act(() => onHidden(true))}
          >
            Hide at the start
          </MenuItem>
          <MenuItem
            disabled={!props.canShow}
            testId={`${ids}-show`}
            onClick={act(() => onHidden(false))}
          >
            Show at the start
          </MenuItem>
        </>
      )}
      {props.children}
    </ContextMenu>
  );
}
