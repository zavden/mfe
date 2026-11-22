/* The frame of a block's tooltip in the block view of the Creator's list (FormulaTooltip, and
 * groups/GroupTooltip for a group's block): where it goes beside its block, how wide it is and how
 * tall its renderings are (`--tip-preview-height`, creator.css), by the size of the block view's
 * previews (D173), held inside the window. `blockTip.ts` works all of it out; this reads the
 * preference and the window. */
import type { CSSProperties } from 'react';
import { placeTip, tipSize, type TipAnchor } from './blockTip';
import { usePreviewScale } from './PreviewSizeKey';

export function useTipFrame(anchor: TipAnchor): CSSProperties {
  const scale = usePreviewScale('grid');
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const size = tipSize(scale, viewport);
  return {
    ...placeTip(anchor, viewport, size),
    width: size.width,
    ['--tip-preview-height' as string]: `${size.preview.height}px`,
  };
}
