import Fastify from "fastify";

const fastify = Fastify({
  logger: true,
});

fastify.get("/api/settings", function (request, reply) {
  reply.send({
    timezones: [],
    signedIn: false,
  });
});

// Run the server!
fastify.listen({ port: 3000 }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
