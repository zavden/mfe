import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { deckRuntime } from './build/deckRuntime.ts';
import { distributionCheck } from './build/distributionCheck.ts';
import { thirdPartyNotices } from './build/thirdParty.ts';
import chromaSnapshot from './src/ui/chroma/snapshot.json' with { type: 'json' };

/** Serve and emit the same verified upstream files, without transforming their HTML or IIFE. */
function chromaDistribution(): Plugin {
  const contentTypes: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    md: 'text/plain; charset=utf-8',
    png: 'image/png',
    mp4: 'video/mp4',
  };
  const files = chromaSnapshot.files.map((file) => {
    const source = readFileSync(new URL(`./src/data/chroma-lab/${file.path}`, import.meta.url));
    if (
      source.length !== file.bytes ||
      createHash('sha256').update(source).digest('hex') !== file.sha256
    ) {
      throw new Error(`Chroma Lab snapshot does not match its manifest: ${file.path}`);
    }
    return { ...file, source, url: `/chroma-lab/${file.path}` };
  });
  return {
    name: 'mfe:chroma-distribution',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0];
        if (!pathname?.startsWith('/chroma-lab/')) return next();
        const file = files.find((entry) => entry.url === pathname);
        if (!file || !['GET', 'HEAD'].includes(request.method ?? '')) {
          response.statusCode = 404;
          response.end('Chroma Lab resource not found.');
          return;
        }
        const extension = file.path.split('.').at(-1) ?? '';
        response.setHeader('Content-Type', contentTypes[extension] ?? 'text/plain; charset=utf-8');
        response.setHeader('Content-Length', file.source.length);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(request.method === 'HEAD' ? undefined : file.source);
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: `chroma-lab/${file.path}`, source: file.source });
      }
    },
  };
}

/**
 * Chrome blocks `<script type="module">` and `crossorigin` stylesheets on file:// (opaque origin,
 * CORS). To keep the production build openable from disk and from webviews we emit a single IIFE
 * bundle and rewrite index.html to load it as a classic deferred script without `crossorigin`.
 */
function fileProtocolFriendlyHtml(): Plugin {
  return {
    name: 'mfe:file-protocol-friendly-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/<script type="module" crossorigin /g, '<script defer ')
          .replace(/ crossorigin(?==|>|\s)/g, '');
      },
    },
  };
}

// The product's configuration: the development server and the build. How the tests run is said
// apart, over this one (`vitest.config.ts`).
// `base: './'` keeps asset URLs relative so the build works from file:// and webviews.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    fileProtocolFriendlyHtml(),
    chromaDistribution(),
    deckRuntime(),
    thirdPartyNotices(),
    distributionCheck(),
  ],
  build: {
    rolldownOptions: {
      output: { format: 'iife', codeSplitting: false },
    },
  },
});
