/// <reference path="../server/dist.d.ts" />

import { AddressInfo } from "node:net";

import { load } from "cheerio";
import t from "tap";
import { Temporal } from "@js-temporal/polyfill";

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

    t.same($("head title").text(), "when.st");
    t.same($('head [property="og:title"]').attr("content"), "when.st");
    t.same($('head [property="og:url"]').attr("content"), undefined);
  });

  await t.test(async () => {
    const $ = await fetch$("/about");

    t.same($("head title").text(), "About | when.st");
    t.same($('head [property="og:title"]').attr("content"), "About");
    t.same($('head [property="og:url"]').attr("content"), undefined);
  });

  await t.test(async () => {
    const $ = await fetch$("/settings");

    t.same($("head title").text(), "Settings | when.st");
    t.same($('head [property="og:title"]').attr("content"), "Settings");
    t.same($('head [property="og:url"]').attr("content"), undefined);
  });

  await t.test(async () => {
    const $ = await fetch$("/link");

    t.same($("head title").text(), "Link | when.st");
    t.same($('head [property="og:title"]').attr("content"), "Link");
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
    const $ = await fetch$("/kyiv");

    t.same($('head [property="og:title"]').attr("content"), "Time in Kyiv");
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Kyiv",
    );
    t.same(
      $('head [property="og:description"]').attr("content"),
      `UTC${getCurrentOffset("Europe/Kiev")}`,
    );
  });

  await t.test(async () => {
    const $ = await fetch$("/kiev");

    t.same($('head [property="og:title"]').attr("content"), "Time in Kyiv");
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Kyiv",
    );
    t.same(
      $('head [property="og:description"]').attr("content"),
      `UTC${getCurrentOffset("Europe/Kiev")}`,
    );
  });

  await t.test(async () => {
    const $ = await fetch$("/America/Sao_Paulo/");

    t.same(
      $('head [property="og:title"]').attr("content"),
      "Time in São Paulo",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/America/Sao_Paulo",
    );
    t.same(
      $('head [property="og:description"]').attr("content"),
      `UTC${getCurrentOffset("America/Sao_Paulo")}`,
    );
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
    t.same(
      $('head [property="og:description"]').attr("content"),
      `UTC${getCurrentOffset("Europe/Berlin")}`,
    );
  });

  await t.test(async () => {
    const $ = await fetch$("/madrid/2026-05-15T22:18", {
      headers: { "accept-language": "en-US" },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "May 15, 2026 at 10:18 PM in Madrid",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Madrid/2026-05-15T22:18",
    );
    t.same($('head [property="og:description"]').attr("content"), "UTC+2");
  });

  await t.test(async () => {
    const $ = await fetch$("/utc/2022-01-19T07:50", {
      headers: { "accept-language": "en-GB" },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "19 January 2022 at 07:50 in UTC",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/UTC/2022-01-19T07:50",
    );
    t.same($('head [property="og:description"]').attr("content"), "UTC");
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

const now = Temporal.Now.instant();
function getCurrentOffset(timeZone: string) {
  const fullOffset = now.toZonedDateTime({
    timeZone,
    calendar: "iso8601",
  }).offset;
  return fullOffset.replace(/:00$/, "").replace(/^([+-])0([0-9])/, "$1$2");
}
