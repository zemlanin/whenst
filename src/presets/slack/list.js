const url = require("url");

const sql = require("pg-template-tag").default;
const nodeEmoji = require("node-emoji");
const Handlebars = require("handlebars");

const slackApi = require("../../external/slack.js");
const {
  getProfile,
  getTeam,
  getTeamEmojis,
  emojiHTMLGetter,
} = require("./common.js");

const tmpl = require.resolve("./templates/index.handlebars");

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji).map((name) => ({
  name,
  html: nodeEmoji.emoji[name],
}));

module.exports = async function slackPresetsList(req, res) {
  const slackOauths = await req.getSlackOauths();
  if (!slackOauths.length) {
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(req.app.routes.landing.stringify(), req.absolute)
    );
    return;
  }

  if (!(req.params && req.params.oauth_id)) {
    const { oauth_id } = slackOauths[0];
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.slackPresetsList.stringify({ oauth_id }),
        req.absolute
      )
    );
    return;
  }

  const user_oauth = slackOauths.find(
    (o) => o.oauth_id === req.params.oauth_id
  );

  if (!user_oauth) {
    const { oauth_id } = slackOauths[0];
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.slackPresetsList.stringify({ oauth_id }),
        req.absolute
      )
    );
    return;
  }

  const db = await req.db();
  const redis = await req.redis();

  const profiles = await Promise.all(
    slackOauths.map((o) => getProfile(db, redis, o.access_token, o.user_id))
  );

  const teams = await Promise.all(
    slackOauths.map((o) => getTeam(db, redis, o.access_token, o.team_id))
  );

  const teamEmojis = await Promise.all(
    slackOauths.map((o) => getTeamEmojis(db, redis, o.access_token, o.team_id))
  );

  const dbPresetsRes = await db.query(sql`
      SELECT p.id, p.slack_user_id, p.status_text, p.status_emoji FROM slack_preset p
      WHERE p.slack_user_id = ${user_oauth.user_id}
      ORDER BY p.id DESC;
    `);

  const slacks = slackOauths.map((o, index) => {
    const { profile } = profiles[index];
    const { emoji: teamEmoji } = teamEmojis[index];
    const getEmojiHTML = emojiHTMLGetter(teamEmoji);
    let current_status = null;

    if (profile.status_text || profile.status_emoji) {
      const status_emoji_html = getEmojiHTML(profile.status_emoji);

      current_status = {
        status_emoji: profile.status_emoji,
        status_text: slackApi.decodeStatusText(profile.status_text),
        status_emoji_html: status_emoji_html.html,
        status_text_html: getEmojiHTML(profile.status_text).html,
        unknown_emoji: status_emoji_html.unknown_emoji,
      };
    }

    const { team } = teams[index];

    return {
      oauth_id: o.id,
      user_id: o.user_id,
      profile,
      team,
      teamEmoji,
      getEmojiHTML,
      current_status,
    };
  });

  const activeSlack = slacks.find((s) => s.oauth_id === user_oauth.oauth_id);
  const presets = dbPresetsRes.rows.map((presetRow) => {
    const status_emoji_html = activeSlack.getEmojiHTML(
      presetRow.status_emoji || slackApi.DEFAULT_STATUS_EMOJI
    );

    return {
      id: presetRow.id,
      status_emoji: presetRow.status_emoji || slackApi.DEFAULT_STATUS_EMOJI,
      status_text: presetRow.status_text,
      status_emoji_html: status_emoji_html.html,
      status_text_html: activeSlack.getEmojiHTML(
        Handlebars.escapeExpression(presetRow.status_text)
      ).html,
      unknown_emoji: status_emoji_html.unknown_emoji,
    };
  });

  if (activeSlack.current_status) {
    const current_status = activeSlack.current_status;
    for (const preset of presets) {
      if (
        preset.status_text === current_status.status_text &&
        preset.status_emoji === current_status.status_emoji
      ) {
        preset.is_current_status = true;
      }
    }
  }

  return res.render(tmpl, {
    slacks,
    activeSlack,
    presets,
    emoji_options: DEFAULT_EMOJI_LIST.concat(
      Object.keys(activeSlack.teamEmoji).map((name) => ({
        name,
        html: activeSlack.getEmojiHTML(`:${name}:`).html,
      }))
    ),
  });
};
