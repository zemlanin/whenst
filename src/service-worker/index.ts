declare const self: ServiceWorkerGlobalScope;

// import { manifest, version } from "@parcel/service-worker";
const manifest = "TODO";
const version = "TODO";
import { generateIntlTimezones } from "../../shared/generateIntlTimezones.js";
import { authCheck, sync } from "./db.js";

async function install() {
  const cache = await caches.open(version);
  const uniqManifest = [...new Set(manifest)];

  await cache.addAll([
    ...uniqManifest.filter(
      (p) => !p.endsWith(".html") && !p.endsWith(".webmanifest"),
    ),
    ...uniqManifest
      .filter((p) => p.endsWith(".html"))
      .map((p) => p.replace(/\/index\.html$/, "").replace(/^\/home$/, "/")),
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
self.addEventListener("install", (e) => e.waitUntil(install()));

async function activate() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => key !== version && caches.delete(key)));
}
self.addEventListener("activate", (e) => e.waitUntil(activate()));
self.addEventListener("message", (e) => {
  if (e.data === "sync") {
    return sync();
  }

  if (e.data === "authCheck") {
    return authCheck();
  }
});

self.addEventListener("fetch", (e) => {
  const { origin, pathname } = new URL(e.request.url);

  if (origin !== location.origin) {
    return;
  }

  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/timezones-index")
  ) {
    return;
  }

  if (
    navigator.onLine &&
    (pathname.endsWith(".woff") ||
      pathname.endsWith(".woff2") ||
      pathname.endsWith(".webmanifest"))
  ) {
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

      const cachedResponse = await getResponseWithIndexFallback(e.request);
      if (cachedResponse) {
        fetchAndCache(e.request);

        return cachedResponse;
      }

      if (pathname.startsWith("/api/timezones-index")) {
        const timezones = generateIntlTimezones();

        fetchAndCache(e.request);

        const resp = new Response(JSON.stringify({ timezones }));
        resp.headers.set("content-type", "application/json");

        return resp;
      }

      return fetchAndCache(e.request);
    })(),
  );
});

async function getResponseWithIndexFallback(request: Request) {
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

async function fetchAndCache(request: Request) {
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

const favoriteColor = "#" + Math.random().toString(16).slice(2, 8);

self.addEventListener("message", (event) => {
  if (event.data.type === "GET_VERSION") {
    event.ports[0].postMessage(version);
  }

  if (event.data.type === "GET_COLOR") {
    event.ports?.[0].postMessage(favoriteColor);
  }
});
