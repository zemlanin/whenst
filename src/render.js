const fs = require("fs");
const url = require("url");

const qs = require("qs");
const Handlebars = require("handlebars");

const config = require("./config.js");
const routes = require("./routes.js");

function routeHelper(name, helperOptions) {
  const pattern = routes.reverse[name];

  if (!pattern) {
    throw new Error(`route not found: ${name}`);
  }

  const queryHash = Object.keys(helperOptions.hash).reduce((acc, k) => {
    if (k.startsWith("?")) {
      acc[k.slice(1)] = helperOptions.hash[k];
    }

    return acc;
  }, {});
  const query = qs.stringify(queryHash);

  return (
    pattern.stringify(helperOptions.hash) + (query.length ? "?" + query : "")
  );
}

Handlebars.registerHelper("route", routeHelper);

const absoluteRoute = (base) =>
  function absoluteRoute(name, helperOptions) {
    return url.resolve(base, routeHelper(name, helperOptions));
  };

if (config.assets.manifest) {
  const { base, manifest } = config.assets;

  if (manifest && !base) {
    throw new Error(`config.assets.manifest requires config.assets.base`);
  }

  Handlebars.registerHelper("asset", function assetManifest(file) {
    if (!manifest[file]) {
      throw new Error(`assets not found in manifest: "${file}"`);
    }

    return url.resolve(base, manifest[file]);
  });
} else if (config.assets.base) {
  const { base, cacheBuster } = config.assets;

  Handlebars.registerHelper("asset", function assetBase(file) {
    return url.resolve(base, file + "?v=" + cacheBuster);
  });
} else {
  const { cacheBuster } = config.assets;

  Handlebars.registerHelper("asset", function assetLocal(file) {
    return routes.reverse["cdn"].stringify({ _: file }) + "?v=" + cacheBuster;
  });
}

const tmplMap = {};

module.exports = function renderMiddleware(req, res, next) {
  // @csrfToken
  const csrfToken = () => req.csrfToken();

  res.render = function render(tmplPath, data) {
    let tmpl;

    if (tmplPath in tmplMap) {
      tmpl = tmplMap[tmplPath];
    } else {
      tmpl = tmplMap[tmplPath] = fs.readFileSync(tmplPath).toString();
    }

    res.setHeader("content-type", "text/html");

    return Handlebars.compile(tmpl, {
      strict: true,
      explicitPartialContext: true,
    })(data, {
      data: {
        csrfToken,
      },
      helpers: {
        absolute: absoluteRoute(req.absolute),
      },
    });
  };

  next();
};
