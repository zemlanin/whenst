require("dotenv").config();

const fs = require("fs");
const path = require("path");

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret && process.env.NODE_ENV !== "development") {
    throw new Error(`SESSION_SECRET is required in production env`);
  }

  return secret || "6563eae1e1c146d1a377a7779a03bbf3";
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
  slack: process.env.SLACK_CLIENT_ID
    ? {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET || "",
      }
    : null,
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
};
