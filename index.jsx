import "urlpattern-polyfill";
import { Temporal, Intl } from "@js-temporal/polyfill";

import { render } from "preact";
import { useEffect } from "preact/hooks";
import {
  useSignal,
  useComputed,
  useSignalEffect,
  batch,
  effect,
  signal,
} from "@preact/signals";

import "./keyboard";

// TODO: `addTimezone`
import { loadSettings } from "./api";
import { guessTimezone } from "./guess-timezone";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "./saved-timezones";

import Discord from "./icons/discord.svg";
import CalendarPlus from "./icons/calendar-plus.svg";

import EarthAfrica from "./icons/earth-africa.svg";
import EarthAmericas from "./icons/earth-americas.svg";
import EarthAsia from "./icons/earth-asia.svg";
import EarthEurope from "./icons/earth-europe.svg";
import EarthOceania from "./icons/earth-oceania.svg";
import Globe from "./icons/globe.svg";

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
  const activeTab = activeTabSignal;

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

      <Tabs
        rootDT={dt}
        pageTZ={pageTZ}
        localTZ={localTZ}
        activeTab={activeTab}
      />
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
    } catch (_e) {
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

      {secondary ? null : <ClockRowActions timestampURL={timestampURL} />}
    </div>
  );
}

function ClockRowActions({ timestampURL }) {
  const copyURL = navigator.clipboard
    ? () => navigator.clipboard.writeText(timestampURL.peek())
    : null;
  const shareURL = navigator.share
    ? async () => {
        try {
          await navigator.share({ url: timestampURL.peek() });
        } catch (_e) {
          //
        }
      }
    : null;

  return (
    <>
      <div className="actions" role="menubar">
        <div className="scrolly">
          <a
            href={timestampURL}
            aria-label="Link to this page"
            role="menuitem"
            tabIndex={-1}
          >
            Link
          </a>
          <div></div>
          <ActionButton
            label="Copy"
            labelSuccess="Copied"
            labelFailure="Failed"
            action={copyURL}
            aria-label="Copy Link"
            role="menuitem"
            tabIndex={0}
            primary
          />
          {shareURL ? (
            <ActionButton
              label="Share"
              labelSuccess="Share"
              labelFailure="Share"
              action={shareURL}
              aria-label="Share Link"
              role="menuitem"
              tabIndex={-1}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

const CALENDAR_LINKS_ID = "calendar-links";

function Tabs({ activeTab, rootDT, pageTZ, localTZ }) {
  const otherTimezonesActive = useComputed(
    () => activeTab.value === SAVED_TIMEZONES_ID,
  );
  const otherTimezonesHidden = useComputed(() => !otherTimezonesActive.value);
  const timezonesTabIndex = useComputed(() =>
    otherTimezonesActive.value ? 0 : -1,
  );

  const discordFormatsActive = useComputed(
    () => activeTab.value === DISCORD_FORMATS_ID,
  );
  const discordFormatsHidden = useComputed(() => !discordFormatsActive.value);
  const discordTabIndex = useComputed(() =>
    discordFormatsActive.value ? 0 : -1,
  );

  const calendarLinksActive = useComputed(
    () => activeTab.value === CALENDAR_LINKS_ID,
  );
  const calendarLinksHidden = useComputed(() => !calendarLinksActive.value);
  const calendarTabIndex = useComputed(() =>
    calendarLinksActive.value ? 0 : -1,
  );

  return (
    <>
      <div className="tabs-row" role="tablist">
        <div className="scrolly">
          <button
            role="tab"
            aria-selected={otherTimezonesActive}
            tabIndex={timezonesTabIndex}
            onClick={() => {
              activeTab.value = SAVED_TIMEZONES_ID;
            }}
            aria-controls={SAVED_TIMEZONES_ID}
            aria-labelledby={SAVED_TIMEZONES_ID}
          >
            <RegionAwareIcon timezone={pageTZ} aria-hidden="true" />
            <span>Other timezones</span>
          </button>

          <button
            role="tab"
            aria-selected={discordFormatsActive}
            tabIndex={discordTabIndex}
            onClick={() => {
              activeTab.value = DISCORD_FORMATS_ID;
            }}
            aria-controls={DISCORD_FORMATS_ID}
            aria-labelledby={DISCORD_FORMATS_ID}
          >
            <Discord aria-hidden="true" />
            <span>Discord codes</span>
          </button>

          <button
            role="tab"
            aria-selected={calendarLinksActive}
            tabIndex={calendarTabIndex}
            onClick={() => {
              activeTab.value = CALENDAR_LINKS_ID;
            }}
            aria-controls={CALENDAR_LINKS_ID}
            aria-labelledby={CALENDAR_LINKS_ID}
          >
            <CalendarPlus aria-hidden="true" />
            <span>Add to calendar</span>
          </button>
        </div>
      </div>

      <SavedTimezones
        rootDT={rootDT}
        pageTZ={pageTZ}
        localTZ={localTZ}
        hidden={otherTimezonesHidden}
      />

      <DiscordActions
        rootDT={rootDT}
        localTZ={localTZ}
        hidden={discordFormatsHidden}
      />

      <CalendarLinks
        rootDT={rootDT}
        localTZ={localTZ}
        hidden={calendarLinksHidden}
      />
    </>
  );
}

function RegionAwareIcon({ timezone, ...otherProps }) {
  const [area] = timezone.id?.split("/") ?? [];

  /*
    > new Set(Intl.supportedValuesOf("timeZone").map(v => v.split('/')[0]))

    "Africa"
    "America"
    "Antarctica"
    "Arctic"
    "Asia"
    "Atlantic"
    "Australia"
    "Europe"
    "Indian"
    "Pacific"
    "UTC"
  */

  if (area === "Europe" || area === "Atlantic") {
    return <EarthEurope {...otherProps} />;
  }

  if (area === "America" || area === "Pacific") {
    return <EarthAmericas {...otherProps} />;
  }

  if (area === "Africa") {
    return <EarthAfrica {...otherProps} />;
  }

  if (area === "Australia") {
    return <EarthOceania {...otherProps} />;
  }

  if (area === "Asia" || area === "Indian") {
    return <EarthAsia {...otherProps} />;
  }

  // "Antarctica", "Arctic", "UTC"
  return <Globe {...otherProps} />;
}

const DISCORD_FORMATS_ID = "discord-formats";

function DiscordActions({ rootDT, localTZ, hidden }) {
  const dt = useComputed(() => rootDT.value.withTimeZone(localTZ));

  const timestampStyles = [
    ["F", "Long Date/Time"],
    ["f", "Short Date/Time"],
    // ["T", "Long Time"],
    ["D", "Long Date"],
    ["d", "Short Date"],
    ["t", "Short Time"],
    // ['R', 'Relative'],
  ];

  return (
    <div
      id={DISCORD_FORMATS_ID}
      className="discord-other-formats"
      role="tabpanel"
      aria-label="Discord codes"
      hidden={hidden}
    >
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

function DiscordFormat({ dt, style, name }) {
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
    <div
      key={style}
      className="discord-format"
      style={style === "F" ? { flexBasis: "100%", flexShrink: 1 } : null}
    >
      <div className="discord-format_row">
        <span className="discord-format_label">{label}</span>
        {navigator.clipboard ? (
          <ActionButton
            label="Copy"
            labelSuccess="Copied"
            labelFailure="Failed"
            action={() => navigator.clipboard.writeText(code.peek())}
            aria-label={`Copy code for ${name}`}
            primary
          />
        ) : null}
      </div>
      <div className="discord-format_row">
        <span className="discord-format_code">{code}</span>
      </div>
    </div>
  );
}

function CalendarLinks({ rootDT, localTZ, hidden }) {
  const dt = useComputed(() => rootDT.value.withTimeZone(localTZ));

  const eventTitle = useSignal("");
  const eventDurationMinutes = useSignal(0);

  const durations = [
    ["None", 0],
    ["15m", 15],
    ["30m", 30],
    ["45m", 45],
    ["1h", 60],
    ["90m", 90],
    ["2h", 120],
    ["3h", 180],
  ];

  return (
    <div
      id={CALENDAR_LINKS_ID}
      className="calendar-links"
      role="tabpanel"
      aria-label="Add to calendar"
      hidden={hidden}
    >
      <form
        className="calendar-links-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          <span>Event name</span>
          <input
            placeholder="Event"
            value={eventTitle}
            onInput={(event) => (eventTitle.value = event.currentTarget.value)}
          />
        </label>

        <label>
          <span>Duration</span>

          <div
            className="calendar-links-durations"
            role="radiogroup"
            aria-orientation="horizontal"
            aria-label="Duration"
          >
            {durations.map(([label, duration], index) => (
              <DurationButton
                key={label}
                label={label}
                duration={duration}
                activeDuration={eventDurationMinutes}
                tabIndex={index === 0 ? 0 : -1}
              />
            ))}
          </div>
        </label>
      </form>

      <div className="calendar-links-rows">
        <WebcalRow duration={eventDurationMinutes} title={eventTitle} dt={dt} />
        <GoogleCalendarRow
          duration={eventDurationMinutes}
          title={eventTitle}
          dt={dt}
        />
      </div>
    </div>
  );
}

function DurationButton({ label, duration, activeDuration, tabIndex }) {
  const isActive = useComputed(() => duration === activeDuration.value);

  return (
    <button
      type="button"
      onClick={() => {
        activeDuration.value = duration;
      }}
      role="radio"
      aria-checked={isActive}
      tabIndex={tabIndex}
    >
      {label}
    </button>
  );
}

const pad2 = (v) => v.toString().padStart(2, "0");
const pad4 = (v) => v.toString().padStart(4, "0");

function WebcalRow({ duration, title, dt }) {
  const href = useComputed(() => {
    return (
      "data:text/calendar;charset=utf8," +
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        `DTSTART;TZID="/${dt.value.timeZoneId}":${formatDTiCal(dt.value)}`,
        duration.value ? `DURATION;PT${duration.value}M` : "",
        `SUMMARY:${encodeURIComponent(title.value || "Event")}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join(encodeURI("\n")) +
      encodeURI("\n")
    );
  });

  return (
    <div className="calendar-links-row">
      <a href={href}>.ics/Webcal</a>
    </div>
  );
}

function GoogleCalendarRow({ duration, title, dt }) {
  const href = useComputed(() => {
    const start = formatDTiCal(dt.value);
    const end = duration.value
      ? formatDTiCal(dt.value.add({ minutes: duration.value }))
      : start;

    return (
      "https://calendar.google.com/calendar/render?action=TEMPLATE&" +
      new URLSearchParams({
        text: title.value || "Event",
        ctz: dt.value.timeZoneId,
        dates: `${start}/${end}`,
      }).toString()
    );
  });

  return (
    <div className="calendar-links-row">
      <a href={href} target="_blank" rel="noreferrer">
        Google Calendar
      </a>
    </div>
  );
}

function formatDTiCal(dt) {
  const { isoYear, isoMonth, isoDay, isoHour, isoMinute, isoSecond } =
    dt.getISOFields();

  return `${pad4(isoYear)}${pad2(isoMonth)}${pad2(isoDay)}T${pad2(
    isoHour,
  )}${pad2(isoMinute)}${pad2(isoSecond)}`;
}

function ActionButton({
  label,
  labelSuccess,
  labelFailure,
  action,
  primary,
  "aria-label": ariaLabel,
  role,
  tabIndex,
}) {
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
        } catch (_e) {
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
      aria-label={ariaLabel}
      role={role}
      tabIndex={tabIndex}
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

      <ClockRowActions timestampURL={timestampURL} />
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

const SAVED_TIMEZONES_ID = "saved-timezones";

function SavedTimezones({ rootDT, pageTZ, localTZ, hidden }) {
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

  const settingsLabel = useComputed(() =>
    filteredTimezones.value.length ? "Edit" : "Add a timezone",
  );

  return (
    <div
      id={SAVED_TIMEZONES_ID}
      role="tabpanel"
      aria-label="Other timezones"
      hidden={hidden}
    >
      <div role="table">
        {filteredTimezones.value.map(({ timezone, label }, index) => {
          const plainDateTime = rootDT.value
            .withTimeZone(Temporal.TimeZone.from(timezone))
            .toPlainDateTime();

          const dateString = shortDateFormatter.format(plainDateTime);
          const timeString = shortTimeFormatter.format(plainDateTime);

          return (
            <div
              role="row"
              className="timezone-row"
              key={timezone + ":" + label}
              tabIndex={index === 0 ? 0 : -1}
            >
              <a
                className="timezone-label"
                href={new URL(getPathnameFromTimezone(timezone), location.href)}
                tabIndex={-1}
                role="cell"
              >
                {label
                  ? `${label} (${getLocationFromTimezone(timezone)})`
                  : getLocationFromTimezone(timezone)}
              </a>

              <div role="cell">
                {localDateString.value === dateString &&
                pageDateString.value === dateString
                  ? timeString
                  : `${dateString}, ${timeString}`}
              </div>
            </div>
          );
        })}
      </div>
      <div className="footer">
        <div />
        <a href="/settings">{settingsLabel}</a>
      </div>
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
  } catch (_e) {
    date = Temporal.Now.plainDate(browserCalendar);
  }

  if (timeString && timeString !== "now") {
    try {
      Temporal.PlainTime.from(timeString);
    } catch (_e) {
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

const activeTabSignal = signal(
  history.state?.activeTab === SAVED_TIMEZONES_ID ||
    history.state?.activeTab === DISCORD_FORMATS_ID ||
    history.state?.activeTab === CALENDAR_LINKS_ID
    ? history.state.activeTab
    : SAVED_TIMEZONES_ID,
);

effect(() => {
  if (activeTabSignal.value !== history.state?.activeTab) {
    history.replaceState(
      { ...history.state, activeTab: activeTabSignal.value },
      undefined,
    );
  }
});

render(<IndexPage />, document.querySelector("main"));
