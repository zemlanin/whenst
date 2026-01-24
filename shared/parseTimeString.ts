import { Temporal } from "@js-temporal/polyfill";

export const CALENDAR = "iso8601";

//                    ($1                 )($2         ) ($3   )
const AM_PM_REGEX = /^([1-9]|0[1-9]|1[0-2])(:[0-5][0-9])?(am|pm)$/i;
const AM_PM_REPLACEMENT = (
  match: string,
  h: string,
  m = ":00",
  ampm: string,
) => {
  if (h.length === 1) {
    h = `0${h}`;
  }

  if (ampm === "am") {
    if (h === "12") {
      return `T00${m}`;
    }

    return `T${h}${m}`;
  }

  if (ampm === "pm") {
    if (h === "12") {
      return `T${h}${m}`;
    }

    const h24 = parseInt(h, 10) + 12;
    return `T${h24}${m}`;
  }

  return match;
};

export function parseTimeString(
  timezone: string | Temporal.TimeZone,
  timeString: string | undefined,
) {
  if (timezone === "unix") {
    timezone = "UTC";
  }

  let date = undefined;
  if (timeString) {
    try {
      date = Temporal.PlainDate.from(timeString);
    } catch (_e) {
      //
    }
  }

  if (!date) {
    date = Temporal.Now.plainDate(CALENDAR); // TODO `(CALENDAR, timezone)`
  }

  if (timeString && timeString !== "now") {
    if (timeString.match(AM_PM_REGEX)) {
      timeString = timeString.replace(AM_PM_REGEX, AM_PM_REPLACEMENT);
    }

    try {
      Temporal.PlainTime.from(timeString);
    } catch (_e) {
      timeString = "now";
    }
  }

  return !timeString || timeString === "now"
    ? Temporal.Now.zonedDateTime(CALENDAR, timezone).with({
        millisecond: 0,
      })
    : date.toZonedDateTime({
        plainTime: Temporal.PlainTime.from(timeString),
        timeZone: timezone,
      });
}
