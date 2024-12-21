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
      string,
      { id: string }
    >(`SELECT a.id AS id FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE id = ?`)
    .get(sessionId);

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

  db.prepare<{ 1: string; 2: string }>(
    `INSERT INTO sessions (id, account_id) VALUES (?1, ?2)`,
  ).run({
    1: sessionId,
    2: accountId,
  });
}

export function moveDataFromSessionToAccount(
  sessionId: string,
  accountId: string,
) {
  const timezones = db
    .prepare<
      string,
      { timezones: unknown[] }
    >(`SELECT timezones FROM sessions WHERE id = ?`)
    .get(sessionId);

  if (timezones) {
    db.prepare(`UPDATE accounts SET timezones = ?1 WHERE id = ?2`).run({
      1: timezones,
      2: accountId,
    });

    db.prepare(`UPDATE sessions SET timezones = NULL WHERE id = ?`).run(
      sessionId,
    );
  }
}
