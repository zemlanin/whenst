const nodeEmoji = require("node-emoji");

function getEmojiHTML(stringWithEmojis, wholeStringIsEmoji) {
  if (!stringWithEmojis) {
    return { html: "" };
  }

  if (wholeStringIsEmoji) {
    stringWithEmojis = `:${stringWithEmojis}:`;
  }

  let custom_emoji = false;

  const html = nodeEmoji.emojify(stringWithEmojis, function onMissing(name) {
    custom_emoji = true;
    return `:${name}:`;
  });

  if (custom_emoji) {
    return { html, custom_emoji };
  }

  return { html };
}

module.exports = {
  getEmojiHTML,
};
