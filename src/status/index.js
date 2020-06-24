const url = require("url");

const Handlebars = require("handlebars");
const sql = require("pg-template-tag").default;

const slackApi = require("../external/slack.js");

const {
  getProfile,
  getTeam,
  processPresetForm,
} = require("../presets/slack/common.js");

const { getEmojiHTML } = require("../presets/common.js");

const tmpl = require.resolve("./templates/index.handlebars");
const TODO_BAD_REQUEST = 400;

module.exports = async function statusIndex(req, res) {
  const formBody = new url.URL(req.url, req.absolute).searchParams;

  let { status_text, status_emoji } = processPresetForm(formBody);

  if (!status_emoji && !status_text) {
    // TODO: empty status page to clear account statuses
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const account = await req.getAccount();

  const db = await req.db();
  const redis = await req.redis();

  const slackOauths = account
    ? account.oauths.filter((o) => o.service === "slack")
    : [];

  const profiles = await Promise.all(
    slackOauths.map((o) => getProfile(db, redis, o.access_token, o.user_id))
  );

  const teams = await Promise.all(
    slackOauths.map((o) => getTeam(db, redis, o.access_token, o.team_id))
  );

  const slacks = slackOauths.map((o, index) => {
    const { team } = teams[index];
    const { profile } = profiles[index];

    let status = null;
    if (profile.status_text || profile.status_emoji) {
      const status_emoji_html = getEmojiHTML(profile.status_emoji, true);

      status = {
        status_emoji: profile.status_emoji,
        status_text: profile.status_text,
        status_emoji_html: status_emoji_html.html,
        status_text_html: getEmojiHTML(
          Handlebars.escapeExpression(profile.status_text)
        ).html,
        unknown_emoji: status_emoji_html.unknown_emoji,
      };
    }

    return {
      oauth_id: o.oauth_id,
      user_id: o.user_id,
      profile,
      team,
      status,
    };
  });

  const status_emoji_html = getEmojiHTML(status_emoji, true);

  const status = {
    status_emoji,
    status_text,
    status_emoji_html: status_emoji_html.html,
    status_text_html: getEmojiHTML(Handlebars.escapeExpression(status_text))
      .html,
    unknown_emoji: status_emoji_html.unknown_emoji,
  };

  let already_saved = null;

  if (status_emoji && status_emoji !== slackApi.DEFAULT_STATUS_EMOJI) {
    already_saved = (
      await db.query(sql`
        SELECT p.id, p.account_id, p.status_text, p.status_emoji FROM status_preset p
        WHERE p.account_id = ${account.id}
          AND p.status_text = ${status_text}
          AND p.status_emoji = ${status_emoji}
        ORDER BY p.id DESC
        LIMIT 1;
      `)
    ).rows[0];
  } else {
    already_saved = (
      await db.query(sql`
        SELECT p.id, p.account_id, p.status_text, p.status_emoji FROM status_preset p
        WHERE p.account_id = ${account.id}
          AND p.status_text = ${status_text}
          AND (p.status_emoji = '' OR p.status_emoji = ${slackApi.DEFAULT_STATUS_EMOJI})
        ORDER BY p.id DESC
        LIMIT 1;
      `)
    ).rows[0];
  }

  const slackPresets = slacks.reduce((acc, slack) => {
    const { profile } = slack;

    acc[slack.oauth_id] = {
      is_current_status: Boolean(
        status.status_text === profile.status_text &&
          (status.status_emoji === profile.status_emoji ||
            (!status.status_emoji &&
              profile.status_emoji === slackApi.DEFAULT_STATUS_EMOJI))
      ),
      unknown_emoji: getEmojiHTML(status.status_emoji, true).unknown_emoji,
    };

    return acc;
  }, {});

  return res.render(tmpl, {
    account,
    status,
    already_saved,
    slacks,
    slackPresets,
    select_all: formBody.get("select") === "all",
  });
};
