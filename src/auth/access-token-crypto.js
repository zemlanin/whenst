const crypto = require("crypto");
const config = require("../config.js");

const key = crypto
  .createHash("sha256")
  .update(config.oauth.accessTokenSecret)
  .digest();

function getIVfromSalt(salt) {
  const resizedIV = Buffer.allocUnsafe(16);

  crypto.createHash("sha256").update(salt).digest().copy(resizedIV);

  return resizedIV;
}

function encryptAccessToken(accessToken, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");

  const iv = getIVfromSalt(salt);

  const cipher = crypto.createCipheriv("aes256", key, iv);

  return {
    cipher: cipher.update(accessToken, "binary", "hex") + cipher.final("hex"),
    salt,
  };
}

function decryptAccessToken(cipher, salt) {
  const iv = getIVfromSalt(salt);

  const decipher = crypto.createDecipheriv("aes256", key, iv);

  return decipher.update(cipher, "hex", "binary") + decipher.final("binary");
}

module.exports = {
  encryptAccessToken,
  decryptAccessToken,
};
