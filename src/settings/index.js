const url = require("url");

module.exports = async function settingsIndex(req, res) {
  const slackOauths = await req.getSlackOauths();
  if (!slackOauths.length) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const { user_id } = slackOauths[0];

  res.statusCode = 302;
  res.setHeader(
    "Location",
    new url.URL(
      req.app.routes.settingsSlack.stringify({ user_id }),
      req.absolute
    )
  );
  return;
};
