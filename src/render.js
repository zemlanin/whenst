const fs = require("fs");
const url = require("url");
const path = require("path");

const Handlebars = require("handlebars");

const config = require("./config.js");
const routes = require("./routes.js");

function routeHelper(name, helperOptions) {
  const pattern = routes.reverse[name];

  if (!pattern) {
    throw new Error(`route not found: ${name}`);
  }

  if (Object.keys(helperOptions.hash).some((k) => k.startsWith("?"))) {
    const query = new url.URLSearchParams();

    for (const k of Object.keys(helperOptions.hash)) {
      if (k.startsWith("?")) {
        query.append(k.slice(1), helperOptions.hash[k] ?? "");
      }
    }

    return pattern.stringify(helperOptions.hash) + "?" + query.toString();
  }

  return pattern.stringify(helperOptions.hash);
}

Handlebars.registerHelper("route", routeHelper);

Handlebars.registerHelper("eq", function equalsHelper(a, b) {
  return a === b;
});

const absoluteRoute = (base) =>
  function absoluteRoute(name, helperOptions) {
    return new url.URL(routeHelper(name, helperOptions), base);
  };

if (config.assets.manifest) {
  const { cacheBuster, manifest } = config.assets;

  Handlebars.registerHelper("asset", function assetManifest(file) {
    const shortHash = manifest[file]?.sha1?.slice(0, 6);

    return (
      routes.reverse["cdn"].stringify({ _: file }) +
      (shortHash ? `?v=${shortHash}` : `?_=${cacheBuster}`)
    );
  });
} else {
  const { cacheBuster } = config.assets;

  Handlebars.registerHelper("asset", function assetLocal(file) {
    return routes.reverse["cdn"].stringify({ _: file }) + `?_=${cacheBuster}`;
  });
}

const HANDLEBARS_EXT = ".handlebars";

for (const file of fs.readdirSync(path.resolve(__dirname, "partials"))) {
  const ext = path.extname(file);
  if (ext !== HANDLEBARS_EXT) {
    continue;
  }

  const basename = path.basename(file, HANDLEBARS_EXT);

  Handlebars.registerPartial(
    "partials_" + basename,
    fs.readFileSync(path.resolve(__dirname, "partials", file)).toString()
  );
}

const tmplMap = {};

module.exports = function renderMiddleware(req, res, next) {
  // @csrfToken
  const csrfToken = () => req.csrfToken();

  res.render = function render(tmplPath, data) {
    let tmpl;

    res.timing.start("handlebars");

    if (tmplPath in tmplMap) {
      tmpl = tmplMap[tmplPath];
    } else {
      tmpl = tmplMap[tmplPath] = fs.readFileSync(tmplPath).toString();
    }

    res.setHeader("content-type", "text/html; charset=utf-8");

    const rendered = Handlebars.compile(tmpl, {
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

    res.timing.stop("handlebars");

    return rendered;
  };

  next();
};
