const url = require("url");

const Handlebars = require("handlebars");
const sql = require("pg-template-tag").default;

const { normalizeStatus } = require("../normalize-status.js");

const { getEmojiHTML } = require("../presets/common.js");

const tmpl = require.resolve("./templates/index.handlebars");
const TODO_BAD_REQUEST = 400;

module.exports = async function statusIndex(req, res) {
  const formBody = new url.URL(req.url, req.absolute).searchParams;

  let { status_text, status_emoji } = normalizeStatus(formBody);

  if (!status_emoji && !status_text) {
    // TODO: empty status page to clear account statuses
    res.statusCode = TODO_BAD_REQUEST;

    return;
  }

  const account = await req.getAccount();

  const db = await req.db();

  const status_emoji_html = getEmojiHTML(status_emoji, true);

  const status = {
    status_emoji,
    status_text,
    status_emoji_html: status_emoji_html.html,
    status_text_html: getEmojiHTML(Handlebars.escapeExpression(status_text))
      .html,
    custom_emoji: status_emoji_html.custom_emoji,
  };

  const already_saved = account
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
  statusOnServices.slack = slacks.reduce(
    (acc, { oauth_id, current_status }) => {
      const statusNormalizedForGithub = normalizeStatus(status, {
        behavior: normalizeStatus.BEHAVIOR.slack,
      });

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

  const githubs = account
    ? account.oauths.filter((o) => o.service === "github")
    : [];
  statusOnServices.github = githubs.reduce(
    (acc, { oauth_id, current_status }) => {
      const statusNormalizedForGithub = normalizeStatus(status, {
        behavior: normalizeStatus.BEHAVIOR.github,
      });

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

  return res.render(tmpl, {
    account,
    status,
    already_saved,
    statusOnServices,
  });
};
