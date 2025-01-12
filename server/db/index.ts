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
