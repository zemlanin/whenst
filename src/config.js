require("dotenv").config();

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret && process.env.NODE_ENV !== "development") {
    throw new Error(`SESSION_SECRET is required in production env`);
  }

  return secret || "6563eae1e1c146d1a377a7779a03bbf3";
}

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
  cdn: process.env.CDN || "",
};
