import "urlpattern-polyfill";
import { Temporal, Intl } from "@js-temporal/polyfill";

import { render } from "preact";
import { useEffect } from "preact/hooks";
import {
  useSignal,
  useComputed,
  useSignalEffect,
  batch,
} from "@preact/signals";

// TODO: `addTimezone`
import { loadSettings } from "./api";
import { guessTimezone } from "./guess-timezone";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "./saved-timezones";

window.Temporal = Temporal;

const browserCalendar = "iso8601";
const rtfAlways = new window.Intl.RelativeTimeFormat("en", {
  numeric: "always",
});
const rtfAuto = new window.Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function IndexPage() {
  const [urlTZ, urlDT] = extractDataFromURL();
  const localTZ = Temporal.TimeZone.from(Temporal.Now.timeZoneId());
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
      isUnix ? "unix" : pageTZ,
    );
  }, []);

  const writeToLocation = (dt) => {
    history.replaceState(
      null,
      "",
      `${getPathnameFromTimezone(isUnix ? "unix" : pageTZ)}/${
        isUnix ? dt.epochSeconds : formatDTInput(dt.withTimeZone(pageTZ))
      }`,
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

const NBSP = "\xa0";

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
  const timestampURL = useComputed(() => `${tzURL}/${timeInTZ}`);
  const relative = useSignal(NBSP);
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
        event.target.value,
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
        }),
      );

      onTimeChange(event);
    }
  };

  return (
    <div className="clock-row">
      {secondary ? <h2>{tzName}</h2> : <h1>{tzName}</h1>}

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
        {withRelative ? <div className="relative">{relative}</div> : null}
      </form>

      {secondary ? null : (
        <ClockRowActions timestampURL={timestampURL} dt={dt} />
      )}
    </div>
  );
}

function ClockRowActions({ timestampURL, dt }) {
  const showDiscordFormats = useSignal(false);

  const copyURL = navigator.clipboard
    ? () => navigator.clipboard.writeText(timestampURL.peek())
    : null;
  const shareURL = navigator.share
    ? async () => {
        try {
          await navigator.share({ url: timestampURL.peek() });
        } catch (e) {
          //
        }
      }
    : null;

  return (
    <>
      <div className="actions">
        <div className="scrolly">
          <a href={timestampURL}>Link</a>
          <div></div>
          <ActionButton
            label="Copy"
            labelSuccess="Copied"
            labelFailure="Failed"
            action={copyURL}
            primary
          />
          {shareURL ? (
            <ActionButton
              label="Share"
              labelSuccess="Share"
              labelFailure="Share"
              action={shareURL}
            />
          ) : null}
          <div></div>
          <ToggleDiscordFormats showDiscordFormats={showDiscordFormats} />
        </div>
      </div>
      <DiscordActions showDiscordFormats={showDiscordFormats} dt={dt} />
    </>
  );
}

function ToggleDiscordFormats({ showDiscordFormats }) {
  return (
    <button
      onClick={() => (showDiscordFormats.value = !showDiscordFormats.peek())}
    >
      {showDiscordFormats.value ? "▼" : "▶"} Discord codes
    </button>
  );
}

function DiscordActions({ dt, showDiscordFormats }) {
  const timestampStyles = [
    ["t", "Short Time"],
    ["T", "Long Time"],
    ["d", "Short Date"],
    ["D", "Long Date"],
    ["f", "Short Date/Time"],
    ["F", "Long Date/Time"],
    // ['R', 'Relative'],
  ];

  if (!showDiscordFormats.value) {
    return null;
  }

  return (
    <div className="discord-other-formats">
      {timestampStyles.map(([style, name]) => {
        return <DiscordFormat key={style} dt={dt} style={style} name={name} />;
      })}
    </div>
  );
}

const discordFormatter_t = new Intl.DateTimeFormat(undefined, {
  timeStyle: "short",
});

const discordFormatter_T = new Intl.DateTimeFormat(undefined, {
  timeStyle: "medium",
  timeZoneName: undefined,
});

const discordFormatter_d = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
});

const discordFormatter_D = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
});

const discordFormatter_f = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const discordFormatter_F = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function DiscordFormat({ dt, style }) {
  const code = useComputed(() => `<t:${dt.value.epochSeconds}:${style}>`);

  const label = useComputed(() => {
    const formatter =
      style === "t"
        ? discordFormatter_t
        : style === "T"
        ? discordFormatter_T
        : style === "d"
        ? discordFormatter_d
        : style === "D"
        ? discordFormatter_D
        : style === "f"
        ? discordFormatter_f
        : style === "F"
        ? discordFormatter_F
        : null;

    return formatter?.format(dt.value.toPlainDateTime());
  });

  if (!label) {
    return null;
  }

  return (
    <div key={style} className="discord-format">
      <div className="discord-format_top">
        <span className="discord-format_label">{label}</span>
        {navigator.clipboard ? (
          <ActionButton
            label="Copy"
            labelSuccess="Copied"
            labelFailure="Failed"
            action={() => navigator.clipboard.writeText(code.peek())}
          />
        ) : null}
      </div>
      <span className="discord-format_code">{code}</span>
    </div>
  );
}

function ActionButton({ label, labelSuccess, labelFailure, action, primary }) {
  const labelSignal = useSignal(label);
  const timeoutIdSignal = useSignal(undefined);

  const onClick = action
    ? async () => {
        clearTimeout(timeoutIdSignal.peek());

        try {
          await action();
          batch(() => {
            labelSignal.value = labelSuccess;
            timeoutIdSignal.value = setTimeout(() => {
              labelSignal.value = label;
            }, 1000);
          });
        } catch (e) {
          batch(() => {
            labelSignal.value = labelFailure;
            timeoutIdSignal.value = setTimeout(() => {
              labelSignal.value = label;
            }, 1000);
          });
        }
      }
    : null;

  return (
    <button
      disabled={!action}
      onClick={onClick}
      className={primary ? "primary" : null}
    >
      {labelSignal}
    </button>
  );
}

function UnixRow({ rootDT, writeToLocation }) {
  const timeInUnix = useComputed(() => rootDT.value.epochSeconds);
  const timestampURL = useComputed(() =>
    new URL(`/unix/${timeInUnix}`, location.href).toString(),
  );

  const onTimeChange = (event) => {
    if (!event.target.value || !event.target.value.match(/^[0-9]{1,10}$/)) {
      return;
    }

    try {
      const newRootDT = Temporal.PlainDateTime.from(
        new Date(+event.target.value * 1000).toISOString().replace(/Z$/, ""),
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

      <ClockRowActions dt={rootDT} timestampURL={timestampURL} />
    </div>
  );
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const shortTimeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: "short",
});

function SavedTimezones({ rootDT, pageTZ, localTZ }) {
  const timezones = useSignal([]);

  const pageDateString = useComputed(() =>
    shortDateFormatter.format(
      rootDT.value.withTimeZone(pageTZ).toPlainDateTime(),
    ),
  );

  const localDateString = useComputed(() =>
    shortDateFormatter.format(
      rootDT.value.withTimeZone(pageTZ).toPlainDateTime(),
    ),
  );

  useEffect(() => {
    loadSettings().then((settings) => {
      timezones.value = settings.timezones;
    });
  }, []);

  const filteredTimezones = useComputed(() => {
    return timezones.value.filter(
      ({ timezone, label }) =>
        (timezone !== localTZ.id && timezone !== pageTZ.id) || label,
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

        const dateString = shortDateFormatter.format(plainDateTime);
        const timeString = shortTimeFormatter.format(plainDateTime);

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
    { ignoreCase: true },
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

const weekdayFormatter = new Intl.DateTimeFormat("en", { weekday: "long" });

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
    return `${totalDays < 0 ? "past" : "upcoming"} ${weekdayFormatter.format(
      localDateTime.toPlainDate(),
    )}`;
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

const titleFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDTTitle(dt) {
  return titleFormatter.format(dt.toPlainDateTime());
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

render(<IndexPage />, document.querySelector("main"));
