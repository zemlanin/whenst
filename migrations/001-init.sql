BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "slack_oauth" (
  id bigserial PRIMARY KEY NOT NULL,
  access_token text UNIQUE NOT NULL,
  scopes text[] NOT NULL,
  user_id text NOT NULL,
  team_id text NOT NULL,
  enterprise_id text,
  revoked boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "slack_preset" (
  id bigserial PRIMARY KEY NOT NULL,
  slack_user_id text NOT NULL,
  status_text text NOT NULL,
  status_emoji text NOT NULL,
  status_expiration timestamp(0)
);

ALTER TABLE "slack_preset" DROP CONSTRAINT IF EXISTS "slack_preset_unique_text_emoji";
ALTER TABLE "slack_preset" ADD CONSTRAINT "slack_preset_unique_text_emoji" UNIQUE ("slack_user_id", "status_text", "status_emoji");

END TRANSACTION;
