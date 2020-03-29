BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "slack_oauth" (
  id bigserial PRIMARY KEY NOT NULL,
  access_token text UNIQUE NOT NULL,
  scope text NOT NULL,
  user_id text NOT NULL,
  team_id text NOT NULL,
  team_name text NOT NULL,
  enterprise_id text
);

-- `node-connect-pg-simple/table.sql`
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_pkey";
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
-- /`node-connect-pg-simple/table.sql`

CREATE TABLE IF NOT EXISTS "slack_preset" (
  id bigserial PRIMARY KEY NOT NULL,
  slack_oauth_id text NOT NULL,
  status_text text NOT NULL,
  status_emoji text NOT NULL,
  status_expiration timestamp(0)
);

ALTER TABLE "slack_preset" DROP CONSTRAINT IF EXISTS "slack_preset_unique_text_emoji";
ALTER TABLE "slack_preset" ADD CONSTRAINT "slack_preset_unique_text_emoji" UNIQUE ("slack_oauth_id", "status_text", "status_emoji");

END TRANSACTION;
