import { defineConfig } from 'vite';

/**
 * The `<script>` tag build.
 *
 * Its own config because an IIFE has exactly one entry and one global, which the multi-entry
 * module build cannot express. React is left out entirely: a page loading a script tag has no
 * bundler, so the React integration is not something it could use anyway, and including it would
 * double the file for nothing.
 *
 * `emptyOutDir: false` so this build does not delete the module build that ran before it.
 */
export default defineConfig({
  build: {
    sourcemap: true,
    emptyOutDir: false,
    outDir: 'dist/browser',
    lib: {
      entry: 'src/browser.ts',
      name: 'AshnivaSupport',
      formats: ['iife', 'umd'],
      fileName: (format) => `ashniva-support.${format}.js`,
    },
  },
});
