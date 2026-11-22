/* The type files of an exported page's folder, made from the sources at the build (the plugin of
 * `deckRuntime.ts` gives them to the app with the runtime): `types/scene.d.ts`, the project that
 * `scene.js` holds — `src/model/types.ts` as it is, with its comments —, and `types/mfe.d.ts`, the
 * API of `window.MFE` — the interfaces `src/deck/index.ts` exports and declares, and every type
 * they use, taken from the runtime's sources with their comments. So the reference an agent reads
 * is the code the page runs, and cannot go stale.
 *
 * The declarations are read with the TypeScript compiler's parser (loaded when the files are
 * made, not when this module is imported). A name a declaration uses is followed to where its
 * file imports it from: another file of `src/deck/` gives its declaration too, the model gives an
 * import from `./scene`, and a name nobody declares is a global of the browser (`HTMLElement`).
 * `typeof X` of a constant becomes the constant's literal type. `src/export/html/__tests__/
 * deckTypes.test.ts` type-checks what this makes. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type * as TS from 'typescript';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** The files the type files are made of, relative to `src/`: the model's types and the runtime's
 * public index (which leads to the rest). */
export const MODEL_TYPES = 'model/types.ts';
export const DECK_INDEX = 'deck/index.ts';

export interface DeckTypeFiles {
  /** `types/mfe.d.ts`. */
  mfe: string;
  /** `types/scene.d.ts`. */
  scene: string;
  /** The sources read, relative to `src/`. */
  sources: string[];
}

type Declaration = TS.InterfaceDeclaration | TS.TypeAliasDeclaration;

interface Parsed {
  path: string;
  file: TS.SourceFile;
  declarations: Map<string, Declaration>;
  /** A name imported, by the source it comes from (relative to `src/`, or `model`). */
  imports: Map<string, string>;
  /** Constants with a literal value, by name: what `typeof X` stands for. */
  literals: Map<string, string>;
}

const loadTypeScript = (): typeof TS => createRequire(import.meta.url)('typescript') as typeof TS;

/** `../model`, `../model/types`, `./options` from `deck/index.ts` → `model`, `deck/options.ts`. */
function resolveSource(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  const joined = parts.join('/');
  if (joined === 'model' || joined === 'model/types' || joined === 'model/index') return 'model';
  return `${joined.replace(/\.ts$/, '')}.ts`;
}

function parse(ts: typeof TS, path: string, text: string): Parsed {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const declarations = new Map<string, Declaration>();
  const imports = new Map<string, string>();
  const literals = new Map<string, string>();
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    } else if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const source = resolveSource(path, statement.moduleSpecifier.text);
      const bindings = statement.importClause?.namedBindings;
      if (source && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) imports.set(element.name.text, source);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const variable of statement.declarationList.declarations) {
        const init = variable.initializer;
        if (
          ts.isIdentifier(variable.name) &&
          init &&
          (ts.isNumericLiteral(init) || ts.isStringLiteral(init))
        ) {
          literals.set(variable.name.text, init.getText(file));
        }
      }
    }
  }
  return { path, file, declarations, imports, literals };
}

/** The roots of `mfe.d.ts`: the interfaces and types `deck/index.ts` declares and exports, and the
 * ones it re-exports (`export type { Deck } from './deck'`), in its order. */
function roots(ts: typeof TS, index: Parsed): { name: string; source: string }[] {
  const out: { name: string; source: string }[] = [];
  for (const statement of index.file.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      out.push({ name: statement.name.text, source: index.path });
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const source = resolveSource(index.path, statement.moduleSpecifier.text);
      if (!source || source === 'model') continue;
      for (const element of statement.exportClause.elements) {
        out.push({ name: element.name.text, source });
      }
    }
  }
  // The runtime itself first: it is where a reader starts.
  return out.sort((a, b) => Number(b.name === 'MfeRuntime') - Number(a.name === 'MfeRuntime'));
}

/** The text of a declaration as a `.d.ts` gives it: its doc comment, then itself, exported, with
 * `typeof CONSTANT` written as the constant's literal type. */
function declarationText(ts: typeof TS, parsed: Parsed, node: Declaration): string {
  const { file } = parsed;
  const full = file.getFullText();
  const docs = (ts.getLeadingCommentRanges(full, node.pos) ?? [])
    .filter((range) => full.slice(range.pos, range.pos + 3) === '/**')
    .map((range) => full.slice(range.pos, range.end));
  const start = node.getStart(file);
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (child: TS.Node) => {
    if (ts.isTypeQueryNode(child) && ts.isIdentifier(child.exprName)) {
      const literal = parsed.literals.get(child.exprName.text);
      if (literal === undefined) {
        throw new Error(
          `${parsed.path}: ${node.name.text} uses typeof ${child.exprName.text}, which is not a constant with a literal value: the type files cannot say what it is.`,
        );
      }
      edits.push({ start: child.getStart(file) - start, end: child.end - start, text: literal });
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  let text = full.slice(start, node.end);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  if (!/^export\s/.test(text)) text = `export ${text}`;
  return [...docs, text].join('\n');
}

/** The names of types a declaration refers to, but its own type parameters. */
function referencedNames(ts: typeof TS, node: Declaration): string[] {
  const own = new Set((node.typeParameters ?? []).map((parameter) => parameter.name.text));
  const names: string[] = [];
  const visit = (child: TS.Node) => {
    if (ts.isTypeReferenceNode(child) && ts.isIdentifier(child.typeName)) {
      names.push(child.typeName.text);
    } else if (ts.isExpressionWithTypeArguments(child) && ts.isIdentifier(child.expression)) {
      names.push(child.expression.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names.filter((name) => !own.has(name));
}

const MFE_HEAD = `/* types/mfe.d.ts — the API of mfe-runtime.js: \`window.MFE\` and the deck it mounts, with the
 * comments of the runtime's own sources. Generated at the export: a reference, not something to
 * edit. To have it in an editor that reads types, start custom.js with
 *
 *   // @ts-check
 *   /// <reference path="types/mfe.d.ts" />
 *
 * Units: everything the stage gives (deck.box, deck.glyphBox, the layers) is the stage's SVG,
 * y down; positions in scene.js are Manim's, y up. The same numbers, y turned. */
`;

const SCENE_HEAD = `/* types/scene.d.ts — the project that scene.js holds (\`MFE.scene(name, project)\`): the file
 * format of Manim Formula Editor, as the editor's own model declares it, with its comments. Those
 * comments name files of the editor's source (\`validate.ts\`, \`lifetime.ts\`…), which are not in
 * this folder: read them as the names of rules. The page applies the same rules, and
 * \`node check.mjs\` says which one a scene breaks. Generated at the export: a reference, not
 * something to edit. Positions here are Manim's: y up. */

`;

/** The type files, made of the sources as `read` gives them (paths relative to `src/`). */
export function deckTypeFiles(
  read: (path: string) => string = (path) => readFileSync(`${SRC}${path}`, 'utf8'),
): DeckTypeFiles {
  const ts = loadTypeScript();
  const sources = new Set<string>([MODEL_TYPES, DECK_INDEX]);

  // scene.d.ts: the model's types, which are all types and import nothing.
  const modelText = read(MODEL_TYPES);
  const model = parse(ts, MODEL_TYPES, modelText);
  for (const statement of model.file.statements) {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) {
      throw new Error(
        `${MODEL_TYPES} holds something other than interfaces and types (${ts.SyntaxKind[statement.kind]}): types/scene.d.ts is that file as it is, and must stay a file of declarations alone.`,
      );
    }
  }
  const scene = SCENE_HEAD + modelText.replace(/\n*$/, '\n');

  // mfe.d.ts: from the runtime's index, following what each declaration uses.
  const files = new Map<string, Parsed>();
  const fileOf = (path: string): Parsed => {
    let parsed = files.get(path);
    if (!parsed) {
      parsed = parse(ts, path, read(path));
      files.set(path, parsed);
      sources.add(path);
    }
    return parsed;
  };
  const written = new Map<string, string>(); // name → the file it was taken from
  const texts: string[] = [];
  const fromScene = new Set<string>();
  const queue = roots(ts, fileOf(DECK_INDEX));
  while (queue.length > 0) {
    const { name, source } = queue.shift()!;
    if (source === 'model') {
      if (!model.declarations.has(name)) {
        throw new Error(
          `the runtime's API uses ${name} of the model, which ${MODEL_TYPES} does not declare: types/scene.d.ts would not have it.`,
        );
      }
      fromScene.add(name);
      continue;
    }
    const known = written.get(name);
    if (known !== undefined) {
      if (known !== source) {
        throw new Error(
          `two types named ${name} (${known}, ${source}) in the runtime's API: types/mfe.d.ts can hold one.`,
        );
      }
      continue;
    }
    const parsed = fileOf(source);
    const node = parsed.declarations.get(name);
    if (!node) {
      const from = parsed.imports.get(name);
      if (from) {
        queue.unshift({ name, source: from });
        continue;
      }
      throw new Error(`${source} does not declare ${name}, which the runtime's API names.`);
    }
    written.set(name, source);
    texts.push(declarationText(ts, parsed, node));
    for (const used of referencedNames(ts, node)) {
      if (parsed.declarations.has(used)) queue.push({ name: used, source });
      else if (parsed.imports.has(used))
        queue.push({ name: used, source: parsed.imports.get(used)! });
      // Anything else is a global of the browser or of the language (HTMLElement, Record).
    }
  }
  const imports =
    fromScene.size === 0
      ? ''
      : `import type { ${[...fromScene].sort().join(', ')} } from './scene';\n\n`;
  const mfe =
    MFE_HEAD +
    '\n' +
    imports +
    texts.join('\n\n') +
    '\n\ndeclare global {\n' +
    '  /** The runtime, once mfe-runtime.js has run. */\n' +
    '  var MFE: MfeRuntime;\n' +
    '}\n';
  return { mfe, scene, sources: [...sources] };
}
