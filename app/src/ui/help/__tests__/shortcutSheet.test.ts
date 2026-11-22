// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keysText } from '../../platform';
import { CLICK_GESTURES, SHORTCUT_GROUPS, SHORTCUT_ROWS, sheetRow } from '../shortcutSheet';

const readme = readFileSync(new URL('../../../../../README.md', import.meta.url), 'utf8');

/** The rows of the first table after `heading` in the README, without its header: the cells of
 * each. */
function tableAfter(heading: string): string[][] {
  const lines = readme.slice(readme.indexOf(heading)).split('\n');
  const start = lines.findIndex((line) => line.startsWith('|'));
  const end = lines.findIndex((line, i) => i > start && !line.startsWith('|'));
  return lines
    .slice(start + 2, end) // without the header and the separator
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

/** The rows of the README's "Keyboard shortcuts" table. */
function readmeRows(): { keys: string; where: string; what: string }[] {
  return tableAfter('### Keyboard shortcuts').map(([keys = '', where = '', what = '']) => ({
    keys,
    where,
    what,
  }));
}

describe('shortcut sheet', () => {
  it('lists the same rows as the README table, in the same order', () => {
    expect(readmeRows()).toEqual(SHORTCUT_ROWS.map((row) => sheetRow(row, false)));
  });

  it('matches the README paragraph about clicks', () => {
    expect(readme.replace(/\s+/g, ' ')).toContain(`Clicks: ${CLICK_GESTURES}`);
  });

  it('has no empty group and no repeated keys', () => {
    expect(SHORTCUT_GROUPS.every((g) => g.rows.length > 0)).toBe(true);
    const keys = SHORTCUT_ROWS.map((r) => r.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the sheet on a Mac', () => {
  it('has the row of every other system where a Mac has nothing of its own', () => {
    const all = SHORTCUT_ROWS.find((row) => row.keys === 'Ctrl/⌘+A')!;
    expect(all.mac).toBeUndefined();
    expect(sheetRow(all, true)).toEqual(sheetRow(all, false));
  });

  it('has what a Mac has in the place of a row, and the rest of the row', () => {
    const redo = SHORTCUT_ROWS.find((row) => row.keys.includes('Ctrl+Y'))!;
    expect(sheetRow(redo, false)).toEqual({
      keys: 'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y',
      where: 'anywhere but text fields',
      what: 'Undo; redo (Ctrl+Y on Windows and Linux only; also in immediate-edit dialogs); cancel an active gesture first',
    });
    // ⌘Y is not redo there, and no word of the row says it is.
    expect(sheetRow(redo, true)).toEqual({
      keys: 'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z',
      where: 'anywhere but text fields',
      what: 'Undo; redo (also in immediate-edit dialogs); cancel an active gesture first',
    });
  });

  it('names no key a Mac’s keyboard lacks, nor a key of the other systems alone', () => {
    for (const row of SHORTCUT_ROWS) {
      const { keys, what } = sheetRow(row, true);
      expect(keys).not.toMatch(/\bMenu\b/);
      expect(`${keys} ${what}`).not.toMatch(/Windows|Linux/);
    }
  });

  it('is listed in the README, under "On macOS": each row whose keys are others there', () => {
    const section = readme.slice(readme.indexOf('### On macOS'));
    const intro = 'are others on a Mac';
    expect(section).toContain(intro);
    // The keys of every system as the table above writes them, then as the sheet shows them on a
    // Mac; what comes after is a note.
    expect(tableAfter(intro).map(([elsewhere = '', onMac = '']) => [elsewhere, onMac])).toEqual(
      SHORTCUT_ROWS.filter((row) => row.mac?.keys !== undefined).map((row) => [
        row.keys,
        keysText(row.mac!.keys!, true),
      ]),
    );
  });
});
