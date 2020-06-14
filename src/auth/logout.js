const url = require("url");

module.exports = async function authLogout(req, res) {
  const slack_oauth_id = req.formBody.get("slack_oauth_id");

  if (slack_oauth_id) {
    const slack_oauth_ids = req.session.slack_oauth_ids;

    if (slack_oauth_ids && slack_oauth_ids.length) {
      req.session.slack_oauth_ids = slack_oauth_ids.filter(
        (id) => id !== slack_oauth_id
      );
    }
  } else {
    await new Promise((resolve) => req.session.destroy(resolve));
  }

  res.statusCode = 302;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.landing.stringify(), req.absolute)
  );
};
