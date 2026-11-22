// @vitest-environment node
/* A press of the interface asks `isMainClick` (`src/ui/pointer.ts`) whether it is the main
 * button's, and does not read `button === 0` itself. On a Mac a Ctrl+click is the secondary
 * click: the browser sends the press of the main button with Ctrl held, then the menu's event and
 * no click. A handler that read the button alone took that press for its own, and acted before
 * the menu opened: the playhead went to the pointer, a clip left the selection its menu was asked
 * for, Edit path got an anchor (seen on a Mac, where the app takes ⌘ and Ctrl+click is how a
 * trackpad with one button opens a menu). The page of an export (`src/deck/`) and the players of
 * the documentation (`src/embed/`) have none of the editor's modules and ask their own
 * `isMainPress` (`src/embed/press.ts`), for the same reason: a press on their time bars sought
 * under the menu. Read from the sources, so that it fails on any machine, not only on the one that
 * would trip. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/** The parts of the app whose presses are read: the interface, the page of an export, the players
 * of the documentation. */
const PARTS = ['ui', 'deck', 'embed'] as const;

/** A comparison of an event's button with the main one: `event.button !== 0`, `e.button === 0`. */
const MAIN_BUTTON = /\.button\s*[!=]==?\s*0\b/;

/** The reads that stay, by file (its path from `src/`, with `/`) and line, each with why. */
const KEPT: Readonly<Record<string, readonly string[]>> = {
  // The question itself, of the interface and of the pages without it.
  'ui/pointer.ts': ['return event.button === 0 && !(event.ctrlKey && isMac());'],
  'embed/press.ts': ['return event.button === 0 && !(event.ctrlKey && apple);'],
  // A release, not a press: the press before it asked, and Ctrl may be held by then.
  'ui/preview/LineLayer.tsx': ['if (!from || event.button !== 0) return;'],
  // A click, not a press: a Mac's click with Ctrl sends none.
  'deck/controls.ts': ['if (event.defaultPrevented || event.button !== 0) return;'],
};

/** The lines of `source` that read the main button themselves, as `line: text`; comments apart. */
function mainButtonReads(source: string, kept: readonly string[] = []): string[] {
  return source.split('\n').flatMap((line, index) => {
    const text = line.trim();
    if (/^(?:\/\/|\*|\/\*)/.test(text) || !MAIN_BUTTON.test(text) || kept.includes(text)) return [];
    return [`${index + 1}: ${text}`];
  });
}

/** The sources of a directory that are no test, by their path from `src/`. */
function sourcesOf(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourcesOf(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [relative(SRC, path).split('\\').join('/')];
  });
}

const sources = (): string[] => PARTS.flatMap((part) => sourcesOf(join(SRC, part)));

describe('the presses of the interface, of an exported page and of the players', () => {
  it('tells a read of the main button from what only looks like one', () => {
    expect(mainButtonReads('if (event.button !== 0) return;')).toHaveLength(1);
    expect(mainButtonReads('if (e.button === 0 && e.altKey) pan(e);')).toHaveLength(1);
    expect(mainButtonReads('if (event.button != 0 || !area) return;')).toHaveLength(1);
    expect(mainButtonReads('if (!isMainClick(event)) return;')).toEqual([]);
    expect(mainButtonReads('if (event.button === 1) onPan(event);')).toEqual([]);
    expect(mainButtonReads('if (event.buttons === 0) end();')).toEqual([]);
    expect(mainButtonReads('// a press with event.button === 0 is the main one')).toEqual([]);
    expect(mainButtonReads('if (a.button !== 0) return;', ['if (a.button !== 0) return;'])).toEqual(
      [],
    );
  });

  it('ask isMainClick or isMainPress, so that a Ctrl+click on a Mac presses nothing', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(200);
    for (const part of PARTS) {
      expect(files.filter((file) => file.startsWith(`${part}/`)).length).toBeGreaterThan(10);
    }
    const found = files.flatMap((file) =>
      mainButtonReads(readFileSync(join(SRC, file), 'utf8'), KEPT[file]).map(
        (line) => `${file}:${line}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('keeps no exception that is no longer there', () => {
    for (const [file, lines] of Object.entries(KEPT)) {
      const source = readFileSync(join(SRC, file), 'utf8')
        .split('\n')
        .map((line) => line.trim());
      for (const line of lines) expect(source, `${file}: ${line}`).toContain(line);
    }
  });
});
