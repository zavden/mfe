/* The relation editor's side column: the list of pairs (each with its style, its Edit path… and
 * the mark of an edited path), the relation's timing and style, and
 * the two "unpaired glyphs" settings (the source's outro, the target's intro). The editor owns
 * the draft and lays these out (the pairs in one tab, the rest in another); they show the draft
 * and report the changes. */
import type {
  FormulaSnapshot,
  GlyphPair,
  PairExtras,
  Relation,
  RelationStyle,
  Severity,
  Window,
} from '../../model';
import { missingPrincipal, PATH_ARC_LIMIT, principalOf } from '../../model';
import { EASING_CHOICES } from '../animations/catalogue';
import { CheckField, NumberField, SelectField } from '../animations/fields';
import { issueMark } from '../animations/issues';
import { STARTS_EMPTY_HINT } from '../animations/PhaseEditor';
import { EditedPathDot } from './EditedPathDot';
import { pairColor } from './pairColors';
import { describePair, glyphLabel, wearsEditedPath, MIN_WINDOW } from './relationOps';
import { EXTRAS_OPTIONS, PAIR_STYLE_OPTIONS, STYLE_OPTIONS, styleLabel } from './styleOptions';

// --- Pairs -------------------------------------------------------------------------

interface PairListProps {
  pairs: readonly GlyphPair[];
  /** Pairs with issues, by the graver severity of theirs (the danger red for an error, the
   * warning colour for warnings only), and pairs emphasised (hovered, or holding a selected
   * glyph). */
  pairIssues: ReadonlyMap<number, Severity>;
  focusPairs: ReadonlySet<number>;
  fromSnap: FormulaSnapshot | null;
  toSnap: FormulaSnapshot | null;
  /** The style of the relation (or Morph block), which "Inherit" means. */
  defaultStyle: RelationStyle;
  onStyle(index: number, style: RelationStyle | null): void;
  /** A pair of several sources and one target: how the sources beyond the first arrive. */
  onExtras(index: number, extras: PairExtras): void;
  /** Take the pair apart to change its glyphs. */
  onEdit(index: number): void;
  onDelete(index: number): void;
  onHover(index: number | null): void;
  /** Edit path… of a pair (D156): the editor saves and the preview's mode opens on the pair.
   * Without it the rows have no such button. */
  onEditPath?(index: number): void;
  /** Why no path can be edited now (the draft cannot be saved): the buttons are off, saying so. */
  editPathBlocked?: string | null;
  /** The path arc of the relation (or Morph block): a pair's path that is that arc is no path
   * of its own (`wearsEditedPath`). Without it no pair wears the mark of an edited path. */
  pathArc?: number;
  /** Prefix of the list's test ids (default `rel`: `rel-pairs`, `rel-pair-0-style`…). */
  testIdPrefix?: string;
  /** The list says "Pairs (n)" over itself; not where a tab that holds it says so already. */
  titled?: boolean;
}

export function PairList({
  pairs,
  pairIssues,
  focusPairs,
  fromSnap,
  toSnap,
  defaultStyle,
  onStyle,
  onExtras,
  onEdit,
  onDelete,
  onHover,
  onEditPath,
  editPathBlocked = null,
  pathArc,
  testIdPrefix: id = 'rel',
  titled = true,
}: PairListProps) {
  return (
    <section className="rel-section rel-pairs" data-testid={`${id}-pairs`}>
      {titled && <h3>Pairs ({pairs.length})</h3>}
      {pairs.length === 0 && <p className="rel-empty">No pairs yet.</p>}
      <ol>
        {pairs.map((pair, i) => {
          const mark = issueMark(pairIssues.get(i));
          const principal = principalOf(pair);
          return (
            <li
              key={i}
              className={`rel-pair${mark ? ` ${mark}` : ''}${focusPairs.has(i) ? ' is-focus' : ''}`}
              style={{ ['--pair-color' as string]: pairColor(i) }}
              data-testid={`${id}-pair-${i}`}
              data-focus={focusPairs.has(i)}
              data-from={pair.from.join(',')}
              data-to={pair.to.join(',')}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
            >
              <span className="rel-swatch" style={{ background: pairColor(i) }}>
                {i + 1}
              </span>
              <span
                className="rel-pair-text"
                title={describePair(pair, fromSnap, toSnap)}
                data-testid={`${id}-pair-${i}-text`}
              >
                {describePair(pair, fromSnap, toSnap)}
              </span>
              {pathArc !== undefined && wearsEditedPath(pair, { pathArc, style: defaultStyle }) && (
                <EditedPathDot testId={`${id}-pair-${i}-path-dot`} />
              )}
              <span className="rel-pair-kind">
                {pair.from.length === 1 && pair.to.length === 1
                  ? '1→1'
                  : `${pair.from.length}→${pair.to.length}`}
              </span>
              <select
                className="an-input rel-pair-style"
                aria-label="Pair style"
                data-testid={`${id}-pair-${i}-style`}
                value={pair.style ?? 'inherit'}
                onChange={(e) =>
                  onStyle(
                    i,
                    e.target.value === 'inherit' ? null : (e.target.value as RelationStyle),
                  )
                }
              >
                {PAIR_STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value === 'inherit' ? `Inherit: ${styleLabel(defaultStyle)}` : o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-small"
                title="Take this pair apart to change its glyphs"
                data-testid={`${id}-pair-${i}-edit`}
                onClick={() => onEdit(i)}
              >
                Edit
              </button>
              {onEditPath && (
                <button
                  type="button"
                  className="btn btn-small rel-pair-path"
                  title={
                    editPathBlocked ??
                    "Save, and shape the curve this pair's glyphs follow in the preview"
                  }
                  data-testid={`${id}-pair-${i}-edit-path`}
                  disabled={editPathBlocked !== null}
                  onClick={() => onEditPath(i)}
                >
                  Edit path…
                </button>
              )}
              <button
                type="button"
                className="btn btn-small rel-pair-delete"
                aria-label="Delete pair"
                data-testid={`${id}-pair-${i}-delete`}
                onClick={() => onDelete(i)}
              >
                ×
              </button>
              {((pair.from.length > 1 && pair.to.length === 1) || missingPrincipal(pair)) && (
                // Several sources, one target: on a line of its own under the pair.
                <span className="rel-pair-extras">
                  <span className="rel-pair-extras-label">Sources</span>
                  <select
                    className="an-input"
                    aria-label="How the sources arrive"
                    title={`Several sources, one target: how the sources arrive. ${EXTRAS_OPTIONS.map((o) => `${o.label}: ${o.title}`).join(' ')}`}
                    data-testid={`${id}-pair-${i}-extras`}
                    value={pair.extras ?? 'separate'}
                    onChange={(e) => onExtras(i, e.target.value as PairExtras)}
                  >
                    {EXTRAS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} title={o.title}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {pair.extras === 'copies' && (
                    <span
                      data-testid={`${id}-pair-${i}-principal`}
                      title="Initially the lowest source index; preserved when glyph order changes. Edit the source glyphs to choose again."
                    >
                      {principal === null
                        ? 'Principal missing: edit this pair.'
                        : `Principal: ${glyphLabel(fromSnap, principal)} (${principal})`}
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- Timing and style ----------------------------------------------------------------

interface RelationSettingsProps {
  relation: Relation;
  /** The offsets the clips allow, relative to the target clip's start (±Infinity without a
   * range). */
  lo: number;
  hi: number;
  /** Where the window starts, in scene seconds. */
  window0: number;
  range: Window | null;
  onWindow(offset: number, duration: number): void;
  patch(change: Partial<Relation>): void;
  /** Something to say about where the window is, under it: a new relation whose window could
   * not start at the playhead (`playheadNote`). */
  note?: string | null;
}

export function RelationSettings({
  relation,
  lo,
  hi,
  window0,
  range,
  onWindow,
  patch,
  note = null,
}: RelationSettingsProps) {
  return (
    <>
      <div className="an-row">
        <NumberField
          label="Offset"
          testId="rel-offset"
          title="Start of the window, relative to the start of the target clip"
          value={relation.offset}
          min={lo}
          max={Math.max(lo, hi - relation.duration)}
          suffix="s"
          onCommit={(v) => onWindow(v, relation.duration)}
        />
        <NumberField
          label="Duration"
          testId="rel-duration"
          value={relation.duration}
          min={MIN_WINDOW}
          max={Math.max(MIN_WINDOW, hi - relation.offset)}
          suffix="s"
          onCommit={(v) => onWindow(relation.offset, v)}
        />
      </div>
      <p className="rel-window" data-testid="rel-window">
        Window {window0.toFixed(2)} → {(window0 + relation.duration).toFixed(2)} s
        {range
          ? ` (allowed ${range.start.toFixed(2)} → ${range.end.toFixed(2)} s)`
          : ' (the clips do not overlap)'}
      </p>
      {note && (
        <p className="rel-hint" data-testid="rel-window-note">
          {note}
        </p>
      )}
      <div className="an-row">
        <SelectField
          label="Easing"
          testId="rel-easing"
          value={relation.easing}
          options={EASING_CHOICES}
          onChange={(easing) => patch({ easing })}
        />
        <SelectField
          label="Default style"
          testId="rel-style"
          value={relation.style}
          options={STYLE_OPTIONS}
          onChange={(style) => patch({ style })}
        />
        <NumberField
          label="Path arc"
          testId="rel-path-arc"
          title="Manim path_arc in degrees: 0 moves glyphs in straight lines"
          value={relation.pathArc}
          min={-PATH_ARC_LIMIT}
          max={PATH_ARC_LIMIT}
          step={5}
          suffix="°"
          onCommit={(v) => patch({ pathArc: v })}
        />
      </div>
    </>
  );
}

// --- Unpaired glyphs -----------------------------------------------------------------

/** What the unpaired glyphs of a target that starts empty do. */
const STAYS_OUT =
  'The clip starts empty: they stay out, unless a Morph or an Appear block of the clip brings them.';

const PHASE_TEXT = {
  outro: {
    testId: 'rel-unpaired-out',
    fate: 'not taken away by a relation or a block',
    then: 'They leave with the outro of that clip:',
    label: 'Outro',
    kindId: 'rel-outro-kind',
    durationId: 'rel-outro-duration',
    matchId: 'rel-match-outro',
    matchLabel: 'Run it during the relation window (ends with the source clip)',
  },
  intro: {
    testId: 'rel-unpaired-in',
    fate: 'not brought in by a relation or a block',
    then: 'They enter with the intro of that clip:',
    label: 'Intro',
    kindId: 'rel-intro-kind',
    durationId: 'rel-intro-duration',
    matchId: 'rel-match-intro',
    matchLabel: 'Run it up to the end of the relation window (starts with the target clip)',
  },
} as const;

interface UnpairedPhaseProps<K extends string> {
  /** The source's outro (glyphs the relation leaves behind) or the target's intro (glyphs it
   * does not bring in). */
  phase: 'outro' | 'intro';
  formulaName: string;
  /** The unpaired glyphs, and the snapshot that labels them. */
  glyphs: readonly number[];
  snap: FormulaSnapshot | null;
  kind: K;
  options: readonly { value: K; label: string }[];
  onKind(kind: K): void;
  /** The phase's duration as it will run, and the most the clip allows. */
  duration: number;
  maxDuration: number;
  onDuration(seconds: number): void;
  /** Whether the phase runs along the relation window instead. */
  match: boolean;
  onMatch(match: boolean): void;
  /** The intro only: whether the target clip starts empty (`Clip.startsEmpty`) — its unpaired
   * glyphs then stay out, and its intro has nothing to animate. */
  startsEmpty?: boolean;
  onStartsEmpty?(startsEmpty: boolean): void;
}

export function UnpairedPhase<K extends string>({
  phase,
  formulaName,
  glyphs,
  snap,
  kind,
  options,
  onKind,
  duration,
  maxDuration,
  onDuration,
  match,
  onMatch,
  startsEmpty = false,
  onStartsEmpty,
}: UnpairedPhaseProps<K>) {
  const text = PHASE_TEXT[phase];
  const none = kind === 'none';
  return (
    <div className="rel-unpaired" data-testid={text.testId}>
      <p className="rel-hint">
        {glyphs.length === 1 ? '1 glyph' : `${glyphs.length} glyphs`} of {formulaName}{' '}
        {glyphs.length === 1 ? 'is' : 'are'} {text.fate}
        {glyphs.length > 0 && snap
          ? ` (${glyphs.map((g) => glyphLabel(snap, g)).join(' ')})`
          : ''}. {startsEmpty ? STAYS_OUT : text.then}
      </p>
      {onStartsEmpty && (
        <>
          <CheckField
            label="Starts empty"
            testId="rel-starts-empty"
            checked={startsEmpty}
            onChange={onStartsEmpty}
          />
          <p className="rel-hint" data-testid="rel-starts-empty-hint">
            {STARTS_EMPTY_HINT}
          </p>
        </>
      )}
      <div className="an-row">
        <SelectField
          label={text.label}
          testId={text.kindId}
          value={kind}
          options={options}
          disabled={startsEmpty}
          onChange={onKind}
        />
        <NumberField
          label="Duration"
          testId={text.durationId}
          value={duration}
          min={0}
          max={maxDuration}
          suffix="s"
          disabled={none || match || startsEmpty}
          onCommit={onDuration}
        />
      </div>
      <CheckField
        label={text.matchLabel}
        testId={text.matchId}
        checked={match}
        disabled={none || startsEmpty}
        onChange={onMatch}
      />
    </div>
  );
}
