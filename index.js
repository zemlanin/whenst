#!/usr/bin/env node

const url = require("url");
const http = require("http");
const util = require("util");

const pg = require("pg");
const sql = require("pg-template-tag").default;
const redis = require("redis");
const connect = require("connect");
const bodyParser = require("body-parser");
const session = require("express-session");
const contentType = require("content-type");
const csurf = require("csurf");

const config = require("./src/config.js");
const routes = require("./src/routes.js");
const renderMiddleware = require("./src/render.js");

const { getAccount } = require("./src/auth/account.js");

const app = connect();

app.use((req, res, next) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";

  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const port =
    (host && host.match(/:(\d+)$/) && host.match(/:(\d+)$/)[1]) || null;

  if (config.production && protocol === "http") {
    res.statusCode = 302;

    res.setHeader(
      "Location",
      new url.URL(
        req.url,
        url.format({
          protocol: "https",
          host,
          port,
        })
      )
    );

    return res.end();
  }

  req.absolute = url.format({
    protocol,
    host,
    port,
  });

  next();
});

// https://github.com/expressjs/body-parser/issues/208#issuecomment-263805902
function rawBodyVerifyHack(req, res, buf, _encoding) {
  if (!req.rawBody) {
    req.rawBody = buf;
  }
}

app.use(bodyParser.json({ verify: rawBodyVerifyHack })); // req.body
app.use(bodyParser.urlencoded({ extended: false, verify: rawBodyVerifyHack })); // req.body
app.use((req, res, next) => {
  const decodedURL = new url.URL(req.url, req.absolute).searchParams;

  if (
    req.headers["content-type"] === "application/x-www-form-urlencoded" &&
    req.body
  ) {
    req.formBody = new url.URLSearchParams();

    for (const [name, value] of Object.entries(req.body)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          req.formBody.append(name, v);
        }
      } else {
        req.formBody.append(name, value);
      }
    }

    const decodedFormKeys = new Set(req.formBody.keys());

    for (const [name, value] of decodedURL) {
      if (!decodedFormKeys.has(name)) {
        req.formBody.append(name, value);
      }
    }
  } else {
    req.formBody = decodedURL;
  }

  next();
});

app.use(renderMiddleware); // res.render

app.use(function dbMiddleware(req, res, next) {
  // req.db()
  let db;

  req.db = async () => {
    if (db) {
      return db;
    }

    if (res.finished) {
      throw new Error("req.db() after res.finished");
    }

    db = new pg.Client(config.pg);

    await db.connect();

    return db;
  };

  req.db.transaction = async (callback) => {
    const db = await req.db();

    try {
      await db.query("BEGIN");
      await callback(db);
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  };

  res.on("finish", () => {
    if (db) {
      db.end();
    }
  });

  next();
});

app.use(function redisMiddleware(req, res, next) {
  let client;

  req.redis = async () => {
    if (!client) {
      client = new redis.createClient(config.redis);
    }

    return {
      get: util.promisify(client.get).bind(client),
      set: util.promisify(client.set).bind(client),
      del: util.promisify(client.del).bind(client),
    };
  };

  res.on("finish", () => {
    if (client) {
      client.quit();
    }
  });

  next();
});

const sessionStore = new (require("connect-redis")(session))({
  client: new redis.createClient(config.redis),
});

app.use(
  session({
    secret: config.session.secret,
    name: "whenst.sid",
    cookie: {
      secure: config.production,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
    proxy: config.production || undefined,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
  })
);

class NeedsAccountMergeException extends Error {}

app.use(function accountAuthMiddleware(req, res, next) {
  req.getAccount = async function getAccountFromMiddleware() {
    if (!req.session.account_id) {
      return null;
    }

    const db = await req.db();
    const redis = await req.redis();

    return await getAccount(db, redis, req.session.account_id);
  };

  next();
});

const csurfInstance = csurf({
  value(req) {
    return (
      (req.body && req.body._csrf) ||
      new url.URL(req.url, req.absolute).searchParams.get("_csrf") ||
      req.headers["csrf-token"] ||
      req.headers["x-csrf-token"]
    );
  },
});

app.use(function (req, res, next) {
  // do something better
  if (req.url.startsWith("/incoming-webhooks/slack")) {
    next();
    return;
  }

  if (config.disableCSRFCheck) {
    next();
    return;
  }

  return csurfInstance(req, res, next);
});

app.use(function (err, req, res, next) {
  if (err.code === "EBADCSRFTOKEN") {
    res.statusCode = 403;
    res.end();
    return;
  }

  return next(err);
});

app.use((req, res, next) => {
  req.app = {
    routes: routes.reverse,
  };

  const handler = routes.getHandler(req); // req.params

  if (!handler) {
    return next(null);
  }

  let result;
  let resultPromise;

  try {
    result = handler(req, res);
    resultPromise =
      result instanceof Promise ? result : Promise.resolve(result);
  } catch (e) {
    resultPromise = Promise.reject(e);
  }

  return resultPromise
    .catch((e) => {
      if (e instanceof NeedsAccountMergeException) {
        return;
      }

      throw e;
    })
    .then((body) => {
      if (res.finished) {
        return;
      }

      const contentTypeHeader = res.getHeader("content-type");
      const resType = contentTypeHeader
        ? contentType.parse(contentTypeHeader).type
        : null;

      const charset = contentTypeHeader
        ? contentType.parse(contentTypeHeader).parameters.charset || "utf-8"
        : "utf-8";

      if (
        typeof body === "string" ||
        resType === "text/xml" ||
        resType === "text/html" ||
        resType === "text/plain" ||
        resType === "text/markdown" ||
        resType === "application/javascript" ||
        resType === "image/svg+xml"
      ) {
        res.writeHead(res.statusCode, {
          "Content-Type": (resType || "text/html") + `; charset=${charset}`,
        });
        res.end(body);
      } else if (resType && resType.startsWith("image/")) {
        res.writeHead(res.statusCode, {
          "Content-Type": resType,
        });
        res.end(body);
      } else if (body || resType === "application/json") {
        res.writeHead(res.statusCode, {
          "Content-Type": `application/json; charset=${charset}`,
        });
        res.end(JSON.stringify(body));
      } else if (!body && res.statusCode === 404) {
        // TODO
        res.writeHead(res.statusCode, {
          "Content-Type": `text/plain; charset=${charset}`,
        });
        res.end(`404 Not Found`);
      } else {
        res.writeHead(res.statusCode, {
          "Content-Type": `text/plain; charset=${charset}`,
        });
        res.end(`${res.statusCode}`);
      }

      next();
    })
    .catch((err) => {
      next(err);
    });
});

const server = http.createServer(app);

sessionStore.client.on("connect", () => {
  server.on("close", () => {
    sessionStore.client.unref();
  });
});

function start() {
  return Promise.resolve()
    .then(async function checkDBConnection() {
      const client = new pg.Client(config.pg);

      await client.connect();

      await client.query(sql`SELECT 1;`);

      await client.end();
    })
    .then(() => {
      server.on("clientError", (err, socket) => {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      server.listen(config.port);

      console.log(`running on ${config.port}`);
    });
}

if (require.main === module) {
  process.on("unhandledRejection", (err) => {
    throw err;
  });

  start();
} else {
  module.exports = {
    server,
    start,
  };
}
