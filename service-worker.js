import { manifest, version } from "@parcel/service-worker";

async function install() {
  const cache = await caches.open(version);

  await cache.addAll([
    ...manifest
      .filter((p) => !p.endsWith(".html"))
      // filter out `functions/api/*` from cached URLs
      .filter((p) => !p.endsWith(".js") || p.match(/\.[0-9a-f]{8}\.js$/)),
    ...manifest
      .filter((p) => p.endsWith(".html"))
      .map((p) => p.replace(/\.html$/, "").replace(/^\/index$/, "/")),
  ]);

  const keys = await cache.keys();
  for (const request of keys) {
    const response = await caches.match(request);
    if (response && !response.ok) {
      cache.delete(request);
    }
  }

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

        if (response.ok) {
          const cache = await caches.open(version);
          cache.put(e.request, response.clone());
        }
        return response;
      }

      const r = (await caches.match(e.request)) || (await caches.match("/"));

      if (r) {
        return r;
      }

      const response = await fetch(e.request.url);
      if (response.ok) {
        const cache = await caches.open(version);
        cache.put(e.request, response.clone());
      }
      return response;
    })()
  );
});
