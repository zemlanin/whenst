const fs = require("fs");
const path = require("path");

const mime = require("mime");

module.exports = async function CDN(req, res) {
  const filepath = path.resolve(__dirname, "../static/", req.params._);
  const mimetype = mime.getType(filepath);

  const filestream = fs.createReadStream(filepath);
  req.sessionID = null;
  res.setHeader("Cache-Control", `max-age=${60 * 60 * 24}`);
  if (mimetype) {
    res.setHeader("Content-Type", mimetype);
  }

  return new Promise((resolve, reject) => {
    filestream.on("error", (err) => {
      if (err.code === "ENOENT") {
        res.statusCode = 404;
      }
      res.removeHeader("Cache-Control");
      reject(err);
    });

    filestream.pipe(res);

    filestream.on("close", () => {
      resolve();
    });
  });
};
