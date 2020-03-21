const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function landing(req, res, ctx) {
  return ctx.render(tmpl, {
    user: null, // TODO
    client_id: config.slack.client_id,
    state: "" // TODO
  });
};
