/* What the production build must not contain. The check runs inside `vite build`: a build that
 * fails it does not exist. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Libraries the project does not distribute, each with a mark its compiled code carries.
 *
 * FFmpeg's libraries are LGPL (or GPL): a build that embeds them cannot be handed over under the
 * project's own terms alone. That is why the app encodes AAC with the browser's own encoder and
 * has none of its own. A WebAssembly build keeps the library's source paths
 * (`libavcodec/aacenc.c`) and its version tag (`Lavc63.25.101`), also when it is embedded in a
 * script as text. The bare tags `Lavc` and `Lavf` are not a mark: a demuxer that reads the
 * encoder tag of an MP3 names them.
 *
 * The marks catch the library as it was once embedded here, and as a plain WebAssembly file. They
 * do not see one that is compressed or encoded, or fetched when the app runs: the guard against
 * a package under such a licence is the list of allowed licences in `thirdParty.ts`. (A build
 * without minification may keep a comment of a library that cites FFmpeg's sources, and fail.) */
export const NOT_DISTRIBUTED: readonly { name: string; mark: RegExp }[] = [
  {
    name: 'FFmpeg (libavcodec and its sister libraries)',
    mark: /libav(?:codec|format|util|filter|device)|libsw(?:resample|scale)|Lav[cf]\d/,
  },
];

/** The names of the libraries of `NOT_DISTRIBUTED` whose mark is in this code. */
export function undistributable(code: string): string[] {
  return NOT_DISTRIBUTED.filter(({ mark }) => mark.test(code)).map(({ name }) => name);
}

/** Scripts and WebAssembly only: media may say which encoder wrote it. */
const CODE = /\.(?:m?js|wasm)$/;

/** Fails the build when a script or WebAssembly module it emits contains one of them, or one
 * of the public folder, which Vite copies into the build as it is. Put it after the plugins
 * that emit files. */
export function distributionCheck(): Plugin {
  let publicDir = '';
  return {
    name: 'mfe:distribution-check',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const check = (fileName: string, code: string) => {
        const found = undistributable(code);
        if (found.length > 0)
          this.error(
            `${fileName} contains ${found.join(' and ')}, which this project does not distribute. ` +
              'See build/distributionCheck.ts.',
          );
      };
      for (const [fileName, file] of Object.entries(bundle)) {
        if (!CODE.test(fileName)) continue;
        check(
          fileName,
          file.type === 'chunk'
            ? file.code
            : typeof file.source === 'string'
              ? file.source
              : Buffer.from(file.source).toString('latin1'),
        );
      }
      if (!publicDir || !existsSync(publicDir)) return;
      for (const name of readdirSync(publicDir, { recursive: true, encoding: 'utf8' })) {
        const path = join(publicDir, name);
        // The listing names a file by the system's separator: `codecs\aac.wasm` on Windows.
        if (CODE.test(name) && statSync(path).isFile())
          check(`public/${name.replaceAll('\\', '/')}`, readFileSync(path).toString('latin1'));
      }
    },
  };
}
