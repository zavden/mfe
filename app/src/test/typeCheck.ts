/* Type-checks files held in memory with the TypeScript compiler, as an editor that reads types
 * would check them: the type files of an exported page's folder, and code written against them
 * (a `custom.js` with `// @ts-check`). Node only. */
import ts from 'typescript';

const ROOT = '/mfe-folder/';

/** The diagnostics of `files` (paths relative to a folder of their own: `types/mfe.d.ts`,
 * `custom.js`), as `path:line: message` lines; none when they check. The browser's library is
 * there (the DOM), Node's is not; JavaScript is checked as with `// @ts-check` everywhere. */
export function typeCheck(files: Readonly<Record<string, string>>): string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    strict: true,
    noEmit: true,
    allowJs: true,
    checkJs: true,
    skipLibCheck: false,
    skipDefaultLibCheck: true,
  };
  const host = ts.createCompilerHost(options, true);
  const inMemory = (name: string) =>
    name.startsWith(ROOT) ? files[name.slice(ROOT.length)] : undefined;
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, ...rest) => {
    const text = inMemory(name);
    return text === undefined
      ? getSourceFile(name, language, ...rest)
      : ts.createSourceFile(name, text, language, true);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => inMemory(name) !== undefined || fileExists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => inMemory(name) ?? readFile(name);
  const directoryExists = host.directoryExists?.bind(host);
  host.directoryExists = (name) => {
    if (!name.startsWith(ROOT.slice(0, -1))) return directoryExists?.(name) ?? true;
    const folder = name.endsWith('/') ? name : `${name}/`;
    return Object.keys(files).some((path) => (ROOT + path).startsWith(folder));
  };
  host.realpath = (name) => name;
  host.getCurrentDirectory = () => ROOT;
  const program = ts.createProgram(
    Object.keys(files).map((path) => ROOT + path),
    options,
    host,
  );
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName.replace(ROOT, '')}:${line + 1}: ${message}`;
  });
}

/** The names of the interfaces and the type aliases a declaration file declares. */
export function declaredNames(text: string): Set<string> {
  const file = ts.createSourceFile('x.d.ts', text, ts.ScriptTarget.Latest, false);
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      names.add(statement.name.text);
    }
  }
  return names;
}

/** The members of an interface a declaration file declares, by their names. */
export function interfaceMembers(text: string, name: string): string[] {
  const file = ts.createSourceFile('x.d.ts', text, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) {
      return statement.members.flatMap((member) =>
        member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
          ? [member.name.text]
          : [],
      );
    }
  }
  return [];
}
