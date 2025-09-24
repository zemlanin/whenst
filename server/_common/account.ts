import { db } from "../db/index.js";

export function generateAccountId() {
  return crypto.randomUUID();
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
  const id = generateAccountId();

  db.prepare<{ id: string }>(
    `INSERT INTO accounts (id) VALUES (@id)
      ON CONFLICT DO NOTHING`,
  ).run({ id });

  return { id };
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
