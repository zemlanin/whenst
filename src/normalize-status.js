const nodeEmoji = require("node-emoji");

const slackApi = require("./external/slack.js");
const githubApi = require("./external/github.js");

const EMOJI_REGEX = /^[a-z0-9+_'-]+$/;
const INSIDE_COLONS_REGEX = /^:[^:]+:$/;

const SLACK_BEHAVIOR = "SLACK_BEHAVIOR";
const GITHUB_BEHAVIOR = "GITHUB_BEHAVIOR";

const BEHAVIOR = {
  slack: SLACK_BEHAVIOR,
  github: GITHUB_BEHAVIOR,
};

module.exports = {
  normalizeStatus,
};

function normalizeStatus(body, { behavior } = {}) {
  let status_emoji = "";
  const body_status_emoji = body.status_emoji ?? body.get?.("status_emoji");
  const body_status_text = body.status_text ?? body.get?.("status_text");

  if (body_status_emoji) {
    const emoji_name = nodeEmoji.which(body_status_emoji, false);

    if (emoji_name) {
      status_emoji = emoji_name;
    } else {
      const status_emoji_without_colons = body_status_emoji.match(
        INSIDE_COLONS_REGEX
      )
        ? body_status_emoji.slice(1, -1)
        : body_status_emoji;

      if (!status_emoji_without_colons.match(EMOJI_REGEX)) {
        return {};
      }

      status_emoji = status_emoji_without_colons;
    }
  }

  let status_text = body_status_text
    ? nodeEmoji.replace(body_status_text.trim(), (emoji) => `:${emoji.key}:`)
    : "";

  let default_status_emoji = false;

  if (!status_emoji) {
    if (behavior === SLACK_BEHAVIOR) {
      // if `status_emoji` is empty, Slack uses emoji-only `status_text` instead
      // so we're doing the same
      if (
        status_text.match(INSIDE_COLONS_REGEX) &&
        status_text.slice(1, -1).match(EMOJI_REGEX)
      ) {
        status_emoji = status_text.slice(1, -1);
        status_text = "";
      } else if (status_text) {
        status_emoji = slackApi.DEFAULT_STATUS_EMOJI;
        default_status_emoji = true;
      }
    } else if (behavior === GITHUB_BEHAVIOR) {
      if (status_text) {
        status_emoji = githubApi.DEFAULT_STATUS_EMOJI;
        default_status_emoji = true;
      }
    }
  }

  if (!status_emoji && !status_text) {
    return {};
  }

  if (default_status_emoji) {
    return { status_emoji, status_text, default_status_emoji };
  }

  return { status_emoji, status_text };
}

normalizeStatus.BEHAVIOR = BEHAVIOR;
