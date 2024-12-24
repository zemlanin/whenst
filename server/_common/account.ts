import { db } from "../db/index.js";

export function generateAccountId() {
  return `account:${crypto.randomUUID()}`;
}

export function getAccount(sessionId: string) {
  if (!sessionId) {
    return null;
  }

  const account = db
    .prepare<
      { session_id: string },
      { id: string }
    >(`SELECT a.id AS id FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = @session_id`)
    .get({ session_id: sessionId });

  return account ?? null;
}

export function createAccount() {
  return {
    id: generateAccountId(),
  };
}

export function associateSessionWithAccount(
  sessionId: string,
  accountId: string,
) {
  if (!sessionId) {
    return null;
  }

  db.prepare<{ id: string; account_id: string }>(
    `INSERT INTO sessions (id, account_id) VALUES (@id, @account_id)
      ON CONFLICT(id) DO UPDATE SET account_id = ?2`,
  ).run({
    id: sessionId,
    account_id: accountId,
  });
}

export function moveDataFromSessionToAccount(
  sessionId: string,
  accountId: string,
) {
  const timezones = db
    .prepare<
      { session_id: string },
      { timezones: unknown[] }
    >(`SELECT timezones FROM session_settings WHERE session_id = @session_id`)
    .get({ session_id: sessionId });

  if (timezones) {
    db.prepare<{ id: string; timezones: string }>(
      `UPDATE account_settings SET timezones = @timezones WHERE id = @id`,
    ).run({
      id: accountId,
      timezones: JSON.stringify(timezones),
    });

    db.prepare<{ session_id: string }>(
      `DELETE FROM session_settings WHERE session_id = @session_id`,
    ).run({ session_id: sessionId });
  }
}
