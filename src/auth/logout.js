const url = require("url");

module.exports = async function authLogout(req, res) {
  await new Promise((resolve) => req.session.destroy(resolve));

  res.statusCode = 302;
  res.setHeader(
    "Location",
    new url.URL(req.app.routes.landing.stringify(), req.absolute)
  );
};
