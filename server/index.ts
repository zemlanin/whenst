import Fastify from "fastify";

import { apiSessionDelete } from "./api/session.js";
import { apiSettingsGet } from "./api/settings.js";
import {
  apiTimezonesDelete,
  apiTimezonesPatch,
  apiTimezonesPut,
} from "./api/timezones.js";
import { apiSqrapCodePost } from "./api/sqrap/code.js";
import { apiSqrapInitPost } from "./api/sqrap/init.js";
import { apiSqrapStatusGet } from "./api/sqrap/status.js";

const fastify = Fastify({
  logger: true,
});

fastify.delete("/api/session", apiSessionDelete);
fastify.get("/api/settings", apiSettingsGet);
fastify.put("/api/timezones", apiTimezonesPut);
fastify.delete("/api/timezones", apiTimezonesDelete);
fastify.patch("/api/timezones", apiTimezonesPatch);
fastify.post("/api/sqrap/code", apiSqrapCodePost);
fastify.post("/api/sqrap/init", apiSqrapInitPost);
fastify.get("/api/sqrap/status", apiSqrapStatusGet);

// Run the server!
fastify.listen({ port: 3000 }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
