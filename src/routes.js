const UrlPattern = require("url-pattern");

const config = require("./config");

const CDN = "cdn";
const METHODS_REGEX = /^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS) /;

const routes = [
  ["GET /", (req, res, ctx) => ctx.routes.cdn.stringify({ _: "index.css" })],
  ["GET /m", require("./meeting/index.js")],
  ["GET /m/(:slug)", require("./meeting/slug.js")],
  ["GET /cdn/*", require("./cdn.js"), CDN]
];

module.exports = {};
module.exports.handlers = routes.reduce((acc, [route, handler]) => {
  if (!route.match(METHODS_REGEX)) {
    throw new Error(`unknown method in route: ${route}`);
  }

  const spaceIndex = route.indexOf(" ");

  const method = route.slice(0, spaceIndex);
  const pattern = route.slice(spaceIndex + 1);

  acc[method] = acc[method] || [];
  acc[method].push([new UrlPattern(pattern), handler]);

  return acc;
}, {});

module.exports.reverse = routes.reduce((acc, [route, handler, name]) => {
  if (!route.match(METHODS_REGEX)) {
    throw new Error(`unknown method in route: ${route}`);
  }

  name = name || handler.name;

  if (!name || acc[name]) {
    return acc;
  }

  let pattern;

  if (handler === CDN && config.cdn) {
    pattern = config.cdn.replace(/:/g, "\\:") + "*";
  } else {
    const spaceIndex = route.indexOf(" ");
    pattern = route.slice(spaceIndex + 1);
  }

  acc[name] = new UrlPattern(pattern);

  return acc;
}, {});
