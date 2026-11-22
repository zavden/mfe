import type { ReactNode } from 'react';

/** The colour a section wears (R5, D75): a stripe on its left edge and its title. Intro and
 * Outro take the Appear and Disappear colours of the timeline's blocks, Animations the block
 * colour, a block's own section its category; Timing the time colour, Initial state its own,
 * Relations the info blue, Problems (issues with an error among them) the danger red, Warnings
 * (only warnings, D177) the warning colour; the scene's camera its sky blue and a target camera
 * its pink (D190). Without one, the section stays neutral. */
export type SectionTone =
  | 'timing'
  | 'intro'
  | 'outro'
  | 'initial'
  | 'animations'
  | 'relations'
  | 'problems'
  | 'warnings'
  | 'appear'
  | 'disappear'
  | 'transform'
  | 'morph'
  | 'emphasis'
  | 'camera'
  | 'target';

/** A titled block of the Animations panel. */
export function Section({
  title,
  testId,
  tone,
  children,
  actions,
}: {
  title: string;
  testId: string;
  tone?: SectionTone;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="an-section" data-testid={testId} data-tone={tone}>
      <header className="an-section-header">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="an-section-body">{children}</div>
    </section>
  );
}
