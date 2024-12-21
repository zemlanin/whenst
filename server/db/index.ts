import Database from "better-sqlite3";
import { getAccount } from "../_common/account.js";

const db = new Database(".data/foobar.db", {});
db.pragma("journal_mode = WAL");

export { db };

export function getSessionTimezones(sessionId: string) {
  const account = getAccount(sessionId);

  const timezones = account
    ? db
        .prepare<
          string,
          { id: string }[]
        >(`SELECT timezones FROM accounts WHERE id = ?`)
        .get(account.id)
    : db
        .prepare<
          string,
          { id: string }[]
        >(`SELECT timezones FROM sessions WHERE id = ?`)
        .get(sessionId);

  return timezones;
}
