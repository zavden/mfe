/* The formula editor's on-screen keypad: the tabs and the keys of `keypadLayout.ts`, under the
 * visual field, writing in it. A press of the pointer leaves the focus in the field, so what is
 * typed next goes on in the formula. From the physical keyboard the keys are one stop of Tab: the
 * arrows move among them, Enter or Space presses one, and undo and redo are the formula's there,
 * as they are in the field (not the project's, which they are on any other key of the dialog). */
import { createElement, useRef, useState, type KeyboardEvent } from 'react';
import type { MathfieldElement } from 'mathlive';
import { keepFocus } from '../../focus';
import { isMac } from '../../platform';
import { commandForKey } from '../../project/shortcuts';
import { Tabs } from '../../Tabs';
import { keyAction, moveOfKey, neighbourKey, shownFace } from './keypadActions';
import {
  faceLines,
  KEYPAD_TABS,
  keypadColumns,
  keyWidth,
  type KeypadFace,
  type KeypadKey,
  type KeypadTab,
  type KeypadTabId,
} from './keypadLayout';

/** What the keypad asks of the visual field. */
export type KeypadField = Pick<MathfieldElement, 'insert' | 'executeCommand' | 'focus'>;

interface FormulaKeypadProps {
  /** The visual field the keys write in. */
  field: KeypadField;
  /** Its Apply key was pressed. */
  onApply(): void;
}

/** The tab the keypad was left on: it opens there again (for the session). */
let rememberedTab: KeypadTabId = KEYPAD_TABS[0]!.id;

/** The face of a key. MathLive's static element draws the LaTeX, in the fonts of the field. */
function Face({ face }: { face: KeypadFace }) {
  if ('text' in face) return <span className="keypad-face">{face.text}</span>;
  // The element draws what it holds when it is connected: another LaTeX is another element.
  return createElement(
    'math-span',
    { key: face.latex, class: 'keypad-face keypad-face-math', 'aria-hidden': 'true' },
    face.latex,
  );
}

export function FormulaKeypad({ field, onApply }: FormulaKeypadProps) {
  const [active, setActive] = useState<KeypadTabId>(rememberedTab);
  const [shifted, setShifted] = useState(false);
  /** The key of the shown tab that Tab stops at: the one the arrows left it on. */
  const [rover, setRover] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const tab = KEYPAD_TABS.find((t) => t.id === active) ?? KEYPAD_TABS[0]!;
  const stop = tab.rows.flat().some((key) => key.id === rover) ? rover : tab.rows[0]![0]!.id;

  const changeTab = (id: KeypadTabId) => {
    rememberedTab = id;
    setActive(id);
    setShifted(false);
    // Another tab has its stop at its first key, whatever key the two tabs share.
    setRover(null);
  };

  /** Presses a key: with the pointer, the field has the focus afterwards; from the physical
   * keyboard, the key keeps it, for the arrows to go on. */
  const press = (key: KeypadKey, byPointer: boolean) => {
    const action = keyAction(key, shifted);
    if (action.kind === 'shift') {
      setShifted(!shifted);
      return;
    }
    // The capitals hold for one key, as a shift pressed once does on a phone.
    setShifted(false);
    if (action.kind === 'apply') {
      onApply();
    } else if (action.kind === 'insert') {
      field.insert(action.latex, {
        focus: byPointer,
        feedback: false,
        scrollIntoView: true,
        mode: 'math',
        format: 'latex',
      });
    } else {
      field.executeCommand(action.command);
      if (byPointer) field.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const command = commandForKey(event, isMac());
    if (command !== 'undo' && command !== 'redo') return;
    // The formula's undo, as in the field: the keys write there, not in the project.
    event.preventDefault();
    field.executeCommand(command);
  };

  const onKeysKeyDown = (event: KeyboardEvent) => {
    const move = moveOfKey(event.key);
    if (!move || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const next = neighbourKey(tab, stop ?? '', move);
    setRover(next);
    buttons.current.get(next)?.focus();
  };

  const keysOf = (shown: KeypadTab) => (
    <div
      className="keypad-keys"
      role="group"
      aria-label={`${shown.label} keys`}
      style={{ ['--keypad-columns' as string]: keypadColumns(shown) }}
      onKeyDown={onKeysKeyDown}
    >
      {shown.rows.flat().map((key) => {
        const face = shownFace(key, shifted);
        const lines = faceLines(face);
        const name = shifted && key.shifted !== undefined ? key.shifted : key.name;
        return (
          <button
            key={key.id}
            ref={(el) => {
              if (el) buttons.current.set(key.id, el);
              else buttons.current.delete(key.id);
            }}
            type="button"
            className={`keypad-key keypad-tone-${key.tone}`}
            style={keyWidth(key) > 1 ? { gridColumn: `span ${keyWidth(key)}` } : undefined}
            data-testid={`keypad-key-${key.id}`}
            data-lines={lines > 1 ? lines : undefined}
            aria-label={name}
            aria-pressed={key.command === 'shift' ? shifted : undefined}
            title={key.name !== key.insert ? key.name : undefined}
            tabIndex={key.id === stop ? 0 : -1}
            onFocus={() => setRover(key.id)}
            // A press from the physical keyboard is a click that no pointer made.
            onClick={(event) => press(key, event.detail !== 0)}
          >
            <Face face={face} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="formula-keypad"
      data-testid="formula-keypad"
      onMouseDown={keepFocus}
      onKeyDown={onKeyDown}
    >
      <Tabs
        tabs={KEYPAD_TABS.map((t) => ({
          id: t.id,
          label: t.label,
          // The keys of the shown tab only: a key is on the page once.
          content: t.id === tab.id ? keysOf(t) : null,
        }))}
        active={tab.id}
        onChange={changeTab}
        label="Formula keypad"
        testId="keypad"
      />
    </div>
  );
}
