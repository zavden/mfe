/* A colour input: native picker plus a hex field. Commits (calls `onCommit`) when the picker
 * closes or the hex text is accepted, never on every drag step, so each edit is one undo step. */
import { useEffect, useRef, useState } from 'react';
import { normalizeColor } from './colors';
import { ownEscape } from './modalStack';
import { PaletteRoleButton } from '../colors/PaletteRoleChoices';

interface HexColorFieldProps {
  value: string;
  onCommit: (color: string) => void;
  label: string;
  testId?: string;
  disabled?: boolean;
  /** Offer the active palette's roles beside the field (the default). The palette editor turns
   * it off: there the field is a role of a palette, which may not be the active one. */
  roles?: boolean;
}

export function HexColorField({
  value,
  onCommit,
  label,
  testId,
  disabled,
  roles = true,
}: HexColorFieldProps) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const pickerRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });

  // The native picker fires `input` while dragging and `change` when it closes.
  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    const onChange = () => {
      const color = normalizeColor(picker.value);
      if (color) commitRef.current(color);
    };
    picker.addEventListener('change', onChange);
    return () => picker.removeEventListener('change', onChange);
  }, []);

  const commitText = () => {
    const color = normalizeColor(draft);
    if (color) {
      setDraft(color);
      if (color !== value) onCommit(color);
    } else {
      setDraft(value);
    }
  };

  return (
    <span className="color-field">
      <input
        ref={pickerRef}
        type="color"
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        value={normalizeColor(draft)?.toLowerCase() ?? value.toLowerCase()}
        onChange={(event) => setDraft(event.target.value.toUpperCase())}
      />
      <input
        type="text"
        className="color-hex"
        aria-label={`${label} (hex)`}
        data-testid={testId ? `${testId}-hex` : undefined}
        spellCheck={false}
        maxLength={7}
        disabled={disabled}
        value={draft}
        {...ownEscape(draft !== value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitText}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitText();
          else if (event.key === 'Escape') setDraft(value);
        }}
      />
      {roles && (
        <PaletteRoleButton
          testIdPrefix={testId ?? 'hex-color'}
          disabled={disabled}
          onPick={(color) => {
            setDraft(color);
            if (color.toUpperCase() !== value.toUpperCase()) onCommit(color);
          }}
        />
      )}
    </span>
  );
}
