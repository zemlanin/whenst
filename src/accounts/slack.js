const url = require("url");

const tmpl = require.resolve("./templates/slack.handlebars");

module.exports = async function accountsSlack(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const slackOauths = account.oauths.filter((o) => o.service === "slack");

  if (!req.params.user_id && slackOauths[0]) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.accountsSlack.stringify({
          user_id: slackOauths[0].user_id,
        }),
        req.absolute
      )
    );
    return;
  }

  const oauth = slackOauths.find((o) => o.user_id === req.params.user_id);

  if (!oauth) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      // req.app.routes.accountsIndex
      new url.URL(req.app.routes.settingsIndex.stringify(), req.absolute)
    );
    return;
  }

  return res.render(tmpl, {
    oauth,
  });
};
