require("dotenv").config({
  path: process.env.DOTENV_CONFIG_PATH || null,
});

const fs = require("fs");
const path = require("path");

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret && process.env.NODE_ENV !== "development") {
    throw new Error(`SESSION_SECRET is required in production env`);
  }

  return secret || "6563eae1e1c146d1a377a7779a03bbf3";
}

function getSlackConfig() {
  const {
    SLACK_CLIENT_ID,
    SLACK_CLIENT_SECRET,
    SLACK_SIGNING_SECRET,
  } = process.env;

  if (!SLACK_CLIENT_ID) {
    throw new Error(`SLACK_CLIENT_ID is required`);
  }

  if (!SLACK_CLIENT_SECRET) {
    throw new Error(`SLACK_CLIENT_SECRET is required`);
  }

  if (!SLACK_SIGNING_SECRET) {
    throw new Error(`SLACK_SIGNING_SECRET is required`);
  }

  return {
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
    signing_secret: SLACK_SIGNING_SECRET,
  };
}

const TODO = null;

module.exports = {
  port: process.env.PORT || 8000,
  pg: {
    connectionString: process.env.DATABASE_URL || null,
  },
  redis: {
    url: process.env.REDIS_URL || null,
  },
  session: {
    secret: getSessionSecret(),
  },
  slack: getSlackConfig(),
  production: process.env.NODE_ENV !== "development",
  assets: {
    base: process.env.ASSETS_BASE || null,
    manifest: process.env.ASSETS_MANIFEST_FILE
      ? fs.readFileSync(
          path.resolve(process.cwd(), process.env.ASSETS_MANIFEST_FILE)
        )
      : null,
    cacheBuster: TODO || parseInt(Math.random() * 36 * 36 * 36).toString(36),
  },
  disableCSRFCheck: false, // overriden in tests
};
