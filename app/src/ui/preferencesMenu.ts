/* The entries of the menu bar's Preferences menu: what `ui/preferences.ts` lets the user choose
 * from the menu. `MenuBar` shows them; the choice goes to `set`, which persists it. */
import type { MenuEntry } from './MenuPopup';
import {
  GUIDE_COLORS,
  GUIDE_WIDTHS,
  LOCKED_OPACITIES,
  type GuideWidth,
  type Preferences,
} from './preferences';
import { formatGridStep, GRID_ANCHORS, GRID_STEPS, type GridAnchor } from './preview/grid';
import { DEFAULT_STANDARD_SCALE, formatStandardScale } from './creator/standardScale';
import { formatScaleStep, SCALE_STEPS } from './preview/scaleStep';

const WIDTH_LABELS: Record<GuideWidth, string> = {
  thin: 'Thin',
  regular: 'Regular',
  thick: 'Thick',
};

const ANCHOR_LABELS: Record<GridAnchor, string> = {
  center: "The formula's centre",
  edges: 'Its nearest edges',
};

/** What the menu shows and changes. */
export type MenuPreferences = Pick<
  Preferences,
  | 'snapObjects'
  | 'guideColor'
  | 'guideWidth'
  | 'pickColor'
  | 'grid'
  | 'gridStep'
  | 'gridAnchor'
  | 'scaleStep'
  | 'splitSuffix'
  | 'keepHandles'
  | 'standardScale'
  | 'lockedOpacity'
  | 'cameraRoute'
  | 'cameraVeil'
  | 'zenMode'
>;

/** `onCustomScaleStep`: Scale step → Custom… opens the dialog that takes a number or a fraction
 * (`project/ScaleStepDialog.tsx`); `onStandardScale`: Standard scale… opens the dialog of the
 * scales new formulas and texts are born with (`project/StandardScaleDialog.tsx`, R4);
 * `onSplitSuffix`: Split suffix… opens the dialog of the suffix that names the copy a split clip
 * makes (`project/SplitSuffixDialog.tsx`, D169). */
export function preferencesMenuItems(
  current: MenuPreferences,
  set: (patch: Partial<Preferences>) => void,
  onCustomScaleStep: () => void = () => {},
  onStandardScale: () => void = () => {},
  onSplitSuffix: () => void = () => {},
): MenuEntry[] {
  const presetStep = (SCALE_STEPS as readonly string[]).includes(current.scaleStep);
  const { math, tex } = current.standardScale;
  const defaultScale =
    math.trim() === DEFAULT_STANDARD_SCALE.math && tex.trim() === DEFAULT_STANDARD_SCALE.tex;
  return [
    {
      type: 'item',
      id: 'snap-objects',
      label: 'Snap to objects',
      checked: current.snapObjects,
      checkbox: true,
      onSelect: () => set({ snapObjects: !current.snapObjects }),
    },
    { type: 'separator', id: 'sep-guides' },
    {
      type: 'submenu',
      id: 'guide-color',
      label: 'Guide colour',
      items: GUIDE_COLORS.map(({ id, label, value }): MenuEntry => ({
        type: 'item',
        id,
        label,
        swatch: value,
        checked: value === current.guideColor.toLowerCase(),
        onSelect: () => set({ guideColor: value }),
      })),
    },
    {
      type: 'submenu',
      id: 'guide-width',
      label: 'Guide width',
      items: (Object.keys(GUIDE_WIDTHS) as GuideWidth[]).map((id): MenuEntry => ({
        type: 'item',
        id,
        label: WIDTH_LABELS[id],
        checked: id === current.guideWidth,
        onSelect: () => set({ guideWidth: id }),
      })),
    },
    {
      // The glyphs picked with Alt in the preview, and the rectangle that picks them (D132).
      type: 'submenu',
      id: 'pick-color',
      label: 'Glyph selection colour',
      items: GUIDE_COLORS.map(({ id, label, value }): MenuEntry => ({
        type: 'item',
        id,
        label,
        swatch: value,
        checked: value === current.pickColor.toLowerCase(),
        onSelect: () => set({ pickColor: value }),
      })),
    },
    { type: 'separator', id: 'sep-handles' },
    {
      type: 'item',
      id: 'keep-handles',
      label: 'Keep the transform handles shown',
      checked: current.keepHandles,
      checkbox: true,
      onSelect: () => set({ keepHandles: !current.keepHandles }),
    },
    {
      type: 'submenu',
      id: 'scale-step',
      label: 'Scale step',
      items: [
        ...SCALE_STEPS.map((step): MenuEntry => ({
          type: 'item',
          id: step,
          label: step,
          checked: step === current.scaleStep,
          onSelect: () => set({ scaleStep: step }),
        })),
        {
          type: 'item',
          id: 'custom',
          label: presetStep ? 'Custom…' : `Custom (${formatScaleStep(current.scaleStep)})…`,
          checked: !presetStep,
          onSelect: onCustomScaleStep,
        },
      ],
    },
    {
      type: 'submenu',
      id: 'locked-opacity',
      label: 'Locked formulas',
      // How faded the preview draws a formula locked in it (a clip's menu on the timeline).
      items: LOCKED_OPACITIES.map((opacity): MenuEntry => ({
        type: 'item',
        id: String(Math.round(opacity * 100)),
        label: opacity === 1 ? '100 % (not faded)' : `${Math.round(opacity * 100)} %`,
        checked: Math.abs(opacity - current.lockedOpacity) < 1e-6,
        onSelect: () => set({ lockedOpacity: opacity }),
      })),
    },
    { type: 'separator', id: 'sep-grid' },
    {
      type: 'item',
      id: 'show-grid',
      label: 'Show grid',
      checked: current.grid,
      checkbox: true,
      onSelect: () => set({ grid: !current.grid }),
    },
    {
      type: 'submenu',
      id: 'grid-step',
      label: 'Grid spacing',
      items: GRID_STEPS.map((step): MenuEntry => ({
        type: 'item',
        id: formatGridStep(step),
        label: `${formatGridStep(step)} ${step === 1 ? 'unit' : 'units'}`,
        checked: step === current.gridStep,
        onSelect: () => set({ gridStep: step }),
      })),
    },
    {
      type: 'submenu',
      id: 'grid-anchor',
      label: 'Grid snaps',
      items: GRID_ANCHORS.map((anchor): MenuEntry => ({
        type: 'item',
        id: anchor,
        label: ANCHOR_LABELS[anchor],
        checked: anchor === current.gridAnchor,
        onSelect: () => set({ gridAnchor: anchor }),
      })),
    },
    { type: 'separator', id: 'sep-camera' },
    {
      // The Preview's world view of a scene with a camera (D190): the line that joins its
      // frames, and the dimming of what it leaves out.
      type: 'item',
      id: 'camera-route',
      label: 'Show the camera’s route',
      checked: current.cameraRoute,
      checkbox: true,
      onSelect: () => set({ cameraRoute: !current.cameraRoute }),
    },
    {
      type: 'item',
      id: 'camera-veil',
      label: 'Dim what the camera leaves out',
      checked: current.cameraVeil,
      checkbox: true,
      onSelect: () => set({ cameraVeil: !current.cameraVeil }),
    },
    { type: 'separator', id: 'sep-new' },
    {
      type: 'item',
      id: 'standard-scale',
      label: defaultScale
        ? 'Standard scale…'
        : `Standard scale (formulas ${formatStandardScale(math)}, texts ${formatStandardScale(tex)})…`,
      onSelect: onStandardScale,
    },
    {
      type: 'item',
      id: 'split-suffix',
      label: `Split suffix (${current.splitSuffix})…`,
      onSelect: onSplitSuffix,
    },
    { type: 'separator', id: 'sep-layout' },
    {
      // For small windows (D182): the Creator and the Animations panel share one place.
      type: 'item',
      id: 'zen-mode',
      label: 'Zen mode',
      checked: current.zenMode,
      checkbox: true,
      onSelect: () => set({ zenMode: !current.zenMode }),
    },
  ];
}
