import Database from "better-sqlite3";
import { getAccount } from "../_common/account.js";

const db = new Database(".data/whenst.db", {});
db.pragma("journal_mode = WAL");

const timezonesDB = new Database(".data/timezones.db", {
  readonly: true,
});
timezonesDB.loadExtension(
  process.env.WHENST_SPATIALITE_MOD ||
    // `brew install spatialite-tools`
    "/opt/homebrew/lib/mod_spatialite.dylib",
);

export { db, timezonesDB };

/** @deprecated */
export function getSessionTimezones(sessionId: string) {
  const account = getAccount(sessionId);

  const row = account
    ? db
        .prepare<
          { account_id: string },
          { timezones: string }
        >(`SELECT timezones FROM account_settings WHERE account_id = @account_id`)
        .get({ account_id: account.id })
    : db
        .prepare<
          { session_id: string },
          { timezones: string }
        >(`SELECT timezones FROM session_settings WHERE session_id = @session_id`)
        .get({ session_id: sessionId });

  if (row?.timezones) {
    try {
      return JSON.parse(row.timezones) as {
        id: string;
        label: string;
        timezone: string;
      }[];
    } catch (_e) {
      return undefined;
    }
  }

  return undefined;
}

export function getSessionTimezonesLegacy(sessionId: string) {
  const account = getAccount(sessionId);

  return account
    ? db
        .prepare<{ account_id: string }, { timezones: string }>(
          `
          SELECT id, label, timezone FROM account_timezones
          WHERE account_id = @account_id AND NOT tombstone
          ORDER BY position ASC
        `,
        )
        .all({ account_id: account.id })
    : db
        .prepare<{ session_id: string }, { timezones: string }>(
          `
          SELECT id, label, timezone FROM session_timezones
          WHERE session_id = @session_id AND NOT tombstone
          ORDER BY position ASC
        `,
        )
        .all({ session_id: sessionId });
}

export function upsertTimezone(
  patch: {
    id: string;
    updated_at: string;
    tombstone: 0;
    timezone: string;
    label: string;
    position: string;
  },
  {
    sessionId,
    accountId,
  }: {
    sessionId?: string;
    accountId?: string;
  },
) {
  if (accountId) {
    db.prepare(
      `
        INSERT INTO account_timezones (
          id, account_id, updated_at, client_updated_at, timezone, label, position, tombstone
        )
        VALUES (
          @id,
          @account_id,
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          @client_updated_at,
          @timezone,
          @label,
          @position,
          0
        )
        ON CONFLICT(id) DO UPDATE SET
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          client_updated_at = @client_updated_at,
          timezone = @timezone,
          label = @label,
          position = @position,
          tombstone = 0
        WHERE id = @id AND account_id = @account_id AND client_updated_at < @client_updated_at
      `,
    ).run({
      id: patch.id,
      account_id: accountId,
      client_updated_at: patch.updated_at,
      timezone: patch.timezone,
      label: patch.label,
      position: patch.position,
    });

    return;
  }

  if (sessionId) {
    db.prepare(
      `
        INSERT INTO session_timezones (
          id, session_id, updated_at, client_updated_at, timezone, label, position, tombstone
        )
        VALUES (
          @id,
          @session_id,
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          @client_updated_at,
          @timezone,
          @label,
          @position,
          0
        )
        ON CONFLICT(id) DO UPDATE SET
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          client_updated_at = @client_updated_at,
          timezone = @timezone,
          label = @label,
          position = @position,
          tombstone = 0
        WHERE id = @id AND session_id = @session_id AND client_updated_at < @client_updated_at
      `,
    ).run({
      id: patch.id,
      session_id: sessionId,
      client_updated_at: patch.updated_at,
      timezone: patch.timezone,
      label: patch.label,
      position: patch.position,
    });

    return;
  }
}
export function deleteExistingTimezone(
  patch: { id: string; updated_at: string; tombstone: 1 },
  {
    sessionId,
    accountId,
  }: {
    sessionId?: string;
    accountId?: string;
  },
) {
  if (accountId) {
    db.prepare(
      `
        INSERT INTO account_timezones (
          id, account_id, updated_at, client_updated_at, timezone, label, position, tombstone
        )
        VALUES (
          @id,
          @account_id,
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          @client_updated_at,
          @timezone,
          @label,
          @position,
          1
        )
        ON CONFLICT(id) DO UPDATE SET
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          client_updated_at = @client_updated_at,
          timezone = @timezone,
          label = @label,
          position = @position,
          tombstone = 1
        WHERE id = @id AND account_id = @account_id AND client_updated_at < @client_updated_at
      `,
    ).run({
      id: patch.id,
      account_id: accountId,
      client_updated_at: patch.updated_at,
      timezone: "",
      label: "",
      position: "",
    });

    return;
  }

  if (sessionId) {
    db.prepare(
      `
        INSERT INTO session_timezones (
          id, session_id, updated_at, client_updated_at, timezone, label, position, tombstone
        )
        VALUES (
          @id,
          @session_id,
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          @client_updated_at,
          @timezone,
          @label,
          @position,
          1
        )
        ON CONFLICT(id) DO UPDATE SET
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          client_updated_at = @client_updated_at,
          timezone = @timezone,
          label = @label,
          position = @position,
          tombstone = 1
        WHERE id = @id AND session_id = @session_id AND client_updated_at < @client_updated_at
      `,
    ).run({
      id: patch.id,
      session_id: sessionId,
      client_updated_at: patch.updated_at,
      timezone: "",
      label: "",
      position: "",
    });

    return;
  }
}

export class DBCursor {
  constructor(
    public updated_at: string,
    public id: string | null,
  ) {}
  toString() {
    return Buffer.from(JSON.stringify([this.updated_at, this.id])).toString(
      "base64url",
    );
  }
  static from(str: string) {
    const [updated_at, id] = JSON.parse(
      Buffer.from(str, "base64url").toString("utf8"),
    );

    return new DBCursor(updated_at, id || null);
  }
}

export function getSessionTimezonesChanges(
  sessionId: string,
  cursor: DBCursor,
) {
  const account = getAccount(sessionId);
  const { updated_at, id } = cursor;

  const rows = account
    ? db
        .prepare<
          { account_id: string; updated_at: string; id: string | null },
          {
            id: string;
            timezone: string;
            label: string;
            updated_at: string;
            position: string;
            tombstone: 0 | 1;
          }
        >(
          `
            SELECT id, timezone, label, updated_at, position, tombstone FROM account_timezones
            WHERE account_id = @account_id AND
              (updated_at > @updated_at OR @id IS NOT NULL AND updated_at == @updated_at AND id > @id)
            ORDER BY updated_at ASC, id ASC
            LIMIT 10;
        `,
        )
        .all({ account_id: account.id, updated_at, id })
    : db
        .prepare<
          { session_id: string; updated_at: string; id: string | null },
          {
            id: string;
            timezone: string;
            label: string;
            updated_at: string;
            position: string;
            tombstone: 0 | 1;
          }
        >(
          `
            SELECT id, timezone, label, updated_at, position, tombstone FROM session_timezones
            WHERE session_id = @session_id AND
              (updated_at > @updated_at OR @id IS NOT NULL AND updated_at == @updated_at AND id > @id)
            ORDER BY updated_at ASC, id ASC
            LIMIT 10;
        `,
        )
        .all({ session_id: sessionId, updated_at, id });

  const lastRow = rows.at(-1);
  const nextCursor = lastRow
    ? new DBCursor(lastRow.updated_at, lastRow.id)
    : null;

  return {
    rows,
    next: nextCursor,
  };
}
