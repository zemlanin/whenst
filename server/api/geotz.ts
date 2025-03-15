import { FastifyReply, FastifyRequest } from "fastify";
import { timezonesDB } from "../db/index.js";

// GET /api/geotz
export const apiGeotzGet = {
  handler: getGeotz,
  schema: {
    querystring: {
      type: "object",
      properties: {
        lat: { type: "number", minimum: -90, maximum: 90 },
        lng: { type: "number", minimum: -180, maximum: 180 },
      },
      required: ["lat", "lng"],
    },
  },
};

export async function getGeotz(request: FastifyRequest, reply: FastifyReply) {
  const { lat, lng } = request.query as { lat: number; lng: number };

  const timezone = timezonesDB
    .prepare<{ lng: number; lat: number }, { tzid: string; geojson: string }>(
      `
        select tzid, asGeoJSON(simplify(geometry, 0.05), 3) as geojson from timezones
          where within(MakePoint(@lng, @lat), timezones.Geometry) = 1
          and rowid in (
            select rowid from SpatialIndex
              where f_table_name = 'timezones'
              and search_frame = MakePoint(@lng, @lat)
          )
      `,
    )
    .get({ lat, lng });

  const geometry = JSON.parse(timezone?.geojson ?? "null");

  reply.header("cache-control", "public, max-age=14400");
  return reply.send({
    timezone: timezone?.tzid,
    geometry: geometry,
  });
}
