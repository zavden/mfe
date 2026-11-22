/* Test-only stand-in for the companion: compiles a formula with the same TeX documents
 * (docs/COMPANION.md, "TeX documents") through `latex` + `dvisvgm --no-fonts`. Used to
 * regenerate fixtures and by the required native integration project. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GL_PREAMBLE = String.raw`\usepackage[english]{babel}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{dsfont}
\usepackage{setspace}
\usepackage{tipa}
\usepackage{relsize}
\usepackage{textcomp}
\usepackage{mathrsfs}
\usepackage{calligra}
\usepackage{wasysym}
\usepackage{ragged2e}
\usepackage{physics}
\usepackage{xcolor}
\usepackage{microtype}
\usepackage{pifont}
\DisableLigatures{encoding = *, family = * }
\linespread{1}
%% Borrowed from https://tex.stackexchange.com/questions/6058/making-a-shorter-minus
\DeclareMathSymbol{\minus}{\mathbin}{AMSa}{"39}`;

export function texDocument(latex: string, target: 'ce' | 'gl', packages: string[] = []): string {
  const uses = packages.map((p) => `\\usepackage{${p}}`).join('\n');
  if (target === 'ce') {
    return [
      '\\documentclass[preview]{standalone}',
      '\\usepackage[english]{babel}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      ...(uses ? [uses] : []),
      '\\begin{document}',
      '\\begin{align*}',
      `\\special{dvisvgm:raw <g id='unique000'>}${latex}\\special{dvisvgm:raw </g>}`,
      '\\end{align*}',
      '\\end{document}',
      '',
    ].join('\n');
  }
  return [
    '\\documentclass[preview]{standalone}',
    [GL_PREAMBLE, uses].filter(Boolean).join('\n'),
    '\\begin{document}',
    `\\centering\n\\begin{align*}\n${latex}\n\\end{align*}`,
    '\\end{document}',
  ].join('\n\n');
}

/** Compile to dvisvgm SVG; throws with the log tail on LaTeX errors. */
export function latexToSvg(latex: string, target: 'ce' | 'gl', packages: string[] = []): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mfe-tex-'));
  try {
    writeFileSync(path.join(dir, 'f.tex'), texDocument(latex, target, packages));
    const run = spawnSync(
      'latex',
      ['-interaction=batchmode', '-halt-on-error', '-no-shell-escape', 'f.tex'],
      { cwd: dir, encoding: 'utf8', timeout: 30_000 },
    );
    if (run.status !== 0) {
      let log = '';
      try {
        log = readFileSync(path.join(dir, 'f.log'), 'utf8');
      } catch {
        // no log
      }
      throw new Error(`latex failed:\n${log.split('\n').slice(-20).join('\n')}`);
    }
    const svgPath = path.join(dir, 'f.svg');
    rmSync(svgPath, { force: true });
    const converted = spawnSync(
      'dvisvgm',
      ['--no-fonts', '--verbosity=0', '--output=f.svg', 'f.dvi'],
      { cwd: dir, encoding: 'utf8', timeout: 30_000 },
    );
    if (converted.status !== 0) throw new Error(`dvisvgm failed: ${converted.stderr}`);
    try {
      if (statSync(svgPath).size > 32 * 1024 * 1024) {
        throw new Error('The SVG produced is too large.');
      }
      const svg = readFileSync(svgPath, 'utf8');
      if (!svg.includes('<svg')) throw new Error('The output is not SVG.');
      return svg;
    } catch (error) {
      throw new Error(`dvisvgm SVG output failed: ${String(error)}`, { cause: error });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
