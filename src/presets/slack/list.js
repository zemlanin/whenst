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

const DEFAULT_EMOJI_LIST = Object.keys(nodeEmoji.emoji);

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

  if (!(req.params && req.params.user_id)) {
    const { user_id } = slackOauths[0];
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.slackPresetsList.stringify({ user_id }),
        req.absolute
      )
    );
    return;
  }

  const user_oauth = slackOauths.find((o) => o.user_id === req.params.user_id);

  if (!user_oauth) {
    const { user_id } = slackOauths[0];
    res.statusCode = 302;
    res.setHeader(
      "Location",
      new url.URL(
        req.app.routes.slackPresetsList.stringify({ user_id }),
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
    const profile = profiles[index].profile;
    const teamEmoji = teamEmojis[index].emoji;
    const getEmojiHTML = emojiHTMLGetter(teamEmoji);
    const current_status =
      profile.status_text || profile.status_emoji
        ? {
            status_text: slackApi.decodeStatusText(profile.status_text),
            status_emoji: profile.status_emoji,
            status_text_html: getEmojiHTML(profile.status_text),
            status_emoji_html: getEmojiHTML(profile.status_emoji),
          }
        : null;

    const team = teams[index].team;

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

  const activeSlack = slacks.find((s) => s.user_id === user_oauth.user_id);
  const presets = dbPresetsRes.rows.map((presetRow) => ({
    id: presetRow.id,
    status_text: presetRow.status_text,
    status_emoji: presetRow.status_emoji,
    status_text_html: activeSlack.getEmojiHTML(
      Handlebars.escapeExpression(presetRow.status_text)
    ),
    status_emoji_html: activeSlack.getEmojiHTML(presetRow.status_emoji),
  }));
  const currentStatusAlreadySaved = Boolean(
    activeSlack.current_status &&
      presets.find(
        (presetRow) =>
          presetRow.status_text === activeSlack.current_status.status_text &&
          presetRow.status_emoji === activeSlack.current_status.status_emoji
      )
  );

  return res.render(tmpl, {
    slacks,
    activeSlack,
    presets,
    currentStatusAlreadySaved,
    emoji_options: DEFAULT_EMOJI_LIST.concat(
      Object.keys(activeSlack.teamEmoji)
    ),
  });
};
