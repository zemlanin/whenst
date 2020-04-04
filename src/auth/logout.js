const url = require("url");

module.exports = async function authLogout(req, res) {
  await new Promise((resolve) => req.session.destroy(resolve));

  res.writeHead(302, {
    Location: url.resolve(req.absolute, req.app.routes.landing.stringify()),
  });
};
