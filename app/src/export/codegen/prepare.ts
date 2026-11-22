/* First pass of the Python generator: the issues of the project as a whole, then one mobject per
 * clip — the formula's name, TeX template, glyph layout and indexing mode (literal indices need
 * glyphs the LaTeX backend made for this very export), and the clip's setup lines, the mobject
 * itself written by the emitter of the formula's kind (emitters.ts) — and the glyphs that Manim's
 * LaTeX does not have. */
import {
  CE_GL_SIZE_RATIO,
  glyphLikes,
  isCurrentRender,
  isExactSnapshot,
  TEXT_CE_GL_SIZE_RATIO,
  textCountedByBoxes,
  textShapedFor,
  textSignatureFor,
  type ResolvedFormula,
} from '../../engine';
import {
  DEFAULT_BRACE_SHARPNESS,
  glyphTransfers,
  isBlank,
  type Issue,
  glyphMembers,
  attachTargets,
  isFittedRule,
  packagesOf,
  TARGET_NAMES,
  kindOf,
} from '../../model';
import { trackDepths } from '../../scene';
import { placeableAttachment } from './attach';
import { emitterOf } from './emitters';
import { glyphSetupLines } from './glyphs';
import { exportIssue } from './issues';
import { opacityChain } from './paint';
import { identifier, num, point, pyComment, pyString } from './python';
import type { Codegen, ClipCtx } from './context';

export function reportProjectIssues(gen: Codegen): void {
  const { project, target } = gen;
  project.tracks.forEach((track, i) => {
    if (track.hidden && project.clips.some((c) => c.trackId === track.id)) {
      gen.issues.push(
        exportIssue(
          'warning',
          'export-hidden-track',
          `Track "${track.name}" is hidden in the preview but is exported like the others.`,
          ['tracks', i, 'hidden'],
        ),
      );
    }
  });
  if (target !== project.meta.target) {
    const other = TARGET_NAMES[target];
    gen.issues.push(
      exportIssue(
        'warning',
        'export-other-target',
        `The project targets ${TARGET_NAMES[project.meta.target]}; exporting to ${other} ` +
          `converts the font sizes of formulas and LaTeX texts (× ${num(target === 'gl' ? CE_GL_SIZE_RATIO : 1 / CE_GL_SIZE_RATIO, 4)}) ` +
          `and matches their glyphs by position. Easing curves and default lag ratios follow ${other}, ` +
          'so the motion differs slightly from the preview.',
        ['meta', 'target'],
      ),
    );
  }
  if (project.clips.length === 0) {
    gen.issues.push(exportIssue('warning', 'export-empty', 'The timeline has no clips.'));
  }
}

export function prepareFormulas(gen: Codegen): void {
  const { project, target } = gen;
  const usedIds = new Set(project.clips.map((c) => c.formulaId));
  const templates = new Map<string, string>();
  // Font texts whose saved geometry is the other library's, the ones this library shaped whose
  // scene cannot check them (no fingerprint at hand), and the ones nothing has shaped: one issue
  // for each list, ahead of the issues of single formulas.
  const borrowed: string[] = [];
  const unchecked: string[] = [];
  const unshaped: string[] = [];
  const ahead = gen.issues.length;
  project.formulas.forEach((formula, index) => {
    if (!usedIds.has(formula.id)) return;
    if (isBlank(formula)) {
      // It may keep the snapshot of its last LaTeX, whose glyphs `MathTex(r"")` does not have.
      gen.issues.push(
        exportIssue(
          'warning',
          'export-missing-render',
          `Formula "${formula.name}" is empty; its clips are left out.`,
          ['formulas', index],
        ),
      );
      return;
    }
    const resolved: ResolvedFormula | undefined = gen.formulas.get(formula.id);
    // A font text is written from the geometry saved of its current source, font and size, by
    // this library (exact) or by the other one (the same glyphs in the same order, on trust).
    // One nothing has shaped as it stands is written too, its glyphs counted by its placeholder
    // boxes, one per character, on trust again. Without any of them its glyphs are unknown: an
    // earlier source's snapshot cannot say which glyph is which.
    const shaped = formula.kind === 'text' ? textShapedFor(formula, resolved?.render) : null;
    if (
      formula.kind === 'text' &&
      shaped === null &&
      !textCountedByBoxes(formula, resolved, project.meta)
    ) {
      gen.issues.push(
        exportIssue(
          'error',
          'export-missing-render',
          `Text "${formula.name}" has no shape of its current source, font and size, and its ` +
            'glyphs are not counted either; its clips are left out.',
          ['formulas', index],
        ),
      );
      return;
    }
    const glyphs = formula.snapshot?.glyphs ?? (resolved && glyphLikes(resolved.render));
    if (!glyphs) {
      gen.issues.push(
        exportIssue(
          'error',
          'export-missing-render',
          `Formula "${formula.name}" has not been rendered yet; its clips are left out.`,
          ['formulas', index],
        ),
      );
      return;
    }
    const source = formula.snapshot?.backend ?? resolved?.render.backend ?? 'mathjax';
    // Literal indices need glyphs the LaTeX backend made for this very export (target,
    // preamble, size, backend version): a snapshot kept from an earlier render may number
    // them differently from what Manim will build (`isExactSnapshot`).
    const exportMeta = { ...project.meta, target };
    const exact =
      formula.kind === 'text'
        ? true
        : formula.snapshot
          ? isExactSnapshot(formula, exportMeta)
          : resolved !== undefined &&
            resolved.render.exact &&
            isCurrentRender(resolved.render, formula, exportMeta);
    // A line is never matched by position, whatever was asked and whatever render its snapshot is
    // of. Its glyphs are the members of the mobject Manim builds, the same in both libraries
    // (`glyphMembers`): the line itself, an arrow and its tips, the dashes in their order. A list
    // of them would stand in for the mobject its own animations need (`GrowArrow`, `Create` of an
    // arrow), and `_glyphs` could tell nothing of a line that lies flat, which has no height to
    // measure by.
    const positional =
      formula.kind !== 'text' &&
      formula.kind !== 'line' &&
      (gen.options.indexing === 'positional' || !exact);
    const flat =
      !positional && target === 'ce' && kindOf(formula).latex && formula.source.includes('{{');

    // Glyph layout normalised by the formula height (union of the glyph boxes).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const g of glyphs) {
      minX = Math.min(minX, g.center[0] - g.size[0] / 2);
      maxX = Math.max(maxX, g.center[0] + g.size[0] / 2);
      minY = Math.min(minY, g.center[1] - g.size[1] / 2);
      maxY = Math.max(maxY, g.center[1] + g.size[1] / 2);
    }
    // By 1 when it has none (`_glyphs` does the same with the mobject's).
    const height = maxY - minY > 1e-6 ? maxY - minY : 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const layout = glyphs.map(
      (g) =>
        [
          (g.center[0] - cx) / height,
          (g.center[1] - cy) / height,
          g.size[0] / height,
          g.size[1] / height,
        ] as [number, number, number, number],
    );

    if (positional && gen.options.indexing === 'auto') {
      const why =
        source !== 'latex'
          ? 'it was rendered with MathJax, whose glyph order can differ from LaTeX'
          : target !== project.meta.target
            ? 'its glyphs were rendered for the other Manim library'
            : 'its exact glyphs come from an earlier render (another library, preamble, size or version)';
      // A wrapped text set by MathJax: LaTeX may break the lines elsewhere, and glyphs paired by
      // position then take each other's colours and animations.
      const wrapped =
        formula.kind === 'tex' && formula.layout.width !== null && source !== 'latex'
          ? ' LaTeX breaks the lines of a text with a width itself, maybe not where the preview did: the pairing by position may then land on the wrong letters.'
          : '';
      gen.issues.push(
        exportIssue(
          'warning',
          'export-positional',
          `Glyphs of "${formula.name}" are matched by position when the scene runs, because ` +
            `${why}.${wrapped} Render with the companion online for exact indices.`,
          ['formulas', index],
        ),
      );
    }
    if (
      resolved &&
      resolved.render.backend !== source &&
      resolved.render.glyphs.length !== glyphs.length
    ) {
      gen.issues.push(
        exportIssue(
          'warning',
          'export-glyph-count',
          `"${formula.name}" has ${glyphs.length} glyphs in its ${source === 'latex' ? 'LaTeX' : 'MathJax'} ` +
            `snapshot but ${resolved.render.glyphs.length} in the current ${resolved.render.backend === 'latex' ? 'LaTeX' : 'MathJax'} ` +
            'render; glyphs without a counterpart are not animated as in the preview.',
          ['formulas', index],
        ),
      );
    }
    if (resolved && resolved.render.backend === 'mathjax') {
      for (const warning of resolved.render.warnings) {
        gen.issues.push(
          exportIssue('warning', 'export-package', `"${formula.name}": ${warning}`, [
            'formulas',
            index,
            'packages',
          ]),
        );
      }
    }

    if (
      formula.kind === 'brace' &&
      target === 'gl' &&
      formula.sharpness !== DEFAULT_BRACE_SHARPNESS
    ) {
      gen.issues.push(
        exportIssue(
          'warning',
          'export-brace-sharpness',
          `"${formula.name}" has sharpness ${num(formula.sharpness)}: ManimGL draws its brace from a font and ignores it.`,
          ['formulas', index, 'sharpness'],
        ),
      );
    }

    // The size the preview shows: a LaTeX object's is its font size in the project's library, a
    // font text's the one in the library that shaped it (the project's, for a text nothing
    // shaped: its boxes are laid out for that library).
    const ratio =
      formula.kind === 'text'
        ? (shaped ?? project.meta.target) === target
          ? 1
          : TEXT_CE_GL_SIZE_RATIO
        : target === project.meta.target || !kindOf(formula).latex
          ? 1
          : CE_GL_SIZE_RATIO;
    const fontSize = target === 'gl' ? formula.fontSize * ratio : formula.fontSize / ratio;

    // The fingerprint the scene checks the text it builds against, when there is one.
    let textSignature: string | null = null;
    if (formula.kind === 'text') {
      textSignature = textSignatureFor(formula, resolved?.render, target);
      // By name, each once: two texts may share one.
      const list =
        shaped === null
          ? unshaped
          : shaped !== target
            ? borrowed
            : textSignature === null
              ? unchecked
              : null;
      if (list && !list.includes(formula.name)) list.push(formula.name);
    }

    let texSetup: string | null = null;
    const lines = [
      ...packagesOf(formula).map((p) => `\\usepackage{${p}}`),
      ...(project.meta.preamble && kindOf(formula).latex ? [project.meta.preamble] : []),
    ];
    if (lines.length > 0) {
      const key = JSON.stringify(lines);
      let name = templates.get(key);
      if (!name) {
        name = gen.names.take(gen.dialect.texSetupVar);
        templates.set(key, name);
        if (target === 'ce') {
          gen.setup.push(`${name} = TexTemplate()`);
          for (const line of lines) gen.setup.push(`${name}.add_to_preamble(${pyString(line)})`);
        } else {
          gen.setup.push(
            lines.length === 1
              ? `${name} = ${pyString(lines[0]!)}`
              : `${name} = "\\n".join([${lines.map(pyString).join(', ')}])`,
          );
        }
      }
      texSetup = name;
    }

    gen.formulaCtx.set(formula.id, {
      formula,
      index,
      count: glyphs.length,
      layout,
      positional,
      flat,
      fontSize,
      texSetup,
      textSignature,
    });
  });
  const texts = (list: string[]) =>
    `${list.length === 1 ? 'Font text' : 'Font texts'} ${list.map((name) => `"${name}"`).join(', ')}`;
  const about: Issue[] = [];
  if (borrowed.length > 0) {
    const from = TARGET_NAMES[target === 'ce' ? 'gl' : 'ce'];
    const to = TARGET_NAMES[target];
    about.push(
      exportIssue(
        'warning',
        'export-text-other-library',
        `${texts(borrowed)} ${borrowed.length === 1 ? 'was' : 'were'} shaped by ${from}. ${to} builds the same glyphs in ` +
          'the same order, so colours and animations of single glyphs hold, but the look can ' +
          `differ from the preview: the font size is converted (× ${num(target === 'gl' ? TEXT_CE_GL_SIZE_RATIO : 1 / TEXT_CE_GL_SIZE_RATIO, 4)}, ` +
          `approximate: ManimGL sizes a text by a font of the machine), and ${to} spaces lines ` +
          'and tabs its own way. The scene checks only the number of glyphs.',
        ['meta', 'target'],
      ),
    );
  }
  if (unshaped.length > 0) {
    const one = unshaped.length === 1;
    about.push(
      exportIssue(
        'warning',
        'export-text-unshaped',
        `${texts(unshaped)}: nothing has shaped ${one ? 'it' : 'them'} as ` +
          `${one ? 'it stands' : 'they stand'} (no companion drew ${one ? 'it' : 'them'}). ` +
          `${one ? 'It is' : 'They are'} written all the same, ${one ? 'its' : 'their'} glyphs ` +
          'counted one per character (or as an earlier shape of the same text counted them): ' +
          'where the font joins letters into one glyph, or the text runs right to left, ' +
          'colours and animations of single glyphs can land on other glyphs. The scene says so ' +
          'when it runs if Manim builds another number of glyphs.',
        ['formulas'],
      ),
    );
  }
  if (unchecked.length > 0) {
    about.push(
      exportIssue(
        'warning',
        'export-text-unchecked',
        `${texts(unchecked)}: the scene checks only how many glyphs Manim builds, not their ` +
          (unchecked.length === 1
            ? 'outlines, because its saved shape is not at hand or has no fingerprint.'
            : 'outlines, because their saved shapes are not at hand or have no fingerprint.'),
        ['formulas'],
      ),
    );
  }
  gen.issues.splice(ahead, 0, ...about);
}

export function prepareClips(gen: Codegen): void {
  const { project, target } = gen;
  const zByTrack = trackDepths(project);
  const clips = [...project.clips].sort((a, b) => a.start - b.start);
  for (const clip of clips) {
    const formula = gen.formulaCtx.get(clip.formulaId);
    if (!formula) continue;
    // `<name>_g` holds the glyph list of list-indexed formulas: keep it free as well.
    const name = gen.names.take(identifier(formula.formula.name), ['_g']);
    const ctx: ClipCtx = {
      clip,
      formula,
      naming: {
        name,
        target,
        indexing: formula.positional || formula.flat ? 'list' : 'literal',
        count: formula.count,
        members: glyphMembers(formula.formula, target),
      },
      z: zByTrack.get(clip.trackId) ?? 0,
      present: new Set(),
      gone: new Set(),
      partColor: new Map(),
      partOpacity: new Map(),
      partsMoved: false,
    };
    gen.clipCtx.set(clip.id, ctx);
    emitClipSetup(gen, ctx);
  }
}

/** Transfers (relations, Morph blocks) that move a glyph Manim will not have: the formula's
 * LaTeX render for the export target (what Manim compiles) lacks a counterpart of that
 * canonical glyph, so `_glyphs` hands the pair an empty placeholder. Unknown when only a
 * MathJax render is at hand. */
export function reportMissingGlyphs(gen: Codegen): void {
  const missing = (clipId: string, glyphs: readonly number[]): number[] => {
    const ctx = gen.clipCtx.get(clipId);
    const resolved = ctx && gen.formulas.get(ctx.clip.formulaId);
    if (!resolved || resolved.render.backend !== 'latex' || resolved.render.target !== gen.target) {
      return [];
    }
    return glyphs.filter((g) => resolved.canonToRender[g] === null);
  };
  for (const transfer of glyphTransfers(gen.project)) {
    const from = gen.clipCtx.get(transfer.fromClipId);
    const to = gen.clipCtx.get(transfer.toClipId);
    if (!from || !to) continue;
    const lost = transfer.pairs.flatMap((pair) => [
      ...missing(from.clip.id, pair.from).map((g) => `${from.naming.name} glyph ${g}`),
      ...missing(to.clip.id, pair.to).map((g) => `${to.naming.name} glyph ${g}`),
    ]);
    if (lost.length === 0) continue;
    const what =
      transfer.origin.kind === 'morph'
        ? `The Morph block of ${from.naming.name}`
        : `Relation ${from.naming.name} → ${to.naming.name}`;
    gen.issues.push(
      exportIssue(
        'warning',
        'export-glyph-count',
        `${what} moves glyphs that Manim's LaTeX does not have ` +
          `(${[...new Set(lost)].join(', ')}): those pairs morph from or into nothing.`,
        transfer.path,
      ),
    );
  }
}

function emitClipSetup(gen: Codegen, ctx: ClipCtx): void {
  const { formula: fc, clip, naming } = ctx;
  const f = fc.formula;
  const lines = gen.setup;
  const attach = placeableAttachment(gen, clip);
  const fitted = attach !== null && isFittedRule(attach.rule);
  const futureInitial = gen.attachments.initialTargets.has(clip.id);
  if (gen.options.comments) {
    // What it is built on: its target, or each of them when it spans several clips.
    const targetNames = (attach ? attachTargets(attach) : []).map((spot) => {
      const target = gen.project.clips.find((c) => c.id === spot.clipId);
      return gen.project.formulas.find((x) => x.id === target?.formulaId)?.name ?? '?';
    });
    const noun =
      f.kind === 'brace'
        ? 'brace'
        : f.kind === 'shape'
          ? f.shape
          : f.kind === 'line'
            ? f.line.replace('_', ' ')
            : null;
    const what =
      noun === null
        ? f.source.replace(/\s+/g, ' ')
        : fitted
          ? `${noun}, built on ${targetNames.join(' and ') || '?'} where its clip starts`
          : noun;
    lines.push('', pyComment(`${f.name}: ${what}`));
  }
  // A brace or a shape fitted to its target is built there, in the step where its clip starts
  // (attach.ts).
  if (fitted && !futureInitial) return;
  const base = clip.initial.color ?? f.color;
  lines.push(...emitterOf(f).construct(gen, ctx, base, f));
  lines.push(...glyphSetupLines(gen, ctx, fitted));
  // A shape's emitter folds the clip's opacity into its style: `set_opacity` would fill a
  // stroked shape.
  if (clip.initial.opacity !== 1 && f.kind !== 'shape')
    lines.push(`${naming.name}${opacityChain(f, clip.initial.opacity, gen.target)}`);

  // Placement: flips and scale about the centre, then the move, then the rotation about the
  // new centre (placementMatrix). An attached object is moved beside its target when its clip
  // starts instead (attach.ts): its position is Manim's to find.
  const chain: string[] = [];
  const s = clip.initial;
  const attached = attach !== null && !futureInitial;
  // A mobject its constructor placed (a line, between its ends) is where it goes already.
  if (!emitterOf(f).placed) {
    if (s.scale !== 1) chain.push(`.scale(${num(s.scale)})`);
    if (s.flipX) chain.push('.stretch(-1, 0)');
    if (s.flipY) chain.push('.stretch(-1, 1)');
    if (!attached && (s.position[0] !== 0 || s.position[1] !== 0 || (futureInitial && fitted))) {
      chain.push(`.move_to(${point(s.position)})`);
    }
    if (s.rotation !== 0) chain.push(`.rotate(${num(s.rotation)} * DEGREES)`);
  }
  if (chain.length > 0) lines.push(`${naming.name}${chain.join('')}`);
  if (ctx.z !== 0) lines.push(`${naming.name}.set_z_index(${ctx.z})`);
}
