/* LaTeX input: a MathLive `<math-field>` for visual editing and a "Raw LaTeX" textarea, kept in
 * sync. The textarea holds the source of truth: edits in the math field replace it, and typing
 * in the textarea updates the math field silently (so MathLive's normalisation of the LaTeX
 * never rewrites what the user typed). A formula with rows (`&` and `\\` outside any
 * environment, as Manim's `align*` reads them) is shown wrapped in `aligned`, which MathLive
 * understands, and the wrapper is kept out of the textarea (`alignedWrap.ts`). Package macros
 * are registered for the live preview.
 *
 * The Keyboard key beside the title shows the editor's on-screen keypad under the visual field
 * (`keypad/FormulaKeypad.tsx`). Left shown, it is shown again the next time the editor opens (a
 * preference). MathLive's own keyboard is never shown: the field asks for none, and the key the
 * field would draw for it is hidden (`creator.css`). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { keepFocus } from '../focus';
import { usePreferences } from '../preferences';
import { fromFieldLatex, toFieldLatex } from './alignedWrap';
import { FormulaKeypad } from './keypad/FormulaKeypad';
import { loadMathLive, type MathLiveModule } from './mathlive';
import { macrosFor } from './packageMacros';
import './keypad/keypad.css';

interface LatexInputProps {
  value: string;
  packages: readonly string[];
  onChange: (latex: string) => void;
  autoFocus?: boolean;
  /** The Apply key of the on-screen keypad was pressed. */
  onApply?: () => void;
}

type Field = InstanceType<MathLiveModule['MathfieldElement']>;

/** What the field holds, in the user's terms (the wrapper of `show` removed): LaTeX as LaTeX reads
 * it. A hole that is still empty (of a fraction just asked for, with a key or with "/") is an empty
 * group, not `\placeholder{}`, MathLive's own mark, which neither MathJax nor Manim typesets: a
 * formula being written is not an error at every key. The field keeps its holes. */
function held(field: Field, wrapped: { current: boolean }): string {
  return fromFieldLatex(field.getValue('latex-without-placeholders'), wrapped.current);
}

/** Shows `latex` in the field, wrapped in `aligned` when it has rows; `wrapped` remembers it, and
 * `told` what the field holds of it. That is MathLive's own writing of the text, seldom the text
 * itself: it is kept to know an edit made in the field from a text the field was only shown. */
function show(
  field: Field,
  latex: string,
  wrapped: { current: boolean },
  told: { current: string | null },
): void {
  const shown = toFieldLatex(latex);
  wrapped.current = shown.wrapped;
  field.setValue(shown.latex, { silenceNotifications: true });
  told.current = held(field, wrapped);
}

export function LatexInput({ value, packages, onChange, autoFocus, onApply }: LatexInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<Field | null>(null);
  const baseMacros = useRef<Field['macros'] | null>(null);
  const onChangeRef = useRef(onChange);
  const onApplyRef = useRef(onApply);
  const valueRef = useRef(value);
  const wrappedRef = useRef(false);
  /** What the field held when the draft last had its word: the text it was shown, as MathLive
   * writes it, or the last edit it told. */
  const toldRef = useRef<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** The visual field, once MathLive has made it. */
  const [shownField, setShownField] = useState<Field | null>(null);
  const ready = shownField !== null;
  /** The keypad is shown: left so by its key, in this editor or in the one before it. */
  const keyboard = usePreferences((state) => state.formulaKeyboardShown);

  useEffect(() => {
    onChangeRef.current = onChange;
    onApplyRef.current = onApply;
    valueRef.current = value;
  });

  /** Apply, from the keypad's key. MathLive tells a change a moment after it is made: what the
   * key pressed just before wrote is told now, and the draft that is applied has it. Only an edit
   * made in the field is told: a source typed in the textarea is in the draft already, and what
   * the field holds of it is MathLive's rewriting, which must not take its place. */
  const applyNow = useCallback(() => {
    const field = fieldRef.current;
    if (field) {
      const latex = held(field, wrappedRef);
      if (latex !== toldRef.current) {
        toldRef.current = latex;
        if (latex !== valueRef.current) flushSync(() => onChangeRef.current(latex));
      }
    }
    onApplyRef.current?.();
  }, []);

  // Create the math field once MathLive has loaded.
  useEffect(() => {
    let disposed = false;
    let field: Field | null = null;
    const host = hostRef.current;
    loadMathLive()
      .then(
        (module) => {
          if (disposed || !host) return;
          field = new module.MathfieldElement();
          field.mathVirtualKeyboardPolicy = 'manual';
          field.setAttribute('data-testid', 'math-field');
          // The element builds its editor when it is connected: attach it before using it.
          host.appendChild(field);
          baseMacros.current = field.macros;
          show(field, valueRef.current, wrappedRef, toldRef);
          field.addEventListener('input', () => {
            const latex = held(field!, wrappedRef);
            toldRef.current = latex;
            if (latex !== valueRef.current) onChangeRef.current(latex);
          });
          fieldRef.current = field;
          setShownField(field);
          if (autoFocus) field.focus();
        },
        (error: unknown) => setFailed(String(error)),
      )
      .catch((error: unknown) => setFailed(String(error)));
    return () => {
      disposed = true;
      field?.remove();
      fieldRef.current = null;
      setShownField(null);
    };
  }, [autoFocus]);

  // Package macros.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field || !baseMacros.current) return;
    field.macros = { ...baseMacros.current, ...macrosFor(packages) };
    // Re-parse the current value so macros defined by a newly added package take effect.
    show(field, valueRef.current, wrappedRef, toldRef);
  }, [packages, ready]);

  // The textarea (or an external reset) changed the value: mirror it into the math field.
  useEffect(() => {
    const field = fieldRef.current;
    if (field && held(field, wrappedRef) !== value) show(field, value, wrappedRef, toldRef);
  }, [value, ready]);

  const toggleKeyboard = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    usePreferences.getState().set({ formulaKeyboardShown: !keyboard });
  };

  // What the keypad writes in stays in sight: it has just taken its place under the field.
  useEffect(() => {
    if (keyboard) rootRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [keyboard]);

  return (
    <div className="latex-input" ref={rootRef}>
      <div className="latex-head">
        <h3>LaTeX</h3>
        <button
          type="button"
          className="btn btn-small"
          onMouseDown={keepFocus}
          onClick={toggleKeyboard}
          disabled={!ready}
          aria-pressed={keyboard}
          data-testid="toggle-keyboard"
        >
          ⌨ Keyboard
        </button>
      </div>
      <div className="latex-field" ref={hostRef} data-testid="math-field-host">
        {!ready && !failed && <span className="field-hint">Loading the math editor…</span>}
        {failed && (
          <span className="field-error" role="alert">
            The visual editor could not be loaded ({failed}). Use the raw LaTeX field.
          </span>
        )}
      </div>
      {keyboard && shownField && <FormulaKeypad field={shownField} onApply={applyNow} />}
      <label className="latex-raw-head" htmlFor="raw-latex">
        Raw LaTeX
      </label>
      <textarea
        id="raw-latex"
        rows={3}
        spellCheck={false}
        value={value}
        placeholder="e.g. e^{i\pi} + 1 = 0"
        data-testid="raw-latex"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
