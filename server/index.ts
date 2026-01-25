import path from "node:path";
import Fastify from "fastify";
import fastifyAccepts from "@fastify/accepts";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import fastifyRawBody from "fastify-raw-body";
import Handlebars from "handlebars";
import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";

import staticAssets from "#dist/server/static.js";
import { apiSessionDelete } from "./api/session.js";
import { apiAccountGet, apiAccountPost } from "./api/account.js";
import { apiSettingsGet } from "./api/settings.js";
import { apiSlackEventsPost } from "./api/slack/events.js";
import { apiSlackOauthGet } from "./api/slack/oauth.js";
import { apiSqrapCodePost } from "./api/sqrap/code.js";
import { apiSqrapInitPost } from "./api/sqrap/init.js";
import { apiSqrapStatusGet } from "./api/sqrap/status.js";
import { apiTimezonesIndex } from "./api/timezones-index.js";
import {
  apiSyncWorldClockGet,
  apiSyncWorldClockPatch,
} from "./api/sync/world-clock.js";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "../shared/from-timezone.js";
import { extractDataFromURL } from "../shared/extractDataFromURL.js";
import { parseTimeString, CALENDAR } from "../shared/parseTimeString.js";

import "./dist.d.ts";

const fastify = Fastify({
  logger: true,
  trustProxy: true,
  routerOptions: {
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
  },
});

await fastify.register(fastifyRawBody, {
  global: false,
});
fastify.register(fastifyAccepts);

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
        const httpsUrl = `https://when.st${url}`;

        reply.redirect(httpsUrl, 301);
      }
    }

    next();
  });
}

const handlebars = Handlebars.create();
handlebars.registerHelper("static", (relative, options) => {
  if (options.hash.type === "entrypoint") {
    return staticAssets.entrypoints[relative].main;
  } else if (options.hash.type === "css-modules") {
    return staticAssets.entrypoints[relative].css;
  } else if (options.hash.type === "asset") {
    return staticAssets.assets[relative];
  } else if (options.hash.type === "manifest") {
    return staticAssets.assets[relative];
  }

  throw new Error(`unknown 'static' type: ${options.hash.type}`);
});

fastify.register(fastifyView, {
  engine: { handlebars },
  options: {
    partials: {
      head: "src/pages/_partials/head.html.hbs",
      nav: "src/pages/_partials/nav.html.hbs",
    },
  },
});

fastify.register((childContext, _, done) => {
  childContext.register(fastifyStatic, {
    root:
      process.env.WHENST_STATIC_ROOT ??
      path.join(process.cwd(), "./dist/client/"),
    prefix: "/",
    cacheControl: false,
    allowedPath(pathName, _root, _request) {
      if (pathName.startsWith("/.") && !pathName.startsWith("/.well-known/")) {
        return false;
      }

      return true;
    },
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

    if (request.url.startsWith("/.") || request.url.startsWith("/static/")) {
      return reply.code(404).send();
    }

    const currentDateTime = (() => {
      if (!request.headers.date) {
        return;
      }

      try {
        return Temporal.Instant.from(
          new Date(request.headers.date).toISOString(),
        ).toZonedDateTimeISO(Temporal.Now.timeZoneId());
      } catch (_e) {
        return undefined;
      }
    })();

    // TODO: 404 for unknown timezones
    const opengraph = (() => {
      try {
        return getHomeOpengraphData(request.url, {
          languages: request
            .accepts()
            .languages()
            .filter((lang) => lang === "en" || lang.startsWith("en-")),
          currentDateTime,
        });
      } catch (e) {
        console.error(e);
        return null;
      }
    })();

    return reply
      .header("cache-control", `public, max-age=${5 * 60}`)
      .viewAsync("src/pages/home/index.html.hbs", { opengraph });
  });

  done();
});

function getHomeOpengraphData(
  pathname: string,
  {
    languages,
    currentDateTime,
  }: { languages: string[]; currentDateTime?: Temporal.ZonedDateTime },
) {
  const url = new URL(pathname, "https://when.st/").toString();
  const [urlTZ, urlDT] = extractDataFromURL(url);

  if (urlTZ instanceof Temporal.TimeZone) {
    const placeStr = getLocationFromTimezone(urlTZ);
    /** "zonedDateTime" */
    const zDT =
      urlDT && urlDT !== "now"
        ? parseTimeString(urlTZ, urlDT, {
            currentDateTime,
          })
        : null;

    const canonicalPathname =
      getPathnameFromTimezone(urlTZ) +
      (zDT
        ? `/${zDT.toString({ timeZoneName: "never", offset: "never", smallestUnit: "minute" })}`
        : "");

    // TODO: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/getTimeZoneTransition
    const utcOffset =
      urlTZ.id === "UTC"
        ? "UTC"
        : `UTC${(zDT || Temporal.Now.zonedDateTime(CALENDAR, urlTZ)).offset
            .replace(/:00$/, "")
            .replace(/^([+-])0([0-9])$/, "$1$2")}`;

    return {
      title: zDT
        ? `${zDT.toLocaleString(languages, {
            dateStyle: "long",
            timeStyle: "short",
          })} in ${placeStr}`
        : `Time in ${placeStr}`,
      url: new URL(canonicalPathname, "https://when.st/").toString(),
      description: utcOffset,
      published_time: zDT
        ? zDT.toString({ timeZoneName: "never", offset: "auto" })
        : undefined,
    };
  }

  if (urlTZ === "unix") {
    /** "zonedDateTime" */
    const zDT =
      urlDT && urlDT !== "now"
        ? parseTimeString(urlTZ, urlDT, {
            currentDateTime,
          })
        : null;

    const canonicalPathname =
      getPathnameFromTimezone(urlTZ) + (zDT ? `/${zDT.epochSeconds}` : "");

    return {
      title: zDT ? `Unix ${zDT.epochSeconds}` : `Unix time`,
      url: new URL(canonicalPathname, "https://when.st/").toString(),
      description: zDT
        ? `0x${zDT.epochSeconds.toString(16)} • 0b${zDT.epochSeconds.toString(2)}`
        : `aka Epoch time, POSIX time, or Unix timestamp`,
      published_time: zDT
        ? zDT.toString({ timeZoneName: "never", offset: "auto" })
        : undefined,
    };
  }

  // TODO: `/` (generic "about" description)
  return null;
}

fastify.get("/api/account", apiAccountGet);
fastify.post("/api/account", apiAccountPost);
fastify.delete("/api/session", apiSessionDelete);
fastify.get("/api/settings", apiSettingsGet);
fastify.post("/api/sqrap/code", apiSqrapCodePost);
fastify.post("/api/sqrap/init", apiSqrapInitPost);
fastify.get("/api/sqrap/status", apiSqrapStatusGet);
fastify.get("/api/timezones-index", apiTimezonesIndex);
fastify.get("/api/sync/world-clock", apiSyncWorldClockGet);
fastify.patch("/api/sync/world-clock", apiSyncWorldClockPatch);
fastify.post(
  "/api/slack/events",
  {
    config: {
      rawBody: true,
    },
  },
  apiSlackEventsPost,
);
fastify.get("/api/slack/oauth", apiSlackOauthGet);
fastify.get("/.well-known/healthcheck", (_request, reply) => {
  return reply.code(200).send();
});
fastify.get("/link", (_request, reply) => {
  return reply
    .header("cache-control", `public, max-age=${5 * 60}`)
    .viewAsync("src/pages/link/index.html.hbs");
});
fastify.get("/settings", (_request, reply) => {
  return reply
    .header("cache-control", `public, max-age=${5 * 60}`)
    .viewAsync("src/pages/settings/index.html.hbs");
});
fastify.get("/about", (_request, reply) => {
  return reply
    .header("cache-control", `public, max-age=${5 * 60}`)
    .viewAsync("src/pages/about/index.html.hbs");
});
fastify.get("/slack/install", (request, reply) => {
  if ((request.query as Record<string, string | undefined>).success) {
    return reply
      .header("cache-control", `public, max-age=${5 * 60}`)
      .viewAsync("src/pages/slack/install/success.html.hbs");
  }

  const WHENST_SLACK_CLIENT_ID = "1018918207158.1016707049728";

  return reply.redirect(
    `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
      scope: "links:read,links:write",
      client_id: WHENST_SLACK_CLIENT_ID,
      redirect_uri: new URL(
        "/api/slack/oauth",
        `https://${request.hostname}`,
      ).toString(),
    })}`,
  );
});

export const server = fastify;

if (import.meta.main) {
  fastify.listen({ port: 3000, host: "0.0.0.0" }, function (err, _address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}
