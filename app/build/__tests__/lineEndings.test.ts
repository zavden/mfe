// @vitest-environment node
/* Git for Windows comes with `core.autocrlf=true`: left to itself it checks every text file out
 * with CRLF line ends. The checks of this repo read files from disk and compare them byte by
 * byte with what the code makes, or with a recorded size and hash: with CRLF the pinned Chroma
 * Lab copy no longer matches its manifest and the Vite config throws before anything starts
 * (the dev server, the build, both test suites), Prettier refuses every file and the shell
 * scripts do not run in Git Bash. `.gitattributes` says what a checkout holds, on any system:
 * LF for every text file, and the verbatim copies untouched. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

/** The rules of `.gitattributes`: pattern → attributes, comments and empty lines left out. */
function rules(): Map<string, string> {
  const lines = readFileSync(join(REPO, '.gitattributes'), 'utf8').split('\n');
  const found = new Map<string, string>();
  for (const line of lines) {
    const rule = /^([^#\s]\S*)\s+(.+?)\s*$/.exec(line);
    if (rule) found.set(rule[1] ?? '', rule[2] ?? '');
  }
  return found;
}

interface Tracked {
  path: string;
  /** What the repository holds: `lf`, `crlf`, `mixed`, `none` (no line end at all), `-text`. */
  index: string;
  /** The attributes that decide the conversion: `text=auto eol=lf`, `-text`, or nothing. */
  attributes: string;
}

/** Every tracked file as `git ls-files --eol` tells it (`i/lf  w/lf  attr/…  <tab>path`), or
 * null where the tree is not a checkout (an archive of the sources) or Git is missing. */
function tracked(): Tracked[] | null {
  let output: string;
  try {
    output = execFileSync('git', ['-C', REPO, 'ls-files', '--eol', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  return output
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const [info = '', path = ''] = record.split('\t');
      const parsed = /^i\/(\S*)\s+w\/\S*\s+attr\/(.*?)\s*$/.exec(info);
      return { path, index: parsed?.[1] ?? '', attributes: parsed?.[2] ?? '' };
    });
}

describe('line ends of a checkout', () => {
  it('text is LF on any system, and the verbatim copies are left as they are', () => {
    const written = rules();
    expect(written.get('*')).toBe('text=auto eol=lf');
    expect(written.get('app/src/data/**')).toBe('-text');
  });

  const files = tracked();

  it.skipIf(files === null)('every tracked file falls under one of the two rules', () => {
    const others = (files ?? []).filter(
      (file) => file.attributes !== 'text=auto eol=lf' && file.attributes !== '-text',
    );
    expect(others).toEqual([]);
  });

  it.skipIf(files === null)('nothing converts the copies of app/src/data', () => {
    const copies = (files ?? []).filter((file) => file.path.startsWith('app/src/data/'));
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.filter((file) => file.attributes !== '-text')).toEqual([]);
  });

  // A file committed with CRLF would be rewritten by the first checkout that normalizes it,
  // and a verbatim copy with CRLF inside would be one that its source never had.
  it.skipIf(files === null)('the repository itself holds no CRLF', () => {
    const carriage = (files ?? []).filter(
      (file) => file.index === 'crlf' || file.index === 'mixed',
    );
    expect(carriage).toEqual([]);
  });
});
