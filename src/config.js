require("dotenv").config();

module.exports = {
  port: process.env.PORT || 8000,
  pg: {
    database: process.env.PGDATABASE || "whenst"
  },
  slack: process.env.SLACK_CLIENT_ID
    ? {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET || ""
      }
    : null,
  production: process.env.NODE_ENV !== "development",
  cdn: process.env.CDN || ""
};
