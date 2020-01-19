require("dotenv").config();

module.exports = {
  port: process.env.PORT || 8000,
  pg: {
    database: process.env.PGDATABASE || "whenst"
  },
  production: process.env.NODE_ENV !== "development",
  cdn: process.env.CDN || ""
};
