const url = require("url");

const Handlebars = require("handlebars");
const sql = require("pg-template-tag").default;

const config = require("../config.js");
const { getOauthState } = require("../auth/oauth-state.js");
const { normalizeStatus } = require("../normalize-status.js");
const { getEmojiHTML } = require("../presets/common.js");
const tmpl = require.resolve("./templates/index.handlebars");

module.exports = async function statusIndex(req, res) {
  const formBody = new url.URL(req.url, req.absolute).searchParams;

  let { status_text, status_emoji, empty: isEmptyStatus } = normalizeStatus(
    formBody
  );

  const account = await req.getAccount();

  const db = await req.db();

  const status_emoji_html = getEmojiHTML(status_emoji, true);

  if (!isEmptyStatus && !status_text && !status_emoji) {
    res.statusCode = 404;

    return;
  }

  const status = isEmptyStatus
    ? { empty: true, status_text, status_emoji }
    : {
        status_emoji,
        status_text,
        status_emoji_html: status_emoji_html.html,
        status_text_html: getEmojiHTML(Handlebars.escapeExpression(status_text))
          .html,
        custom_emoji: status_emoji_html.custom_emoji,
      };

  const already_saved =
    account && !isEmptyStatus
      ? (
          await db.query(sql`
      SELECT p.id, p.account_id, p.status_text, p.status_emoji FROM status_preset p
      WHERE p.account_id = ${account.id}
        AND p.status_text = ${status_text}
        AND p.status_emoji = ${status_emoji}
      ORDER BY p.id DESC
      LIMIT 1;
    `)
        ).rows[0]
      : null;

  const statusOnServices = {};

  const slacks = account
    ? account.oauths.filter((o) => o.service === "slack")
    : [];

  const statusNormalizedForSlack = slacks.length
    ? normalizeStatus(status, {
        behavior: normalizeStatus.BEHAVIOR.slack,
      })
    : null;

  statusOnServices.slack = slacks.reduce(
    (acc, { oauth_id, current_status }) => {
      const statusNormalizedForSlack = normalizeStatus(status, {
        behavior: normalizeStatus.BEHAVIOR.slack,
      });

      acc[oauth_id] = {
        is_current_status: Boolean(
          current_status &&
            current_status.status_emoji ===
              statusNormalizedForSlack.status_emoji &&
            current_status.status_text === statusNormalizedForSlack.status_text
        ),
        custom_emoji: getEmojiHTML(statusNormalizedForSlack.status_emoji, true)
          .custom_emoji,
      };

      return acc;
    },
    {}
  );

  const githubs = account
    ? account.oauths.filter((o) => o.service === "github")
    : [];

  const statusNormalizedForGithub = githubs.length
    ? normalizeStatus(status, {
        behavior: normalizeStatus.BEHAVIOR.github,
      })
    : null;

  statusOnServices.github = githubs.reduce(
    (acc, { oauth_id, current_status }) => {
      acc[oauth_id] = {
        is_current_status: Boolean(
          current_status &&
            current_status.status_emoji ===
              statusNormalizedForGithub.status_emoji &&
            current_status.status_text === statusNormalizedForGithub.status_text
        ),
        custom_emoji: getEmojiHTML(statusNormalizedForGithub.status_emoji, true)
          .custom_emoji,
      };

      return acc;
    },
    {}
  );

  const can_save_presets =
    account &&
    (
      await db.query(sql`
        SELECT count(p.id)
        FROM status_preset p
        WHERE p.account_id = ${account.id};
      `)
    ).rows[0].count < 100;

  const state = getOauthState(req.session.id, req.url);

  return res.render(tmpl, {
    account,
    status,
    warnings:
      statusNormalizedForSlack?.warnings || statusNormalizedForGithub?.warnings
        ? {
            slack: statusNormalizedForSlack?.warnings || {},
            github: statusNormalizedForGithub?.warnings || {},
          }
        : null,
    already_saved,
    statusOnServices,
    can_save_presets,
    slackAuth: {
      client_id: config.slack.client_id,
      scope: config.slack.scope,
      state,
    },
    githubAuth: {
      client_id: config.github.client_id,
      scope: config.github.scope,
      state,
    },
  });
};
