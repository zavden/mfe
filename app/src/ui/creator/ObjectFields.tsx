/* Two fields every kind of object has, as the editors show them: its tag (a colour and an
 * optional icon, which identify it in the lists and never colour its glyphs) and the intro its new
 * clips start with. They report the change; the editor decides when it reaches the project. */
import { TAG_COLORS, type FormulaTag, type IntroKind, type IntroSpec } from '../../model';
import { GROW_ARROW, INTRO_CHOICES } from '../animations/catalogue';
import { MIN_DURATION } from '../project/defaultAnimations';
import { HexColorField } from '../project/HexColorField';
import { usePreferences } from '../preferences';
import { CommitInput } from './CommitInput';
import { defaultIntroLabel } from './formulaActions';

/** The longest intro an object may give its clips, in seconds. */
export const MAX_INTRO_SECONDS = 60;

export function TagField({
  tag,
  onChange,
  colorTestId,
  iconTestId,
}: {
  tag: FormulaTag;
  onChange(tag: FormulaTag): void;
  colorTestId: string;
  iconTestId: string;
}) {
  return (
    <span className="tag-field">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={tag.color.toUpperCase() === color ? 'tag-swatch active' : 'tag-swatch'}
          style={{ background: color }}
          aria-label={`Tag colour ${color}`}
          data-testid={`tag-color-${color.slice(1)}`}
          onClick={() => onChange({ ...tag, color })}
        />
      ))}
      <HexColorField
        value={tag.color}
        label="Custom tag colour"
        testId={colorTestId}
        onCommit={(color) => onChange({ ...tag, color })}
      />
      <CommitInput
        value={tag.icon ?? ''}
        label="Tag icon"
        testId={iconTestId}
        placeholder="icon"
        maxLength={8}
        width="64px"
        onCommit={(icon) => onChange({ ...tag, icon: icon.trim() || null })}
      />
    </span>
  );
}

/** The intro of an object: "Default" (the editor's preference, when the object takes it) or one of
 * the kinds its clips may use — GrowArrow among them for an arrow —, and the duration of the one it
 * chose. */
export function IntroField({
  id,
  intro,
  kinds,
  takes = (spec) => kinds.includes(spec.kind),
  onKind,
  onDuration,
  selectTestId,
  durationTestId,
}: {
  /** The id of the select, for the label beside it. */
  id: string;
  intro: IntroSpec | null;
  kinds: readonly IntroKind[];
  /** Whether the object takes an intro as it is (`takesIntro`): «Default» gives it the
   * preference's then, else none. */
  takes?: (intro: IntroSpec) => boolean;
  /** A kind was chosen ('' = the preference). */
  onKind(kind: string): void;
  onDuration(seconds: number): void;
  selectTestId: string;
  durationTestId: string;
}) {
  const autoIntro = usePreferences((state) => state.autoIntro);
  const preferred = usePreferences((state) => state.intro);
  return (
    <>
      <select
        id={id}
        className="editor-select"
        data-testid={selectTestId}
        value={intro?.kind ?? ''}
        onChange={(event) => onKind(event.target.value)}
      >
        <option value="">{defaultIntroLabel(autoIntro, preferred, takes)}</option>
        {[...INTRO_CHOICES, GROW_ARROW]
          .filter((choice) => kinds.includes(choice.value))
          .map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
      </select>
      {intro && intro.kind !== 'none' && (
        <>
          <CommitInput
            value={String(intro.duration)}
            label="Intro duration (seconds)"
            testId={durationTestId}
            width="56px"
            validate={(text) => {
              const n = Number(text);
              return Number.isFinite(n) && n >= MIN_DURATION && n <= MAX_INTRO_SECONDS
                ? null
                : `From ${MIN_DURATION} to ${MAX_INTRO_SECONDS} seconds.`;
            }}
            onCommit={(text) => onDuration(Number(text))}
          />
          <span className="field-hint">s</span>
        </>
      )}
    </>
  );
}
