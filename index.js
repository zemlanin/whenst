import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";
import {
  RELATIVE_UTC_ID_REGEX,
  STRICT_RELATIVE_UTC_ID_REGEX,
  init as initSavedTimezones,
  updateSavedTimezoneDatetimes,
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

let localTZ = Temporal.Now.timeZone();
let now = Temporal.Now.zonedDateTime(browserCalendar);
let localDateTime = now;

window.localDateTime = localDateTime;
window.Temporal = Temporal;

let [remoteTZ, timeString] = extractDataFromURL();

if (remoteTZ && timeString === "now") {
  if (localTZ.toString() !== remoteTZ.toString()) {
    const localAsSavedRow = document.getElementById("local-as-saved");

    const label = localAsSavedRow.querySelector(".timezone-label");
    label.innerText = `Local (${getLocationFromTimezone(localTZ)})`;
    label.href = new URL(getPathnameFromTimezone(localTZ), location.href);

    const dt = localAsSavedRow.querySelector('input[type="datetime-local"]');
    dt.dataset.tz = localTZ.toString();

    localAsSavedRow.hidden = false;
    localAsSavedRow.classList.add("timezone-row");
  }

  localTZ = remoteTZ;
  now = Temporal.Now.zonedDateTime(browserCalendar, remoteTZ);
  localDateTime = now;
  window.localDateTime = localDateTime;

  updateRelative(true);
} else if (remoteTZ && timeString) {
  const today = Temporal.Now.plainDate(browserCalendar);
  let remoteDate = undefined;
  try {
    remoteDate = Temporal.PlainDate.from(timeString);
  } catch (e) {
    //
  }

  if (timeString && timeString !== "now") {
    try {
      Temporal.PlainTime.from(timeString);
    } catch (e) {
      timeString = "now";
    }
  }

  const remoteDateTime =
    timeString === "now"
      ? Temporal.Now.zonedDateTime(browserCalendar, remoteTZ)
      : (remoteDate || today).toZonedDateTime({
          plainTime: timeString
            ? Temporal.PlainTime.from(timeString)
            : localDateTime.toPlainTime(),
          timeZone: remoteTZ,
        });
  localDateTime = remoteDateTime.withTimeZone(localTZ);

  document.getElementById("remote-time").textContent = formatDT(remoteDateTime);
  updateRelative(true);
  document.getElementById("remote-place").textContent =
    getLocationFromTimezone(remoteTZ);

  document.getElementById("remote-url").href = new URL(
    `${getPathnameFromTimezone(remoteTZ)}/${
      document.getElementById("remote-time").textContent
    }`,
    location.href
  );
  document.getElementById("remote-label").hidden = false;

  updateTitle(remoteDateTime, remoteTZ);
} else {
  updateRelative();
}

function updateRelative(withRemote) {
  const now = Temporal.Now.zonedDateTime(browserCalendar, localTZ);
  const today = now.startOfDay();
  const durationSinceNow = localDateTime.since(now);
  const durationSinceToday = localDateTime.startOfDay().since(today);
  const inTheFuture = Temporal.ZonedDateTime.compare(localDateTime, now) === 1;
  const thisMinute = !inTheFuture && -1 * durationSinceNow.total("second") < 60;

  let remoteRelative = "";
  let localRelative = "";

  if (thisMinute) {
    remoteRelative = "is";
    localRelative = "now";
  } else {
    if (inTheFuture) {
      remoteRelative = "will be";
    } else {
      remoteRelative = "was";
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
      localRelative = rtfAuto.format(Math.ceil(totalSeconds), "second");
    } else if (Math.ceil(Math.abs(totalMinutes)) < 120) {
      localRelative = rtfAuto.format(Math.ceil(totalMinutes), "minute");
    } else if (
      Math.floor(Math.abs(totalDays)) === 0 ||
      Math.ceil(Math.abs(totalHours)) < 12
    ) {
      localRelative = rtfAuto.format(Math.floor(totalHours), "hour");
    } else if (Math.abs(totalDays) < 2) {
      localRelative = rtfAuto.format(Math.floor(totalDays), "day");
    } else if (Math.abs(totalDays) < 7) {
      localRelative = `${
        totalDays < 0 ? "past" : "upcoming"
      } ${localDateTime.toLocaleString("en", { weekday: "long" })}`;
    } else if (Math.abs(totalMonths) < 1) {
      localRelative = rtfAlways.format(Math.trunc(totalWeeks), "week");
    } else if (Math.abs(totalYears) < 1) {
      localRelative = rtfAlways.format(Math.trunc(totalMonths), "months");
    } else {
      localRelative = rtfAlways.format(Math.trunc(totalYears), "year");
    }
  }

  if (withRemote) {
    document.getElementById("remote-relative").textContent = remoteRelative;
  }

  document.getElementById("local-relative").textContent = localRelative;
}

function scheduleUpdateRelative() {
  setTimeout(() => {
    updateRelative(!document.getElementById("remote-label").hidden);
    scheduleUpdateRelative();
  }, 1000);
}

scheduleUpdateRelative();

document.getElementById("local-time").value = formatDT(localDateTime);

document.getElementById("local-place").textContent =
  getLocationFromTimezone(localTZ);

document.getElementById("local-url").href = getLocalURL();

document.getElementById("local-label").hidden = false;

document.getElementById("local-time").addEventListener("change", (event) => {
  document.getElementById("remote-label").hidden = true;
  localDateTime = Temporal.PlainDateTime.from(
    event.target.value
  ).toZonedDateTime(localTZ);
  updateSavedTimezoneDatetimes(localDateTime);
  updateTitle();
  updateRelative();

  const localURL = getLocalURL();
  document.getElementById("local-url").href = localURL;
  history.replaceState(null, "", localURL);
});

initSavedTimezones(localDateTime, remoteTZ);

function extractDataFromURL() {
  const utcURLPattern = new URLPattern(
    {
      pathname: "/(utc|gmt){:offset}?{/*}?",
    },
    { ignoreCase: true }
  );

  const matchesUTC = utcURLPattern.test(location.href);

  if (matchesUTC) {
    const { offset, 1: extraString } = utcURLPattern.exec(location.href)
      .pathname.groups;

    const extra = extraString ? extraString.split("/") : [];

    if (!offset) {
      const timeString = extra[0] ?? "now";
      return ["UTC", timeString];
    }

    if (offset.match(RELATIVE_UTC_ID_REGEX)) {
      const timeString = extra[0] ?? "now";
      const strictOffset = offset.match(STRICT_RELATIVE_UTC_ID_REGEX)
        ? offset
        : `${offset[0]}0${offset.slice(1)}`;

      return [strictOffset, timeString];
    }

    return [];
  }

  const geoURLPattern = new URLPattern({
    pathname: "/:continent/:state{/*}?",
  });

  const matchesGeo = geoURLPattern.test(location.href);
  if (!matchesGeo) {
    return [];
  }

  const {
    continent,
    state,
    0: extraString,
  } = geoURLPattern.exec(location.href).pathname.groups;

  const extra = extraString ? extraString.split("/") : [];

  let timeString = undefined;
  let remoteTZ = undefined;

  try {
    const continentLowerCase = continent.toLowerCase();

    remoteTZ =
      continentLowerCase === "utc"
        ? Temporal.TimeZone.from("UTC")
        : Temporal.TimeZone.from(
            `${continent}/${state.toLowerCase() === "kyiv" ? "Kiev" : state}`
          );

    timeString =
      (continentLowerCase.startsWith("utc") ? state : extra[0]) ?? "now";
  } catch (e) {
    if (e instanceof RangeError) {
      try {
        remoteTZ = Temporal.TimeZone.from(`${continent}/${state}/${extra[0]}`);
        timeString = extra[1] ?? "now";
      } catch (e) {
        if (e instanceof RangeError) {
          return [];
        } else {
          throw e;
        }
      }
    } else {
      throw e;
    }
  }

  return [remoteTZ, timeString];
}

function getLocalURL() {
  return new URL(
    `${getPathnameFromTimezone(localTZ)}/${formatDT(localDateTime)}`,
    location.href
  );
}

function formatDT(dt) {
  return dt
    .toPlainDateTime()
    .toString({ smallestUnit: "minute", calendarName: "never" });
}

function updateTitle(dt, tz) {
  const timeStr = formatDT(dt || localDateTime);

  const placeStr = getLocationFromTimezone(tz || localTZ);

  document.title = `${timeStr} in ${placeStr} | when.st`;
}
