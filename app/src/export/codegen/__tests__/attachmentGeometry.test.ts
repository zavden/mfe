// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  refreshLocalRenders,
  renderRequestFor,
  resolveFormula,
  toSnapshot,
  type ResolvedFormula,
} from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFitTween,
  createFormula,
  createPartTransform,
  createShapeAttach,
  createShapeFormula,
  createTipAttach,
  createTrack,
  createTween,
  parseProject,
  serializeProject,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Formula,
  type Project,
} from '../../../model';
import { settleScene } from '../../../scene';
import { generatePython } from '..';
import { num, point } from '../python';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
function add(p: Project, f: Formula, start: number, fields: Partial<Clip> = {}) {
  if (!p.formulas.includes(f)) p.formulas.push(f);
  const track = createTrack(f.name);
  p.tracks.push(track);
  const clip = createClip(f.id, track.id, start, 6, { ...none, ...fields });
  p.clips.push(clip);
  return clip;
}

async function renderMock(p: Project) {
  const renders = new Map<string, ResolvedFormula>();
  for (const f of p.formulas) {
    const result = await createMockEngine().render(renderRequestFor(f, p.meta, 'auto'));
    if (!result.ok) throw new Error(result.error.message);
    f.snapshot = toSnapshot(result.render);
    renders.set(f.id, resolveFormula(f, result.render));
  }
  return settleScene(p, renders, refreshLocalRenders);
}

describe.each(['ce', 'gl'] as const)('%s attachment construction and placement', (target) => {
  it.each(['brace', 'box', 'circle', 'underline', 'cross'] as const)(
    'every reused %s keeps the first attached clip dimensions and its own paint/pose',
    (kind) => {
      const p = createEmptyProject();
      p.meta.target = target;
      const host = createShapeFormula({ name: 'host', width: 2, height: 1 });
      const h = add(p, host, 0);
      const f =
        kind === 'brace'
          ? createBraceFormula({ name: 'fit' })
          : createShapeFormula({ name: 'fit', shape: kind });
      const attach =
        kind === 'brace' ? createBraceAttach(h.id, 'all') : createShapeAttach(h.id, 'all');
      const owner = add(p, f, 3, { attach });
      owner.initial.opacity = 0.25;
      owner.initial.color = '#00FF00';
      owner.initial.scale = 0.8;
      const reused = add(p, f, 1, { attach: { ...attach, buff: 0.7 } });
      reused.initial.opacity = 0.75;
      reused.initial.color = '#0000FF';
      reused.initial.scale = 1.2;
      h.actions = [createTween(1, 1, { scale: 2 }, 'linear')];
      const fresh = refreshLocalRenders(p, new Map());
      const s = settleScene(fresh.project, fresh.formulas, refreshLocalRenders);
      const output = generatePython(s.project, s.formulas, {
        target,
        indexing: 'auto',
        sceneName: 'Shared',
        comments: false,
      });
      expect(output.issues.filter((i) => i.severity === 'error')).toEqual([]);
      if (kind === 'brace') expect(output.code).not.toMatch(/= Brace\(host,/);
      else
        expect(output.code).not.toMatch(
          /= (SurroundingRectangle|_circle_around|Underline|Cross)\(host,/,
        );
      expect(output.code).toMatch(/fit\.scale\(1\.2[,)]/);
      expect(output.code).toMatch(/fit_2\.scale\(0\.8[,)]/);
      expect(output.code).toContain('"#0000FF"');
      expect(output.code).toContain('"#00FF00"');
      // Both clips are used whole: matched by position, neither binds a glyph list.
      const positional = generatePython(s.project, s.formulas, {
        target,
        indexing: 'positional',
        sceneName: 'Shared',
        comments: false,
      }).code;
      expect(positional).toContain('host_g = _glyphs(host, [');
      expect(positional).toMatch(/^\s+fit_2 = /m);
      expect(positional).not.toMatch(/\bfit(_2)?_g\b/);
    },
  );

  it('constructs future fitted targets and places future labels before early consumers, retaining visibility times', async () => {
    const p = createEmptyProject();
    p.meta.target = target;
    const host = add(p, createShapeFormula({ name: 'host', width: 2, height: 1 }), 0);
    host.initial.position = [3, 1];
    host.actions = [createTween(1, 1, { position: [-2, 1] }, 'linear')];
    const brace = add(p, createBraceFormula({ name: 'brace' }), 3, {
      attach: createBraceAttach(host.id, 'all'),
    });
    const label = add(p, createFormula({ name: 'label', source: 'b' }), 4, {
      attach: createTipAttach(brace.id),
    });
    add(p, createShapeFormula({ name: 'earlybox' }), 2, {
      attach: createShapeAttach(label.id, 'all'),
    });
    add(p, createFormula({ name: 'earlynext', source: 's' }), 1, {
      attach: createAttach(brace.id, 'all'),
    });
    const renders = new Map<string, ResolvedFormula>();
    for (const f of p.formulas) {
      const result = await createMockEngine().render(renderRequestFor(f, p.meta, 'auto'));
      if (!result.ok) throw new Error(result.error.message);
      f.snapshot = toSnapshot(result.render);
      renders.set(f.id, resolveFormula(f, result.render));
    }
    const fresh = refreshLocalRenders(p, renders);
    const s = settleScene(fresh.project, fresh.formulas, refreshLocalRenders);
    const output = generatePython(s.project, s.formulas, {
      target,
      indexing: 'auto',
      sceneName: 'Early',
      comments: false,
    });
    expect(output.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(output.issues.filter((i) => i.code === 'attach-target-hidden')).toHaveLength(2);
    const labelInitial = s.project.clips.find((c) => c.id === label.id)!.initial.position;
    expect(labelInitial[0]).toBeCloseTo(-2, target === 'ce' ? 5 : 1);
    expect(output.code).toContain(`label.move_to(${point(labelInitial)})`);
    expect(output.code.indexOf('brace = Brace(')).toBeLessThan(
      output.code.indexOf('earlynext.next_to(brace,'),
    );
    expect(output.code.indexOf('label.move_to(')).toBeLessThan(
      output.code.indexOf('earlybox = SurroundingRectangle(label,'),
    );
    expect(output.code.indexOf('self.add(label)')).toBeGreaterThan(
      output.code.indexOf('self.add(earlybox)'),
    );
    // The early brace is built twice (setup, then its own start) and only used whole: matched by
    // position, it binds its glyph list neither time.
    const positional = generatePython(s.project, s.formulas, {
      target,
      indexing: 'positional',
      sceneName: 'Early',
      comments: false,
    }).code;
    expect(positional.match(/^\s+brace = Brace\(/gm)).toHaveLength(2);
    expect(positional).toContain('label_g = _glyphs(label, [');
    expect(positional).not.toMatch(/\bbrace_g\b/);
  });

  it.each(['shape', 'label', 'brace', 'tip'] as const)(
    'builds the attached target of a fit that starts before it, where it will be (a %s)',
    async (attached) => {
      // A shape is carried, at 1 s, to surround an object that is attached and starts at 3 s, on
      // an anchor that moves in between. The editor measures that object where it will be
      // (`attach-target-hidden`); so must the Python, which builds a fitted object, and places
      // any attached one, when its clip starts.
      const p = createEmptyProject();
      p.meta.target = target;
      const anchor = add(p, createShapeFormula({ name: 'anchor', width: 2, height: 1 }), 0);
      anchor.initial.position = [2, 1];
      anchor.actions = [createTween(2, 0.5, { position: [-1, 2] }, 'linear')];
      const brace = () =>
        add(p, createBraceFormula({ name: attached === 'tip' ? 'brace' : 'future' }), 3, {
          attach: createBraceAttach(anchor.id, 'all'),
        });
      const future =
        attached === 'shape'
          ? add(p, createShapeFormula({ name: 'future' }), 3, {
              attach: createShapeAttach(anchor.id, 'all', 0.3),
            })
          : attached === 'brace'
            ? brace()
            : add(p, createFormula({ name: 'future', source: 'b' }), 3, {
                attach:
                  attached === 'tip' ? createTipAttach(brace().id) : createAttach(anchor.id, 'all'),
              });
      const moving = add(p, createShapeFormula({ name: 'moving', width: 1, height: 1 }), 0);
      moving.initial.position = [-3, -2];
      moving.actions = [createFitTween(1, 1, { clipId: future.id, glyphs: 'all' })];
      const s = await renderMock(p);
      const output = generatePython(s.project, s.formulas, {
        target,
        indexing: 'auto',
        sceneName: 'FutureFit',
        comments: false,
      });
      expect(output.issues.filter((i) => i.severity === 'error')).toEqual([]);
      const { code } = output;
      const fit = code.indexOf('moving_to = SurroundingRectangle(future');
      expect(fit).toBeGreaterThan(-1);
      // The target is built before the shape is fitted to it, at the size the settle gave it…
      const built = code.indexOf('future = ');
      expect(built).toBeGreaterThan(-1);
      expect(built).toBeLessThan(fit);
      const formula = target === 'ce' ? 'future = MathTex(' : 'future = Tex(';
      const constructor = {
        shape: 'future = Rectangle(width=2.6, height=1.6,',
        label: formula,
        brace: 'future = Brace(Line(ORIGIN, 2 * RIGHT), DOWN, buff=0',
        tip: formula,
      }[attached];
      expect(code.indexOf(constructor)).toBe(built);
      // … and put where it will be once the anchor has moved, not where the anchor is now.
      const settled = s.project.clips.find((c) => c.id === future.id)!.initial.position;
      expect(settled[0]).toBeCloseTo(-1, 1);
      const placed = code.indexOf(`future.move_to(${point(settled)})`);
      expect(placed).toBeGreaterThan(built);
      expect(placed).toBeLessThan(fit);
      // It still comes on, and is built on or put beside its own target, when its clip starts.
      const own = code.indexOf(
        {
          shape: 'future = SurroundingRectangle(anchor',
          label: 'future.next_to(anchor',
          brace: 'future = Brace(anchor',
          tip: 'brace.put_at_tip(future',
        }[attached],
      );
      expect(own).toBeGreaterThan(fit);
      expect(code.indexOf('self.add(future)')).toBeGreaterThan(fit);
    },
  );

  it.each(['ce', 'gl'] as const)(
    'keeps free-mode shared dimensions on export to %s and refreshes early positional glyph bindings',
    async (exportTarget) => {
      const p = createEmptyProject();
      p.meta.target = target;
      const host = add(p, createFormula({ name: 'host', source: 'x^2+bx+c' }), 0);
      host.actions.push(createTween(1, 1, { scale: 1.5 }, 'linear'));
      const expected: Record<
        string,
        {
          width: number;
          height: number;
          scale: number;
          opacity: number;
          color: string;
          glyphColors: Record<string, string>;
          start: number;
        }
      > = {};
      for (const shape of ['box', 'cross'] as const) {
        const f = createShapeFormula({ name: `fit_${shape}`, shape });
        const owner = add(p, f, 3, { attach: createShapeAttach(host.id, 'all') });
        Object.assign(owner.initial, {
          scale: 0.8,
          color: '#00FF00',
          opacity: 0.3,
          glyphColors: { 0: '#FF0000' },
        });
        owner.actions.push(
          createPartTransform(0.25, [0], { duration: 0.25, opacity: 0.2, easing: 'linear' }),
        );
        const reused = add(p, f, 1, { attach: createShapeAttach(host.id, 'all', 0.7) });
        Object.assign(reused.initial, {
          scale: 1.2,
          color: '#0000FF',
          opacity: 0.75,
          glyphColors: { 0: '#00FFCC' },
        });
        add(p, createFormula({ name: `label_${shape}`, source: 's' }), 0.5, {
          attach: createAttach(owner.id, 'all'),
        });
      }
      const s = await renderMock(p);
      expect(s.readiness.ready).toBe(true);
      const output = generatePython(s.project, s.formulas, {
        target: exportTarget,
        indexing: 'positional',
        sceneName: 'FreeFits',
        comments: false,
      });
      expect(output.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(output.issues.filter((i) => i.code === 'export-other-target')).toHaveLength(
        target === exportTarget ? 0 : 1,
      );
      for (const shape of ['box', 'cross'] as const) {
        const f = s.project.formulas.find((f) => f.name === `fit_${shape}`)!;
        if (f.kind !== 'shape') throw new Error('shape fixture');
        expect(output.code.match(new RegExp(`fit_${shape}_2_g = _glyphs\\(`, 'g'))).toHaveLength(2);
        expect(output.code).toContain(`Rectangle(width=${num(f.width)}, height=${num(f.height)}`);
        expect(output.code).toContain(`fit_${shape}_2_g[0].set_color("#FF0000")`);
        const uses = s.project.clips.filter((c) => c.formulaId === f.id);
        for (const c of uses) {
          const name = c.start === 3 ? `fit_${shape}_2` : `fit_${shape}`;
          expected[name] = {
            width: f.width,
            height: f.height,
            scale: c.initial.scale,
            opacity: c.initial.opacity,
            color: c.initial.color!,
            glyphColors: c.initial.glyphColors,
            start: c.start,
          };
        }
      }
      const out = process.env.MFE_GEOMETRY_OUTPUT;
      if (out) {
        mkdirSync(out, { recursive: true });
        const name = `free-${target}-to-${exportTarget}`;
        writeFileSync(join(out, `${name}.py`), output.code);
        writeFileSync(
          join(out, `${name}.json`),
          JSON.stringify(
            { target: exportTarget, expected, samples: [1.25, 3.1, 3.75], sceneName: 'FreeFits' },
            null,
            2,
          ),
        );
      }
    },
  );

  it('reports unavailable future initial geometry and still returns export code', async () => {
    const p = createEmptyProject();
    p.meta.target = target;
    const host = add(p, createFormula({ name: 'host', source: 'x' }), 3);
    const brace = add(p, createBraceFormula({ name: 'brace' }), 4, {
      attach: createBraceAttach(host.id, 'all'),
    });
    add(p, createFormula({ name: 'label', source: 'b' }), 1, { attach: createTipAttach(brace.id) });
    const ready = await renderMock(p);
    const output = generatePython(ready.project, new Map(), {
      target,
      indexing: 'auto',
      sceneName: 'Unready',
      comments: false,
    });
    expect(
      output.issues.some(
        (i) =>
          i.code === 'export-missing-render' && i.message.includes('initial geometry is not ready'),
      ),
    ).toBe(true);
    expect(output.code).toContain('class Unready(Scene):');
  });

  it('retains explicit invalid-fit errors and saveable geometry without blocking Python downloads', () => {
    const p = createEmptyProject();
    p.meta.target = target;
    const host = add(p, createShapeFormula({ name: 'host', width: 1, height: 1 }), 0);
    const f = createShapeFormula({ name: 'fit' });
    add(p, f, 2, { attach: createShapeAttach(host.id, 'all', -1) });
    add(p, f, 1, { attach: createShapeAttach(host.id, 'all') });
    const fresh = refreshLocalRenders(p, new Map());
    const output = generatePython(fresh.project, fresh.formulas, {
      target,
      indexing: 'auto',
      sceneName: 'InvalidFit',
      comments: false,
    });
    expect(output.issues.some((i) => i.code === 'attach-shape-fit' && i.severity === 'error')).toBe(
      true,
    );
    expect(parseProject(serializeProject(fresh.project)).ok).toBe(true);
    expect(output.code).toContain('class InvalidFit(Scene):');
  });
});
