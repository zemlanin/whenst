const fs = require("fs");

const Handlebars = require("handlebars");

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
  })(data);
};
