/* Draws an animation's icon (`animationIcons.ts`) in the house style of `ui/timeline/icons.tsx`:
 * 16×16, `currentColor`, so that it takes the colour of the text it sits in (a block's
 * `--block-fg`, a menu's). */
import { ANIMATION_ICON_DRAWINGS, type AnimationIconName } from './animationIcons';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function AnimationIcon({ name }: { name: AnimationIconName }) {
  const { parts, mirror } = ANIMATION_ICON_DRAWINGS[name];
  const paths = parts.map((part, i) =>
    part.fill ? (
      <path key={i} d={part.d} fill="currentColor" opacity={part.opacity} />
    ) : (
      <path key={i} {...stroke} d={part.d} opacity={part.opacity} />
    ),
  );
  return (
    <svg
      className="icon animation-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {mirror ? <g transform="matrix(-1 0 0 1 16 0)">{paths}</g> : paths}
    </svg>
  );
}
