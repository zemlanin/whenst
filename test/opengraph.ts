/// <reference path="../server/dist.d.ts" />

import { AddressInfo } from "node:net";
import t from "tap";
import { load } from "cheerio";

t.test("opengraph", async (t) => {
  process.env.WHENST_MAIN_DB = ":memory:";
  process.env.WHENST_TIMEZONES_DB = ":memory:";
  const { server } = await import("#dist/server/index.js");
  server.log.level = "silent";
  await server.listen();
  const port = (server.server.address() as AddressInfo).port;

  const fetch$ = async function fetch$(input: string, init?: RequestInit) {
    const resp = await fetch(new URL(input, `http://localhost:${port}/`), init);
    if (!resp.ok) {
      throw new Error(`Failed to fetch: ${resp.statusText}`, { cause: resp });
    }
    const html = await resp.text();
    const $ = load(html);

    return $;
  };

  await t.test(async () => {
    const $ = await fetch$("/");

    t.same($('head [property="og:title"]').attr("content"), "when.st");
    t.same($('head [property="og:url"]').attr("content"), undefined);
  });

  await t.test(async () => {
    // TODO 404
    const $ = await fetch$("/knowhere");

    t.same($('head [property="og:title"]').attr("content"), "when.st");
    t.same($('head [property="og:url"]').attr("content"), undefined);
    t.same($('head [property="og:description"]').attr("content"), undefined);
  });

  await t.test(async () => {
    const $ = await fetch$("/madrid");

    t.same($('head [property="og:title"]').attr("content"), "Time in Madrid");
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Madrid",
    );
    t.same($('head [property="og:description"]').attr("content"), "UTC+1");
  });

  await t.test(async () => {
    const $ = await fetch$("/berlin/2026-01-05T20:18", {
      headers: { "accept-language": "en-GB" },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "5 January 2026 at 20:18 in Berlin",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Berlin/2026-01-05T20:18",
    );
    t.same($('head [property="og:description"]').attr("content"), "UTC+1");
  });

  await t.test(async () => {
    const $ = await fetch$("/madrid/2026-01-15T22:18", {
      headers: { "accept-language": "en-US" },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "January 15, 2026 at 10:18 PM in Madrid",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Madrid/2026-01-15T22:18",
    );
  });

  await t.test(async () => {
    const $ = await fetch$("/chicago/T10:10", {
      headers: { "accept-language": "en-US" },
    });

    // TODO check for today's date
    t.match(
      $('head [property="og:title"]').attr("content"),
      /at 10:10 AM in Chicago$/,
    );
    t.match(
      $('head [property="og:url"]').attr("content"),
      /https:\/\/when\.st\/America\/Chicago\/\d{4}-\d{2}-\d{2}T10:10/,
    );
  });

  // TODO
  await t.skip("/chicago/10pm", async () => {
    const $ = await fetch$("/chicago/10pm", {
      headers: { "accept-language": "en-US" },
    });

    // TODO check for today's date
    t.match(
      $('head [property="og:title"]').attr("content"),
      /at 10:00 PM in Chicago$/,
    );
    t.match(
      $('head [property="og:url"]').attr("content"),
      /https:\/\/when\.st\/America\/Chicago\/\d{4}-\d{2}-\d{2}T22:00/,
    );
  });

  // TODO
  await t.skip("/chicago/9:15am", async () => {
    const $ = await fetch$("/chicago/9:15am", {
      headers: { "accept-language": "en-US" },
    });

    // TODO check for today's date
    t.match(
      $('head [property="og:title"]').attr("content"),
      /at 09:15 AM in Chicago$/,
    );
    t.match(
      $('head [property="og:url"]').attr("content"),
      /https:\/\/when\.st\/America\/Chicago\/\d{4}-\d{2}-\d{2}T09:15/,
    );
  });

  // TODO `/unix`
  await t.skip("/unix", async () => {
    const $ = await fetch$("/unix");

    t.same($('head [property="og:title"]').attr("content"), "Time in Madrid");
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Madrid",
    );
  });

  await server.close();
});
