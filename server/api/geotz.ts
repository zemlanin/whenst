import { find as findTZ } from "geo-tz/dist/find-1970";
import { FastifyReply, FastifyRequest } from "fastify";

// GET /settings
export const apiGeotzGet = {
  handler: getGeotz,
  schema: {
    querystring: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          minimum: -90,
          maximum: 90,
        },
        lng: { type: "number", minimum: -180, maximum: 180 },
      },
      required: ["lat", "lng"],
    },
  },
};

export async function getGeotz(request: FastifyRequest, reply: FastifyReply) {
  const { lat, lng } = request.query as { lat: number; lng: number };

  const [timezone] = findTZ(lat, lng);

  reply.header("cache-control", "public, max-age=14400");
  reply.send({ timezone });
}
