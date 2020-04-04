const sql = require("pg-template-tag").default;
const nodeEmoji = require("node-emoji");

const config = require("../config.js");
const slackApi = require("../external/slack.js");

const tmpl = require.resolve("./templates/index.handlebars");

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji);

const emojiHTMLGetter = (slacksEmojis) => {
  function onMissing(name) {
    const customEmoji = slacksEmojis && slacksEmojis[name];

    if (customEmoji) {
      if (customEmoji.startsWith("alias:")) {
        return getEmojiHTML(`:${customEmoji.slice("alias:".length)}:`);
      } else {
        return `<img class="custom-emoji" src="${customEmoji}" alt="${name}" title=":${name}:">`;
      }
    }

    return `:${name}:`;
  }

  function getEmojiHTML(stringWithEmojis) {
    if (!stringWithEmojis) {
      return "";
    }

    return nodeEmoji.emojify(stringWithEmojis, onMissing);
  }

  return getEmojiHTML;
};

module.exports = async function landing(req, res) {
  let slacks = [];
  if (req.session.slack_oauth_ids && req.session.slack_oauth_ids.length) {
    const db = await req.db();

    const slack_oauth_ids = req.session.slack_oauth_ids;

    const dbOauthRes = await db.query(sql`
      SELECT s.id, s.team_id, s.team_name, s.access_token FROM slack_oauth s
      WHERE s.id = ANY(${slack_oauth_ids})
    `);

    const dbPresetsRes = await db.query(sql`
      SELECT p.id, p.slack_oauth_id, p.status_text, p.status_emoji FROM slack_preset p
      WHERE p.slack_oauth_id = ANY(${slack_oauth_ids})
    `);

    const profiles = await Promise.all(
      dbOauthRes.rows.map((row) =>
        slackApi.apiGet("users.profile.get", { token: row.access_token })
      )
    );

    const emojis = await Promise.all(
      dbOauthRes.rows.map((row) =>
        slackApi.apiGet("emoji.list", { token: row.access_token })
      )
    );

    slacks = dbOauthRes.rows.map((row, index) => {
      const profile = profiles[index].profile;
      const slacksEmojis = emojis[index].emoji;
      const getEmojiHTML = emojiHTMLGetter(slacksEmojis);
      const presets = dbPresetsRes.rows
        .filter((presetRow) => row.id === presetRow.slack_oauth_id)
        .map((presetRow) => ({
          id: presetRow.id,
          status_text: presetRow.status_text,
          status_emoji: presetRow.status_emoji,
          status_text_html: getEmojiHTML(presetRow.status_text),
          status_emoji_html: getEmojiHTML(presetRow.status_emoji),
        }));
      const current_status =
        profile.status_text || profile.status_emoji
          ? {
              status_text: profile.status_text,
              status_emoji: profile.status_emoji,
              status_text_html: getEmojiHTML(profile.status_text),
              status_emoji_html: getEmojiHTML(profile.status_emoji),
              already_saved: presets.find(
                (presetRow) =>
                  presetRow.status_text === profile.status_text &&
                  presetRow.status_emoji === profile.status_emoji
              ),
            }
          : null;

      return {
        slack_oauth_id: row.id,
        profile,
        presets,
        current_status,
        team_name: row.team_name,
        team_id: row.team_id,
        emoji_options: DEFAULT_EMOJI_LIST.concat(Object.keys(slacksEmojis)),
      };
    });
  }

  return res.render(tmpl, {
    session: req.session,
    slacks: slacks,
    client_id: config.slack.client_id,
    state: "", // TODO
  });
};
