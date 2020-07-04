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

function getAccessTokenSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret && process.env.NODE_ENV !== "development") {
    throw new Error(`ACCESS_TOKEN_SECRET is required in production env`);
  }

  return secret || "f6b8d6921ec724dcd4a98cc81ffb31a1";
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
    scope:
      "team:read users.profile:read users.profile:write dnd:write emoji:read",
  };
}

function getGithubConfig() {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

  if (!GITHUB_CLIENT_ID) {
    throw new Error(`GITHUB_CLIENT_ID is required`);
  }

  if (!GITHUB_CLIENT_SECRET) {
    throw new Error(`GITHUB_CLIENT_SECRET is required`);
  }

  return {
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    scope: "user",
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
  oauth: {
    accessTokenSecret: getAccessTokenSecret(),
  },
  slack: getSlackConfig(),
  github: getGithubConfig(),
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
  disableHTTPSEnforce: false, // overriden in tests
  disableCSRFCheck: false, // overriden in tests
};
