/* The app's symbol: an M drawn from a square source node to a diamond target node, its second
 * half in the accent. Theme-aware: it takes the UI's text and accent colours. Decorative: the app
 * name always goes with it. */
export function BrandMark({ size = 18 }: { size?: number }) {
  const stroke = {
    fill: 'none',
    strokeWidth: 7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="12 18 76 68"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24 72 V32 Q24 24 30 30 L48 50" stroke="var(--text)" {...stroke} />
      <path d="M48 50 L66 30 Q72 24 72 32 V71" stroke="var(--accent)" {...stroke} />
      <rect x="18" y="66" width="12" height="12" rx="2" fill="var(--text)" />
      <path d="M72 61 L82 71 L72 81 L62 71 Z" fill="var(--accent)" />
    </svg>
  );
}
