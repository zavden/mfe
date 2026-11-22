/* Semantic comparison of validation diagnostics. Array positions, names and time text describe
 * a problem; its stable owner, participants and affected glyphs identify it. Editors may repair
 * an imported problem incrementally, but must not add another participant or affected glyph. */
import type { Issue, IssueSubject } from './validate';

function sameSubject(a: IssueSubject, b: IssueSubject): boolean {
  if (a.kind === 'relation') return b.kind === 'relation' && a.relationId === b.relationId;
  if (a.kind === 'clip') return b.kind === 'clip' && a.clipId === b.clipId;
  return b.kind === 'action' && a.clipId === b.clipId && a.actionId === b.actionId;
}

function containsOccurrences(available: readonly string[], wanted: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const value of available) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of wanted) {
    const count = counts.get(value) ?? 0;
    if (!count) return false;
    counts.set(value, count - 1);
  }
  return true;
}

/** Whether `candidate` is the same semantic problem as `baseline`, possibly improved. Both must
 * have identity metadata; callers choose the fallback appropriate to their metadata-free issues.
 * Participant multiplicity matters: two pairs of the same transfer are two competing owners. */
export function issueIdentityNotWorse(candidate: Issue, baseline: Issue): boolean {
  const next = candidate.identity;
  const before = baseline.identity;
  if (!next || !before || candidate.code !== baseline.code) return false;
  if (candidate.severity === 'error' && baseline.severity !== 'error') return false;
  return (
    sameSubject(next.subject, before.subject) &&
    containsOccurrences(before.participants, next.participants) &&
    containsOccurrences(
      before.glyphs.map((g) => JSON.stringify([g.clipId, g.index])),
      next.glyphs.map((g) => JSON.stringify([g.clipId, g.index])),
    )
  );
}
