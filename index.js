#!/usr/bin/env node

const url = require("url");
const http = require("http");
const path = require("path");
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

const app = connect();

app.use(bodyParser.json()); // req.body
app.use(bodyParser.urlencoded({ extended: true })); // req.body
app.use((req, res, next) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const port =
    (host && host.match(/:(\d+)$/) && host.match(/:(\d+)$/)[1]) || null;

  req.absolute = url.format({
    protocol,
    host,
    port,
  });

  next();
});
app.use((req, res, next) => {
  req.query = url.parse(req.url, true).query;
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
    if (client) {
      return client;
    }

    client = new redis.createClient(config.redis);

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
    secure: config.production,
    name: "whenst.sid",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
  })
);

app.use(function slackAuthMiddleware(req, res, next) {
  let oauthTokens;
  
  req.getSlackOauth = async function getSlackOauth() {
    if (oauthTokens !== undefined) {
      return oauthTokens;
    }
    
    if (!req.session.slack_oauth_ids || !req.session.slack_oauth_ids.length) {
      oauthTokens = [];
      return oauthTokens;
    }
    
    const db = await req.db();

    const slack_oauth_ids = req.session.slack_oauth_ids;

    const dbOauthRes = await db.query(sql`
      SELECT s.id, s.user_id, s.team_id, s.access_token FROM slack_oauth s
      WHERE s.id = ANY(${slack_oauth_ids}) AND s.revoked = false
    `);
    
    if (dbOauthRes.rows.length !== slack_oauth_ids.length) {
      const activeOauths = new Set(dbOauthRes.rows.map((row) => row.id))
    
      req.session.slack_oauth_ids = slack_oauth_ids.filter((id) => activeOauths.has(id))
    }
    
    oauthTokens = dbOauthRes.rows.map((row) => {
      return {
        id: row.id,
        user_id: row.user_id,
        team_id: row.team_id,
        access_token: row.access_token,
      }
    })
    
    return oauthTokens;
  }
  
  next();
})

app.use(csurf());
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
    .then((body) => {
      if (res.finished) {
        return;
      }

      const contentTypeHeader = res.getHeader("content-type");
      const resType = contentTypeHeader
        ? contentType.parse(contentTypeHeader).type
        : null;

      if (
        typeof body === "string" ||
        resType === "text/xml" ||
        resType === "text/html" ||
        resType === "text/plain" ||
        resType === "text/markdown" ||
        resType === "application/javascript" ||
        (resType && resType.startsWith("image/"))
      ) {
        res.writeHead(res.statusCode, {
          "Content-Type": resType || "text/html",
        });
        res.end(body);
      } else if (body || resType === "application/json") {
        res.writeHead(res.statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      } else {
        res.end();
      }

      next();
    })
    .catch((err) => {
      next(err);
    });
});

const server = http.createServer(app);

server.on("close", () => {
  sessionStore.client.unref();
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
                connection: config.pg,
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
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

if (require.main === module) {
  start();
} else {
  module.exports = {
    server,
    start,
  };
}
