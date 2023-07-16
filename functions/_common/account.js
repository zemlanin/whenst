export function generateAccountId() {
  return `account:${crypto.randomUUID()}`;
}

export async function getAccount(context, sessionId) {
  if (!sessionId) {
    return null;
  }

  const account = await context.env.KV.get(`session:${sessionId}:account`);

  if (!account) {
    return null;
  }

  try {
    return JSON.parse(account);
  } catch (e) {
    return null;
  }
}

export async function createAccount() {
  return {
    id: generateAccountId(),
  };
}

export async function associateSessionWithAccount(context, sessionId, account) {
  if (!sessionId) {
    return null;
  }

  await context.env.KV.put(
    `session:${sessionId}:account`,
    JSON.stringify(account),
  );
}

export async function moveDataFromSessionToAccount(
  context,
  sessionId,
  accountId,
) {
  const timezones = await context.env.KV.get(`timezones:${sessionId}`);

  if (!timezones) {
    return;
  }

  await context.env.KV.put(`timezones:${accountId}`, timezones);
  await context.env.KV.delete(`timezones:${sessionId}`);
}
