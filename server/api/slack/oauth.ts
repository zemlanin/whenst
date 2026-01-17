import { db } from "../../db/index.js";

import type { FastifyReply, FastifyRequest } from "fastify";

// GET /api/slack/oauth
export async function apiSlackOauthGet(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { code } = request.query as Record<string, string | undefined>;

  if (!code) {
    return reply.status(401).send();
  }

  const WHENST_SLACK_CLIENT_ID = "1018918207158.1016707049728";

  const accessResp = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "post",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: WHENST_SLACK_CLIENT_ID,
      client_secret: process.env.WHENST_SLACK_CLIENT_SECRET || "",
      redirect_uri: new URL(
        "/api/slack/oauth",
        `https://${request.hostname}`,
      ).toString(),
    }).toString(),
  });

  if (!accessResp.ok) {
    return reply.status(401).send();
  }

  const access = await accessResp.json();
  if (!access.ok) {
    return reply.status(401).send();
  }

  const { access_token, scope, bot_user_id, team } = access;
  if (!access_token || !scope || !bot_user_id || !team?.id) {
    return reply.status(401).send();
  }

  db.transaction(() => {
    const params = {
      team_id: team.id,
      bot_user_id,
      scope,
      access_token,
    };

    const { changes } = db
      .prepare<{
        team_id: string;
        bot_user_id: string;
        scope: string;
        access_token: string;
      }>(
        `
          UPDATE slack_oauth_tokens
          SET scope = @scope
          WHERE
            team_id = @team_id
            AND bot_user_id = @bot_user_id
            AND access_token = @access_token
        `,
      )
      .run(params);

    if (!changes) {
      db.prepare<{
        team_id: string;
        bot_user_id: string;
        scope: string;
        access_token: string;
      }>(
        `
          INSERT INTO slack_oauth_tokens
            (team_id, bot_user_id, scope, access_token)
          VALUES
            (@team_id, @bot_user_id, @scope, @access_token);
        `,
      ).run(params);
    }
  })();

  return reply.redirect(`/slack/install?success=1`);
}
