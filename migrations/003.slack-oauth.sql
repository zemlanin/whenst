CREATE TABLE slack_oauth_tokens (
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  team_id TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  access_token TEXT NOT NULL
) STRICT;
