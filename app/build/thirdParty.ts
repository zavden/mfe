/* The third-party components of the production build, and the notices that go with it.
 *
 * `package-lock.json` says which packages may reach the bundle (the ones that are not
 * development-only), at which version, under which licence and from which tarball; the installed
 * package gives the licence text as its authors distribute it. What is not an npm package of its
 * own (fonts inside one, code a package adapted from another project, data the app itself took
 * from one, the libraries inside Chroma Lab) is listed by hand in `EMBEDDED`, and the build
 * cannot check that list beyond its fonts: it is as complete as the review that wrote it.
 *
 * Three things keep the list honest:
 * - a unit test: every runtime package of the lockfile is either a component, with an allowed
 *   licence and its licence text, or in `NOT_BUNDLED` with the reason;
 * - the build (`thirdPartyNotices`): every package that puts a module or an asset in the output
 *   must be a component, so nothing is distributed without its notice; every package component
 *   must put something there, so the list does not go stale; and every font file must belong
 *   to a declared component;
 * - `distributionCheck.ts`, for what must not be there at all.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { PROJECT_LICENSE } from './projectLicense.ts';

const APP_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(APP_DIR + path, 'utf8');

/** The licences a component of the distribution may have (SPDX identifiers): permissive ones,
 * the file-level copyleft of MPL-2.0 (met by saying where the source is) and the SIL Open Font
 * License for fonts. Any other licence needs a decision before it is added here. */
export const ALLOWED_LICENSES: readonly string[] = [
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'MPL-2.0',
  'OFL-1.1',
];

/** Runtime dependencies of the lockfile that the build does not contain, and why. The build
 * fails if one of them turns up in the output. */
export const NOT_BUNDLED: Readonly<Record<string, string>> = {
  '@types/dom-mediacapture-transform': 'type declarations only',
  '@types/dom-webcodecs': 'type declarations only',
  '@types/react': 'type declarations only',
  '@types/wicg-file-system-access': 'type declarations only',
  csstype: 'type declarations only',
  esm: 'a dependency of mathjax-full that none of its modules loads',
  'mj-context-menu': 'the menu of MathJax, which the app does not use',
  'speech-rule-engine': 'the speech output of MathJax, which the app does not use',
  '@xmldom/xmldom': 'used by speech-rule-engine only',
  commander: 'used by speech-rule-engine only',
  'wicked-good-xpath': 'used by speech-rule-engine only',
};

/** What the licence file of a package does not say: who holds the copyright when the file is
 * the bare licence text, and what else the package carries. From the package's own sources. */
const PACKAGE_NOTES: Readonly<Record<string, { holder?: string; note?: string }>> = {
  'mathjax-full': {
    holder:
      'Copyright (c) 2009-2022 The MathJax Consortium; the color extension, ' +
      'Copyright (c) 2018-2022 Omar Al-Ithawi and The MathJax Consortium',
    note:
      'Includes the glyph outlines and metrics of the MathJax TeX fonts, which the package ' +
      'distributes as part of its sources, under the same license.',
  },
  mhchemparser: { holder: 'Copyright (c) 2015-2023 Martin Hensel' },
  mediabunny: { holder: 'Copyright (c) 2026-present, Vanilagy and contributors' },
  'react-dom': {
    note: 'Includes an input-event feature test taken from Modernizr 3.0.0pre (MIT).',
  },
};

/** One thing the build contains that is not this project's own work. */
export interface Component {
  name: string;
  /** `null` for a part that has no version of its own. */
  version: string | null;
  /** SPDX identifier, one of `ALLOWED_LICENSES`. */
  license: string;
  /** The component this one comes inside (a package, Chroma Lab, the app itself), if any. */
  within: string | null;
  /** The copyright line, when the licence text below does not carry it. */
  holder: string | null;
  /** Where the exact source is. */
  source: string | null;
  repository: string | null;
  note: string | null;
  /** The licence text, as distributed by the authors. */
  text: string;
}

/** A component that is not a package of the lockfile. `within` names the lockfile package it
 * arrives in, when there is one: if that package leaves the build, so must the entry. */
interface Embedded extends Omit<Component, 'text' | 'holder' | 'repository'> {
  /** The licence text, relative to `app/`. */
  file: string;
  /** The font files of the output this component accounts for. */
  fonts?: RegExp;
}

const APP = 'Manim Formula Editor';
const CHROMA = 'Chroma Lab';

export const EMBEDDED: readonly Embedded[] = [
  {
    name: 'KaTeX fonts',
    version: null,
    license: 'OFL-1.1',
    within: 'mathlive',
    // They are the files of the MathLive package: its tarball is where they come from.
    source: null,
    note:
      'The KaTeX_*.woff2 font files that MathLive carries, unmodified, in assets/ (the build ' +
      'puts the ones under 4 KiB inside the script instead).',
    file: 'build/licenses/KaTeX-fonts-OFL.txt',
    fonts: /^assets\/KaTeX_[A-Za-z0-9]+-[A-Za-z]+-[\w-]+\.woff2$/,
  },
  {
    name: 'KaTeX',
    version: null,
    license: 'MIT',
    within: 'mathlive',
    source: 'https://github.com/KaTeX/KaTeX',
    note:
      'MathLive adapts code of KaTeX: its stretchy accents and arrows, whose outlines come ' +
      'from the KaTeX fonts.',
    file: 'build/licenses/KaTeX-LICENSE.txt',
  },
  {
    name: 'Manim Community Edition',
    version: '0.22.1',
    license: 'MIT',
    within: APP,
    source: 'https://github.com/ManimCommunity/manim/tree/v0.22.1',
    note:
      'The outline of the brace (the path template of manim/mobject/svg/brace.py) is part of ' +
      'the geometry of the app, so that the preview draws the brace Manim draws. The rate ' +
      'functions a ManimCE project is played with are ports of manim/utils/rate_functions.py, ' +
      'so that it eases as Manim does.',
    file: 'build/licenses/ManimCE-LICENSE.txt',
  },
  {
    name: 'ManimGL',
    version: '1.7.2',
    license: 'MIT',
    within: APP,
    source: 'https://github.com/3b1b/manim/tree/v1.7.2',
    note:
      'The rate functions a ManimGL project is played with are ports of ' +
      'manimlib/utils/rate_functions.py, so that it eases as Manim does.',
    file: 'build/licenses/ManimGL-LICENSE.txt',
  },
  {
    name: 'Color.js',
    version: '0.5.2',
    license: 'MIT',
    within: CHROMA,
    source: 'https://github.com/color-js/color.js/tree/v0.5.2',
    note: 'Unmodified, inside chroma-lab/app.bundle.js.',
    file: 'src/data/chroma-lab/vendor/COLORJS-LICENSE',
  },
  {
    name: 'Colour',
    version: '0.4.6',
    license: 'BSD-3-Clause',
    within: CHROMA,
    source: 'https://github.com/colour-science/colour/tree/v0.4.6',
    note:
      'Chroma Lab converts its color-vision-deficiency tables (Machado et al. 2009) and adapts its ' +
      'CIECAM02 and CAM16 equations; see chroma-lab/vendor/README.md.',
    file: 'src/data/chroma-lab/vendor/COLOUR-LICENSE',
  },
];

/** Work the build draws on without containing it: named, as its authors may like, with no
 * licence to reproduce. A drawing made with a font is not the font (the SIL Open Font License
 * leaves what is created with a font to its author; OFL-FAQ 1.1 and 1.13). */
export const ACKNOWLEDGEMENTS: readonly string[] = [
  'The brace drawn for ManimGL is a drawing made with the Computer Modern font CMEX10 ' +
    '(Copyright (c) 1997, 2009 American Mathematical Society; SIL Open Font License 1.1): ' +
    "four of its six pieces follow the outlines of that font's brace glyphs, as ManimGL " +
    'holds them for \\underbrace.',
];

interface LockEntry {
  version?: string;
  resolved?: string;
  license?: string;
  dev?: boolean;
}

export interface LockedPackage {
  /** Its key in the lockfile: where it is installed, relative to `app/`. */
  path: string;
  name: string;
  version: string;
  license: string | null;
  resolved: string | null;
}

/** The packages of the lockfile that are not development-only, one per installed copy. */
export function runtimePackages(lock: { packages: Record<string, LockEntry> }): LockedPackage[] {
  return Object.entries(lock.packages)
    .filter(([path, entry]) => path !== '' && !entry.dev)
    .map(([path, entry]) => ({
      path,
      name: path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length),
      version: entry.version ?? '',
      license: entry.license ?? null,
      resolved: entry.resolved ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

const lockfile = () =>
  JSON.parse(read('package-lock.json')) as { packages: Record<string, LockEntry> };

/** Which files of a package directory hold its licence: the licence file, and the NOTICE file
 * when there is one (Apache-2.0 asks for it). Exactly one licence file: with none there is
 * nothing to reproduce, and with two a choice would silently drop one. */
export function licenseFiles(files: readonly string[], where: string): string[] {
  const licenses = files.filter((file) => /^(licen[sc]e|copying)(\.|-|$)/i.test(file));
  if (licenses.length !== 1)
    throw new Error(
      licenses.length === 0
        ? `${where} has no license file to reproduce.`
        : `${where} has several license files (${licenses.join(', ')}): say which apply.`,
    );
  return [...licenses, ...files.filter((file) => /^notice(\.|$)/i.test(file))];
}

/** A text as its authors wrote it, without the blank lines around it. */
const verbatim = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();

function licenseText(packagePath: string): string {
  return licenseFiles(readdirSync(APP_DIR + packagePath), packagePath)
    .map((file) => verbatim(read(`${packagePath}/${file}`)))
    .join('\n\n');
}

/** The `repository` of a package.json as an address a reader can open. */
export function repositoryUrl(repository: string | { url?: string } | undefined): string | null {
  const url = typeof repository === 'string' ? repository : repository?.url;
  if (!url) return null;
  return url
    .replace(/^github:/, 'https://github.com/')
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
}

function repositoryOf(packagePath: string): string | null {
  const { repository } = JSON.parse(read(`${packagePath}/package.json`)) as {
    repository?: string | { url?: string };
  };
  return repositoryUrl(repository);
}

/** Every third-party component of the build: the bundled packages of the lockfile, then what
 * comes embedded in them, in the app and in Chroma Lab. */
export function thirdPartyComponents(): Component[] {
  const packages = runtimePackages(lockfile()).filter((entry) => !(entry.name in NOT_BUNDLED));
  const hosts = new Map(packages.map((entry) => [entry.name, entry]));
  return [
    ...packages.map((entry): Component => ({
      name: entry.name,
      version: entry.version,
      license: entry.license ?? 'UNKNOWN',
      within: null,
      holder: PACKAGE_NOTES[entry.name]?.holder ?? null,
      source: entry.resolved,
      repository: repositoryOf(entry.path),
      note: PACKAGE_NOTES[entry.name]?.note ?? null,
      text: licenseText(entry.path),
    })),
    ...EMBEDDED.map((entry): Component => {
      const host = hosts.get(entry.within ?? '');
      return {
        name: entry.name,
        version: entry.version,
        license: entry.license,
        within: host ? `${entry.within} ${host.version}` : entry.within,
        holder: null,
        source: entry.source ?? host?.resolved ?? null,
        repository: null,
        note: entry.note,
        text: verbatim(read(entry.file)),
      };
    }),
  ];
}

const RULE = '='.repeat(78);
const THIN = '-'.repeat(78);

/** Hard-wrap a paragraph for the notices file. */
function wrap(text: string, indent = ''): string {
  const lines: string[] = [];
  let line = indent;
  for (const word of text.split(/\s+/)) {
    if (line.length > indent.length && line.length + 1 + word.length > 78) {
      lines.push(line);
      line = indent;
    }
    line += (line.length > indent.length ? ' ' : '') + word;
  }
  return [...lines, line].join('\n');
}

const title = (component: Component) =>
  [component.name, component.version].filter(Boolean).join(' ') +
  (component.within ? ` (in ${component.within})` : '');

/** `licenses/THIRD-PARTY-NOTICES.txt`: the list, where the sources are, and every licence text. */
export function noticesText(components: readonly Component[]): string {
  const width = Math.max(...components.map((component) => title(component).length));
  const copyleft = components.filter((component) => component.license === 'MPL-2.0');
  const parts = [
    'MANIM FORMULA EDITOR: THIRD-PARTY NOTICES',
    RULE,
    // What the project's own work is under: said in one place (`projectLicense.ts`).
    ...PROJECT_LICENSE.notices.map((paragraph) => wrap(paragraph)),
    wrap(
      'This file is written by the build from app/package-lock.json and the installed ' +
        'packages (app/build/thirdParty.ts). Keep it, and LICENSE.txt, with every copy of ' +
        'the build.',
    ),
    'COMPONENTS\n' +
      components
        .map((component) => `  ${title(component).padEnd(width)}  ${component.license}`)
        .join('\n'),
    'SOURCE CODE\n' +
      wrap(
        'The packages are included as their authors publish them, without modification, ' +
          'compiled into assets/ by the build. The address given with each component is ' +
          'where its source is; for a package, it is the exact tarball its authors published.',
      ) +
      copyleft
        .map(
          (component) =>
            '\n\n' +
            wrap(
              `${title(component)} is distributed under the Mozilla Public License 2.0. Its ` +
                `Source Code Form is available from ${component.source}` +
                (component.repository
                  ? ` and from ${component.repository} (tag v${component.version}).`
                  : '.'),
            ),
        )
        .join(''),
    'ACKNOWLEDGEMENTS\n' + ACKNOWLEDGEMENTS.map((text) => wrap(text)).join('\n\n'),
    ...components.map((component) =>
      [
        RULE,
        title(component),
        `License: ${component.license}`,
        ...(component.holder ? [wrap(component.holder)] : []),
        ...(component.source ? [`Source: ${component.source}`] : []),
        ...(component.repository ? [`Repository: ${component.repository}`] : []),
        ...(component.note ? [wrap(component.note)] : []),
        THIN,
        component.text,
      ].join('\n'),
    ),
  ];
  return parts.join('\n\n') + '\n';
}

/** The package a module or an asset of the build comes from, `null` for the project's own. A
 * module is named by its absolute path; an asset from the project root (`node_modules/…`). */
export function packageOf(id: string): string | null {
  const path = `/${id.replace(/^\0+/, '').split('?')[0]!.replaceAll('\\', '/')}`;
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const [first, second] = path.slice(at + '/node_modules/'.length).split('/');
  return first!.startsWith('@') ? `${first}/${second}` : first!;
}

/** What is wrong between a build output and the declared components: packages in the output
 * without a notice, package components the output does not contain, fonts nobody accounts for. */
export function distributionProblems(
  output: { packages: ReadonlySet<string>; files: readonly string[] },
  components: readonly Component[],
): string[] {
  const declared = new Set(
    components.filter((component) => !component.within).map((component) => component.name),
  );
  const problems: string[] = [];
  for (const name of [...output.packages].sort())
    if (!declared.has(name))
      problems.push(
        `${name} is in the build but has no notice` +
          (name in NOT_BUNDLED ? ` (NOT_BUNDLED says: ${NOT_BUNDLED[name]}).` : '.'),
      );
  for (const name of [...declared].sort())
    if (!output.packages.has(name))
      problems.push(`${name} has a notice but is not in the build: add it to NOT_BUNDLED.`);
  const fonts = EMBEDDED.flatMap((entry) => (entry.fonts ? [entry.fonts] : []));
  for (const file of output.files)
    if (/\.(woff2?|ttf|otf|eot)$/i.test(file) && !fonts.some((pattern) => pattern.test(file)))
      problems.push(`The font ${file} belongs to no component of EMBEDDED.`);
  return problems;
}

export const NOTICES_FILE = 'licenses/THIRD-PARTY-NOTICES.txt';
export const LICENSE_FILE = 'licenses/LICENSE.txt';

/** The module the app imports to list the components (Help → Third-party licenses): the same
 * list as the notices, without the texts, and the words that name the project's own licence
 * (`projectLicense.ts`; the notices are the build's alone). Typed in `src/vite-env.d.ts`. */
export const COMPONENTS_MODULE = 'virtual:third-party';

export function componentsModule(components: readonly Component[]): string {
  const list = components.map(({ name, version, license, within }) => ({
    name,
    version,
    license,
    within,
  }));
  const { name, title, dialog } = PROJECT_LICENSE;
  return (
    `export const components = ${JSON.stringify(list)};\n` +
    `export const projectLicense = ${JSON.stringify({ name, title, dialog })};\n`
  );
}

/** Writes the notices and the project's own licence into the build (and serves them in
 * development, where the same links must work), gives the app the list of components, and
 * fails a build whose content and notices disagree. Put it after the plugins that emit files. */
export function thirdPartyNotices(): Plugin {
  const files = () => ({
    [NOTICES_FILE]: noticesText(thirdPartyComponents()),
    [LICENSE_FILE]: read('../LICENSE'),
  });
  return {
    name: 'mfe:third-party-notices',
    resolveId(id) {
      return id === COMPONENTS_MODULE ? `\0${COMPONENTS_MODULE}` : null;
    },
    load(id) {
      return id === `\0${COMPONENTS_MODULE}` ? componentsModule(thirdPartyComponents()) : null;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]?.replace(/^\//, '') ?? '';
        if (path !== NOTICES_FILE && path !== LICENSE_FILE) return next();
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end(files()[path]);
      });
    },
    generateBundle(_options, bundle) {
      const packages = new Set<string>();
      const add = (id: string) => {
        const name = packageOf(id);
        if (name) packages.add(name);
      };
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.moduleIds.forEach(add);
        else file.originalFileNames.forEach(add);
      }
      const problems = distributionProblems(
        { packages, files: Object.keys(bundle) },
        thirdPartyComponents(),
      );
      if (problems.length > 0)
        this.error(`Third-party notices (build/thirdParty.ts):\n- ${problems.join('\n- ')}`);
      for (const [fileName, source] of Object.entries(files()))
        this.emitFile({ type: 'asset', fileName, source });
    },
  };
}

/** Whether the installed tree is the lockfile's: the notices are read from it. */
export function installed(entry: LockedPackage): boolean {
  if (!existsSync(`${APP_DIR}${entry.path}/package.json`)) return false;
  const { version } = JSON.parse(read(`${entry.path}/package.json`)) as { version: string };
  return version === entry.version;
}
