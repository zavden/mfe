/* The marks of the Slides mode in the generated scene (format 35, `model/slides.ts`): each one a
 * comment at its instant in `construct`, among the steps where `placeMarks` (timeline.ts) puts it
 * — a comment's words as `# NOTE`, a pause as `# PAUSE n of N`. They are the user's words, not the
 * generator's explanation: written whether or not the export explains itself (`comments`). Free
 * text goes through `pyComment` line by line, so that no text can end its comment and go on as
 * code. A pause that skips its wait (format 36, D202) says so on its line: the exported page goes
 * on past that wait, while the scene's `self.wait` stays — played through, and in a video, the
 * rest is the timeline's. */
import type { SlideMark } from '../../model';
import { pyComment, safeText } from './python';

/** Which of the exported pauses a pause is: its number, from 1, and how many there are; and how
 * long the wait after it that the exported page skips is (`skippedWait`), when it skips one. */
export interface PauseNumber {
  number: number;
  of: number;
  skipped?: number | null;
}

/** The comment lines of a mark: `# NOTE (5.00 s): its words`, or `# PAUSE 2 of 5 (3.20 s)` with
 * `, the exported page skips the 0.50 s wait after it` when it skips one and `: its note` when it
 * has one (`pause`: which pause it is). A text of several lines goes on in
 * lines of its own, indented under the first (`#   …`); the spaces at the end of a line and the
 * blank lines at the start and at the end of the text are left out. */
export function markLines(mark: SlideMark, pause: PauseNumber | null): string[] {
  const at = `(${mark.time.toFixed(2)} s)`;
  const skipped = pause?.skipped ?? null;
  const skips =
    skipped === null ? '' : `, the exported page skips the ${skipped.toFixed(2)} s wait after it`;
  const head =
    mark.kind === 'pause' && pause
      ? `PAUSE ${pause.number} of ${pause.of} ${at}${skips}`
      : `NOTE ${at}`;
  const lines = safeText(mark.text ?? '')
    .split(/\r\n|[\r\n]/)
    .map((line) => line.trimEnd());
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) return [pyComment(head)];
  return [
    pyComment(`${head}: ${lines[0]}`),
    ...lines.slice(1).map((line) => (line === '' ? '#' : pyComment(`  ${line}`))),
  ];
}
