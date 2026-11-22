/* Help → Keyboard shortcuts… (also the "?" key): the shortcuts by group, then the click gestures.
 * The keys are drawn as key caps (keyCaps.ts); screen readers get the keys as the sheet writes
 * them, once, and the caps are hidden from them. On a Mac the sheet shows the keys that system
 * has (`sheetRow`) and writes them as its menus do, in the caps and in the words (`macLines`,
 * `keysText`); a screen reader gets them by their names there (`keysSpoken`). */
import { Fragment } from 'react';
import { isMac, keysSpoken, keysText } from '../platform';
import { Modal } from '../project/Modal';
import { macLines, parseKeys, plusBefore, type KeyCombo, type KeyLine } from './keyCaps';
import { CLICK_GESTURES, SHORTCUT_GROUPS, sheetRow } from './shortcutSheet';
import './help.css';

/** One key cap; arrows and other symbols get a larger glyph so they read at cap size. */
function Cap({ text }: { text: string }) {
  return <kbd className={/^[^\w]+$/.test(text) ? 'help-symbol' : undefined}>{text}</kbd>;
}

function Combo({ combo }: { combo: KeyCombo }) {
  return (
    <span className="help-combo">
      {combo.parts.map((part, i) => (
        <Fragment key={i}>
          {plusBefore(combo, i) && <span className="help-plus">+</span>}
          {part.kind === 'key' ? (
            <Cap text={part.text} />
          ) : (
            <span className="help-gesture">{part.text}</span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

function Line({ line }: { line: KeyLine }) {
  return (
    <span className="help-keyline">
      {line.combos.map(({ separator, combo }, i) => (
        <Fragment key={i}>
          {separator && (
            <span className={separator === ',' ? 'help-sep help-sep-comma' : 'help-sep'}>
              {separator}
            </span>
          )}
          <Combo combo={combo} />
        </Fragment>
      ))}
      {line.note && (
        <span className="help-note">
          (
          {line.note.key && (
            <>
              <Cap text={line.note.key} />:{' '}
            </>
          )}
          {line.note.text})
        </span>
      )}
    </span>
  );
}

/** The clicks sentence, with the modifier keys it names as caps (the text stays the same). */
function withCaps(text: string) {
  return text
    .split(/(Shift|Ctrl\/⌘|⇧|⌘)(?=[+ ])/)
    .map((piece, i) => (i % 2 === 1 ? <kbd key={i}>{piece}</kbd> : piece));
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const mac = isMac();
  /** The lines of a row's keys, as the system writes them. */
  const lines = (keys: string) => (mac ? macLines(parseKeys(keys)) : parseKeys(keys));
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} testId="shortcuts-dialog" width="900px">
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className="help-group">
          <table className="help-shortcuts" data-testid="shortcuts-group">
            <caption>{group.title}</caption>
            <colgroup>
              <col className="help-col-keys" />
              <col />
              <col className="help-col-where" />
            </colgroup>
            <thead className="help-sr">
              <tr>
                <th scope="col">Keys</th>
                <th scope="col">What</th>
                <th scope="col">Where</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const { keys, where, what } = sheetRow(row, mac);
                return (
                  <tr key={row.keys}>
                    <th scope="row" className="help-keys">
                      <span className="help-sr">{keysSpoken(keys, mac)}</span>
                      <span className="help-caps" aria-hidden="true">
                        {lines(keys).map((line, i) => (
                          <Line key={i} line={line} />
                        ))}
                      </span>
                    </th>
                    <td className="help-what">{keysText(what, mac)}</td>
                    <td className="help-where">
                      <span className="help-where-label">{keysText(where, mac)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <section className="help-clicks" data-testid="shortcuts-clicks" aria-label="Clicks">
        <h3>Clicks</h3>
        <p>{withCaps(keysText(CLICK_GESTURES, mac))}</p>
      </section>
    </Modal>
  );
}
