const sql = require("pg-template-tag").default;
const tmpl = require.resolve("./templates/slug.handlebars");

const SLUG_REGEX = /[a-z][a-z0-9]{2,}/i;

module.exports = async function meetingSlug(req, res, ctx) {
  const client = await ctx.db();
  const slug = ctx.params.slug;

  let meeting;

  if (slug && slug.match(SLUG_REGEX)) {
    const res = await client.query(
      sql`SELECT id, slug FROM meeting WHERE slug = ${slug} LIMIT 1`
    );

    meeting = res.rows[0];
  }

  if (!meeting) {
    res.statusCode = 404;

    return `404 Not Found`;
  }

  return ctx.render(tmpl, {
    meeting
  });
};
