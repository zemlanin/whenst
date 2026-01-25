import { Temporal } from "@js-temporal/polyfill";

import "../../keyboard";
import { getLocationFromTimezone } from "../../../shared/from-timezone.js";
import { CALENDAR } from "../../../shared/parseTimeString.js";

const patternAnchors =
  document.querySelectorAll<HTMLAnchorElement>("a[data-pattern]");

const timezone = Temporal.Now.timeZoneId();
const location = getLocationFromTimezone(timezone);
const currentDateTime = Temporal.Now.zonedDateTime(CALENDAR, timezone).with({
  second: 0,
  millisecond: 0,
});
// .with({hour: 12, minute: 0})

const PATTERN_PART_REGEX = /\/:([a-z0-9_]+)/g;
const PATTERN_PART_REPLACEMENT = (_match: string, part: string) => {
  if (part === "timezone") {
    return `/${timezone}`;
  }

  if (part === "location") {
    return `/${location}`;
  }

  if (part === "datetime") {
    return `/${currentDateTime
      .toPlainDateTime()
      .toString({ smallestUnit: "minute", calendarName: "never" })}`;
  }

  if (part === "time24") {
    return `/${currentDateTime
      .toPlainTime()
      .toString({ smallestUnit: "minute" })}`;
  }

  if (part === "time12") {
    const minutes = currentDateTime.minute.toString().padStart(2, "0");
    const hours = currentDateTime.hour;

    return `/${hours % 12 || 12}:${minutes}${0 <= hours && hours < 12 ? "am" : "pm"}`;
  }

  if (part === "hour12") {
    const hours = currentDateTime.hour;

    return `/${hours % 12 || 12}${0 <= hours && hours < 12 ? "am" : "pm"}`;
  }

  if (part === "epoch") {
    return `/${currentDateTime.epochSeconds}`;
  }

  throw new Error(`Unknown pattern part: ${part}`);
};

for (const anchor of patternAnchors) {
  const pattern = anchor.getAttribute("data-pattern");
  if (!pattern) {
    continue;
  }

  // replace with URLPattern.prototype.generate if it'll become a standard
  // https://github.com/explainers-by-googlers/urlpattern-generate
  const pathname = pattern.replace(
    PATTERN_PART_REGEX,
    PATTERN_PART_REPLACEMENT,
  );
  anchor.href = pathname;
  anchor.textContent = pathname;
}
