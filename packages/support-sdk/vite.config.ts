import { defineConfig } from 'vite';

/**
 * The module builds: ESM for bundlers, CJS for anything still on `require`.
 *
 * Two entry points, because `react` is a peer dependency and an optional one. A plain-JavaScript
 * host importing the package must never end up with React in its bundle, and a separate `react`
 * entry is what guarantees that rather than relying on a bundler's tree-shaking to notice.
 *
 * `dist` is real, `files` names it, and `exports` maps both formats — the `@ashniva/types`
 * packaging convention. The `@ashniva/ui` convention of exporting `src` directly is right for a
 * package only this repository consumes and wrong for one a customer installs: it would ship
 * TypeScript that their build has to compile with our compiler options.
 */
export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        react: 'src/react.ts',
      },
      formats: ['es', 'cjs'],
      fileName: (format, name) => (format === 'es' ? `esm/${name}.js` : `cjs/${name}.cjs`),
    },
    rollupOptions: {
      // Never bundled: the host's copy of React is the one the hook must use, and two copies in
      // one page is the classic invalid-hook-call failure.
      external: ['react'],
    },
  },
});
