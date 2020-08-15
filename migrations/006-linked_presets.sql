BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "preset" (
  id bigserial PRIMARY KEY NOT NULL,
  account_id bigint NOT NULL,
  title text
);

CREATE TABLE IF NOT EXISTS "slack_status" (
  id bigserial PRIMARY KEY NOT NULL,
  preset_id bigint NOT NULL,
  slack_oauth_id bigint NOT NULL,
  status_text text NOT NULL,
  status_emoji text NOT NULL
);

ALTER TABLE "slack_status"
  ADD CONSTRAINT "slack_status_single_oauth"
  UNIQUE ("preset_id", "slack_oauth_id");

CREATE TABLE IF NOT EXISTS "github_status" (
  id bigserial PRIMARY KEY NOT NULL,
  preset_id bigint NOT NULL,
  github_oauth_id bigint NOT NULL,
  status_text text NOT NULL,
  status_emoji text NOT NULL
);

ALTER TABLE "github_status"
  ADD CONSTRAINT "github_status_single_oauth"
  UNIQUE ("preset_id", "github_oauth_id");

-- future migration:
-- DROP TABLE "status_preset";

END TRANSACTION;
