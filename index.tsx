import "urlpattern-polyfill";
import { Temporal, Intl } from "@js-temporal/polyfill";

import { JSX, render } from "preact";
import { useEffect } from "preact/hooks";
import {
  useSignal,
  useComputed,
  useSignalEffect,
  batch,
  effect,
  Signal,
  ReadonlySignal,
} from "@preact/signals";
import { For, Show } from "@preact/signals/utils";

import "./keyboard";

// TODO: `addTimezone`
import { worldClockSignal } from "./api.js";
import { guessTimezone } from "./guess-timezone.js";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "./shared/from-timezone.js";

import Discord from "./icons/discord.svg.js";
import CalendarPlus from "./icons/calendar-plus.svg.js";
import Gear from "./icons/gear.svg.js";

import EarthAfrica from "./icons/earth-africa.svg.js";
import EarthAmericas from "./icons/earth-americas.svg.js";
import EarthAsia from "./icons/earth-asia.svg.js";
import EarthEurope from "./icons/earth-europe.svg.js";
import EarthOceania from "./icons/earth-oceania.svg.js";
import Globe from "./icons/globe.svg.js";
import { TimezoneHeading } from "./src/components/TimezoneHeading/index.js";
import { TitleBarPortal } from "./src/components/TitleBarPortal/index.js";

const _T = Temporal;
window.Temporal = Temporal;
declare global {
  interface Window {
    Temporal: typeof _T;
  }
}

const browserCalendar = "iso8601";
const rtfAlways = new window.Intl.RelativeTimeFormat("en", {
  numeric: "always",
});
const rtfAuto = new window.Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function IndexPage() {
  const [urlTZ, urlDT] = extractDataFromURL();
  const localTZ = Temporal.TimeZone.from(
    Temporal.Now.timeZoneId(),
  ) as Temporal.TimeZone;
  const isUnix = urlTZ === "unix";
  const pageTZ = isUnix ? "UTC" : urlTZ ? urlTZ : localTZ;

  const dt = useSignal(parseTimeString(pageTZ, urlDT));
  const activeTab = activeTabSignal;

  const pageForRemoteTimeZone =
    isUnix || typeof pageTZ === "string" || pageTZ.id !== localTZ.id;

  useEffect(() => {
    if (!urlTZ && location.pathname !== "/" && location.pathname !== "") {
      history.replaceState(history.state || null, "", "/");
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

    history.replaceState(history.state || null, "", canonicalPathname);
    updateTitle(
      urlDT === "now" ? undefined : dt.peek(),
      isUnix ? "unix" : pageTZ,
    );
  }, []);

  const writeToLocation = (dt: Temporal.ZonedDateTime) => {
    history.replaceState(
      history.state || null,
      "",
      `${getPathnameFromTimezone(isUnix ? "unix" : pageTZ)}/${
        isUnix ? dt.epochSeconds : formatDTInput(dt.withTimeZone(pageTZ))
      }`,
    );

    updateTitle(dt, isUnix ? "unix" : pageTZ);
  };

  const shouldShowBack = isUnix || pageForRemoteTimeZone;

  useEffect(() => {
    const titleBarBack = document.querySelector("#title-bar a.back");

    if (!titleBarBack) {
      return;
    }

    if (shouldShowBack) {
      titleBarBack.removeAttribute("hidden");
    } else {
      titleBarBack.setAttribute("hidden", "hidden");
    }
  }, [shouldShowBack]);

  return (
    <>
      <TitleBarPortal>
        <TimezoneHeading
          defaultValue={isUnix ? "Unix Epoch" : getLocationFromTimezone(pageTZ)}
          idPrefix="title-bar-tzh"
        />
      </TitleBarPortal>
      {isUnix ? (
        <UnixRow rootDT={dt} writeToLocation={writeToLocation} />
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
}: {
  rootDT: Signal<Temporal.ZonedDateTime>;
  timeZone: Temporal.TimeZone | string;
  withRelative: boolean;
  secondary?: boolean;
  writeToLocation(dt: Temporal.ZonedDateTime): void;
}) {
  const dt = useComputed(() => rootDT.value.withTimeZone(timeZone));

  const tzName = getLocationFromTimezone(timeZone);
  const tzURL = new URL(getPathnameFromTimezone(timeZone), location.href);
  const timeInTZ = useComputed(() => formatDTInput(dt.value));
  const timestampURL = useComputed(() => `${tzURL}/${timeInTZ}`);
  const relative = useSignal(NBSP);
  const withRelativeSignal = useSignal(withRelative);
  useSignalEffect(() => {
    if (!withRelativeSignal.value) {
      return;
    }

    let timeoutId: undefined | ReturnType<typeof setTimeout>;

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
  });

  const onTimeChange = (event: { target: EventTarget | null }) => {
    if (!event.target || !(event.target instanceof HTMLInputElement)) {
      return;
    }

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

  const onBlur = (event: FocusEvent) => {
    if (!event.target || !(event.target instanceof HTMLInputElement)) {
      return;
    }

    try {
      Temporal.PlainDateTime.from(event.target.value).toZonedDateTime(timeZone);
    } catch (_e) {
      event.target.value = formatDTInput(
        Temporal.Now.zonedDateTime(browserCalendar, timeZone).with({
          second: 0,
          millisecond: 0,
        }),
      );

      onTimeChange({ target: event.target });
    }
  };

  return (
    <div className="clock-row">
      {secondary ? (
        <h2>{tzName}</h2>
      ) : (
        <TimezoneHeading
          defaultValue={tzName}
          className="window-controls-overlay-hidden"
        />
      )}

      <form
        className="clock"
        action="/"
        method="GET"
        onSubmit={(e) => e.preventDefault()}
      >
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

function ClockRowActions({ timestampURL }: { timestampURL: Signal<string> }) {
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

function Tabs({
  activeTab,
  rootDT,
  pageTZ,
  localTZ,
}: {
  activeTab: Signal<
    | typeof SAVED_TIMEZONES_ID
    | typeof DISCORD_FORMATS_ID
    | typeof CALENDAR_LINKS_ID
  >;
  rootDT: Signal<Temporal.ZonedDateTime>;
  pageTZ: string | Temporal.TimeZone;
  localTZ: Temporal.TimeZone;
}) {
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
          <a role="tab" href="/settings" tabIndex={-1} aria-label="Settings">
            <Gear aria-hidden="true" />
          </a>

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
            <span>World clock</span>
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

function RegionAwareIcon({
  timezone,
  ...otherProps
}: {
  timezone: Temporal.TimeZone | string;
} & JSX.SVGAttributes<SVGSVGElement>) {
  const [area] =
    typeof timezone === "string" ? [] : (timezone.id?.split("/") ?? []);

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

function DiscordActions({
  rootDT,
  localTZ,
  hidden,
}: {
  rootDT: Signal<Temporal.ZonedDateTime>;
  localTZ: Temporal.TimeZone;
  hidden: Signal<boolean>;
}) {
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

function DiscordFormat({
  dt,
  style,
  name,
}: {
  dt: Signal<Temporal.ZonedDateTime>;
  style: string;
  name: string;
}) {
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
      style={style === "F" ? { flexBasis: "100%", flexShrink: 1 } : undefined}
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

function CalendarLinks({
  rootDT,
  localTZ,
  hidden,
}: {
  rootDT: Signal<Temporal.ZonedDateTime>;
  localTZ: Temporal.TimeZone;
  hidden: Signal<boolean>;
}) {
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
  ] as const;

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

function DurationButton({
  label,
  duration,
  activeDuration,
  tabIndex,
}: {
  label: string;
  duration: number;
  activeDuration: Signal<number>;
  tabIndex?: number;
}) {
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

const pad2 = (v: number) => v.toString().padStart(2, "0");
const pad4 = (v: number) => v.toString().padStart(4, "0");

function WebcalRow({
  duration,
  title,
  dt,
}: {
  duration: Signal<number>;
  title: Signal<string>;
  dt: Signal<Temporal.ZonedDateTime>;
}) {
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

function GoogleCalendarRow({
  duration,
  title,
  dt,
}: {
  duration: Signal<number>;
  title: Signal<string>;
  dt: Signal<Temporal.ZonedDateTime>;
}) {
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

function formatDTiCal(dt: Temporal.ZonedDateTime) {
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
}: {
  label: string;
  labelSuccess: string;
  labelFailure: string;
  action?: null | (() => void) | (() => Promise<void>);
  primary?: boolean;
  "aria-label"?: string;
  role?: JSX.HTMLAttributes["role"];
  tabIndex?: number;
}) {
  const labelSignal = useSignal(label);
  const timeoutIdSignal = useSignal<undefined | ReturnType<typeof setTimeout>>(
    undefined,
  );

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
    : undefined;

  return (
    <button
      disabled={!action}
      onClick={onClick}
      className={primary ? "primary" : undefined}
      aria-label={ariaLabel}
      role={role}
      tabIndex={tabIndex}
    >
      {labelSignal}
    </button>
  );
}

function UnixRow({
  rootDT,
  writeToLocation,
}: {
  rootDT: Signal<Temporal.ZonedDateTime>;
  writeToLocation(dt: Temporal.ZonedDateTime): void;
}) {
  const timeInUnix = useComputed(() => rootDT.value.epochSeconds);
  const timestampURL = useComputed(() =>
    new URL(`/unix/${timeInUnix}`, location.href).toString(),
  );

  const onTimeChange = (event: { target: EventTarget | null }) => {
    if (
      !event.target ||
      !(event.target instanceof HTMLInputElement) ||
      !event.target.value ||
      !event.target.value.match(/^[0-9]{1,10}$/)
    ) {
      return;
    }

    try {
      const newRootDT = Temporal.PlainDateTime.from(
        new Date(+event.target.value * 1000).toISOString().replace(/Z$/, ""),
      ).toZonedDateTime("UTC");
      writeToLocation(newRootDT);
      rootDT.value = newRootDT;
    } catch (e) {
      console.error(e);
      return;
    }
  };

  const onBlur = (event: FocusEvent) => {
    const target = event.target;

    if (!target || !(event.target instanceof HTMLInputElement)) {
      return;
    }

    if (!event.target.value || !event.target.value.match(/^[0-9]{1,10}$/)) {
      event.target.value = Math.floor(+new Date() / 1000).toString();

      onTimeChange({ target: event.target });
    }
  };

  return (
    <div className="clock-row">
      <h1>Unix Epoch</h1>

      <form
        className="clock"
        action="/"
        method="GET"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          className="unix-input"
          name="t"
          type="text"
          maxLength={10}
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

function SavedTimezones({
  rootDT,
  pageTZ,
  localTZ,
  hidden,
}: {
  rootDT: Signal<Temporal.ZonedDateTime>;
  pageTZ: Temporal.TimeZone | string;
  localTZ: Temporal.TimeZone;
  hidden?: Signal<boolean>;
}) {
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

  const filteredTimezones = useComputed(() => {
    return (
      worldClockSignal.value?.filter(({ timezone, label }) => {
        try {
          Temporal.TimeZone.from(timezone);
        } catch (e) {
          console.error(e);
          return false;
        }

        return (
          (timezone !== localTZ.id &&
            (typeof pageTZ === "string" || timezone !== pageTZ.id)) ||
          label
        );
      }) ?? []
    );
  });

  const emptySignal = useComputed(
    () => !!worldClockSignal.value && !filteredTimezones.value.length,
  );

  return (
    <div
      id={SAVED_TIMEZONES_ID}
      role="tabpanel"
      aria-label="World clock"
      hidden={hidden}
    >
      <Show when={emptySignal}>
        <div className="message-empty">
          <a href="/settings">Add a timezone</a>
        </div>
      </Show>
      <div role="table">
        <For each={filteredTimezones}>
          {({ timezone, label }, index) => (
            <WorldClockRow
              key={timezone + ":" + label}
              timezone={timezone}
              label={label}
              rootDT={rootDT}
              tabIndex={index === 0 ? 0 : -1}
              localDateString={localDateString}
              pageDateString={pageDateString}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function WorldClockRow({
  timezone,
  label,
  rootDT,
  tabIndex,
  localDateString,
  pageDateString,
}: {
  timezone: string;
  label: string;
  rootDT: Signal<Temporal.ZonedDateTime>;
  tabIndex: number;
  localDateString: ReadonlySignal<string>;
  pageDateString: ReadonlySignal<string>;
}) {
  const plainDateTime = useComputed(() =>
    rootDT.value
      .withTimeZone(Temporal.TimeZone.from(timezone))
      .toPlainDateTime(),
  );

  const dateString = useComputed(() =>
    shortDateFormatter.format(plainDateTime.value),
  );
  const timeString = useComputed(() =>
    shortTimeFormatter.format(plainDateTime.value),
  );

  const displayedLabel = label || getLocationFromTimezone(timezone);

  const showSubtitle = useComputed(() => {
    return (
      localDateString.value !== dateString.value ||
      pageDateString.value !== dateString.value
    );
  });

  return (
    <div role="row" className="timezone-row" tabIndex={tabIndex}>
      <div className="timezone-label-wrapper">
        <a
          className="timezone-label"
          href={new URL(
            getPathnameFromTimezone(timezone),
            location.href,
          ).toString()}
          tabIndex={-1}
          role="cell"
        >
          {displayedLabel}
        </a>
      </div>

      <div role="cell" className="timezone-time-wrapper">
        <div>{timeString}</div>
        <Show when={showSubtitle}>
          <span className="subtitle">{dateString}</span>
        </Show>
      </div>
    </div>
  );
}

function parseTimeString(
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

function extractDataFromURL(): [] | [string | Temporal.TimeZone, string] {
  const unixURLPattern = new URLPattern(
    {
      pathname: "/unix{/:seconds(\\d*)}?",
    },
    // https://github.com/kenchris/urlpattern-polyfill/issues/127
    { ignoreCase: true } as unknown as string,
  );
  const matchesUnix = unixURLPattern.test(location.href);
  if (matchesUnix) {
    const { seconds } =
      unixURLPattern.exec(location.href)?.pathname.groups ?? {};

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

  const { zeroth, 0: extra } = geoURLPattern.exec(location.href)?.pathname
    .groups || { zeroth: "" };

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

function getRelativeTime(dt: Temporal.ZonedDateTime) {
  const localDateTime = dt;
  const now = Temporal.Now.zonedDateTime(browserCalendar, dt.timeZoneId);
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

function formatDTInput(dt: Temporal.ZonedDateTime) {
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

function formatDTTitle(dt: Temporal.ZonedDateTime) {
  return titleFormatter.format(dt.toPlainDateTime());
}

function updateTitle(
  dt: Temporal.ZonedDateTime | undefined,
  tz: string | Temporal.TimeZone,
) {
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

const activeTabSignal = new Signal(
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
      "",
    );
  }
});

const main = document.querySelector("main");
if (main) {
  render(<IndexPage />, main);
}
