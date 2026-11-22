// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  createAttach,
  createClip,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
  createTrack,
  defaultIntro,
  defaultOutro,
  FORMAT_VERSION,
  glyphTransfers,
  parseProject,
  remapGlyphRefs,
  serializeProject,
  sourceRoles,
  validateProject,
  type GlyphPair,
  type RelationStyle,
} from '../index';
import { boxSnapshot } from './fixtures';

const plain = { intro: defaultIntro('none'), outro: defaultOutro('none') };
type PrincipalPair = GlyphPair & { principal?: number | null };

/** A project file as JSON holds it, as far as these tests reach into it. */
interface RawPair {
  from: number[];
  principal?: number | null;
}
interface RawHolder {
  pairs?: RawPair[];
}
interface RawProject {
  version: number;
  audioAssets?: unknown;
  audioClips?: unknown;
  tracks: { kind?: string; muted?: boolean }[];
  relations: RawHolder[];
  clips: { actions: RawHolder[] }[];
}

function scene() {
  const project = createEmptyProject('Preserve the authored source');
  project.tracks.push(createTrack('Later'), createTrack('Attached'));
  const source = createFormula({
    name: 'source',
    source: 'a+b',
    snapshot: boxSnapshot(['a', '+', 'b']),
  });
  const target = createFormula({ name: 'target', source: 'x', snapshot: boxSnapshot(['x']) });
  const later = createFormula({ name: 'later', source: 'y', snapshot: boxSnapshot(['y']) });
  project.formulas.push(source, target, later);
  const a = createClip(source.id, project.tracks[0]!.id, 0, 8, plain);
  const b = createClip(target.id, project.tracks[1]!.id, 2, 8, plain);
  const c = createClip(later.id, project.tracks[2]!.id, 4, 8, plain);
  project.clips.push(a, b, c);
  const relation = createRelation(a.id, b.id, {
    pairs: [{ from: [0, 2], to: [0], style: null, extras: 'copies' }],
  });
  const copy = createRelation(a.id, c.id, {
    style: 'copy',
    pairs: [{ from: [2], to: [0], style: null }],
  });
  project.relations.push(relation, copy);
  return { project, source, a, b, c, relation };
}

describe('authored consuming principal', () => {
  it('keeps the same source through a reorder, later copies, attachment lifetime and reopening', () => {
    const { project, source, a, relation } = scene();
    const label = createFormula({ name: 'label', source: 'z', snapshot: boxSnapshot(['z']) });
    project.formulas.push(label);
    project.clips.push(
      createClip(label.id, project.tracks[3]!.id, 5.5, 8, {
        ...plain,
        attach: createAttach(a.id, [2]),
      }),
    );
    expect(validateProject(project)).toEqual([]);
    remapGlyphRefs(project, source.id, [2, 1, 0]);
    source.source = 'b+a';
    source.snapshot = boxSnapshot(['b', '+', 'a']);
    const pair = relation.pairs[0]! as PrincipalPair;
    expect(pair.from).toEqual([2, 0]);
    expect(sourceRoles(pair, relation.style)).toEqual({ consumed: [2], copied: [0], lead: 2 });
    expect(pair.principal).toBe(2);
    expect(validateProject(project)).toEqual([]);
    expect(clipLifetimes(project).get(a.id)!.stints.get(0)!.at(-1)!.exit.end).toBe(8);
    const reopened = parseProject(serializeProject(project));
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) throw new Error(reopened.error);
    expect(reopened.project.version).toBe(FORMAT_VERSION);
    expect(reopened.project.relations[0]!.pairs[0]).toMatchObject({ principal: 2 });
    expect(reopened.issues).toEqual([]);
  });

  it.each<RelationStyle>(['transform', 'fade', 'copy'])(
    'uses the stored principal with a %s override',
    (style) => {
      const pair: PrincipalPair = { from: [0, 2], to: [0], style, extras: 'copies', principal: 2 };
      expect(sourceRoles(pair, style)).toEqual(
        style === 'copy'
          ? { consumed: [], copied: [0, 2], lead: null }
          : { consumed: [2], copied: [0], lead: 2 },
      );
    },
  );

  it('keeps a Morph principal through remapping both sides and a pair style override', () => {
    const { project, source, a } = scene();
    project.relations = [];
    source.source = 'a+b=c';
    source.snapshot = boxSnapshot(['a', '+', 'b', '=', 'c']);
    const morph = createMorph(2, {
      style: 'copy',
      pairs: [{ from: [0, 2], to: [4], style: 'fade', extras: 'copies' }],
    });
    a.actions.push(morph);
    remapGlyphRefs(project, source.id, [2, 1, 0, 3, 4]);
    source.snapshot = boxSnapshot(['b', '+', 'a', '=', 'c']);
    const pair = glyphTransfers(project)[0]!.pairs[0]!;
    expect(sourceRoles(pair, pair.style)).toEqual({ consumed: [2], copied: [0], lead: 2 });
    expect(validateProject(project)).toEqual([]);
  });

  it.each([false, true])('retains a lost principal for repair (all sources lost: %s)', (all) => {
    const { project, source, relation } = scene();
    remapGlyphRefs(project, source.id, [null, 0, all ? null : 1]);
    source.snapshot = boxSnapshot(all ? ['+'] : ['+', 'b']);
    expect(relation.pairs).toHaveLength(1);
    const pair = relation.pairs[0]! as PrincipalPair;
    expect(pair).toMatchObject({ from: all ? [] : [1], principal: null });
    expect(sourceRoles(pair, 'transform').consumed).toEqual([]);
    expect(validateProject(project).map((i) => i.code)).toContain('pair-principal');
    if (all) expect(validateProject(project).map((i) => i.code)).toContain('pair-empty');
    // A copy override cannot silently heal the missing authored source.
    pair.style = 'copy';
    expect(validateProject(project).map((i) => i.code)).toContain('pair-principal');
    const transfer = glyphTransfers(project).find((t) => t.key === `relation:${relation.id}`)!;
    expect(transfer.pairs[0]!.from).toEqual([]);
    expect(transfer.pairs[0]!.to).toEqual([]);
    const reopened = parseProject(serializeProject(project));
    if (!reopened.ok) throw new Error(reopened.error);
    expect(reopened.project.relations[0]!.pairs[0]).toMatchObject({ principal: null });
    expect(reopened.issues.map((i) => i.code)).toContain('pair-principal');
  });

  /** The scene as a version 14 file holds it: no `principal` on any pair, plain tracks and no
   * audio (formats 15 and 16 brought those). `edit` touches the raw pairs before it is read. */
  function fileV14(edit: (relationPair: RawPair, morphPair: RawPair) => void = () => {}): string {
    const { project, a } = scene();
    a.actions.push(
      createMorph(1, { pairs: [{ from: [0, 2], to: [1], style: null, extras: 'copies' }] }),
    );
    const raw = JSON.parse(JSON.stringify(project)) as RawProject;
    raw.version = 14;
    delete raw.audioAssets;
    delete raw.audioClips;
    for (const track of raw.tracks) {
      delete track.kind;
      delete track.muted;
    }
    const holders = [...raw.relations, ...raw.clips.flatMap((clip) => clip.actions)];
    for (const holder of holders) for (const pair of holder.pairs ?? []) delete pair.principal;
    edit(raw.relations[0]!.pairs![0]!, raw.clips[0]!.actions[0]!.pairs![0]!);
    return JSON.stringify(raw);
  }

  it('reads a version 14 file: a copies pair consumes its lowest source, whatever their order', () => {
    // Version 14 stored no principal and always consumed the lowest source, however the file
    // listed them.
    const text = fileV14((relationPair, morphPair) => {
      relationPair.from = [2, 0];
      morphPair.from = [2, 0];
    });
    expect(text).not.toContain('principal');
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.migratedFrom).toBe(14);
    expect(parsed.issues).toEqual([]);
    const [copies, copy] = parsed.project.relations;
    expect(copies!.pairs[0]).toMatchObject({ from: [2, 0], extras: 'copies', principal: 0 });
    const morph = parsed.project.clips[0]!.actions[0]!;
    expect(morph.kind === 'morph' && morph.pairs[0]).toMatchObject({ from: [2, 0], principal: 0 });
    // A pair that copies nothing has no principal to store.
    expect(copy!.pairs[0]).not.toHaveProperty('principal');
    expect(sourceRoles(copies!.pairs[0]!, copies!.style)).toEqual({
      consumed: [0],
      copied: [2],
      lead: 0,
    });
    // Saved again, the choice is in the file.
    const saved = JSON.parse(serializeProject(parsed.project)) as RawProject;
    expect(saved.version).toBeGreaterThan(14);
    expect(saved.relations[0]!.pairs![0]!.principal).toBe(0);
    expect(saved.clips[0]!.actions[0]!.pairs![0]!.principal).toBe(0);
  });

  it('reads a version 14 file by the rule of its version, not by a field that version never had', () => {
    // Only the migration can tell: without it, the parser would take the stray field as the
    // authored choice of a later format and consume glyph 2.
    const parsed = parseProject(
      fileV14((relationPair, morphPair) => {
        relationPair.principal = 2;
        morphPair.principal = 2;
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project.relations[0]!.pairs[0]).toMatchObject({ principal: 0 });
    const morph = parsed.project.clips[0]!.actions[0]!;
    expect(morph.kind === 'morph' && morph.pairs[0]).toMatchObject({ principal: 0 });
  });
});
