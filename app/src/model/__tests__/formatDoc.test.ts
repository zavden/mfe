// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION } from '../defaults';

/* docs/FORMAT.md names the manifest version in four places; a bump changes all four (the
 * mfe-change skill, "A format bump"). */
const doc = readFileSync(new URL('../../../../docs/FORMAT.md', import.meta.url), 'utf8');

describe('docs/FORMAT.md', () => {
  it('gives the version the app writes, wherever it names it', () => {
    const v = String(FORMAT_VERSION);
    expect(doc.split('\n')[0]).toBe(`# Project file format (manifest version ${v})`);
    expect(doc).toContain(`| \`version\` | \`${v}\` | Manifest version (see *Versioning*). |`);
    expect(doc.replace(/\s+/g, ' ')).toContain(
      `with manifest version ${v} and no \`textGeometry\``,
    );
    const versioning = doc.slice(doc.indexOf('## Versioning'));
    const rows = versioning.split('\n').filter((line) => /^\| \d+ \|/.test(line));
    expect(rows.at(-1)).toMatch(new RegExp(`^\\| ${v} \\|`));
  });
});
