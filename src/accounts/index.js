const url = require("url");

module.exports = async function accountsIndex(req, res) {
  const account = await req.getAccount();

  if (!account) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  res.statusCode = 302;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.settingsIndex.stringify(), req.absolute)
  );
};
