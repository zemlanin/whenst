const config = require("../config.js");

const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function landing(req, res) {
  return res.render(tmpl, {
    session: req.session, // TODO
    client_id: config.slack.client_id,
    state: "" // TODO
  });
};
