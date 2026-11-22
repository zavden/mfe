/* «Link as»: what a right-click offers for glyphs selected on both sides of a pair editor — the
 * styles the new pair can be born with, instead of the holder's default a plain click gives it.
 * Each choice is tried on the draft before it is offered: one that cannot be made (the link is
 * refused), or that would bring an error the draft does not have, is offered disabled with that
 * reason; one that would bring a warning says so and can still be chosen. Linking onto the
 * targets of a pair joins that pair, which keeps its own style — or makes a pair of its own
 * that brings the same targets, with the style chosen (D167), which is all there is to choose
 * once several pairs bring them.
 * Pure: the relation editor and the Morph block's pair editor give their own `link`, their own
 * reading of the project's rules (`problems`) and, for a problem about a glyph their canvas
 * already has a word for (who else takes it), that word (`explain`). */
import type { ClipId, GlyphPair, Issue, RelationStyle } from '../../model';
import { STYLE_NAME } from './pairStyle';
import { sameGlyphs, sortedUnique, type LinkResult, type PairHolder } from './relationOps';

/** The tooltip of the Link button of both editors: where the other styles are. (Said there, not
 * in the hint over the drawing: a line more of it would take the room of the lists below.) */
export const LINK_TITLE =
  'Make one pair of the selected glyphs, with the default style. To choose its style, right-click one of them instead: Link as…';

/** The styles a new pair can be given, in the order of every style list. */
export const LINK_STYLES: readonly RelationStyle[] = ['transform', 'copy', 'fade', 'fade_copy'];

export interface LinkChoice {
  /** What names the choice in a menu: `transform`, `join`, `separate-copy`… */
  key: string;
  /** The style the pair is born with; null for joining a pair, which has its own. */
  style: RelationStyle | null;
  /** A pair of its own onto targets that a pair brings already, instead of joining it. */
  separate: boolean;
  /** "Link as Copy", "Join pair 2 (Transform)", "Separate pair as Copy". */
  label: string;
  /** Why it cannot be chosen (the link is refused, or it would be an error), or null. */
  blocked: string | null;
  /** A warning the link would bring, or null. Not said for a blocked choice. */
  warning: string | null;
}

export interface LinkOffer {
  from: number[];
  to: number[];
  /** The place of the pair the link would join (its targets are linked already), or null. */
  joins: number | null;
  choices: LinkChoice[];
  /** The one reason none of the choices can be made, when they all share it. */
  refused: string | null;
}

const issueKey = (issue: Issue): string =>
  `${issue.severity}|${issue.code}|${JSON.stringify(issue.path)}|${issue.message}`;

/** The glyphs of a link that is being considered. */
export interface LinkGlyphs {
  from: number[];
  to: number[];
}

/** What can be made of the glyphs `from` → `to` on `holder`, or null when there is nothing to
 * make: a side is empty, or the glyphs are linked to each other already (all of them in one pair).
 * `link` makes the pair (`linkPair`, `linkMorphPair`), `problems` lists what validation would
 * say of the draft with some pairs (`draftProblems`, `morphProblems`) and `explain` may say a
 * problem in the editor's own words (null: the problem's message). */
export function linkOffer<H extends PairHolder>(
  holder: H,
  from: Iterable<number>,
  to: Iterable<number>,
  link: (
    holder: H,
    from: readonly number[],
    to: readonly number[],
    style: RelationStyle | null,
    separate: boolean,
  ) => LinkResult<H>,
  problems: (pairs: GlyphPair[]) => readonly Issue[],
  explain?: (issue: Issue, glyphs: LinkGlyphs) => string | null,
): LinkOffer | null {
  const src = sortedUnique(from);
  const dst = sortedUnique(to);
  if (src.length === 0 || dst.length === 0) return null;
  const within = (pair: GlyphPair) =>
    src.every((g) => pair.from.includes(g)) && dst.every((g) => pair.to.includes(g));
  if (holder.pairs.some(within)) return null;

  const say = (issue: Issue) => explain?.(issue, { from: src, to: dst }) ?? issue.message;
  const known = new Set(problems(holder.pairs).map(issueKey));
  const attempt = (
    style: RelationStyle | null,
    separate: boolean,
  ): Pick<LinkChoice, 'blocked' | 'warning'> => {
    const result = link(holder, src, dst, style, separate);
    if (!result.ok) return { blocked: result.message, warning: null };
    const fresh = problems(result.relation.pairs).filter((issue) => !known.has(issueKey(issue)));
    const error = fresh.find((issue) => issue.severity === 'error');
    if (error) return { blocked: say(error), warning: null };
    return { blocked: null, warning: fresh[0] ? say(fresh[0]) : null };
  };

  const styles = (separate: boolean, key: string, label: string): LinkChoice[] =>
    LINK_STYLES.map((style) => ({
      key: `${key}${style}`,
      style,
      separate,
      label: `${label} ${STYLE_NAME[style]}`,
      ...attempt(style, separate),
    }));
  const holding = holder.pairs.flatMap((pair, i) =>
    pair.to.some((g) => dst.includes(g)) ? [i] : [],
  );
  let joins: number | null = null;
  let choices: LinkChoice[];
  if (holding.length === 1) {
    // One pair brings the targets: join it, or — when the link is onto all of them — bring them
    // through a pair of its own.
    joins = holding[0]!;
    const pair = holder.pairs[joins]!;
    const join: LinkChoice = {
      key: 'join',
      style: null,
      separate: false,
      label: `Join pair ${joins + 1} (${STYLE_NAME[pair.style ?? holder.style]})`,
      ...attempt(null, false),
    };
    choices = [
      join,
      ...(sameGlyphs(pair.to, dst) ? styles(true, 'separate-', 'Separate pair as') : []),
    ];
  } else {
    // Free targets, or targets several pairs bring already: a pair of its own either way.
    choices = styles(holding.length > 1, '', 'Link as');
  }
  const [first] = choices;
  const refused =
    first?.blocked && choices.every((c) => c.blocked === first.blocked) ? first.blocked : null;
  return { from: src, to: dst, joins, choices, refused };
}

/** What an editor's canvas says of a glyph, by side: why it is dimmed, or what it is noted for
 * (`relationEligibility`, `morphEligibility`). */
export interface GlyphHints {
  from?: ReadonlyMap<number, string>;
  to?: ReadonlyMap<number, string>;
}

/** A problem in the canvas's words, for `explain`: the hint of the first glyph the problem is
 * about that is a glyph of the link — "Source glyph x (2) — relation 1 of 2 (f1 → f2) consumes
 * it: here it can only be copied." —, or null when the problem names none that has a hint.
 * `clips` are the clips whose glyphs the two sides index (the one clip twice for a Morph block,
 * where a glyph is on the side of the link that holds it). */
export function hintedProblem(
  issue: Issue,
  glyphs: LinkGlyphs,
  clips: { from: ClipId; to: ClipId },
  hints: GlyphHints,
  label: (side: 'from' | 'to', glyph: number) => string,
): string | null {
  for (const { clipId, index } of issue.identity?.glyphs ?? []) {
    for (const side of ['from', 'to'] as const) {
      const hint = hints[side]?.get(index);
      if (clipId !== clips[side] || !glyphs[side].includes(index) || hint === undefined) continue;
      const name = `${label(side, index)} (${index})`.trim();
      return `${side === 'from' ? 'Source' : 'Target'} glyph ${name} — ${hint}.`;
    }
  }
  return null;
}
