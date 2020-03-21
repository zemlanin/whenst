const fs = require("fs");
const url = require("url");

const Handlebars = require("handlebars");

const routes = require("./routes.js");

Handlebars.registerHelper("route", function(name, helperOptions) {
  const pattern = routes.reverse[name];

  if (!pattern) {
    throw new Error(`route not found: ${name}`);
  }

  return pattern.stringify(helperOptions.hash);
});

const absoluteRoute = base =>
  function absoluteRoute(name, helperOptions) {
    const pattern = routes.reverse[name];

    if (!pattern) {
      throw new Error(`route not found: ${name}`);
    }

    return url.resolve(base, pattern.stringify(helperOptions.hash));
  };

const tmplMap = {};

module.exports = function render(tmplPath, data) {
  let tmpl;

  if (tmplPath in tmplMap) {
    tmpl = tmplMap[tmplPath];
  } else {
    tmpl = tmplMap[tmplPath] = fs.readFileSync(tmplPath).toString();
  }

  return Handlebars.compile(tmpl, {
    strict: true,
    explicitPartialContext: true
  })(data, {
    helpers: {
      absolute: absoluteRoute(this.absolute)
    }
  });
};
