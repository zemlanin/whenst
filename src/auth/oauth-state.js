const url = require("url");
const crypto = require("crypto");

module.exports = {
  getOauthState,
  parseOauthState,
};

const config = require("../config.js");
const routes = require("../routes.js");

const key = crypto.createHash("sha256").update(config.session.secret).digest();

const getNonce = () => {
  return (
    Math.floor(1000000 * Math.random())
      .toString()
      .padStart(6, "0") + ":"
  );
};

const stripNonce = (str) => {
  if (!str) {
    return str;
  }

  if (!str.match(/^[0-9]{6}:/)) {
    return "";
  }

  return str.slice(7);
};

function getOauthState(sessionId, nextURL) {
  if (!sessionId) {
    throw new Error("`sessionId` argument is required");
  }

  const { protocol, hostname, pathname, search } = new url.URL(
    nextURL || "/",
    "https://example.com/"
  );

  if (
    protocol !== "https:" ||
    hostname !== "example.com" ||
    !pathname.startsWith("/")
  ) {
    nextURL = "/";
  } else {
    nextURL = pathname + search;
  }

  const iv = crypto
    .createHash("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 16);
  const cipher = crypto.createCipheriv("aes256", key, iv);

  cipher.update(getNonce(), "binary", "hex");

  return cipher.update(nextURL, "binary", "hex") + cipher.final("hex");
}

function parseOauthState(sessionId, state) {
  if (!sessionId) {
    throw new Error("`sessionId` argument is required");
  }

  if (!state) {
    throw new Error("`state` argument is required");
  }

  const iv = crypto
    .createHash("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 16);
  const decipher = crypto.createDecipheriv("aes256", key, iv);

  const nextURL = stripNonce(
    decipher.update(state, "hex", "binary") + decipher.final("binary")
  );

  if (!nextURL) {
    throw new Error("invalid state");
  }

  const { protocol, hostname, pathname, search } = new url.URL(
    nextURL,
    "https://example.com/"
  );

  if (
    protocol !== "https:" ||
    hostname !== "example.com" ||
    !pathname.startsWith("/")
  ) {
    throw new Error("invalid state");
  }

  const knownRoute = routes.handlers["GET"].some(
    ([pattern]) => !!pattern.match(pathname)
  );

  if (!knownRoute) {
    return "/";
  }

  return pathname + search;
}
