const sql = require("pg-template-tag").default;

const SLUG_REGEX = /[a-z][a-z0-9]{2,}/i;

module.exports = async function meetingIndex(req, res, ctx) {
  const client = await ctx.db();
  const query = ctx.query;

  let id;

  if (query && query.q && query.q.match(SLUG_REGEX)) {
    const res = await client.query(
      sql`SELECT id FROM meeting WHERE slug = ${query.q} LIMIT 1`
    );

    id = res.rows[0].id;
  }

  if (!id) {
    res.statusCode = 404;

    return `404 Not Found`;
  }

  res.writeHead(302, {
    Location: ctx.routes.meetingSlug.stringify({ slug: query.q })
  });

  return;
};
