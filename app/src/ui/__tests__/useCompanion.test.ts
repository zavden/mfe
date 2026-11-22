// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanionHealth } from '../../engine';
import { companionTooltip } from '../useCompanion';

const URL = 'http://127.0.0.1:7799';
const health = (latex: boolean): CompanionHealth => ({
  name: 'mfe-companion',
  version: '1.1.0',
  protocol: 1,
  capabilities: { latex, dvisvgm: true, ffmpeg: true, manimCE: null, manimGL: null },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('companionTooltip', () => {
  it('lists the tools and versions of a running companion', () => {
    expect(companionTooltip({ status: 'online', health: health(true) }, URL)).toBe(
      `Companion 1.1.0 at ${URL}\nTools: latex, dvisvgm, ffmpeg\nManim: none`,
    );
  });

  it('says how to start the companion when it is not running', () => {
    // The command names the Python of the system the page runs on, and Node has a `navigator`
    // too, with the platform of the machine the test runs on: the test states the one it means.
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    expect(companionTooltip({ status: 'offline' }, URL)).toBe(
      `No companion at ${URL}. Start it for exact LaTeX rendering: ` +
        'python3 companion/mfe_companion.py serve',
    );
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(companionTooltip({ status: 'offline' }, URL)).toBe(
      `No companion at ${URL}. Start it for exact LaTeX rendering: ` +
        'python companion/mfe_companion.py serve',
    );
  });

  it('says that formulas use MathJax when the companion has no LaTeX', () => {
    expect(companionTooltip({ status: 'online', health: health(false) }, URL)).toBe(
      `Companion 1.1.0 at ${URL}\nTools: dvisvgm, ffmpeg\nManim: none\n` +
        'LaTeX is not installed where the companion runs: formulas use MathJax.',
    );
  });
});
