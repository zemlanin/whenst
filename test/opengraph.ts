/// <reference path="../server/dist.d.ts" />

import { AddressInfo } from "node:net";

import { load } from "cheerio";
import t from "tap";
import { Temporal } from "@js-temporal/polyfill";

const ANCHOR_DATE = "Thu, 22 Jan 2026 13:59:03 GMT";

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
      headers: {
        "accept-language": "en-US",
        date: ANCHOR_DATE,
      },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "January 22, 2026 at 10:10 AM in Chicago",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/America/Chicago/2026-01-22T10:10",
    );
  });

  await t.test("/chicago/10pm", async () => {
    const $ = await fetch$("/chicago/10pm", {
      headers: { "accept-language": "en-US", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "January 22, 2026 at 10:00 PM in Chicago",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/America/Chicago/2026-01-22T22:00",
    );
  });

  await t.test("/chicago/9:15am", async () => {
    const $ = await fetch$("/chicago/9:15am", {
      headers: { "accept-language": "en-US", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "January 22, 2026 at 9:15 AM in Chicago",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/America/Chicago/2026-01-22T09:15",
    );
  });

  await t.test("/los_angeles/12:00am", async () => {
    const $ = await fetch$("/los_angeles/12:00am", {
      headers: { "accept-language": "en-US", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "January 22, 2026 at 12:00 AM in Los Angeles",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/America/Los_Angeles/2026-01-22T00:00",
    );
  });

  await t.test("/denver/12:00pm", async () => {
    const $ = await fetch$("/denver/12:00pm", {
      headers: { "accept-language": "en-GB", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "22 January 2026 at 12:00 in Denver",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/America/Denver/2026-01-22T12:00",
    );
  });

  await t.test("/Tallinn/1am", async () => {
    const $ = await fetch$("/Tallinn/1am", {
      headers: { "accept-language": "en-GB", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "22 January 2026 at 01:00 in Tallinn",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Tallinn/2026-01-22T01:00",
    );
  });

  await t.test("/Tallinn/12am", async () => {
    const $ = await fetch$("/Tallinn/12am", {
      headers: { "accept-language": "en-GB", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "22 January 2026 at 00:00 in Tallinn",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Tallinn/2026-01-22T00:00",
    );
  });

  await t.test("/Tallinn/12pm", async () => {
    const $ = await fetch$("/Tallinn/12pm", {
      headers: { "accept-language": "en-GB", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      "22 January 2026 at 12:00 in Tallinn",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/Europe/Tallinn/2026-01-22T12:00",
    );
  });

  await t.test("/Auckland/T00", async () => {
    const $ = await fetch$("/Auckland/T00", {
      headers: { "accept-language": "en-GB", date: ANCHOR_DATE },
    });

    t.same(
      $('head [property="og:title"]').attr("content"),
      // it's the 23rd in Auckland at `ANCHOR_DATE`
      "23 January 2026 at 00:00 in Auckland",
    );
    t.same(
      $('head [property="og:url"]').attr("content"),
      // it's the 23rd in Auckland at `ANCHOR_DATE`
      "https://when.st/Pacific/Auckland/2026-01-23T00:00",
    );
  });

  await t.test("/unix", async () => {
    const $ = await fetch$("/unix");

    t.same($('head [property="og:title"]').attr("content"), "Unix time");
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/unix",
    );
  });

  await t.test("/unix/1645671600", async () => {
    const $ = await fetch$("/unix/1645671600");

    t.same($('head [property="og:title"]').attr("content"), "Unix 1645671600");
    t.same(
      $('head [property="og:url"]').attr("content"),
      "https://when.st/unix/1645671600",
    );
  });

  await server.close();
});

const now = Temporal.Now.instant();
function getCurrentOffset(timeZone: string) {
  const fullOffset = now.toZonedDateTimeISO(timeZone).offset;
  return fullOffset.replace(/:00$/, "").replace(/^([+-])0([0-9])/, "$1$2");
}
