// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { issueIdentityNotWorse } from '../diagnostics';
import type { Issue } from '../validate';

const baseline: Issue = {
  severity: 'error',
  code: 'target-conflict',
  path: ['relations', 2, 'pairs', 0, 'to'],
  message: 'Two owners bring these glyphs.',
  identity: {
    subject: { kind: 'relation', relationId: 'relation-a' },
    participants: ['relation:relation-a', 'relation:relation-b'],
    glyphs: [
      { clipId: 'target', index: 0 },
      { clipId: 'target', index: 1 },
    ],
  },
};

describe('issueIdentityNotWorse', () => {
  it('ignores presentation changes and allows a smaller affected glyph set', () => {
    const next = {
      ...baseline,
      path: ['relations', 0, 'pairs', 3, 'to'],
      message: 'Renamed owners at a different time.',
      identity: { ...baseline.identity!, glyphs: [{ clipId: 'target', index: 1 }] },
    };
    expect(issueIdentityNotWorse(next, baseline)).toBe(true);
    expect(issueIdentityNotWorse(baseline, next)).toBe(false);
  });

  it('allows removing an owner and rejects a third owner, including repeated transfer pairs', () => {
    const smaller = {
      ...baseline,
      identity: { ...baseline.identity!, participants: ['relation:relation-a'] },
    };
    const larger = {
      ...baseline,
      identity: {
        ...baseline.identity!,
        participants: [...baseline.identity!.participants, 'relation:relation-b'],
      },
    };
    expect(issueIdentityNotWorse(smaller, baseline)).toBe(true);
    expect(issueIdentityNotWorse(larger, baseline)).toBe(false);
    expect(issueIdentityNotWorse(baseline, larger)).toBe(true);
  });

  it('requires the same owner and code and never permits severity escalation', () => {
    expect(issueIdentityNotWorse({ ...baseline, code: 'source-arriving' }, baseline)).toBe(false);
    expect(
      issueIdentityNotWorse(
        {
          ...baseline,
          identity: {
            ...baseline.identity!,
            subject: { kind: 'relation', relationId: 'relation-c' },
          },
        },
        baseline,
      ),
    ).toBe(false);
    const warning: Issue = { ...baseline, severity: 'warning' };
    expect(issueIdentityNotWorse(warning, baseline)).toBe(true);
    expect(issueIdentityNotWorse(baseline, warning)).toBe(false);
    expect(issueIdentityNotWorse({ ...baseline, identity: undefined }, baseline)).toBe(false);
  });
});
