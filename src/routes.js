const UrlPattern = require("url-pattern");

const h = (req, res, ctx) => `hello ${ctx.params.name || "world"}`;

const METHODS_REGEX = /^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS) /;

const routes = [
  ["GET /", () => module.exports.reverse.get(h).stringify()],
  ["GET /hello(/:name)", h],
  [
    "GET /now",
    async (req, res, ctx) => {
      const client = await ctx.db();
      return (await client.query("SELECT now()")).rows[0].now;
    }
  ]
];

module.exports = {};

module.exports.handlers = routes.reduce((acc, [route, handler]) => {
  if (!route.match(METHODS_REGEX)) {
    throw new Error(`unknown method in route: ${route}`);
  }

  const method = route.split(" ")[0];

  const pattern = route.slice(method.length + 1);

  acc[method] = acc[method] || [];
  acc[method].push([new UrlPattern(pattern), handler]);

  return acc;
}, {});

module.exports.reverse = routes.reduce((acc, [route, handler]) => {
  if (!route.match(METHODS_REGEX)) {
    throw new Error(`unknown method in route: ${route}`);
  }

  if (acc.has(handler)) {
    return acc;
  }

  const method = route.split(" ")[0];
  const pattern = route.slice(method.length + 1);

  acc.set(handler, new UrlPattern(pattern));

  return acc;
}, new Map());
