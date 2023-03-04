import { manifest, version } from "@parcel/service-worker";

async function install() {
  const cache = await caches.open(version);
  await cache.addAll([
    ...manifest,
    "/",
    ...manifest
      .filter((p) => p.endsWith(".html"))
      .map((p) => p.replace(/\.html$/, "")),
  ]);

  self.skipWaiting();
}
addEventListener("install", (e) => e.waitUntil(install()));

async function activate() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => key !== version && caches.delete(key)));
}
addEventListener("activate", (e) => e.waitUntil(activate()));

self.addEventListener("fetch", (e) => {
  const { origin, pathname } = new URL(e.request.url);

  if (origin !== location.origin) {
    return;
  }

  if (e.request.method !== "GET") {
    return;
  }

  e.respondWith(
    (async () => {
      if (pathname.startsWith("/api/")) {
        let response;

        try {
          response = await fetch(e.request);
        } catch (err) {
          const r = await caches.match(e.request);
          if (r) {
            return r;
          }

          throw err;
        }

        const cache = await caches.open(version);
        cache.put(e.request, response.clone());
        return response;
      }

      const r = await caches.match(
        pathname.endsWith(".html") ? pathname.replace(/\.html$/, "") : e.request
      );
      if (r) {
        return r;
      }

      const index = await caches.match("/");
      if (index) {
        return index;
      }

      return fetch(e.request.url);
    })()
  );
});
