BEGIN TRANSACTION;

ALTER TABLE "github_oauth" ADD COLUMN access_token_encrypted text;
ALTER TABLE "github_oauth" ADD COLUMN access_token_salt text;
ALTER TABLE "slack_oauth" ADD COLUMN access_token_encrypted text;
ALTER TABLE "slack_oauth" ADD COLUMN access_token_salt text;

-- TODO:
--   DROP COLUMN access_token
--   ALTER COLUMN access_token_encrypted ADD CONSTRAINT NOT NULL
--   ALTER COLUMN access_token_salt ADD CONSTRAINT NOT NULL

END TRANSACTION;
