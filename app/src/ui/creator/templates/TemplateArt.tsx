import type { Ref } from 'react';
import type { ThumbArt } from './thumbs';

interface TemplateArtProps {
  /** What MathJax made of the formula; undefined while it has not. */
  art: ThumbArt | undefined;
  /** The LaTeX drawn, for whoever cannot see it. */
  latex: string;
  background: string;
  testId: string;
  className?: string;
  /** The formula changed and this is still the rendering of what it was. */
  stale?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/** A formula drawn like one of the Creator's list: white, on the project's background. */
export function TemplateArt({
  art,
  latex,
  background,
  testId,
  className = '',
  stale = false,
  ref,
}: TemplateArtProps) {
  return (
    <div
      ref={ref}
      className={`formula-thumb template-thumb ${className}`.trimEnd()}
      style={{ background }}
      data-testid={testId}
      data-state={!art || stale ? 'pending' : art.ok ? 'ready' : 'error'}
    >
      {art?.ok ? (
        <svg
          viewBox={art.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={latex}
        >
          <g transform="scale(1,-1)" fill="#FFFFFF">
            {art.paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
      ) : (
        <span className="formula-thumb-empty" title={art && !art.ok ? art.message : undefined}>
          {art ? 'cannot render' : '…'}
        </span>
      )}
    </div>
  );
}
