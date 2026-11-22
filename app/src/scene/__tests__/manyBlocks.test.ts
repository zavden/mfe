// @vitest-environment node
/* Performance with many animation blocks: a 40-glyph formula on a 52 s clip with 400 blocks (four
 * independent "voices" of ten glyphs each, every half second a disappear, an appear or a part
 * transform), and five more such clips. The budgets are generous (several times what a laptop
 * takes) — they catch an accidental quadratic, not a few percent. */
import { describe, expect, it } from 'vitest';
import { generatePython } from '../../export';
import {
  clipLifetimes,
  createAppear,
  createDisappear,
  createPartTransform,
  hasErrors,
  validateProject,
  type ClipAction,
} from '../../model';
import { blockLimits, clampTiming } from '../../ui/animations/blockRange';
import { tracksLayout } from '../../ui/timeline/trackLayout';
import { buildEvents, createEvaluator } from '../index';
import { plainClip, sceneWith } from './sceneKit';

const GLYPHS = 40;
const VOICES = 4;
const STEPS = 100;

/** Voice v animates glyphs 10v … 10v + 9; step k runs over [0.5 + 0.5k, 0.9 + 0.5k). */
function blocks(): ClipAction[] {
  const out: ClipAction[] = [];
  for (let v = 0; v < VOICES; v++) {
    for (let k = 0; k < STEPS; k++) {
      const start = 0.5 + 0.5 * k;
      const base = 10 * v;
      // Steps 3m, 3m + 1 and 3m + 2: pair m takes leave, comes back, then one glyph turns.
      const m = Math.floor(k / 3) % 5;
      const pair = [base + 2 * m, base + 2 * m + 1];
      const fields = { duration: 0.4 };
      if (k % 3 === 0) out.push(createDisappear(start, 'fade_out', pair, fields));
      else if (k % 3 === 1) out.push(createAppear(start, 'write', pair, fields));
      else {
        out.push(
          createPartTransform(start, [base + (k % 10)], {
            ...fields,
            shift: [0.05, 0],
            rotation: 10,
          }),
        );
      }
    }
  }
  return out;
}

function time<T>(run: () => T): [T, number] {
  const t0 = performance.now();
  const value = run();
  return [value, performance.now() - t0];
}

describe('many animation blocks', () => {
  it('simulates, validates, evaluates, lays out and exports within budget', async () => {
    const latex = 'abcdefghijklmnopqrst'.repeat(2);
    const scene = await sceneWith({ f: latex });
    expect(scene.formulas.get(scene.f.f!.id)!.render.glyphs).toHaveLength(GLYPHS);
    for (let c = 0; c < 6; c++) {
      const clip = plainClip(scene, 'f', 0, c * 60, c * 60 + 52);
      clip.actions = blocks();
      clip.initial.position = [0, c - 2.5];
    }
    const { project, formulas } = scene;
    expect(project.clips.flatMap((c) => c.actions)).toHaveLength(6 * VOICES * STEPS);

    const [lifetimes, lifetimeMs] = time(() => clipLifetimes(project));
    expect(lifetimes.size).toBe(6);
    const [issues, validateMs] = time(() => validateProject(project));
    expect(hasErrors(issues)).toBe(false);
    expect(issues.filter((i) => i.code.startsWith('action-'))).toEqual([]);
    const [events, eventsMs] = time(() => buildEvents(project));
    expect(events.filter((e) => e.kind !== 'intro' && e.kind !== 'outro')).toHaveLength(
      6 * VOICES * STEPS,
    );

    const [evaluator, buildMs] = time(() => createEvaluator(project, formulas));
    // One frame every 0.1 s of the whole scene (3 520 frames).
    const [drawn, evaluateMs] = time(() => {
      let count = 0;
      for (let t = 0; t <= evaluator.duration; t += 0.1) count += evaluator.evaluate(t).length;
      return count;
    });
    expect(drawn).toBeGreaterThan(0);
    const frames = Math.floor(evaluator.duration / 0.1) + 1;

    // Dragging a block: its allowed range once per gesture, then a clamp per pointer move (which
    // may re-simulate the lifetime). A write in the middle of the first clip, dragged far right.
    const clip = project.clips[0]!;
    const block = clip.actions.find((a) => a.kind === 'appear' && a.start > 25)!;
    const [limits, limitsMs] = time(() => blockLimits(project, clip, block.id));
    const [, clampMs] = time(() => {
      for (let i = 1; i <= 20; i++) {
        const start = block.start + i * 0.05;
        clampTiming(
          project,
          clip,
          block.id,
          { start, end: start + block.duration },
          'move',
          limits,
        );
      }
    });

    const [layout, layoutMs] = time(() => tracksLayout(project));
    expect(layout.rows[0]!.lanes).toBe(VOICES);

    const [code, exportMs] = time(
      () =>
        generatePython(project, formulas, {
          target: 'ce',
          sceneName: 'Many',
          indexing: 'auto',
          comments: false,
        }).code,
    );
    expect(code).toContain('class Many(Scene):');

    const report = {
      lifetimeMs,
      validateMs,
      eventsMs,
      buildMs,
      perFrameMs: evaluateMs / frames,
      layoutMs,
      limitsMs,
      clampMs: clampMs / 20,
      exportMs,
    };
    expect(report.lifetimeMs, JSON.stringify(report)).toBeLessThan(500);
    expect(report.validateMs, JSON.stringify(report)).toBeLessThan(1500);
    expect(report.eventsMs, JSON.stringify(report)).toBeLessThan(500);
    expect(report.buildMs, JSON.stringify(report)).toBeLessThan(1500);
    // The preview draws a frame per animation frame: well under one 60 fps frame.
    expect(report.perFrameMs, JSON.stringify(report)).toBeLessThan(8);
    expect(report.layoutMs, JSON.stringify(report)).toBeLessThan(200);
    // A drag stays fluid: well under a frame per pointer move.
    expect(report.limitsMs, JSON.stringify(report)).toBeLessThan(200);
    expect(report.clampMs, JSON.stringify(report)).toBeLessThan(16);
    expect(report.exportMs, JSON.stringify(report)).toBeLessThan(5000);
  }, 60_000);
});
