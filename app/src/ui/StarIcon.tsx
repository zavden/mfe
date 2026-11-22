/* The star of a favorite: an outline, filled when it is one. */
export function StarIcon({ on = false }: { on?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.9l1.86 3.86 4.24.56-3.1 2.95.78 4.2L8 11.43l-3.78 2.04.78-4.2-3.1-2.95 4.24-.56z"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
