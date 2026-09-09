import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The component gallery.
 *
 * Its own Vite config rather than a Storybook, because Vite and the React plugin are already
 * devDependencies of this package and Storybook is ~40 packages for a page that renders components
 * — and this repository has no story tooling to fit into. `pnpm --filter @ashniva/ui gallery`.
 */
export default defineConfig({
  root: resolve(import.meta.dirname, 'gallery'),
  plugins: [react()],
  server: { port: 5174 },
});
