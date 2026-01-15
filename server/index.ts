import path from "node:path";
import Fastify from "fastify";
import fastifyAccepts from "@fastify/accepts";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import Handlebars from "handlebars";
import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";

import staticAssets from "#dist/server/static.js";
import { apiSessionDelete } from "./api/session.js";
import { apiAccountGet, apiAccountPost } from "./api/account.js";
import { apiSettingsGet } from "./api/settings.js";
import { apiSqrapCodePost } from "./api/sqrap/code.js";
import { apiSqrapInitPost } from "./api/sqrap/init.js";
import { apiSqrapStatusGet } from "./api/sqrap/status.js";
import { apiTimezonesIndex } from "./api/timezones-index.js";
import {
  apiSyncWorldClockGet,
  apiSyncWorldClockPatch,
} from "./api/sync/world-clock.js";
import { guessTimezone } from "../src/guess-timezone.js";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "../shared/from-timezone.js";

import "./dist.d.ts";

const serverCalendar = "iso8601";

const fastify = Fastify({
  logger: true,
  trustProxy: true,
  routerOptions: {
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
  },
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

    // TODO: 404 for unknown timezones
    const opengraph = (() => {
      try {
        return getHomeOpengraphData(request.url, {
          languages: request
            .accepts()
            .languages()
            .filter((lang) => lang === "en" || lang.startsWith("en-")),
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
  { languages }: { languages: string[] },
) {
  const url = new URL(pathname, "https://when.st/").toString();
  const [urlTZ, urlDT] = extractDataFromURL(url);

  if (urlTZ instanceof Temporal.TimeZone) {
    const placeStr = getLocationFromTimezone(urlTZ);
    const instant =
      urlDT && urlDT !== "now" ? parseTimeString(urlTZ, urlDT) : null;

    const canonicalPathname =
      getPathnameFromTimezone(urlTZ) +
      (instant
        ? `/${instant.toString({ timeZoneName: "never", offset: "never", smallestUnit: "minute" })}`
        : "");

    return {
      title: instant
        ? `${instant.toLocaleString(languages, {
            dateStyle: "long",
            timeStyle: "short",
          })} in ${placeStr}`
        : `Time in ${placeStr}`,
      url: new URL(canonicalPathname, "https://when.st/").toString(),
      // TODO: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/getTimeZoneTransition
      description: `UTC${(
        instant || Temporal.Now.zonedDateTime(serverCalendar, urlTZ)
      ).offset
        .replace(/:00$/, "")
        .replace(/^([+-])0([0-9])$/, "$1$2")}`,
      published_time: instant
        ? instant.toString({ timeZoneName: "never", offset: "auto" })
        : undefined,
    };
  }

  // TODO: `/unix/:seconds`
  // TODO: `/` (generic "about" description)
  return null;
}

function parseTimeString(
  timezone: string | Temporal.TimeZone,
  timeString: string | undefined,
) {
  if (timezone === "unix") {
    timezone = "UTC";
  }

  let date = undefined;
  if (timeString) {
    try {
      date = Temporal.PlainDate.from(timeString);
    } catch (_e) {
      //
    }
  }

  if (!date) {
    date = Temporal.Now.plainDate(serverCalendar);
  }

  if (timeString && timeString !== "now") {
    try {
      Temporal.PlainTime.from(timeString);
    } catch (_e) {
      timeString = "now";
    }
  }

  return !timeString || timeString === "now"
    ? Temporal.Now.zonedDateTime(serverCalendar, timezone).with({
        millisecond: 0,
      })
    : date.toZonedDateTime({
        plainTime: Temporal.PlainTime.from(timeString),
        timeZone: timezone,
      });
}

function extractDataFromURL(
  href: string,
): [] | [string | Temporal.TimeZone, string] {
  const unixURLPattern = new URLPattern(
    {
      pathname: "/unix{/:seconds(\\d*)}?",
    },
    // https://github.com/kenchris/urlpattern-polyfill/issues/127
    { ignoreCase: true } as unknown as string,
  );
  const matchesUnix = unixURLPattern.test(href);
  if (matchesUnix) {
    const { seconds } = unixURLPattern.exec(href)?.pathname.groups ?? {};

    if (!seconds || !seconds.match(/^[0-9]{1,10}$/)) {
      return ["unix", "now"];
    }

    return ["unix", new Date(+seconds * 1000).toISOString().replace(/Z$/, "")];
  }

  const geoURLPattern = new URLPattern({
    pathname: "/:zeroth{/*}?",
  });

  const matchesGeo = geoURLPattern.test(href);
  if (!matchesGeo) {
    return [];
  }

  const { zeroth, 0: extra } = geoURLPattern.exec(href)?.pathname.groups || {
    zeroth: "",
  };

  if (zeroth === "") {
    return [];
  }

  const [first, second, third] = extra?.split("/") ?? [];

  let remoteTZ = guessTimezone(`${zeroth}/${first}/${second}`, {
    strict: true,
  });
  if (remoteTZ) {
    return [remoteTZ, third || "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}/${first}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, second || "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, first || "now"];
  }

  return [];
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

export const server = fastify;

if (import.meta.main) {
  fastify.listen({ port: 3000, host: "0.0.0.0" }, function (err, _address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}
