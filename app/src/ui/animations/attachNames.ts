/* What an attachment hangs on, in words: for the Animations panel, the notices and the
 * announcements that name it. One object for most attachments, several for a brace or a shape over
 * glyphs of several clips (D117). Pure. */
import {
  attachTargets,
  type AttachTarget,
  type ClipAttach,
  type ClipId,
  type Project,
  type TweenFit,
} from '../../model';

/** "a", "a and b", "a, b and c". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** What `targets` name, each clip with its glyphs: "f1 · glyphs 2, 3, 4 and f2 · glyph 0"; a
 * shape or a brace named whole is named alone, "s1": it is one piece (D123). */
export function describeTargets(
  project: Pick<Project, 'clips' | 'formulas'>,
  targets: readonly AttachTarget[],
): string {
  const objectOf = (clipId: ClipId) => {
    const target = project.clips.find((c) => c.id === clipId);
    return project.formulas.find((f) => f.id === target?.formulaId);
  };
  const spots = targets.map(({ clipId, glyphs }) => {
    const object = objectOf(clipId);
    const name = object?.name ?? '?';
    if (glyphs === 'all' && (object?.kind === 'shape' || object?.kind === 'brace')) return name;
    const which =
      glyphs === 'all'
        ? 'all its glyphs'
        : `glyph${glyphs.length === 1 ? '' : 's'} ${glyphs.join(', ')}`;
    return `${name} · ${which}`;
  });
  return listNames(spots);
}

/** The names of the objects an attachment hangs on — or the fit of a tween carries its shape to
 * —, in its order, each once. */
export function attachHosts(
  project: Pick<Project, 'clips' | 'formulas'>,
  attach: ClipAttach | TweenFit,
): string[] {
  const names = attachTargets(attach).map((target) => {
    const clip = project.clips.find((c) => c.id === target.clipId);
    return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';
  });
  return [...new Set(names)];
}
