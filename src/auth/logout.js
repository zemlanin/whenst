const url = require("url");

module.exports = async function authLogout(req, res) {
  await new Promise((resolve) => req.session.destroy(resolve));
  res.statusCode = 302;
  res.setHeader(
    "Location",
    url.resolve(req.absolute, req.app.routes.landing.stringify())
  );
};
