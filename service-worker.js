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

let staleAPICache = false;

self.addEventListener("fetch", (e) => {
  const { origin, pathname } = new URL(e.request.url);

  if (origin !== location.origin) {
    return;
  }

  if (e.request.method !== "GET") {
    if (pathname.startsWith("/api/")) {
      staleAPICache = true;
    }

    return;
  }

  e.respondWith(
    (async () => {
      if (!navigator.onLine) {
        const r = await getResponseWithIndexFallback(e.request);

        if (r) {
          return r;
        }
      }

      if (pathname.startsWith("/api/") && staleAPICache) {
        const response = fetchAndCache(e.request);
        staleAPICache = false;
        return response;
      }

      const cachedResponse = await getResponseWithIndexFallback(e.request);
      if (cachedResponse) {
        fetchAndCache(e.request);

        return cachedResponse;
      }

      return fetchAndCache(e.request);
    })()
  );
});

async function getResponseWithIndexFallback(request) {
  const { pathname } = new URL(request.url);

  const r = await caches.match(request);
  if (r) {
    return r;
  }

  if (!pathname.includes(".") && !pathname.startsWith("/api/")) {
    const index = await caches.match("/");

    if (index) {
      return index;
    }
  }
}

async function fetchAndCache(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (err) {
    const r = await getResponseWithIndexFallback(request);

    if (r) {
      return r;
    }

    throw err;
  }

  if (response.ok) {
    const cache = await caches.open(version);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("message", (event) => {
  console.log(event.data);
  if (event.data.type === "GET_VERSION") {
    event.ports[0].postMessage(version);
  }

  if (event.data.type === "GET_COLOR") {
    (async () => {
      const cache = await caches.open(version);
      let response = await cache.match("/_fake/color");
      let text;

      if (response) {
        text = await response.text();
      } else {
        text = "#" + Math.random().toString(16).slice(2, 8);
        response = new Response(text);
        await cache.put("/_fake/color", response);
      }

      console.log(event.ports);
      console.log(text);

      event.ports?.[0].postMessage(text);
    })();
  }
});
