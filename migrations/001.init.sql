CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_settings (
  session_id TEXT PRIMARY KEY,
  timezones JSON
);

CREATE TABLE account_settings (
  account_id TEXT PRIMARY KEY,
  timezones JSON
);

CREATE TABLE sqrap_states (
  session_id TEXT NOT NULL,
  account_id TEXT,
  code TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
