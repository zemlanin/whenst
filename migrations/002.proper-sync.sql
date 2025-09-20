BEGIN;

CREATE TABLE session_timezones (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  client_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  tombstone INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL,
  label TEXT NOT NULL,
  position TEXT NOT NULL
) WITHOUT ROWID, STRICT;

INSERT INTO session_timezones (id, session_id, timezone, label, position)
SELECT
  json_extract(t.value, '$.id') as id,
  session_id,
  json_extract(t.value, '$.timezone') as timezone,
  json_extract(t.value, '$.label') as label,
  char(unicode('A') + t.rowid) as position
FROM session_settings, json_each(session_settings.timezones) as t;

CREATE TABLE account_timezones (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  client_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  tombstone INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL,
  label TEXT NOT NULL,
  position TEXT NOT NULL
) WITHOUT ROWID, STRICT;

INSERT INTO account_timezones (id, account_id, timezone, label, position)
SELECT
  json_extract(t.value, '$.id') as id,
  account_id,
  json_extract(t.value, '$.timezone') as timezone,
  json_extract(t.value, '$.label') as label,
  char(unicode('A') + t.rowid) as position
FROM account_settings, json_each(account_settings.timezones) as t;

COMMIT;
