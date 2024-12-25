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

const fastify = Fastify({
  logger: true,
});

await fastify.register(import("@fastify/compress"));

fastify.register((childContext, _, done) => {
  childContext.register(fastifyStatic, {
    root:
      process.env.WHENST_STATIC_ROOT ??
      path.join(process.cwd(), "./dist/client/"),
    prefix: "/",
    preCompressed: true,
    cacheControl: false,
    // can be overwritten with `sendFile(..., { cacheControl: true, maxAge: ms })`
    setHeaders(res, filepath, _stat) {
      // strip unimportant for caching extensions
      const basename = path.basename(
        path.basename(path.basename(filepath, ".br"), ".gz"),
        ".map",
      );

      if (basename === "app.webmanifest" || basename === "service-worker.js") {
        res.setHeader("cache-control", `public, max-age=${5 * 60}`);
        return;
      }

      if (basename === "index.html") {
        res.setHeader("cache-control", `public, max-age=${60 * 60}`);
        return;
      }

      res.setHeader("cache-control", `public, max-age=${365 * 24 * 60 * 60}`);
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

    return reply.code(200).type("text/html").sendFile("index.html");
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

// Run the server!
fastify.listen({ port: 3000, host: "0.0.0.0" }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
