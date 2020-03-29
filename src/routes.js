const url = require("url");

const UrlPattern = require("url-pattern");

const config = require("./config");

const CDN = "cdn";
const METHODS_REGEX = /^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS) /;

const routes = [
  ["GET /", require("./landing/index.js")],
  ["GET /auth/slack", require("./auth/slack.js")],
  ["POST /presets/add", require("./presets/add.js")],
  ["POST /presets/delete", require("./presets/delete.js")],
  ["GET /cdn/*", require("./cdn.js"), CDN],
];

const handlers = routes.reduce((acc, [route, handler]) => {
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

module.exports = {};
module.exports.handlers = handlers;
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

module.exports.getHandler = function getHandler(req) {
  let handler;

  const pathname = url.parse(req.url).pathname.replace(/(.)\/$/, "$1");

  if (handlers[req.method]) {
    handler = (handlers[req.method].find(([pattern]) => {
      const params = pattern.match(pathname);

      if (params) {
        req.params = params;
      }

      return !!params;
    }) || [])[1];
  }

  if (req.method === "HEAD" && !handler) {
    handler = (handlers["GET"].find(([pattern]) => {
      const params = pattern.match(pathname);

      if (params) {
        req.params = params;
      }

      return !!params;
    }) || [])[1];
  }

  return handler;
};
