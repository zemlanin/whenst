const url = require("url");
const config = require("../config.js");

module.exports = async function authSlack(req, res, ctx) {
  const query = ctx.query;

  const error = !query ? "something's wrong" : query.error;

  if (error) {
    res.writeHead(400);
    return error;
  }

  const code = query.code;
  const { client_id, client_secret } = config.slack;
  const redirect_uri = url.resolve(
    ctx.absolute,
    ctx.routes.authSlack.stringify()
  );

  return {
    code,
    client_id,
    client_secret,
    redirect_uri
  };
};
