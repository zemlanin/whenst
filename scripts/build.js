#!/usr/bin/env node

require("dotenv").config({
  path: process.env.DOTENV_CONFIG_PATH || null,
});

const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { opendir, writeFile } = require("fs").promises;

async function getSHA1(filepath) {
  return new Promise((resolve, reject) =>
    fs
      .createReadStream(filepath)
      .on("error", reject)
      .pipe(crypto.createHash("sha1").setEncoding("hex"))
      .once("finish", function () {
        resolve(this.read());
      })
  );
}

async function* walk(dir) {
  for await (const dirent of await opendir(dir)) {
    if (dirent.name.startsWith(".")) {
      continue;
    }

    const direntpath = path.resolve(dir, dirent.name);

    if (dirent.isDirectory()) {
      yield* walk(direntpath);
    } else {
      yield direntpath;
    }
  }
}

async function createManifest(assetsFolder) {
  const manifest = {};

  for await (const filepath of await walk(assetsFolder)) {
    const relativePath = path.relative(assetsFolder, filepath);
    manifest[relativePath] = {
      sha1: await getSHA1(filepath),
    };
  }

  return manifest;
}

if (require.main === module) {
  process.on("unhandledRejection", (err) => {
    throw err;
  });

  createManifest(path.resolve(__dirname, "../static")).then((manifest) =>
    writeFile(
      path.resolve(
        process.cwd(),
        process.env.ASSETS_MANIFEST_FILE || "./static/.manifest.json"
      ),
      JSON.stringify(manifest)
    )
  );
} else {
  module.exports = {
    createManifest,
  };
}
