import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";

import { guessTimezone } from "./guess-timezone";
import {
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
let now = Temporal.Now.zonedDateTime(browserCalendar).with({
  second: 0,
  millisecond: 0,
});
let localDateTime = now;

window.localDateTime = localDateTime;
window.Temporal = Temporal;

let [remoteTZ, timeString] = extractDataFromURL();

if (
  remoteTZ &&
  (location.pathname !== getPathnameFromTimezone(remoteTZ) ||
    !location.pathname.startsWith(getPathnameFromTimezone(remoteTZ) + "/"))
) {
  const canonicalPathname =
    remoteTZ === "unix" && timeString !== "now"
      ? `/unix/${
          Temporal.PlainDateTime.from(timeString).toZonedDateTime("UTC")
            .epochSeconds
        }`
      : timeString && timeString !== "now"
      ? `${getPathnameFromTimezone(remoteTZ)}/${timeString}`
      : getPathnameFromTimezone(remoteTZ);

  history.replaceState(null, "", canonicalPathname);
} else if (!remoteTZ && location.pathname !== "/" && location.pathname !== "") {
  history.replaceState(null, "", "/");
}

if (remoteTZ === "unix") {
  const remoteDateTime =
    timeString === "now"
      ? Temporal.Now.zonedDateTime(browserCalendar, "UTC")
      : Temporal.PlainDateTime.from(timeString).toZonedDateTime("UTC");
  const epochSeconds = remoteDateTime.epochSeconds;
  localDateTime = remoteDateTime.withTimeZone(localTZ);

  document.getElementById("remote-time").textContent = epochSeconds;
  updateRelative(true);
  document.getElementById("remote-place").textContent = "Unix Time";

  document.getElementById("remote-url").href = new URL(
    `/unix/${epochSeconds}`,
    location.href
  );
  document.getElementById("remote-label").hidden = false;

  document.title = `${epochSeconds} in Unix Time | when.st`;
} else if (remoteTZ && timeString === "now") {
  if (localTZ.toString() !== remoteTZ.toString()) {
    const localAsSavedRow = document.getElementById("local-as-saved");

    const label = localAsSavedRow.querySelector(".timezone-label");
    label.innerText = `Local (${getLocationFromTimezone(localTZ)})`;
    label.href = new URL(getPathnameFromTimezone(localTZ), location.href);

    const dt = localAsSavedRow.querySelector("div[data-tz]");
    dt.dataset.tz = localTZ.toString();

    localAsSavedRow.hidden = false;
    localAsSavedRow.classList.add("timezone-row");
  }

  localTZ = remoteTZ;
  now = Temporal.Now.zonedDateTime(browserCalendar, remoteTZ).with({
    second: 0,
    millisecond: 0,
  });
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
      ? Temporal.Now.zonedDateTime(browserCalendar, remoteTZ).with({
          second: 0,
          millisecond: 0,
        })
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

initSavedTimezones(localDateTime, remoteTZ)
  .catch((e) => {
    console.error(e);
  })
  .then(() => {
    showMainUI();
  });

setTimeout(() => {
  showMainUI();
}, 500);

function showMainUI() {
  document.getElementById("clock").hidden = false;
  document.getElementById("saved-timezones").hidden = false;
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

    return [
      "unix",
      seconds
        ? new Date(+seconds * 1000).toISOString().replace(/Z$/, "")
        : "now",
    ];
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
