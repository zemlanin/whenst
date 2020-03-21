#!/usr/bin/env node

const url = require("url");
const http = require("http");
const path = require("path");
const querystring = require("querystring");

const pg = require("pg");
const sql = require("pg-template-tag").default;

const config = require("./src/config.js");
const routes = require("./src/routes.js");
const render = require("./src/render.js");

async function processPost(request, response, ctx) {
  var queryData = "";
  return new Promise((resolve, reject) => {
    request.on("data", function(data) {
      queryData += data;
      if (queryData.length > 1e6) {
        queryData = "";
        response.writeHead(413, { "Content-Type": "text/plain" }).end();
        request.connection.destroy();
        reject("413 Content Too Long");
      }
    });

    request.on("end", function() {
      ctx.post = querystring.parse(queryData);
      resolve(ctx.post);
    });
  });
}

function wrapPostHandler(handler) {
  return async (req, res, ctx) => {
    await processPost(req, res, ctx);
    return handler(req, res, ctx);
  };
}

const server = http.createServer((req, res) => {
  const ctx = {
    // ctx.db
    // ctx.params
    // ctx.absolute
    // ctx.query
    config,
    render,
    routes: routes.reverse
  };

  const pathname = url.parse(req.url).pathname.replace(/(.)\/$/, "$1");
  let handler;

  if (routes.handlers[req.method]) {
    handler = (routes.handlers[req.method].find(([pattern]) => {
      const params = pattern.match(pathname);

      if (params) {
        ctx.params = params;
      }

      return !!params;
    }) || [])[1];
  }

  if (req.method === "HEAD" && !handler) {
    handler = (routes.handlers["GET"].find(([pattern]) => {
      const params = pattern.match(pathname);

      if (params) {
        ctx.params = params;
      }

      return !!params;
    }) || [])[1];
  }

  if (!handler) {
    if (!res.finished) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404");
      return;
    }

    return;
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const port =
    (host && host.match(/:(\d+)$/) && host.match(/:(\d+)$/)[1]) || null;

  ctx.absolute = url.format({
    protocol,
    host,
    port
  });

  ctx.query = url.parse(req.url, true).query;

  if (
    req.method === "POST" &&
    req.headers["content-type"] === "application/x-www-form-urlencoded"
  ) {
    const ogHandler = handler;
    handler = wrapPostHandler(ogHandler);
  }

  let db;
  ctx.db = async () => {
    if (db) {
      return db;
    }

    db = new pg.Client(config.pg);

    await db.connect();

    return db;
  };

  let result;
  let resultPromise;

  try {
    result = handler(req, res, ctx);
    resultPromise =
      result instanceof Promise ? result : Promise.resolve(result);
  } catch (e) {
    resultPromise = Promise.reject(e);
  }

  return resultPromise
    .then(body => {
      if (res.finished) {
        return;
      }

      const contentType = res.getHeader("content-type");
      if (
        typeof body === "string" ||
        contentType === "text/xml" ||
        contentType === "text/html" ||
        contentType === "text/plain" ||
        contentType === "text/markdown" ||
        contentType === "application/javascript" ||
        (contentType && contentType.startsWith("image/"))
      ) {
        res.writeHead(res.statusCode, {
          "Content-Type": contentType || "text/html"
        });
        res.end(body);
      } else if (body || contentType === "application/json") {
        res.writeHead(res.statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      } else {
        res.end();
      }
    })
    .catch(err => {
      if (!res.finished) {
        console.error(err);

        res.writeHead(500, { "Content-Type": "text/plain" });
        if (config.production) {
          res.end("500");
        } else {
          res.end(err.stack);
        }
      }
    })
    .finally(() => db && db.end());
});

function start() {
  Promise.resolve()
    .then(async function checkDBConnection() {
      const client = new pg.Client(config.pg);

      await client.connect();

      await client.query(sql`SELECT 1;`);

      await client.end();
    })
    .then(
      config.production
        ? null
        : async function migrate() {
            const marv = require("marv/api/promise");
            const driver = require("marv-pg-driver");
            const directory = path.resolve("migrations");

            const migrations = await marv.scan(directory);
            await marv.migrate(
              migrations,
              driver({
                connection: config.pg
              })
            );
          }
    )
    .then(() => {
      server.on("clientError", (err, socket) => {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      server.listen(config.port);

      console.log(`running on ${config.port}`);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

if (require.main === module) {
  start();
} else {
  module.exports = {
    server,
    start
  };
}
