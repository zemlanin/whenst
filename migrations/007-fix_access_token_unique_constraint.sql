BEGIN TRANSACTION;

ALTER TABLE "github_oauth" DROP CONSTRAINT github_oauth_access_token_key;
ALTER TABLE "slack_oauth" DROP CONSTRAINT slack_oauth_access_token_key;

END TRANSACTION;
