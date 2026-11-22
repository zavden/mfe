import { useEffect, useMemo, useRef, useState } from 'react';
import { cachedThumb, requestThumb, thumbKey, type ThumbArt } from './thumbs';
import { templateLatex, type TemplateSource } from './library';
import { TemplateArt } from './TemplateArt';

interface TemplateThumbProps {
  template: TemplateSource;
  background: string;
}

/** A template drawn like a formula of the list (white on the project's background) with the
 * default values of its placeholders, rendered with MathJax once its row comes near the visible
 * part of the list. */
export function TemplateThumb({ template, background }: TemplateThumbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latex = useMemo(() => templateLatex(template), [template]);
  const source = useMemo(
    () => ({ latex, packages: template.packages }),
    [latex, template.packages],
  );
  // What the drawing is of: the LaTeX and its packages, as the thumbnails are kept (`thumbs.ts`).
  const key = useMemo(() => thumbKey(source), [source]);
  const [shown, setShown] = useState<{ of: string; art: ThumbArt } | undefined>(() => {
    const art = cachedThumb(source);
    return art && { of: key, art };
  });
  // A template the user edited — its LaTeX, or its packages alone — shows nothing of what it
  // was: what it is now if that was drawn before, else nothing until it is.
  const art = shown?.of === key ? shown.art : cachedThumb(source);

  useEffect(() => {
    const el = ref.current;
    if (art || !el) return;
    let withdraw: (() => void) | null = null;
    const ask = () => {
      withdraw ??= requestThumb(source, (made) => setShown({ of: thumbKey(source), art: made }));
    };
    if (typeof IntersectionObserver === 'undefined') {
      ask();
      return () => withdraw?.();
    }
    // Requested while near the view; withdrawn if it scrolls away before its turn.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) ask();
        else {
          withdraw?.();
          withdraw = null;
        }
      },
      { rootMargin: '150px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      withdraw?.();
    };
  }, [source, art]);

  return (
    <TemplateArt
      ref={ref}
      art={art}
      latex={latex}
      background={background}
      testId="template-thumb"
    />
  );
}
