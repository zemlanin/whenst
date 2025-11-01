/**
 * Fake module added by custom `service-worker-manifest` esbuild plugin
 *
 * @see `scripts/build.js`
 * */
declare module "service-worker-manifest" {
  /** Hash/version of the service worker */
  export const version: string;
  /** Lists of URLs service worker should cache */
  export const manifest: string[];
  export const pages: string[];
}
