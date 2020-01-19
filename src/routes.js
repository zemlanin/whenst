const UrlPattern = require("url-pattern");

const config = require("./config");

const routes = [
  [
    "GET /",
    (req, res, ctx) =>
      ctx.routes.get(require("./cdn.js")).stringify({ _: "index.css" })
  ],
  ["GET /m", require("./meeting/index.js")],
  ["GET /m/(:slug)", require("./meeting/slug.js")],
  ["GET /cdn/*", require("./cdn.js")]
];

const METHODS_REGEX = /^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS) /;

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

  if (handler === require("./cdn.js") && config.cdn) {
    acc.set(handler, new UrlPattern(config.cdn.replace(/:/g, "\\:") + "*"));
    return acc;
  }

  const method = route.split(" ")[0];
  const pattern = route.slice(method.length + 1);

  acc.set(handler, new UrlPattern(pattern));

  return acc;
}, new Map());
