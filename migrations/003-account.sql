BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "account" (
  id bigserial PRIMARY KEY NOT NULL
);

INSERT INTO "account" (id)
  SELECT id FROM slack_oauth;

ALTER TABLE "slack_oauth" ADD COLUMN account_id bigint;
  UPDATE "slack_oauth" SET account_id = id;
  ALTER TABLE "slack_oauth" ALTER COLUMN account_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS "status_preset" (
  id bigserial PRIMARY KEY NOT NULL,
  account_id bigint NOT NULL,
  status_text text NOT NULL,
  status_emoji text NOT NULL
);

ALTER TABLE "status_preset"
  ADD CONSTRAINT "status_preset_unique_text_emoji"
  UNIQUE ("account_id", "status_text", "status_emoji");

INSERT INTO status_preset
  (account_id, status_text, status_emoji)
  SELECT account_id, status_text, status_emoji
  FROM slack_preset
  LEFT JOIN slack_oauth ON slack_oauth.user_id = slack_preset.slack_user_id;

-- rollback:
-- DROP TABLE account;
-- DROP TABLE status_preset;
-- ALTER TABLE slack_oauth DROP COLUMN account_id;

-- future migration:
-- DROP TABLE "slack_preset";

END TRANSACTION;
