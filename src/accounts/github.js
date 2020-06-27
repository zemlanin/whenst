const url = require("url");

const tmpl = require.resolve("./templates/github.handlebars");

module.exports = async function accountsGithub(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  const githubOauths = account.oauths.filter((o) => o.service === "github");

  if (!req.params.user_id && githubOauths[0]) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.accountsGithub.stringify({
          user_id: githubOauths[0].user_id,
        }),
        req.absolute
      )
    );
    return;
  }

  const oauth = githubOauths.find((o) => o.user_id === req.params.user_id);

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
