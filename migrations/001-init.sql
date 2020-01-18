BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "event" (
  id uuid PRIMARY KEY NOT NULL,
  track_id uuid NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL,
  ts_start timestamp(0) without time zone NOT NULL,
  ts_end timestamp(0) without time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS event_track_id_id_idx ON "event" (track_id, id);

CREATE TABLE IF NOT EXISTS "track" (
  id uuid PRIMARY KEY NOT NULL,
  meeting_id uuid NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL,
  color_rgb text NOT NULL
);

CREATE INDEX IF NOT EXISTS track_meeting_id_id_idx ON "track" (meeting_id, id);

CREATE TABLE IF NOT EXISTS "meeting" (
  id uuid PRIMARY KEY NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL,
  slug text UNIQUE NOT NULL
);

END TRANSACTION;
