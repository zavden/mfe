/* The first line of a generated scene has the project's name, and Python reads the first two
 * lines of a file for the declaration of its encoding (PEP 263: `coding:` or `coding=` and a name,
 * anywhere in a comment). A real Python compiles the scene of a project whose name has the words
 * of such a declaration; the same file with the name written as any other comment, it refuses. */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { pythonCommand } from '../../../../build/python';
import { createEmptyProject, type Target } from '../../../model';
import { generatePython } from '..';
import { pyComment } from '../python';

/** Compiles the file given on the standard input, as bytes: the way Python reads a file. */
const COMPILE = "import sys\ncompile(sys.stdin.buffer.read(), 'scene.py', 'exec')\n";

function compile(code: string): { status: number | null; stderr: string } {
  const result = spawnSync(pythonCommand(), ['-c', COMPILE], {
    input: Buffer.from(code, 'utf8'),
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: result.status, stderr: result.stderr.trim() };
}

function sceneOf(name: string, target: Target): string {
  const project = createEmptyProject(name);
  project.meta.target = target;
  return generatePython(project, new Map(), {
    target,
    sceneName: 'Demo',
    indexing: 'auto',
    comments: true,
  }).code;
}

describe('the first line of a generated scene, read by Python', () => {
  it.each(['Huffman coding: an example', 'Decoding=ascii', 'Source coding:ascii'])(
    'declares no encoding for a project called «%s»',
    (name) => {
      for (const target of ['ce', 'gl'] as const) {
        const code = sceneOf(name, target);
        expect(compile(code)).toEqual({ status: 0, stderr: '' });
        // The control: with the name written as it is, this Python takes it for a declaration.
        const lines = code.split('\n');
        lines[0] = pyComment(`${name} — exported by Manim Formula Editor.`);
        const refused = compile(lines.join('\n'));
        expect(refused.status).not.toBe(0);
        expect(refused.stderr).toMatch(/encoding|codec/);
      }
    },
  );
});
