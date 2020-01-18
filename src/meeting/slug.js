const sql = require("pg-template-tag").default;

const SLUG_REGEX = /[a-z][a-z0-9]{2,}/i;

module.exports = async function meetingSlug(req, res, ctx) {
  const client = await ctx.db();
  const slug = ctx.params.slug;

  let id;

  if (slug && slug.match(SLUG_REGEX)) {
    const res = await client.query(
      sql`SELECT id FROM meeting WHERE slug = ${slug} LIMIT 1`
    );

    id = res.rows[0].id;
  }

  if (!id) {
    res.statusCode = 404;

    return `404 Not Found`;
  }

  return id;
};
