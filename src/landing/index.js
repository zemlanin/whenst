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

async function getProfile(db, redis, token, userId) {
  const apiMethod = "users.profile.get";
  const cacheKey = `slack:${apiMethod}:${userId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await slackApi.apiGet(apiMethod, { token });

  if (freshResp.ok) {
    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}

async function getTeam(db, redis, token, teamId) {
  const apiMethod = "team.info";
  const cacheKey = `slack:${apiMethod}:${teamId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await slackApi.apiGet(apiMethod, { token });

  if (freshResp.ok) {
    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}

async function getTeamEmojis(db, redis, token, teamId) {
  const apiMethod = "emoji.list";
  const cacheKey = `slack:${apiMethod}:${teamId}`;

  const cachedResp = await redis.get(cacheKey);

  if (cachedResp) {
    return JSON.parse(cachedResp);
  }

  const freshResp = await slackApi.apiGet(apiMethod, { token });

  if (freshResp.ok) {
    await redis.set(cacheKey, JSON.stringify(freshResp), "EX", 60 * 60);
  }

  return freshResp;
}

module.exports = async function landing(req, res) {
  let slacks = [];
  const slackOauths = await req.getSlackOauths();
  if (slackOauths.length) {
    const db = await req.db();
    const redis = await req.redis();

    const slack_user_ids = slackOauths.map((o) => o.user_id);

    const dbPresetsRes = await db.query(sql`
      SELECT p.id, p.slack_user_id, p.status_text, p.status_emoji FROM slack_preset p
      WHERE p.slack_user_id = ANY(${slack_user_ids})
      ORDER BY p.id DESC;
    `);

    const profiles = await Promise.all(
      slackOauths.map((o) => getProfile(db, redis, o.access_token, o.user_id))
    );

    const emojis = await Promise.all(
      slackOauths.map((o) =>
        getTeamEmojis(db, redis, o.access_token, o.team_id)
      )
    );

    const teams = await Promise.all(
      slackOauths.map((o) => getTeam(db, redis, o.access_token, o.team_id))
    );

    slacks = slackOauths.map((o, index) => {
      const profile = profiles[index].profile;
      const slacksEmojis = emojis[index].emoji;
      const getEmojiHTML = emojiHTMLGetter(slacksEmojis);
      const presets = dbPresetsRes.rows
        .filter((presetRow) => o.user_id === presetRow.slack_user_id)
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

      const team = teams[index].team;

      return {
        slack_oauth_id: o.id,
        profile,
        team,
        presets,
        current_status,
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
