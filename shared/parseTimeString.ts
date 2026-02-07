import { Temporal } from "@js-temporal/polyfill";

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
      return `00${m}`;
    }

    return `${h}${m}`;
  }

  if (ampm === "pm") {
    if (h === "12") {
      return `${h}${m}`;
    }

    const h24 = parseInt(h, 10) + 12;
    return `${h24}${m}`;
  }

  return match;
};

export function parseTimeString(
  timezone: string,
  timeString: string | undefined,
  options: {
    currentDateTime?: Temporal.ZonedDateTime;
  } = {},
) {
  if (timezone === "unix") {
    timezone = "UTC";
  }

  let date: Temporal.PlainDate | undefined = undefined;
  if (timeString) {
    try {
      date = Temporal.PlainDate.from(timeString);
    } catch (_e) {
      //
    }
  }

  if (!date) {
    if (options?.currentDateTime) {
      date = options.currentDateTime.withTimeZone(timezone).toPlainDate();
    } else {
      date = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
    }
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

  if (!timeString || timeString === "now") {
    if (options?.currentDateTime) {
      return options.currentDateTime.with({
        timeZone: timezone,
        millisecond: 0,
      });
    }

    return Temporal.Now.zonedDateTimeISO(timezone).with({
      millisecond: 0,
    });
  }

  return date.toZonedDateTime({
    plainTime: Temporal.PlainTime.from(timeString),
    timeZone: timezone,
  });
}
