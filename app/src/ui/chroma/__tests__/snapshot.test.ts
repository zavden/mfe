// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import snapshot from '../snapshot.json';

const directory = new URL('../../../data/chroma-lab/', import.meta.url);

describe('verbatim Chroma Lab snapshot', () => {
  it('contains exactly the pinned functional distribution and both dependency notices', () => {
    const actual = readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      // The manifest names its files with `/`, on Windows too.
      .map((entry) =>
        relative(fileURLToPath(directory), join(entry.parentPath, entry.name)).replaceAll(
          '\\',
          '/',
        ),
      )
      .sort();
    expect(actual).toEqual(snapshot.files.map((entry) => entry.path).sort());
    expect(actual).toContain('vendor/COLORJS-LICENSE');
    expect(actual).toContain('vendor/COLOUR-LICENSE');
    expect(snapshot.files.reduce((bytes, entry) => bytes + entry.bytes, 0)).toBe(
      snapshot.distributionBytes,
    );
    for (const entry of snapshot.files) {
      const bytes = readFileSync(new URL(entry.path, directory));
      expect(bytes.length, entry.path).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), entry.path).toBe(entry.sha256);
    }
  });

  // These files travel in every build as they are: a path of the machine they were written on —
  // a home folder, which names its owner — has no place in them (its documents once had one).
  it('carries no path of somebody’s home folder', () => {
    const home = /\/(?:home|Users)\/[A-Za-z][\w.-]*\/|[A-Za-z]:\\Users\\/;
    expect('run /home/alex/.venv/bin/manim').toMatch(home);
    expect('open C:\\Users\\Alex\\file').toMatch(home);
    expect('see /home/ and the Users of an app').not.toMatch(home);
    for (const entry of snapshot.files) {
      if (!/\.(?:md|html|css|js)$/.test(entry.path) && entry.path.includes('.')) continue;
      const text = readFileSync(new URL(entry.path, directory), 'utf8');
      expect(home.exec(text)?.[0], entry.path).toBeUndefined();
    }
  });
});
