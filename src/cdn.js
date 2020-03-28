const fs = require("fs");
const url = require("url");
const path = require("path");

const mime = require("mime");

const config = require("./config.js");

module.exports = async function CDN(req, res) {
  if (config.cdn) {
    res.writeHead(302, { Location: new url.URL(req.params._, config.cdn) });
    return;
  } else if (config.production) {
    res.statusCode = 404;
    return;
  }

  const filepath = path.resolve(__dirname, "../static/", req.params._);
  const mimetype = mime.getType(filepath);

  const filestream = fs.createReadStream(filepath);

  return new Promise(resolve => {
    filestream.on("error", () => {
      res.setHeader("Content-Type", "text/plain");
      res.statusCode = 404;
      resolve("404 Not Found");
    });

    if (mimetype) {
      res.on("pipe", () => {
        res.setHeader("Content-Type", mimetype);
      });
    }

    filestream.pipe(res);

    filestream.on("end", () => {
      resolve();
    });
  });
};
