import { FastifyReply, FastifyRequest } from "fastify";

import { generateIntlTimezones } from "../../shared/generateIntlTimezones.js";

// GET /api/timezones-index
export async function apiTimezonesIndex(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const timezones = generateIntlTimezones();

  return reply
    .status(200)
    .header("cache-control", "public, max-age=14400")
    .send({ timezones });
}
