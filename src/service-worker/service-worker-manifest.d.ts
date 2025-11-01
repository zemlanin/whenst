/**
 * Fake module added by custom `service-worker-manifest` esbuild plugin
 *
 * @see `scripts/build.js`
 * */
declare module "service-worker-manifest" {
  /** Hash/version of the service worker */
  export const version: string;
  /** List of URLs service worker should cache */
  export const manifest: string[];
}
