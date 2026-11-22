// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pythonCommand } from '../../../build/python';
import {
  createCompanionClient,
  createEngine,
  type CompanionTexResponse,
  type Engine,
} from '../../engine';
import { fakeCompanion, HEALTH } from '../../engine/__tests__/fakeCompanion';
import { createEmptyProject, createTexFormula, parseProject, serializeProject } from '../../model';
import { history, loadProject, useProjectStore } from '../projectStore';
import { startRenderSync, useSyncWarnings } from '../renderSync';
import { useRenderStore } from '../renderStore';

const companion = path.resolve('../companion/mfe_companion.py');
let engine: Engine | undefined;
let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
  engine?.dispose();
  engine = undefined;
});

describe('actual CE/GL paragraph reflow', () => {
  it.each(['ce', 'gl'] as const)(
    'preserves every labeled occurrence in exact %s output and history',
    async (target) => {
      const fake = fakeCompanion((request) => {
        const result = spawnSync(
          pythonCommand(),
          [
            companion,
            'compile',
            '--target',
            request.target,
            '--mode',
            request.mode ?? 'math',
            '--latex',
            request.latex,
            '--preamble',
            request.preamble,
            ...(request.packages.length ? ['--packages', request.packages.join(',')] : []),
            '--no-disk-cache',
            '--no-sandbox',
          ],
          { encoding: 'utf8', timeout: 30_000, maxBuffer: 34 * 1024 * 1024 },
        );
        if (result.error) throw result.error;
        if (!result.stdout.trim()) throw new Error(`Companion compile failed: ${result.stderr}`);
        return JSON.parse(result.stdout) as CompanionTexResponse;
      });
      fake.health = {
        ...HEALTH,
        version: '1.3.0',
        capabilities: { ...HEALTH.capabilities, textMode: true },
      };
      engine = createEngine({
        companion: createCompanionClient({ fetch: fake.fetch, autoStart: false }),
      });
      const value = createEmptyProject();
      value.meta.target = target;
      const item = createTexFormula({
        source: 'alpha beta gamma delta',
        layout: { width: null, align: 'left', lineSpacing: 1 },
      });
      value.formulas.push(item);
      loadProject(value);
      useRenderStore.getState().retain([]);
      useRenderStore.getState().setPrefer('latex');
      useSyncWarnings.getState().clear();
      stop = startRenderSync(engine);
      const current = () => useProjectStore.getState().project.formulas[0]!;
      const settled = () =>
        vi.waitFor(() => expect(useRenderStore.getState().entries[item.id]?.status).toBe('ok'), {
          timeout: 30_000,
        });
      await settled();
      const labels = current().snapshot!.glyphs.map((glyph) => glyph.label);
      expect(labels.join('')).toBe('alphabetagammadelta');
      expect(current().snapshot!.backend).toBe('latex');
      const colors = Object.fromEntries(
        labels.map((_, index) => [
          String(index),
          `#${(0x200000 + index).toString(16).toUpperCase()}`,
        ]),
      );
      useProjectStore.getState().update((draft) => {
        draft.formulas[0]!.glyphColors = colors;
      });
      for (const [width, fontSize] of [
        [2, 48],
        [3.2, 48],
        [null, 48],
        [2, 60],
      ] as const) {
        const before = current().snapshot!.key;
        useProjectStore.getState().update((draft) => {
          const text = draft.formulas[0]!;
          if (text.kind === 'tex') text.layout.width = width;
          text.fontSize = fontSize;
        });
        await settled();
        expect(current().snapshot!.glyphs.map((glyph) => glyph.label)).toEqual(labels);
        expect(current().glyphColors).toEqual(colors);
        expect(useRenderStore.getState().transitions[item.id]!.map).toEqual(
          labels.map((_, index) => index),
        );
        expect(useSyncWarnings.getState().warnings[item.id]).toBeUndefined();
        history.undo();
        await settled();
        expect(current().snapshot!.key).toBe(before);
        expect(current().glyphColors).toEqual(colors);
        history.redo();
        await settled();
        expect(current().glyphColors).toEqual(colors);
      }
      const reopened = parseProject(serializeProject(useProjectStore.getState().project));
      expect(reopened.ok).toBe(true);
      if (reopened.ok) expect(reopened.project.formulas[0]!.glyphColors).toEqual(colors);
    },
    60_000,
  );
});
