#!/usr/bin/env node

const path = require("path");

const marv = require("marv/api/promise");
const driver = require("marv-pg-driver");

const config = require("./src/config.js");

async function migrate() {
  const directory = path.resolve("migrations");

  const migrations = await marv.scan(directory);
  await marv.migrate(migrations, driver({ connection: config.pg }));
}

if (require.main === module) {
  process.on("unhandledRejection", (err) => {
    throw err;
  });

  migrate();
} else {
  module.exports = {
    migrate,
  };
}
