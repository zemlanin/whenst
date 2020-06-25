BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "github_oauth" (
  id bigserial PRIMARY KEY NOT NULL,
  account_id bigint,
  access_token text UNIQUE NOT NULL,
  scopes text[] NOT NULL,
  user_id text NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);

END TRANSACTION;
