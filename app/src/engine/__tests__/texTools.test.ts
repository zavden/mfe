// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { truncateSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { latexToSvg } from './texTools';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

const SVG = "<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'><path/></svg>";

function converter(
  options: { missing?: boolean; stale?: boolean; oversize?: boolean; failed?: boolean } = {},
) {
  vi.mocked(spawnSync).mockImplementation((command, _args, settings) => {
    const output = path.join(String(settings?.cwd), 'f.svg');
    if (command === 'latex' && options.stale) writeFileSync(output, SVG);
    if (command === 'dvisvgm' && !options.missing) {
      writeFileSync(output, SVG);
      if (options.oversize) truncateSync(output, 32 * 1024 * 1024 + 1);
    }
    return {
      pid: 1,
      output: [],
      status: command === 'dvisvgm' && options.failed ? 1 : 0,
      signal: null,
      stdout: 'The old PDF interpreter has been removed.\n' + SVG,
      stderr: 'conversion diagnostic',
    };
  });
}

afterEach(() => vi.resetAllMocks());

describe('test compiler SVG artifacts', () => {
  it('returns the SVG artifact without converter stdout diagnostics', () => {
    converter();
    expect(latexToSvg('x', 'ce')).toBe(SVG);
  });

  it('rejects success without a fresh SVG artifact', () => {
    converter({ missing: true });
    expect(() => latexToSvg('x', 'ce')).toThrow(/SVG/i);
  });

  it('removes any SVG left by the LaTeX step before converting', () => {
    converter({ missing: true, stale: true });
    expect(() => latexToSvg('x', 'gl')).toThrow(/SVG/i);
  });

  it('rejects an oversized artifact before reading it', () => {
    converter({ oversize: true });
    expect(() => latexToSvg('x', 'ce')).toThrow(/too large/i);
  });

  it('reports converter failure even if an artifact was written', () => {
    converter({ failed: true });
    expect(() => latexToSvg('x', 'ce')).toThrow(/conversion diagnostic/);
  });
});
