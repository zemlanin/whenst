import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";
import FALink from "./icons/arrow-up-right-from-square.svg.jsx";

import { render } from "preact";
import { useEffect } from "preact/hooks";
import { useSignal, useComputed, useSignalEffect } from "@preact/signals";

// TODO: `addTimezone`
import { loadSettings } from "./api";
import { guessTimezone } from "./guess-timezone";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "./saved-timezones";

const browserCalendar = "iso8601";
const rtfAlways = new Intl.RelativeTimeFormat("en", {
  numeric: "always",
});
const rtfAuto = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

window.Temporal = Temporal;

render(<IndexPage />, document.querySelector("main"));

function IndexPage() {
  const [urlTZ, urlDT] = extractDataFromURL();
  const localTZ = Temporal.Now.timeZone();
  const isUnix = urlTZ === "unix";
  const pageTZ = isUnix ? "UTC" : urlTZ ? urlTZ : localTZ;

  const dt = useSignal(parseTimeString(pageTZ, urlDT));

  const pageForRemoteTimeZone = isUnix || pageTZ.id !== localTZ.id;

  useEffect(() => {
    if (!urlTZ && location.pathname !== "/" && location.pathname !== "") {
      history.replaceState(null, "", "/");
    }

    if (!urlTZ) {
      return;
    }

    const timeString = isUnix
      ? dt.peek().epochSeconds
      : formatDTInput(dt.peek());

    const canonicalPathname =
      urlDT === "now"
        ? getPathnameFromTimezone(isUnix ? "unix" : pageTZ)
        : `${getPathnameFromTimezone(isUnix ? "unix" : pageTZ)}/${timeString}`;

    history.replaceState(null, "", canonicalPathname);
    updateTitle(
      urlDT === "now" ? undefined : dt.peek(),
      isUnix ? "unix" : pageTZ
    );
  }, []);

  const writeToLocation = (dt) => {
    history.replaceState(
      null,
      "",
      `${getPathnameFromTimezone(isUnix ? "unix" : pageTZ)}/${
        isUnix ? dt.epochSeconds : formatDTInput(dt.withTimeZone(pageTZ))
      }`
    );

    updateTitle(dt, isUnix ? "unix" : pageTZ);
  };

  return (
    <>
      {isUnix ? (
        <UnixRow
          rootDT={dt}
          timeZone={pageTZ}
          writeToLocation={writeToLocation}
        />
      ) : (
        <ClockRow
          rootDT={dt}
          timeZone={pageTZ}
          withRelative={!pageForRemoteTimeZone}
          writeToLocation={writeToLocation}
        />
      )}
      {pageForRemoteTimeZone ? (
        <ClockRow
          rootDT={dt}
          timeZone={localTZ}
          withRelative
          secondary
          writeToLocation={writeToLocation}
        />
      ) : null}

      <SavedTimezones rootDT={dt} pageTZ={pageTZ} localTZ={localTZ} />
    </>
  );
}

function ClockRow({
  rootDT,
  timeZone,
  withRelative,
  secondary,
  writeToLocation,
}) {
  const dt = useComputed(() => rootDT.value.withTimeZone(timeZone));

  const tzName = getLocationFromTimezone(timeZone);
  const tzURL = new URL(getPathnameFromTimezone(timeZone), location.href);
  const timeInTZ = useComputed(() => formatDTInput(dt.value));
  const relative = useSignal(null);
  useSignalEffect(() => {
    if (!withRelative) {
      return;
    }

    let timeoutId;

    function scheduleUpdateRelative() {
      timeoutId = setTimeout(() => {
        relative.value = getRelativeTime(dt.value);
        scheduleUpdateRelative();
      }, 1000);
    }

    relative.value = getRelativeTime(dt.value);
    scheduleUpdateRelative();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [withRelative]);

  const onTimeChange = (event) => {
    try {
      const newRootDT = Temporal.PlainDateTime.from(
        event.target.value
      ).toZonedDateTime(timeZone);
      writeToLocation(newRootDT);
      rootDT.value = newRootDT;
    } catch (e) {
      console.error(e);
      return;
    }
  };

  const onBlur = (event) => {
    try {
      Temporal.PlainDateTime.from(event.target.value).toZonedDateTime(timeZone);
    } catch (e) {
      event.target.value = formatDTInput(
        Temporal.Now.zonedDateTime(browserCalendar, timeZone).with({
          second: 0,
          millisecond: 0,
        })
      );

      onTimeChange(event);
    }
  };

  return (
    <div className="clock-row">
      {secondary ? (
        <h2>
          {tzName}{" "}
          <a href={tzURL}>
            <FALink width="0.7em" height="0.7em" fill="currentColor" />
          </a>
        </h2>
      ) : (
        <h1>{tzName}</h1>
      )}

      <form className="clock" action="/" method="GET">
        <input
          className="local-time"
          name="t"
          type="datetime-local"
          value={timeInTZ}
          required
          onChange={onTimeChange}
          onBlur={onBlur}
        />
        {relative ? <div className="relative">{relative}</div> : null}
      </form>
    </div>
  );
}

function UnixRow({ rootDT, writeToLocation }) {
  const timeInUnix = useComputed(() => rootDT.value.epochSeconds);

  const onTimeChange = (event) => {
    if (!event.target.value || !event.target.value.match(/^[0-9]{1,10}$/)) {
      return;
    }

    try {
      const newRootDT = Temporal.PlainDateTime.from(
        new Date(+event.target.value * 1000).toISOString().replace(/Z$/, "")
      ).toZonedDateTime("UTC");
      writeToLocation(newRootDT, true);
      rootDT.value = newRootDT;
    } catch (e) {
      console.error(e);
      return;
    }
  };

  const onBlur = (event) => {
    if (!event.target.value || !event.target.value.match(/^[0-9]{1,10}$/)) {
      event.target.value = Math.floor(+new Date() / 1000).toString();

      onTimeChange(event);
    }
  };

  return (
    <div className="clock-row">
      <h1>Unix Epoch</h1>

      <form className="clock" action="/" method="GET">
        <input
          className="unix-input"
          name="t"
          type="text"
          maxLength="10"
          pattern="^[0-9]+$"
          value={timeInUnix}
          required
          onChange={onTimeChange}
          onInput={onTimeChange}
          onBlur={onBlur}
          autoComplete="off"
        />
      </form>
    </div>
  );
}

function SavedTimezones({ rootDT, pageTZ, localTZ }) {
  const timezones = useSignal([]);

  const pageDateString = useComputed(() =>
    rootDT.value
      .withTimeZone(pageTZ)
      .toPlainDateTime()
      .toLocaleString(undefined, {
        day: "numeric",
        month: "short",
      })
  );

  const localDateString = useComputed(() =>
    rootDT.value
      .withTimeZone(localTZ)
      .toPlainDateTime()
      .toLocaleString(undefined, {
        day: "numeric",
        month: "short",
      })
  );

  useEffect(() => {
    loadSettings().then((settings) => {
      timezones.value = settings.timezones;
    });
  }, []);

  const filteredTimezones = useComputed(() => {
    return timezones.value.filter(
      ({ timezone, label }) =>
        (timezone !== localTZ.id && timezone !== pageTZ.id) || label
    );
  });

  return (
    <div id="saved-timezones">
      <div className="header">
        <b>Other timezones</b>
        <a href="/settings.html">Edit</a>
      </div>
      {filteredTimezones.value.map(({ timezone, label }) => {
        const plainDateTime = rootDT.value
          .withTimeZone(Temporal.TimeZone.from(timezone))
          .toPlainDateTime();

        const dateString = plainDateTime.toLocaleString(undefined, {
          day: "numeric",
          month: "short",
        });
        const timeString = plainDateTime.toLocaleString(undefined, {
          timeStyle: "short",
        });

        return (
          <div
            role="listitem"
            className="timezone-row"
            key={timezone + ":" + label}
          >
            <a
              className="timezone-label"
              href={new URL(getPathnameFromTimezone(timezone), location.href)}
            >
              {label
                ? `${label} (${getLocationFromTimezone(timezone)})`
                : getLocationFromTimezone(timezone)}
            </a>

            <div>
              {localDateString.value === dateString &&
              pageDateString.value === dateString
                ? timeString
                : `${dateString}, ${timeString}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseTimeString(timezone, timeString) {
  if (timezone === "unix") {
    timezone = "UTC";
  }

  let date = undefined;
  try {
    date = Temporal.PlainDate.from(timeString);
  } catch (e) {
    date = Temporal.Now.plainDate(browserCalendar);
  }

  if (timeString && timeString !== "now") {
    try {
      Temporal.PlainTime.from(timeString);
    } catch (e) {
      timeString = "now";
    }
  }

  return !timeString || timeString === "now"
    ? Temporal.Now.zonedDateTime(browserCalendar, timezone).with({
        second: 0,
        millisecond: 0,
      })
    : date.toZonedDateTime({
        plainTime: Temporal.PlainTime.from(timeString),
        timeZone: timezone,
      });
}

function extractDataFromURL() {
  const unixURLPattern = new URLPattern(
    {
      pathname: "/unix{/:seconds(\\d*)}?",
    },
    { ignoreCase: true }
  );
  const matchesUnix = unixURLPattern.test(location.href);
  if (matchesUnix) {
    const { seconds } = unixURLPattern.exec(location.href).pathname.groups;

    if (!seconds || !seconds.match(/^[0-9]{1,10}$/)) {
      return ["unix", "now"];
    }

    return ["unix", new Date(+seconds * 1000).toISOString().replace(/Z$/, "")];
  }

  const geoURLPattern = new URLPattern({
    pathname: "/:zeroth{/*}?",
  });

  const matchesGeo = geoURLPattern.test(location.href);
  if (!matchesGeo) {
    return [];
  }

  const { zeroth, 0: extra } = geoURLPattern.exec(location.href).pathname
    .groups;

  if (zeroth === "") {
    return [];
  }

  const [first, second, third] = extra?.split("/") ?? [];

  let remoteTZ = guessTimezone(`${zeroth}/${first}/${second}`, {
    strict: true,
  });
  if (remoteTZ) {
    return [remoteTZ, third ?? "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}/${first}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, second ?? "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, first ?? "now"];
  }

  return [];
}

function getRelativeTime(dt) {
  const localDateTime = dt;
  const now = Temporal.Now.zonedDateTime(browserCalendar, dt.timeZone);
  const today = now.startOfDay();
  const durationSinceNow = localDateTime.since(now);
  const durationSinceToday = localDateTime.startOfDay().since(today);
  const inTheFuture = Temporal.ZonedDateTime.compare(localDateTime, now) === 1;
  const thisMinute = !inTheFuture && -1 * durationSinceNow.total("second") < 60;

  if (thisMinute) {
    return "now";
  }

  const totalSeconds = durationSinceNow.total("second");
  const totalMinutes = durationSinceNow.total("minute");
  const totalHours = durationSinceNow.total("hour");
  const totalDays = localDateTime
    .startOfDay()
    .since(today, { largestUnit: "day", roundingMode: "floor" })
    .total("day");
  const totalWeeks = localDateTime
    .startOfDay()
    .since(today, { largestUnit: "day", roundingMode: "floor" })
    .total({ unit: "week", relativeTo: today });
  const totalMonths = durationSinceToday.total({
    unit: "month",
    relativeTo: today,
  });
  const totalYears = durationSinceToday.total({
    unit: "year",
    relativeTo: today,
  });

  if (0 < totalSeconds && totalSeconds < 60) {
    return rtfAuto.format(Math.ceil(totalSeconds), "second");
  }

  if (Math.ceil(Math.abs(totalMinutes)) < 120) {
    return rtfAuto.format(Math.ceil(totalMinutes), "minute");
  }

  if (
    Math.floor(Math.abs(totalDays)) === 0 ||
    Math.ceil(Math.abs(totalHours)) < 12
  ) {
    return rtfAuto.format(Math.floor(totalHours), "hour");
  }

  if (Math.abs(totalDays) < 2) {
    return rtfAuto.format(Math.floor(totalDays), "day");
  }

  if (Math.abs(totalDays) < 7) {
    return `${
      totalDays < 0 ? "past" : "upcoming"
    } ${localDateTime.toLocaleString("en", { weekday: "long" })}`;
  }

  if (Math.abs(totalMonths) < 1) {
    return rtfAlways.format(Math.trunc(totalWeeks), "week");
  }

  if (Math.abs(totalYears) < 1) {
    return rtfAlways.format(Math.trunc(totalMonths), "months");
  }

  return rtfAlways.format(Math.trunc(totalYears), "year");
}

function formatDTInput(dt) {
  return dt
    .toPlainDateTime()
    .toString({ smallestUnit: "minute", calendarName: "never" });
}

// function formatDTDisplay(dt) {
//   return dt.toPlainDateTime().toLocaleString(undefined, {
//     dateStyle: "medium",
//     timeStyle: "short",
//   });
// }

function formatDTTitle(dt) {
  return dt.toPlainDateTime().toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function updateTitle(dt, tz) {
  if (!dt && !tz) {
    document.title = `when.st`;
    return;
  }

  const placeStr = getLocationFromTimezone(tz);
  if (!dt) {
    document.title =
      tz === "unix" ? `Unix epoch | when.st` : `Time in ${placeStr} | when.st`;
    return;
  }

  if (tz === "unix") {
    document.title = `Unix ${dt.epochSeconds} | when.st`;
    return;
  }

  const timeStr = formatDTTitle(dt);
  document.title = `${timeStr} in ${placeStr} | when.st`;
}
