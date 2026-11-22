/* A colour typed as hexadecimal, under the swatches of a context menu's colours
 * (`ColourSwatches.tsx`): a field for `#RRGGBB` — or `#RGB`, with or without the `#` —, a sample
 * of what is typed, and Apply; Enter in the field applies too. The caller applies the colour and
 * closes its menu. The field is one of the menu's stops (↑/↓ reach it, `data-ctx-field`), and
 * keeps the keys a text field uses: ←/→, Home and End move in the text. Test ids:
 * `<testIdPrefix>-hex` and `<testIdPrefix>-hex-apply`. */
import { useId, useState } from 'react';
import { parseHexColour } from './hexColour';

/** The keys that move in the text: the menu around must not take them. */
const TEXT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function HexColourField({
  testIdPrefix,
  onPick,
}: {
  testIdPrefix: string;
  onPick(hex: string): void;
}) {
  const [text, setText] = useState('');
  const id = useId();
  const color = parseHexColour(text);
  const wrong = text.trim() !== '' && color === null;
  return (
    <div className="ctx-hex">
      <label className="ctx-hex-label" htmlFor={id}>
        Hex
      </label>
      <span
        className="ctx-hex-sample"
        style={color ? { background: color } : undefined}
        data-testid={`${testIdPrefix}-hex-sample`}
        aria-hidden="true"
      />
      <input
        id={id}
        className="ctx-hex-input"
        type="text"
        value={text}
        placeholder="#RRGGBB"
        maxLength={9}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        aria-invalid={wrong}
        data-ctx-field=""
        data-testid={`${testIdPrefix}-hex`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (color) onPick(color);
          } else if (TEXT_KEYS.has(event.key)) {
            // Not the submenu's ← (which would close it): the caret's.
            event.stopPropagation();
          }
        }}
      />
      <button
        type="button"
        role="menuitem"
        className="ctx-hex-apply"
        disabled={color === null}
        title={color ? `Use ${color}` : 'Type a colour as #RRGGBB'}
        data-testid={`${testIdPrefix}-hex-apply`}
        onClick={() => {
          if (color) onPick(color);
        }}
      >
        Apply
      </button>
    </div>
  );
}
