// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROJECT_LICENSE } from '../projectLicense';
import {
  ACKNOWLEDGEMENTS,
  ALLOWED_LICENSES,
  componentsModule,
  distributionProblems,
  EMBEDDED,
  installed,
  licenseFiles,
  NOT_BUNDLED,
  noticesText,
  packageOf,
  repositoryUrl,
  runtimePackages,
  thirdPartyComponents,
} from '../thirdParty';

const json = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const runtime = runtimePackages(json('package-lock.json'));
const components = thirdPartyComponents();
const packages = components.filter((component) => !component.within);
const flat = (text: string) => text.replace(/\s+/g, ' ');

describe('the runtime packages of the lockfile', () => {
  it('each have a notice, or the reason the build does not contain them', () => {
    const noticed = new Set(packages.map((component) => component.name));
    for (const entry of runtime)
      expect(noticed.has(entry.name) !== entry.name in NOT_BUNDLED, entry.name).toBe(true);
    // Nothing is excused that the lockfile no longer has.
    for (const name of Object.keys(NOT_BUNDLED))
      expect(
        runtime.some((entry) => entry.name === name),
        name,
      ).toBe(true);
  });

  it('are the installed ones: the licence texts are read from them', () => {
    for (const entry of runtime) expect(installed(entry), entry.path).toBe(true);
  });

  it('are used as published: no overrides that would make "unmodified" untrue', () => {
    expect(json('package.json').overrides).toBeUndefined();
  });
});

describe('the components of the build', () => {
  // A change here is a change in what the project distributes: read the new licence first.
  it('are these, under these licences', () => {
    expect(
      components.map(
        ({ name, license, within }) =>
          `${name}: ${license}${within ? ` (in ${within.replace(/ [\d.]+$/, '')})` : ''}`,
      ),
    ).toEqual([
      'immer: MIT',
      'mathjax-full: Apache-2.0',
      'mathlive: MIT',
      'mediabunny: MPL-2.0',
      'mhchemparser: Apache-2.0',
      'mp4-muxer: MIT',
      'react: MIT',
      'react-dom: MIT',
      'react-resizable-panels: MIT',
      'scheduler: MIT',
      'webm-muxer: MIT',
      'zod: MIT',
      'zundo: MIT',
      'zustand: MIT',
      'KaTeX fonts: OFL-1.1 (in mathlive)',
      'KaTeX: MIT (in mathlive)',
      'Manim Community Edition: MIT (in Manim Formula Editor)',
      'ManimGL: MIT (in Manim Formula Editor)',
      'Color.js: MIT (in Chroma Lab)',
      'Colour: BSD-3-Clause (in Chroma Lab)',
    ]);
  });

  it('have only licences the project decided it can distribute', () => {
    for (const component of components)
      expect(ALLOWED_LICENSES, component.name).toContain(component.license);
    // In particular nothing under the LGPL or the GPL: the reason the AAC encoder left.
    expect(ALLOWED_LICENSES.some((license) => /GPL/.test(license))).toBe(false);
    expect(runtime.map((entry) => entry.name)).not.toContain('@mediabunny/aac-encoder');
  });

  it('each bring the text of the licence they declare', () => {
    const opening: Record<string, RegExp> = {
      MIT: /Permission is hereby granted, free of charge, to any person obtaining a copy/,
      'Apache-2.0': /Apache License\s+Version 2\.0, January 2004/,
      'BSD-3-Clause': /Redistribution and use in source and binary forms, with or without/,
      'MPL-2.0': /Mozilla Public License Version 2\.0/,
      'OFL-1.1': /SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007/,
    };
    for (const component of components)
      expect(flat(component.text), component.name).toMatch(opening[component.license]!);
  });

  // The Apache-2.0 and MPL-2.0 texts are the bare licence ("Copyright [yyyy] [name…]").
  it('name a copyright holder, in the licence text or beside it', () => {
    for (const component of components)
      expect(`${component.holder ?? ''}\n${component.text}`, component.name).toMatch(
        /^\s*Copyright (\(c\)|\d{4})/m,
      );
  });

  it('that come inside a package leave with it', () => {
    const names = new Set(packages.map((component) => component.name));
    for (const entry of EMBEDDED.filter((entry) => /^[a-z@]/.test(entry.within ?? '')))
      expect(names, entry.name).toContain(entry.within);
  });
});

describe('the licence files of a package', () => {
  it('are its licence and, when it has one, its NOTICE', () => {
    expect(licenseFiles(['README.md', 'LICENSE', 'package.json'], 'x')).toEqual(['LICENSE']);
    expect(licenseFiles(['LICENSE.txt', 'NOTICE', 'index.js'], 'x')).toEqual([
      'LICENSE.txt',
      'NOTICE',
    ]);
    expect(licenseFiles(['COPYING', 'licensed.js'], 'x')).toEqual(['COPYING']);
  });

  it('must be there, and must not be a choice between two', () => {
    expect(() => licenseFiles(['README.md', 'index.js'], 'node_modules/x')).toThrow(
      'node_modules/x has no license file to reproduce.',
    );
    expect(() => licenseFiles(['LICENSE-MIT', 'LICENSE-APACHE'], 'node_modules/x')).toThrow(
      'node_modules/x has several license files (LICENSE-MIT, LICENSE-APACHE): say which apply.',
    );
  });

  it('come with an address a reader can open', () => {
    expect(repositoryUrl({ url: 'git+https://github.com/arnog/mathlive.git' })).toBe(
      'https://github.com/arnog/mathlive',
    );
    expect(repositoryUrl('github:mhchem/mhchemParser')).toBe(
      'https://github.com/mhchem/mhchemParser',
    );
    expect(repositoryUrl({ url: 'git://github.com/a/b.git' })).toBe('https://github.com/a/b');
    expect(repositoryUrl(undefined)).toBeNull();
    for (const component of packages) expect(component.repository).toMatch(/^https:\/\//);
  });
});

describe('the notices file', () => {
  const text = noticesText(components);

  it('lists every component with its licence, then reproduces every licence text', () => {
    for (const component of components) {
      const heading = [component.name, component.version].filter(Boolean).join(' ');
      expect(text).toMatch(
        new RegExp(`^  ${heading.replace(/[.()]/g, '\\$&')}.* ${component.license}$`, 'm'),
      );
      expect(text).toContain(component.text);
    }
  });

  it('says where the source code of an MPL component is (MPL-2.0, section 3.2)', () => {
    const mediabunny = packages.find((component) => component.name === 'mediabunny')!;
    expect(flat(text)).toContain(
      `mediabunny ${mediabunny.version} is distributed under the Mozilla Public License 2.0. ` +
        'Its Source Code Form is available from ' +
        `https://registry.npmjs.org/mediabunny/-/mediabunny-${mediabunny.version}.tgz and from ` +
        `https://github.com/Vanilagy/mediabunny (tag v${mediabunny.version}).`,
    );
  });

  it('gives the fonts the source they have: the package that carries them', () => {
    const fonts = components.find((component) => component.name === 'KaTeX fonts')!;
    const mathlive = packages.find((component) => component.name === 'mathlive')!;
    expect(fonts.source).toBe(mathlive.source);
    expect(fonts.source).toMatch(/^https:\/\/registry\.npmjs\.org\/mathlive\/-\/mathlive-.*\.tgz$/);
  });

  it('acknowledges what the build draws on without containing it, claiming no licence for it', () => {
    expect(ACKNOWLEDGEMENTS).toHaveLength(1);
    expect(flat(text)).toContain(`ACKNOWLEDGEMENTS ${ACKNOWLEDGEMENTS[0]}`);
    expect(components.map((component) => component.name)).not.toContain('Computer Modern CMEX10');
  });

  it('names the holders the bare licence texts leave out, and the project licence beside it', () => {
    expect(text).toContain('Copyright (c) 2015-2023 Martin Hensel');
    expect(flat(text)).toContain('Copyright (c) 2009-2022 The MathJax Consortium');
    expect(text).toContain('with Reserved Font Names KaTeX_AMS, KaTeX_Caligraphic');
    // The project's own, and Chroma Lab's with it: the words of the one module that names it
    // (`projectLicense.test.ts` pins them), before the list.
    expect(PROJECT_LICENSE.notices.length).toBeGreaterThan(0);
    for (const paragraph of PROJECT_LICENSE.notices) {
      expect(flat(text)).toContain(paragraph);
      expect(flat(text).indexOf(paragraph)).toBeLessThan(flat(text).indexOf('COMPONENTS '));
    }
    expect(flat(text)).toContain(`under the ${PROJECT_LICENSE.title}: see LICENSE.txt`);
  });
});

describe('the list the app shows (virtual:third-party)', () => {
  it('is the list of the notices, without the texts, and the words on the project’s licence', () => {
    const lines = componentsModule(components).trimEnd().split('\n');
    const value = (line: string | undefined, name: string): unknown => {
      const head = `export const ${name} = `;
      expect(line?.startsWith(head) && line.endsWith(';'), name).toBe(true);
      return JSON.parse(line!.slice(head.length, -1));
    };
    expect(lines).toHaveLength(2);
    expect(value(lines[0], 'components')).toEqual(
      components.map(({ name, version, license, within }) => ({ name, version, license, within })),
    );
    // What the dialogs show of it; the paragraphs of the notices stay in the build.
    const { name, title, dialog } = PROJECT_LICENSE;
    expect(value(lines[1], 'projectLicense')).toEqual({ name, title, dialog });
  });
});

describe('a build output against the notices', () => {
  const bundled = new Set(packages.map((component) => component.name));
  const fonts = [
    'assets/KaTeX_Main-Regular-B22Nviop.woff2',
    'assets/KaTeX_Size1-Regular-mCD8mA8B.woff2',
  ];

  it('agrees when it holds exactly the declared packages and their fonts', () => {
    expect(
      distributionProblems({ packages: bundled, files: [...fonts, 'index.html'] }, components),
    ).toEqual([]);
  });

  it('is refused when it holds a package without a notice', () => {
    expect(
      distributionProblems(
        { packages: new Set([...bundled, 'left-pad', 'esm']), files: [] },
        components,
      ),
    ).toEqual([
      'esm is in the build but has no notice (NOT_BUNDLED says: a dependency of mathjax-full that none of its modules loads).',
      'left-pad is in the build but has no notice.',
    ]);
  });

  it('is refused when a declared package is no longer in it', () => {
    const without = new Set(bundled);
    without.delete('zundo');
    expect(distributionProblems({ packages: without, files: [] }, components)).toEqual([
      'zundo has a notice but is not in the build: add it to NOT_BUNDLED.',
    ]);
  });

  it('is refused when it holds a font no component accounts for', () => {
    expect(
      distributionProblems(
        { packages: bundled, files: [...fonts, 'assets/Inter-Regular-abc.woff2'] },
        components,
      ),
    ).toEqual(['The font assets/Inter-Regular-abc.woff2 belongs to no component of EMBEDDED.']);
  });

  it('finds the package of a module or an asset, scoped and nested ones too', () => {
    expect(packageOf('/repo/app/node_modules/react-dom/cjs/react-dom-client.production.js')).toBe(
      'react-dom',
    );
    expect(packageOf('/repo/app/node_modules/@scope/name/index.js?commonjs-proxy')).toBe(
      '@scope/name',
    );
    expect(
      packageOf('/repo/app/node_modules/mediabunny/node_modules/@types/dom-webcodecs/index.d.ts'),
    ).toBe('@types/dom-webcodecs');
    // An asset is named from the project root, without a leading slash: a package that reaches
    // the build only through one (a font, an image of its style sheet) has no module to show.
    expect(packageOf('node_modules/mathlive/fonts/KaTeX_AMS-Regular.woff2')).toBe('mathlive');
    expect(packageOf('node_modules/@scope/name/logo.svg')).toBe('@scope/name');
    expect(packageOf('src/ui/my_node_modules/logo.svg')).toBeNull();
    expect(packageOf('C:\\repo\\app\\node_modules\\zod\\index.js')).toBe('zod');
    expect(packageOf('/repo/app/src/main.tsx')).toBeNull();
    expect(packageOf('\0rolldown/runtime.js')).toBeNull();
  });
});
