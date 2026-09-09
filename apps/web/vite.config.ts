/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The web app talks to the API through this proxy, so it stays same-origin and needs no CORS.
    // That is true of the *web app* only. The embedded support SDK runs on a customer's own site
    // and is genuinely cross-origin; the API decides those requests per product — see
    // `apps/api/src/widget-cors.ts`.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Long-lived vendor code in its own chunk so app changes do not invalidate it.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router', '@tanstack/react-query'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    /**
     * How long one test may take before Vitest kills it. The default is five seconds.
     *
     * That default was the real ceiling on this suite: a test that renders a page, resolves three
     * or four queries and waits on each was dying at exactly 5000ms whenever the machine was
     * busy, in whichever file happened to be unlucky — and `asyncUtilTimeout` in the setup file
     * cannot help, because the test is killed before the longer wait it allows can finish.
     *
     * Twenty seconds is a ceiling, not a delay: a passing test never reaches it, and a genuinely
     * stuck query still fails at the five-second `asyncUtilTimeout` with a Testing Library error
     * naming what it could not find, which is a far better message than "timed out in 5000ms".
     * What this buys is that a green suite stops going red because something else on the box was
     * compiling at the time.
     */
    testTimeout: 20000,
  },
});
