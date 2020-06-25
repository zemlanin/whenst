const url = require("url");

const UrlPattern = require("url-pattern");

const CDN = "cdn";
const METHODS_REGEX = /^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS) /;

const routes = [
  ["GET /", require("./landing/index.js")],
  ["POST /incoming-webhooks/slack", require("./incoming-webhooks/slack.js")],
  ["GET /cdn/*", require("./cdn.js"), CDN],

  ["GET /auth/slack", require("./auth/slack.js")],
  ["GET /auth/github", require("./auth/github.js")],
  ["GET /auth/merge", require("./auth/merge.js")],
  ["POST /auth/merge", require("./auth/merge.js")],
  ["POST /auth/logout", require("./auth/logout.js")],
  ["POST /auth/unlink", require("./auth/unlink.js")],

  ["GET /presets", require("./presets/index.js")],
  ["POST /presets/save", require("./presets/save.js")],
  ["POST /presets/delete", require("./presets/delete.js")],

  ["GET /status", require("./status/index.js")],
  ["POST /status/use", require("./status/use.js")],

  ["GET /settings", require("./settings/index.js")],
  // ["GET /account", require("./accounts/index.js")],
  // ["GET /account/slack(/:user_id)", require("./account/slack.js")],
  // ["POST /account/merge", require("./account/merge.js")],
  // ["GET /a/:oauth_id", require("./settings/slack.js")],
];

const handlers = routes.reduce((acc, [route, handler]) => {
  if (!route.match(METHODS_REGEX)) {
    throw new Error(`unknown method in route: ${route}`);
  }

  const spaceIndex = route.indexOf(" ");

  const method = route.slice(0, spaceIndex);
  const pattern = route.slice(spaceIndex + 1);

  acc[method] = acc[method] || [];
  acc[method].push([
    new UrlPattern(pattern, { segmentNameCharset: "a-zA-Z0-9_" }),
    handler,
  ]);

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

  const spaceIndex = route.indexOf(" ");
  pattern = route.slice(spaceIndex + 1);

  acc[name] = new UrlPattern(pattern, { segmentNameCharset: "a-zA-Z0-9_" });

  return acc;
}, {});

module.exports.getHandler = function getHandler(req) {
  let handler;

  const pathname = new url.URL(req.url, req.absolute).pathname.replace(
    /(.)\/$/,
    "$1"
  );

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
