const sql = require("pg-template-tag").default;
const tmpl = require.resolve("./templates/slug.handlebars");

const SLUG_REGEX = /[a-z][a-z0-9]{2,}/i;

const idMapper = v => v.id;

const groupByTrackId = (acc, event) => {
  if (!acc[event.track_id]) {
    acc[event.track_id] = [];
  }

  acc[event.track_id].push(event);

  return acc;
};

module.exports = async function meetingSlug(req, res, ctx) {
  const client = await ctx.db();
  const slug = ctx.params.slug;

  let meeting;

  if (slug && slug.match(SLUG_REGEX)) {
    const res = await client.query(
      sql`SELECT id, slug, title FROM meeting WHERE slug = ${slug} LIMIT 1`
    );

    meeting = res.rows[0];
  }

  if (!meeting) {
    res.statusCode = 404;

    return `404 Not Found`;
  }

  // TODO: specify tracks order
  const tracks = (
    await client.query(
      sql`SELECT id, title, color_rgb FROM track WHERE meeting_id = ${meeting.id}`
    )
  ).rows;

  if (!tracks.length) {
    res.statusCode = 404;

    return `404 Not Found`;
  }

  const events = (
    await client.query(
      sql`SELECT id, track_id, title, subtitle, ts_start, ts_end
      FROM event
      WHERE track_id = any(${tracks.map(idMapper)})
      ORDER BY ts_start ASC`
    )
  ).rows;

  if (!events.length) {
    res.statusCode = 404;

    return `404 Not Found`;
  }

  const eventsByTrack = events.reduce(groupByTrackId, {});

  return ctx.render(tmpl, {
    meeting,
    tracks,
    events,
    eventsByTrack
  });
};
