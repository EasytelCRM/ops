import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const APP_VERSION = `v${pkg.version}`;

/**
 * The old single-file app checked for a new deploy by re-fetching index.html and
 * reading its <meta name="version">. Vite emits hash-named bundles, so instead the
 * build drops a tiny version.json next to index.html for the same poll to read.
 */
function emitVersionFile(): Plugin {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the app from /ops/; the preview build overrides this with /ops/next/.
  base: process.env.BASE_PATH ?? '/ops/',
  plugins: [react(), emitVersionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
