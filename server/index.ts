import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { apiSessionDelete } from "./api/session.js";
import { apiSettingsGet } from "./api/settings.js";
import {
  apiTimezonesDelete,
  apiTimezonesPatch,
  apiTimezonesPut,
} from "./api/timezones.js";
import { apiSqrapCodePost } from "./api/sqrap/code.js";
import { apiSqrapInitPost } from "./api/sqrap/init.js";
import { apiSqrapStatusGet } from "./api/sqrap/status.js";
import { apiGeotzGet } from "./api/geotz.js";
import { apiTimezonesIndex } from "./api/timezones-index.js";

const fastify = Fastify({
  logger: true,
  trustProxy: true,
});

// redirect to the main domain
if (process.env.NODE_ENV === "production") {
  fastify.addHook("onRequest", (request, reply, next) => {
    const { hostname, url } = request;

    // TODO? move `when.st` to an env
    if (hostname !== "when.st") {
      if (url === "/.well-known/healthcheck") {
        reply.send();
      } else if (url === "/service-worker.js") {
        // if user has old domain's service worker, replace it with a self-destructing dummy
        // (to stop fetching cached everything; SW URL redirects don't seem to work)
        reply.header("content-type", "application/javascript").send(`
          addEventListener("install", function () { self.skipWaiting() });
          caches.keys()
          .then(function (keys) { return Promise.all(keys.map(function (key) { return caches.delete(key) } )) })
          .then(function () { return registration.unregister() })
          .catch(console.error);
        `);
      } else {
        const httpsUrl = `http://when.st${url}`;

        reply.redirect(httpsUrl, 301);
      }
    }

    next();
  });
}

await fastify.register(import("@fastify/compress"));

fastify.register((childContext, _, done) => {
  childContext.register(fastifyStatic, {
    root:
      process.env.WHENST_STATIC_ROOT ??
      path.join(process.cwd(), "./dist/client/"),
    prefix: "/",
    // `parcel` doesn't compress while `watch`ing
    preCompressed: !!process.env.WHENST_SERVE_PRECOMPRESSED,
    cacheControl: false,
    // can be overwritten with `sendFile(..., { cacheControl: true, maxAge: ms })`
    setHeaders(res, filepath, _stat) {
      if (res.getHeader("cache-control")) {
        return;
      }

      // strip unimportant for caching extensions
      const basename = path.basename(
        path.basename(path.basename(filepath, ".br"), ".gz"),
        ".map",
      );

      if (basename === "app.webmanifest" || basename === "service-worker.js") {
        res.setHeader("cache-control", `public, max-age=${5 * 60}`);
        return;
      }

      res.setHeader("cache-control", `public, max-age=${60 * 60}`);
    },
  });

  childContext.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply
        .code(404)
        .type("text/json")
        .send({
          message: `API endpoint ${request.url} not found`,
          error: "Not Found",
          statusCode: 404,
        });
    }

    if (
      request.url.startsWith("/.well-known/") ||
      request.url.startsWith("/static/")
    ) {
      return reply.code(404).send();
    }

    return reply
      .code(200)
      .type("text/html")
      .header("cache-control", `public, max-age=${5 * 60}`)
      .sendFile("index.html");
  });

  done();
});

fastify.delete("/api/session", apiSessionDelete);
fastify.get("/api/settings", apiSettingsGet);
fastify.put("/api/timezones", apiTimezonesPut);
fastify.delete("/api/timezones", apiTimezonesDelete);
fastify.patch("/api/timezones", apiTimezonesPatch);
fastify.post("/api/sqrap/code", apiSqrapCodePost);
fastify.post("/api/sqrap/init", apiSqrapInitPost);
fastify.get("/api/sqrap/status", apiSqrapStatusGet);
fastify.get("/api/geotz", apiGeotzGet);
fastify.get("/api/timezones-index", apiTimezonesIndex);
fastify.get("/.well-known/healthcheck", (_request, reply) => {
  return reply.code(200).send();
});

// Run the server!
fastify.listen({ port: 3000, host: "0.0.0.0" }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
