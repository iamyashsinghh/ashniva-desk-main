/**
 * The `<script>` tag entry point.
 *
 * A page that loads `ashniva-support.iife.js` gets a single global, `AshnivaSupport`, carrying
 * everything the module build exports. Kept as its own entry rather than pointed at `index.ts` so
 * that the global's shape is a deliberate decision written in one place — a page cannot import a
 * named export, so anything not on this object is unreachable from a script tag, and adding to it
 * is a change somebody makes on purpose.
 */
export * from './index';
