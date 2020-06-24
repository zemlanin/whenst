const nodeEmoji = require("node-emoji");

function onMissing(name) {
  // `unknown_emoji = result.startWith("<span")`
  //
  // this won't catch unknown emojis in status_text
  // because `unknown :xxxx: emoji` is a valid status
  return `<span class="not-found">:${name}:</span>`;
}

function getEmojiHTML(stringWithEmojis, wholeStringIsEmoji) {
  if (!stringWithEmojis) {
    return { html: "" };
  }

  if (wholeStringIsEmoji) {
    stringWithEmojis = `:${stringWithEmojis}:`;
  }

  const html = nodeEmoji.emojify(stringWithEmojis, onMissing);
  const unknown_emoji = html.startsWith("<span");

  if (unknown_emoji) {
    return { html, unknown_emoji };
  }

  return { html };
}

module.exports = {
  getEmojiHTML,
};
