// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  producerOf,
  renderRequestFor,
  resolveFormula,
  savedBoxesRender,
  textArtifactRender,
  textBoxesKey,
  textSavedBoxesKey,
  textSignatureFor,
  toSnapshot,
  type CompanionState,
  type ResolvedFormula,
  type TextRenderRequest,
} from '../../../engine';
import {
  createClip,
  createEmptyProject,
  createTextFormula,
  type Project,
  type Target,
  type TextFormula,
} from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { textGeometry } from '../../../test/textGeometry';
import {
  formulaReadiness,
  pythonReadiness,
  textIsWritten,
  textVerification,
  textVerificationNotes,
  videoReadiness,
} from '../readiness';

/** A companion that shapes text for `target` in the environment the test geometry names, or in
 * another one. */
function companion(target: Target, environmentKey = 'test-environment'): CompanionState {
  return {
    status: 'online',
    health: {
      name: 'mfe-companion',
      version: 'test',
      protocol: 1,
      capabilities: {
        latex: false,
        dvisvgm: false,
        ffmpeg: false,
        manimCE: null,
        manimGL: null,
        pango: { [target]: { state: 'ready', adapterVersion: 'test-adapter', environmentKey } },
      },
    },
  };
}

/** A project with one text on its timeline, `shaped` by `shapedBy` when it said that, as the
 * render sync leaves it; `fields`: what the formula says now. */
function scene(shapedBy: Target, shaped = 'AB', fields: Partial<TextFormula> = {}) {
  const project: Project = createEmptyProject();
  const artifact = textGeometry(shaped, undefined, shapedBy);
  const render = textArtifactRender(artifact);
  const formula = createTextFormula({
    name: 'title',
    source: shaped,
    snapshot: toSnapshot(render),
    geometry: {
      contentHash: 'a'.repeat(64),
      byteLength: 1,
      key: artifact.key,
      basisKey: artifact.basisKey,
    },
    ...fields,
  });
  project.formulas.push(formula);
  project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
  const resolved = new Map<string, ResolvedFormula>([
    [formula.id, resolveFormula(formula, render)],
  ]);
  return { project, formula, resolved, render };
}

const names = (formulas: { name: string }[]) => formulas.map((formula) => formula.name);

/** A project with one text nothing has shaped, drawn as its boxes, as the render sync leaves it. */
function boxed(source = 'AB') {
  const project: Project = createEmptyProject();
  const draft = createTextFormula({ name: 'title', source });
  const request = renderRequestFor(draft, project.meta, 'auto') as TextRenderRequest;
  const result = producerOf('text').free(request, textBoxesKey(request));
  if (!result.ok) throw new Error(result.error.message);
  const formula = { ...draft, snapshot: toSnapshot(result.render) };
  project.formulas.push(formula);
  project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
  const resolved = new Map<string, ResolvedFormula>([
    [formula.id, resolveFormula(formula, result.render)],
  ]);
  const entries: Record<string, FormulaRenderEntry> = {
    [formula.id]: { status: 'ok', resolved: resolved.get(formula.id)!, error: null },
  };
  return { project, formula, resolved, entries };
}

describe('the readiness of a text drawn without its real glyphs', () => {
  it('is settled, not stale: nothing is on its way for a text drawn as boxes', () => {
    const { project, entries, resolved } = boxed();
    const readiness = formulaReadiness(project, entries, resolved);
    expect(names(readiness.unshaped)).toEqual(['title']);
    expect(readiness.stale).toEqual([]);
    expect(readiness.pending).toEqual([]);
    const video = videoReadiness(project, entries, resolved);
    expect(video.waiting).toEqual([]);
    expect(names(video.boxes)).toEqual(['title']);
    // The generator writes it by its boxes: nothing holds the Python back.
    expect(pythonReadiness(project, entries, resolved)).toEqual({ pending: [], unwritten: [] });
  });

  it('is written though the companion then refused to shape it, its boxes being its own', () => {
    // Drawn as boxes, then a companion came and said it has no such font: the boxes stay.
    const { project, formula, resolved } = boxed();
    const entries: Record<string, FormulaRenderEntry> = {
      [formula.id]: {
        status: 'error',
        resolved: resolved.get(formula.id)!,
        error: { message: 'The requested font family is not available.', backend: 'pango' },
      },
    };
    expect(pythonReadiness(project, entries, resolved)).toEqual({ pending: [], unwritten: [] });
    expect(textIsWritten(formula, project, resolved)).toBe(true);
    // And it is on screen as boxes: the video films them, as for any text nothing shaped.
    const video = videoReadiness(project, entries, resolved);
    expect(names(video.boxes)).toEqual(['title']);
    // Counted one per character: the Python has it, so Render with Manim goes on.
    expect(video.uncounted).toEqual([]);
    expect(video.savedBoxes).toEqual([]);
  });

  it('is not written when its boxes stand over a snapshot nothing could carry over', () => {
    // Its references count by a geometry that is gone, and the source moved on (confidence 0).
    const { project, formula, resolved } = boxed();
    const unsure = new Map([
      [formula.id, { ...resolved.get(formula.id)!, canonToRender: [null, null], confidence: 0 }],
    ]);
    const stranger = { ...formula.snapshot!, key: 'pango-of-an-earlier-text' };
    const moved = { ...formula, snapshot: stranger };
    project.formulas[0] = moved;
    unsure.get(formula.id)!.formula = moved;
    const entries: Record<string, FormulaRenderEntry> = {
      [moved.id]: { status: 'ok', resolved: unsure.get(moved.id)!, error: null },
    };
    expect(textIsWritten(moved, project, unsure)).toBe(false);
    expect(names(pythonReadiness(project, entries, unsure).unwritten)).toEqual(['title']);
    // Settled all the same: no export waits for it, and the video films its boxes.
    const video = videoReadiness(project, entries, unsure);
    expect(video.waiting).toEqual([]);
    expect(names(video.boxes)).toEqual(['title']);
    // But the Python leaves it out: Render with Manim, which gets that Python, must know.
    expect(names(video.uncounted)).toEqual(['title']);
  });

  it('drawn where the glyphs of its saved shape were, is written and counted by that shape', () => {
    // The geometry is not at hand; the references count by it all the same.
    const { project, formula } = scene('ce');
    const request = renderRequestFor(formula, project.meta, 'auto') as TextRenderRequest;
    const render = savedBoxesRender(
      formula.snapshot!,
      request,
      textSavedBoxesKey(request, formula.snapshot!.key),
    );
    const resolved = new Map([[formula.id, resolveFormula(formula, render)]]);
    const entries: Record<string, FormulaRenderEntry> = {
      [formula.id]: { status: 'ok', resolved: resolved.get(formula.id)!, error: null },
    };
    expect(textIsWritten(formula, project, resolved)).toBe(true);
    const video = videoReadiness(project, entries, resolved);
    expect(names(video.boxes)).toEqual(['title']);
    expect(video.uncounted).toEqual([]);
    expect(names(video.savedBoxes)).toEqual(['title']);
  });

  it('is not written with the boxes of an earlier source', () => {
    const { project, formula, resolved } = boxed();
    const edited = { ...formula, source: 'ABC' };
    project.formulas[0] = edited;
    const entries: Record<string, FormulaRenderEntry> = {
      [edited.id]: {
        status: 'error',
        resolved: resolved.get(formula.id)!,
        error: { message: 'The requested font family is not available.', backend: 'pango' },
      },
    };
    expect(names(pythonReadiness(project, entries, resolved).unwritten)).toEqual(['title']);
  });

  it('is settled too for a text drawn with the shape the other library gave it', () => {
    const { project, formula, resolved } = scene('ce');
    project.meta.target = 'gl';
    const entries: Record<string, FormulaRenderEntry> = {
      [formula.id]: { status: 'ok', resolved: resolved.get(formula.id)!, error: null },
    };
    const readiness = formulaReadiness(project, entries, resolved);
    expect(names(readiness.unshaped)).toEqual(['title']);
    expect(readiness.stale).toEqual([]);
    const video = videoReadiness(project, entries, resolved);
    expect(video.waiting).toEqual([]);
    // Real glyphs on screen: nothing to say of boxes.
    expect(video.boxes).toEqual([]);
    expect(pythonReadiness(project, entries, resolved)).toEqual({ pending: [], unwritten: [] });
  });

  it('has nothing to say of a text drawn with its own shape', () => {
    const { project, formula, resolved } = scene('ce');
    const entries: Record<string, FormulaRenderEntry> = {
      [formula.id]: { status: 'ok', resolved: resolved.get(formula.id)!, error: null },
    };
    expect(formulaReadiness(project, entries, resolved)).toEqual({
      empty: [],
      pending: [],
      stale: [],
      unshaped: [],
    });
  });
});

describe('textVerification', () => {
  it('has nothing to say of a text the running companion still shapes the same way', () => {
    const { project, resolved } = scene('ce');
    expect(textVerification(project, resolved, companion('ce'), 'ce')).toEqual({
      unknown: [],
      changed: [],
    });
  });

  it('lists a text nobody can compare: no companion, or none for the library', () => {
    const { project, resolved } = scene('ce');
    for (const state of [{ status: 'offline' } as const, companion('gl')]) {
      const found = textVerification(project, resolved, state, 'ce');
      expect(names(found.unknown)).toEqual(['title']);
      expect(found.changed).toEqual([]);
    }
  });

  it('lists a text whose fonts or versions changed since it was shaped', () => {
    const { project, resolved } = scene('ce');
    const found = textVerification(project, resolved, companion('ce', 'other fonts'), 'ce');
    expect(names(found.changed)).toEqual(['title']);
    expect(found.unknown).toEqual([]);
  });

  it('leaves to the generator the texts whose scene has no check of its own', () => {
    // The other library's geometry, and a text whose geometry is not loaded: the generator says
    // so in its issues; the companion has nothing to compare.
    const other = scene('gl');
    expect(textVerification(other.project, other.resolved, { status: 'offline' }, 'ce')).toEqual({
      unknown: [],
      changed: [],
    });
    const unloaded = scene('ce');
    expect(textVerification(unloaded.project, new Map(), { status: 'offline' }, 'ce')).toEqual({
      unknown: [],
      changed: [],
    });
  });

  it('skips the texts that are not on the timeline, and the empty ones', () => {
    const { project, resolved } = scene('ce');
    expect(names(textVerification(project, resolved, { status: 'offline' }, 'ce').unknown)).toEqual(
      ['title'],
    );
    project.clips = [];
    expect(textVerification(project, resolved, { status: 'offline' }, 'ce').unknown).toEqual([]);
    // A text of spaces alone has a shape of its own (no glyphs, with its fingerprint) and still
    // is not listed: the exports leave it out.
    const blank = scene('ce', '  ');
    expect(textSignatureFor(blank.formula, blank.render, 'ce')).not.toBeNull();
    expect(textVerification(blank.project, blank.resolved, { status: 'offline' }, 'ce')).toEqual({
      unknown: [],
      changed: [],
    });
  });
});

describe('textVerificationNotes', () => {
  const one = [createTextFormula({ name: 'title' })];
  const two = [...one, createTextFormula({ name: 'credits' })];

  it('says nothing when there is nothing', () => {
    expect(textVerificationNotes({ unknown: [], changed: [] }, 'ce', true)).toEqual([]);
  });

  it('names the texts, and the library nobody shapes text for', () => {
    const [note] = textVerificationNotes({ unknown: one, changed: [] }, 'gl', true);
    expect(note).toMatch(/^Font text "title": not compared with the fonts of this machine/);
    expect(note).toContain('no companion that shapes text for ManimGL is running');
    expect(note).toContain('The scene checks it when it runs');
    const [many] = textVerificationNotes({ unknown: two, changed: [] }, 'ce', true);
    expect(many).toMatch(/^Font texts "title", "credits": not compared/);
    expect(many).toContain('The scene checks them when it runs');
  });

  it('tells a text nobody compared yet from one nobody can compare', () => {
    for (const worker of ['unused', 'preparing'] as const) {
      const [note] = textVerificationNotes({ unknown: one, changed: [] }, 'gl', true, worker);
      expect(note).toMatch(
        /^Font text "title": not compared with the fonts of this machine yet: the companion is starting its text worker for ManimGL\./,
      );
      expect(note).not.toContain('no companion');
    }
    const [failed] = textVerificationNotes({ unknown: one, changed: [] }, 'ce', false, 'failed');
    expect(failed).toBe(
      'Font text "title": not compared with the fonts of this machine: the companion could not start its text worker for ManimCE.',
    );
    for (const worker of ['none', 'ready'] as const) {
      const [note] = textVerificationNotes({ unknown: one, changed: [] }, 'gl', true, worker);
      expect(note).toContain('no companion that shapes text for ManimGL is running');
    }
  });

  it('says what changed and how to shape the text again', () => {
    const [note] = textVerificationNotes({ unknown: [], changed: one }, 'ce', true);
    expect(note).toMatch(
      /^Font text "title": shaped with other fonts, or other versions of Manim or Pango, than/,
    );
    expect(note).toContain('Refresh appearance');
    expect(note).toContain('The scene warns when it runs if the text differs.');
  });

  it('does not promise the scene’s own warning to a render by the companion', () => {
    const notes = textVerificationNotes({ unknown: one, changed: two }, 'ce', false);
    expect(notes).toHaveLength(2);
    for (const note of notes) expect(note).not.toMatch(/The scene (checks|warns)/);
  });
});

describe('pythonReadiness', () => {
  const failing = (resolved: ResolvedFormula | null): FormulaRenderEntry => ({
    status: 'error',
    resolved,
    error: { message: 'Font text needs a companion.', backend: 'pango' },
  });

  it('writes a text that keeps a saved shape of its current source though it could not render', () => {
    // The project was switched to ManimGL with the companion off: the render of the text for
    // ManimGL fails, and its shape by ManimCE is still there.
    const { project, formula, resolved } = scene('ce');
    project.meta.target = 'gl';
    const entries = { [formula.id]: failing(resolved.get(formula.id)!) };
    expect(pythonReadiness(project, entries, resolved)).toEqual({ pending: [], unwritten: [] });
  });

  it('cannot write a text whose saved shape is of an earlier source, nor one never shaped', () => {
    const { project, formula, resolved } = scene('ce', 'AB', { source: 'ABC' });
    const entries = { [formula.id]: failing(resolved.get(formula.id)!) };
    expect(names(pythonReadiness(project, entries, resolved).unwritten)).toEqual(['title']);
    const never = scene('ce', 'AB', { snapshot: null, geometry: null });
    expect(
      names(
        pythonReadiness(never.project, { [never.formula.id]: failing(null) }, new Map()).unwritten,
      ),
    ).toEqual(['title']);
  });

  it('waits for a text that is being shaped', () => {
    const { project, formula, resolved } = scene('ce');
    const entries: Record<string, FormulaRenderEntry> = {
      [formula.id]: { status: 'loading', resolved: resolved.get(formula.id)!, error: null },
    };
    expect(names(pythonReadiness(project, entries, resolved).pending)).toEqual(['title']);
  });
});
