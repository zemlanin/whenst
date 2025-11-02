declare const self: ServiceWorkerGlobalScope;

import { manifest, version, pages } from "service-worker-manifest";
import { generateIntlTimezones } from "../../shared/generateIntlTimezones.js";
import { authCheck, sync } from "./db.js";

async function install() {
  self.skipWaiting();

  if (navigator.connection?.saveData === true) {
    const handleConnectionChange = () => {
      if (navigator.connection?.saveData === false) {
        navigator.connection.removeEventListener(
          "change",
          handleConnectionChange,
        );
        void precacheEverything();
      }
    };
    navigator.connection.addEventListener("change", handleConnectionChange);
    return;
  }

  await precacheEverything();
}
async function precacheEverything() {
  const cache = await caches.open(version);
  await cache.addAll(manifest);
}
self.addEventListener("install", (e) => e.waitUntil(install()));

async function activate() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => key !== version && caches.delete(key)));

  const absoluteManifestSet = new Set(
    manifest.map((p) => new URL(p, self.location.toString()).toString()),
  );
  const cache = await caches.open(version);
  for (const request of await cache.keys()) {
    if (!absoluteManifestSet.has(request.url)) {
      cache.delete(request);
      continue;
    }

    const response = await caches.match(request);
    if (response && !response.ok) {
      cache.delete(request);
    }
  }
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

  e.respondWith(
    (async () => {
      if (!navigator.onLine) {
        const r = await getResponseWithIndexFallback(e.request);

        if (r) {
          return r;
        }
      }

      const cachedResponse = await getResponseWithIndexFallback(e.request);
      if (pathname.startsWith("/static/")) {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetchAndCache(e.request);
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
    response = await fetch(request, {
      signal: timeoutAbortSignal(2000),
    });
  } catch (err) {
    const r = await getResponseWithIndexFallback(request);

    if (r) {
      return r;
    }

    throw err;
  }

  const isHtml = !!response.headers.get("content-type")?.match(/^text\/html;?/);
  const knownHtmlPage = isHtml && pages.includes(new URL(request.url).pathname);
  if (response.ok && (!isHtml || knownHtmlPage)) {
    const cache = await caches.open(version);
    cache.put(request, response.clone());
  }
  return response;
}

function timeoutAbortSignal(milliseconds: number) {
  if ("timeout" in AbortSignal && AbortSignal.timeout) {
    return AbortSignal.timeout(milliseconds);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
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
