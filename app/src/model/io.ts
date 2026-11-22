/* Reading and writing `.mfe.json` project files: the project, and beside it the geometry of its
 * font texts, which the file carries and the project only names (docs/FORMAT.md). */
import { FORMAT_ID, FORMAT_VERSION } from './defaults';
import { repairGroups } from './groups';
import { repairFormulaGroups } from './formulaGroups';
import { newId, projectIdEntries } from './ids';
import { ProjectSchema } from './schema';
import { initializePairPrincipal } from './transfers';
import type { Project } from './types';
import { validateProject, type Issue } from './validate';

export const FILE_EXTENSION = '.mfe.json';

/** The geometry of font texts as a `.mfe.json` carries it, in its `textGeometry` section: each
 * payload under its content hash (`TextGeometryRef.contentHash`), as the JSON value it is. The
 * values are as they were read: `media/` checks each one (schema, limits, identity, hash)
 * before it is used. The project itself holds references only (`TextFormula.geometry`). */
export type EmbeddedTextGeometry = Readonly<Record<string, unknown>>;

export type ParseResult =
  | {
      ok: true;
      project: Project;
      issues: Issue[];
      migratedFrom: number | null;
      /** The geometry the file carries for texts of the project; nothing else of its
       * `textGeometry` section is kept. Empty for a file without the section. */
      textGeometry: EmbeddedTextGeometry;
    }
  | {
      ok: false;
      error: string;
      details: string[];
      /** Whether the file says it is a project of this app (its `format`): then it is a project
       * that does not open, and `error` is why; otherwise it is another kind of file. A list of a
       * folder's projects names the first and leaves the second out. */
      isProject: boolean;
    };

/** Upgraders from version n to n + 1, keyed by n. Each receives the raw JSON of version n. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v2: formulas gained `hiddenGlyphs` (glyphs left out of the intro).
  1: (raw) => ({
    ...raw,
    formulas: Array.isArray(raw.formulas)
      ? raw.formulas.map((f: unknown) => (isRecord(f) ? { hiddenGlyphs: [], ...f } : f))
      : raw.formulas,
  }),
  // v3: clip actions gained the animation blocks (appear, disappear, transform). A v2 file is
  // a valid v3 file; the version number only tells older apps that they cannot read it.
  2: (raw) => raw,
  // v4: formulas gained `intro`, the intro their new clips start with (null: the editor's
  // preference, which is what every new clip got before).
  3: (raw) => ({
    ...raw,
    formulas: Array.isArray(raw.formulas)
      ? raw.formulas.map((f: unknown) => (isRecord(f) ? { intro: null, ...f } : f))
      : raw.formulas,
  }),
  // v5: clip actions gained the `morph` kind (glyph pairs within the formula). A v4 file is a
  // valid v5 file; the version number only tells older apps that they cannot read it.
  4: (raw) => raw,
  // v6: glyph pairs gained `extras` (how several sources reach one target; D54). A v5 file is a
  // valid v6 file: without the field its pairs arrive separately, where Manim's alignment fused
  // them before (the look most people want; `merge` keeps the old one).
  5: (raw) => raw,
  // v7: projects gained `colorMatches`, the match colour lists of the Edit menu (D55).
  6: (raw) => ({ ...raw, colorMatches: [] }),
  // v8: glyph pairs gained `path`, a custom spline for their glyphs to follow (D48). A v7 file
  // is a valid v8 file; the version number only tells older apps that they cannot read it.
  7: (raw) => raw,
  // v9: formulas became objects of a `kind` — only 'math' exists yet (D61, D63). `latex` is the
  // kind's `source`, and a snapshot names the `backend` that made it (was `source`).
  8: (raw) => ({
    ...raw,
    formulas: Array.isArray(raw.formulas) ? raw.formulas.map(formulaToV9) : raw.formulas,
  }),
  // v10: clips gained `attach`, an object pegged to glyphs of another clip (R4, D65).
  9: (raw) => ({
    ...raw,
    clips: Array.isArray(raw.clips)
      ? raw.clips.map((c: unknown) => (isRecord(c) ? { ...c, attach: null } : c))
      : raw.clips,
  }),
  // v11: formulas gain the kind `brace` and attachments the rule `brace` (D66). A v10 file is a
  // valid v11 file; the version number only tells older apps that they cannot read it.
  10: (raw) => raw,
  // v12: attachments gain the rule `tip`, a label at the tip of a brace (D69). A v11 file is a
  // valid v12 file; the version number only tells older apps that they cannot read it.
  11: (raw) => raw,
  // v13: formulas gain the kind `shape` and attachments the rule `shape`, a box, circle,
  // underline or cross fitted to glyphs of another clip (D71). A v12 file is a valid v13 file;
  // the version number only tells older apps that they cannot read it.
  12: (raw) => raw,
  // v14: clip actions gain the kind `emphasis` (Indicate, Wiggle, Circumscribe, Flash, FocusOn on
  // some glyphs, D73) and the easing `there_and_back_with_pause`. A v13 file is a valid v14 file;
  // the version number only tells older apps that they cannot read it.
  13: (raw) => raw,
  // v15: copies pairs store their authored consuming source. Earlier files always selected the
  // lowest canonical source, regardless of the order of their source array.
  14: (raw) => ({
    ...raw,
    relations: Array.isArray(raw.relations) ? raw.relations.map(holderToV15) : raw.relations,
    clips: Array.isArray(raw.clips)
      ? raw.clips.map((clip: unknown) => {
          if (!isRecord(clip) || !Array.isArray(clip.actions)) return clip;
          return {
            ...clip,
            actions: clip.actions.map((action: unknown) =>
              isRecord(action) && action.kind === 'morph' ? holderToV15(action) : action,
            ),
          };
        })
      : raw.clips,
  }),
  // v16: dedicated audio rows and reusable sources. Every legacy row stays visual; its
  // preview visibility and lock state keep their original meaning.
  15: (raw) => ({
    ...raw,
    tracks: Array.isArray(raw.tracks)
      ? raw.tracks.map((track: unknown) =>
          isRecord(track) ? { ...track, kind: 'visual', muted: false } : track,
        )
      : raw.tracks,
    audioAssets: [],
    audioClips: [],
  }),
  // v17: literal Pango text and owned geometry payload references. Existing objects, audio
  // sources, glyph snapshots and keys already satisfy the new format without alteration.
  16: (raw) => raw,
  // v18: a `.mfe.json` can carry the geometry of its font texts in a `textGeometry` section, so
  // that a project with text and no audio is one JSON file (D82). A v17 file is a valid v18
  // file; the version number only tells older apps that they cannot read the section.
  17: (raw) => raw,
  // v19: a block that names glyphs can carry a `group`, the blocks of a clip with the same one
  // being one thing on the timeline (`groups.ts`). A v18 file has no groups and is a valid v19
  // file.
  18: (raw) => raw,
  // v20: a clip can carry `previewLocked`, which the preview reads and nothing else does. A v19
  // file has none and is a valid v20 file.
  19: (raw) => raw,
  // v21: the attachment of a brace or a shape can carry `also`, the glyphs of other clips it
  // spans as well. A v20 file has none and is a valid v21 file.
  20: (raw) => raw,
  // v22: a project can carry `formulaGroups`, the groups of formulas of the Creator's list
  // (`formulaGroups.ts`). A v21 file has none and is a valid v22 file.
  21: (raw) => raw,
  // v23: a shape can carry `fillColor`, a colour for its fill other than its stroke's, and a clip
  // state the paint of a shape that a Transform sets (`strokeWidth`, `strokeOpacity`,
  // `fillOpacity`, `fillColor`); a tween on a shape's clip can carry `fit`, the glyphs it carries
  // the shape to surround (D123). A v22 file has none of them and is a valid v23 file.
  22: (raw) => raw,
  // v24: an object can carry `startPosition`, where its new clips start (D124). A v23 file has
  // none and is a valid v24 file.
  23: (raw) => raw,
  // v25: a shape can be a `cross_line`, one line over a diagonal of its target's box, which its
  // `diagonal` names. A v24 file has none and is a valid v25 file.
  24: (raw) => raw,
  // v26: objects gain the kind `line` — a line, a dashed line, an arrow, a double arrow — and
  // attachments the rule `ends`, a line whose ends are on glyphs of other clips (D137). A v25
  // file has none and is a valid v26 file.
  25: (raw) => raw,
  // v27: an end of a line that is on glyphs says where on them it is (`anchor`, D140): the edge
  // Manim finds towards the other end (`auto`), which every v26 line has, or one of the nine
  // points of the glyphs' box.
  26: (raw) => ({
    ...raw,
    clips: Array.isArray(raw.clips) ? raw.clips.map(lineEndsToV27) : raw.clips,
  }),
  // v28: a line can be bent (`curve`: an arc or a spline, D145) and says the shape of its tips
  // (`tip`, `startTip`, D146). Every v27 line is straight, with Manim's triangle at each tip.
  27: (raw) => ({
    ...raw,
    formulas: Array.isArray(raw.formulas) ? raw.formulas.map(lineToV28) : raw.formulas,
  }),
  // v29: an arrow or a double arrow can come in with Manim's `GrowArrow` (`grow_arrow`, as an
  // intro or in an Appear block, D145). A v28 file has none and is a valid v29 file.
  28: (raw) => raw,
  // v30: a tween of a line can carry its two ends elsewhere (`ends`, D144). A v29 file has none
  // and is a valid v30 file: its tweens of lines move them as they are.
  29: (raw) => raw,
  // v31: a clip can start empty (`startsEmpty`: none of its glyphs comes in with the intro), and
  // two clips can have several relations (D165). A v30 file has neither and is a valid v31 file.
  30: (raw) => raw,
  // v32: a route of a pair — one source glyph on its way to one target glyph — can have a custom
  // path of its own (`GlyphPair.routes`), and pairs of one relation or Morph block can bring the
  // same target glyphs (D167). A v31 file has neither and is a valid v32 file.
  31: (raw) => raw,
  // v33: a clip can leave glyphs of its own out of its intro (`startHidden`, D178): what a split
  // gives its first half for the glyphs that only came on screen after the cut. And a relation, a
  // Morph block or a pair can have the style `fade_copy` (D185): a copy of the sources cross-fades
  // into the targets. A v32 file has neither and is a valid v33 file.
  32: (raw) => raw,
  // v34: a project can carry `camera`, the scene's camera (D190): its frame at 0 s, its target
  // cameras and its moves. A v33 file has none — the multicamera is off — and is a valid v34 file.
  33: (raw) => raw,
  // v35: a project can carry `slides`, the marks of the Slides mode (D200): pauses and comments at
  // instants of the scene. A v34 file has none — the mode is off — and is a valid v35 file.
  34: (raw) => raw,
  // v36: a pause of the Slides mode can skip its wait (`SlideMark.skipWait`, D202). A v35 file has
  // no such pause and is a valid v36 file.
  35: (raw) => raw,
};

function lineToV28(formula: unknown): unknown {
  if (!isRecord(formula) || formula.kind !== 'line') return formula;
  return { curve: null, tip: 'triangle', startTip: 'triangle', ...formula };
}

function lineEndsToV27(clip: unknown): unknown {
  if (!isRecord(clip) || !isRecord(clip.attach) || clip.attach.rule !== 'ends') return clip;
  const side = (end: unknown): unknown =>
    isRecord(end) && 'clipId' in end && !('anchor' in end) ? { ...end, anchor: 'auto' } : end;
  return {
    ...clip,
    attach: { ...clip.attach, start: side(clip.attach.start), end: side(clip.attach.end) },
  };
}

function holderToV15(holder: unknown): unknown {
  if (!isRecord(holder) || !Array.isArray(holder.pairs)) return holder;
  return {
    ...holder,
    pairs: holder.pairs.map((pair: unknown) => {
      if (!isRecord(pair) || pair.extras !== 'copies' || !Array.isArray(pair.from)) return pair;
      if (!pair.from.every((g: unknown) => typeof g === 'number' && Number.isInteger(g) && g >= 0))
        return pair;
      const principal = (pair.from as number[]).reduce<number | null>(
        (lowest, g) => (lowest === null || g < lowest ? g : lowest),
        null,
      );
      return { ...pair, principal };
    }),
  };
}

/** Copies authored through older/in-memory callers are materialized at the persistence boundary.
 * Explicit null is preserved; saving never repairs a missing principal by picking another glyph. */
function withPrincipals(project: Project): Project {
  return {
    ...project,
    relations: project.relations.map((r) => ({
      ...r,
      pairs: r.pairs.map(initializePairPrincipal),
    })),
    clips: project.clips.map((clip) => ({
      ...clip,
      actions: clip.actions.map((action) =>
        action.kind === 'morph'
          ? { ...action, pairs: action.pairs.map(initializePairPrincipal) }
          : action,
      ),
    })),
  };
}

/** Color lists have no persisted foreign keys. Keep every colliding list and its entries while
 * giving it its own identity; reserve all original IDs before generating any replacements. */
function repairColorMatchIds(project: Project): Issue[] {
  const entries = projectIdEntries(project);
  const counts = new Map<string, number>();
  for (const { id } of entries) counts.set(id, (counts.get(id) ?? 0) + 1);
  const reserved = new Set(counts.keys());
  const repairs: Issue[] = [];
  project.colorMatches.forEach((list, index) => {
    if (counts.get(list.id) === 1) return;
    const previous = list.id;
    let fresh: string;
    do {
      fresh = newId('m');
    } while (reserved.has(fresh));
    reserved.add(fresh);
    list.id = fresh;
    repairs.push({
      severity: 'warning',
      code: 'color-match-id-repaired',
      message: `Match colour list "${list.name}" shared id "${previous}". It received a new id; all its entries were kept.`,
      path: ['colorMatches', index, 'id'],
    });
  });
  return repairs;
}

/** A group whose blocks do not start and end together, or with a single block, is no group: its
 * blocks are left on their own, as they were before they were grouped, and nothing else of them
 * changes. */
function repairBlockGroups(project: Project): Issue[] {
  return repairGroups(project).map(({ clip, left }): Issue => ({
    severity: 'warning',
    code: 'animation-group-repaired',
    message: `${left.length === 1 ? 'An animation block was' : `${left.length} animation blocks were`} taken out of a group: the blocks of a group start together and last the same, and a group has at least two. Nothing else of ${left.length === 1 ? 'it' : 'them'} changed.`,
    path: ['clips', project.clips.indexOf(clip), 'actions'],
  }));
}

/** A group of formulas that names a formula the project has not, or one another group already
 * holds, loses it; a group left without formulas goes. The formulas themselves stay as they
 * are. */
function repairCreatorGroups(project: Project): Issue[] {
  const problems = repairFormulaGroups(project);
  if (problems.length === 0) return [];
  return [
    {
      severity: 'warning',
      code: 'formula-group-repaired',
      message:
        'The groups of formulas of the Creator were put right: a formula is in one group at most, a group holds formulas of the list that exist, and has a name. No formula changed.',
      path: ['formulaGroups'],
    },
  ];
}

function formulaToV9(formula: unknown): unknown {
  if (!isRecord(formula)) return formula;
  const { id, ...rest } = renameKey(formula, 'latex', 'source');
  const snapshot = isRecord(rest.snapshot)
    ? renameKey(rest.snapshot, 'source', 'backend')
    : rest.snapshot;
  // `kind` goes right after `id`; `snapshot` keeps its place (a later key keeps the first one's).
  return { id, kind: 'math', ...rest, snapshot };
}

/** `record` with `from` renamed to `to`, in place: a migrated file keeps its field order. */
function renameKey(
  record: Record<string, unknown>,
  from: string,
  to: string,
): Record<string, unknown> {
  if (!(from in record)) return record;
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k === from ? to : k, v]));
}

/** Parse a project file. Schema errors reject the file; semantic issues (validate.ts) are
 * returned alongside the project so the app can open it and show them. */
export function parseProject(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: 'The file is not valid JSON.',
      details: [String(e)],
      isProject: false,
    };
  }
  if (!isRecord(raw) || raw.format !== FORMAT_ID) {
    return {
      ok: false,
      error: 'This is not a Manim Formula Editor project.',
      details: [],
      isProject: false,
    };
  }
  // From here on the file says it is a project: what follows is why it does not open.
  const refused = (error: string, details: string[] = []): ParseResult => ({
    ok: false,
    error,
    details,
    isProject: true,
  });
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return refused('The project file has no valid version.');
  }
  if (version > FORMAT_VERSION) {
    return refused(
      `The project was saved by a newer version of the app (format ${version}; this app reads up to ${FORMAT_VERSION}).`,
    );
  }

  let current: Record<string, unknown> = raw;
  for (let v = version; v < FORMAT_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return refused(`No migration from format ${v}.`);
    current = { ...migrate(current), version: v + 1 };
  }

  // The section is the file's, not the project's: the project names its geometry by hash. One
  // that is not an object carries nothing: the project opens without it (its geometry can be
  // made again), and an issue says so.
  const { textGeometry: section, ...manifest } = current;
  const carried = isRecord(section) ? section : {};
  const parsed = ProjectSchema.safeParse(manifest);
  if (!parsed.success) {
    return refused(
      'The project file is malformed.',
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const project = withPrincipals(parsed.data);
  const repairs = [
    ...repairColorMatchIds(project),
    ...repairBlockGroups(project),
    ...repairCreatorGroups(project),
  ];
  if (section !== undefined && !isRecord(section)) {
    repairs.push({
      severity: 'warning',
      code: 'text-geometry-section',
      message:
        'The file’s textGeometry section is not an object of geometry by content hash. It was ignored: the font texts open without the appearance it should carry.',
      path: ['textGeometry'],
    });
  }
  return {
    ok: true,
    project,
    issues: [...repairs, ...validateProject(project)],
    migratedFrom: version === FORMAT_VERSION ? null : version,
    textGeometry: referencedGeometry(project, carried),
  };
}

/** The entries of a `textGeometry` section that texts of `project` name. */
function referencedGeometry(
  project: Project,
  section: Record<string, unknown>,
): EmbeddedTextGeometry {
  const kept: Record<string, unknown> = {};
  for (const formula of project.formulas) {
    const hash = formula.kind === 'text' ? formula.geometry?.contentHash : undefined;
    if (hash !== undefined && Object.hasOwn(section, hash)) kept[hash] = section[hash];
  }
  return kept;
}

/** Stable, human-readable JSON (2-space indent, trailing newline). `textGeometry`, when it has
 * entries, is written as the file's last section, sorted by hash and one geometry per line: the
 * line holds the very bytes its hash names (the compact JSON of the value), so a text shaped
 * again changes one line of the file and its hash can be checked by hand. */
export function serializeProject(
  project: Project,
  textGeometry: EmbeddedTextGeometry = {},
): string {
  const body = JSON.stringify(withPrincipals(project), null, 2);
  const lines = Object.keys(textGeometry)
    .sort()
    .map((hash) => `    ${JSON.stringify(hash)}: ${JSON.stringify(textGeometry[hash]) ?? 'null'}`);
  if (lines.length === 0) return body + '\n';
  // `body` ends with the brace that closes the project, on a line of its own.
  const open = body.slice(0, body.lastIndexOf('\n'));
  return `${open},\n  "textGeometry": {\n${lines.join(',\n')}\n  }\n}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
