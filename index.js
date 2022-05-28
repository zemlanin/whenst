import "urlpattern-polyfill";
import { Temporal } from "@js-temporal/polyfill";

const browserCalendar = "iso8601";
const rtfAlways = new Intl.RelativeTimeFormat("en", {
  numeric: "always",
});
const rtfAuto = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const localTZ = Temporal.Now.timeZone();
let now = Temporal.Now.zonedDateTime(browserCalendar);
let localDateTime = now;

window.localDateTime = localDateTime;
window.Temporal = Temporal;

const [remoteTZ, timeString] = extractDataFromURL();

if (remoteTZ) {
  const today = Temporal.Now.plainDate(browserCalendar);
  let remoteDate = undefined;
  try {
    remoteDate = Temporal.PlainDate.from(timeString);
  } catch (e) {
    //
  }

  const remoteDateTime = (remoteDate || today).toZonedDateTime({
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
    `/${remoteTZ.toString()}/${
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
  const now = Temporal.Now.zonedDateTime(browserCalendar);
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
      .since(today, { largestUnit: "week", roundingMode: "floor" })
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
  updateTitle();
  updateRelative();

  const localURL = getLocalURL();
  document.getElementById("local-url").href = localURL;
  history.replaceState(null, "", localURL);
});

let restoreCopyButtonTextTimeout = undefined;

document.getElementById("url-copy").addEventListener("click", (event) => {
  const button = event.target;
  const scheduleTextContentRestore = () => {
    if (restoreCopyButtonTextTimeout) {
      clearTimeout(restoreCopyButtonTextTimeout);
    }
    restoreCopyButtonTextTimeout = setTimeout(() => {
      button.textContent = "Copy";
      restoreCopyButtonTextTimeout = undefined;
    }, 2000);
  };

  navigator.clipboard.writeText(document.getElementById("local-url").href).then(
    () => {
      button.textContent = "Copied";
      scheduleTextContentRestore();
    },
    () => {
      button.textContent = "Error";
      scheduleTextContentRestore();
    }
  );
});

if ("share" in navigator && "canShare" in navigator) {
  document.getElementById("url-share").hidden = false;
  document.getElementById("url-share").addEventListener("click", (event) => {
    const button = event.target;

    const payload = {
      url: document.getElementById("local-url").href,
    };

    if (navigator.canShare(payload)) {
      navigator.share(payload).then(noop, noop);
    } else {
      button.hidden = true;
    }
  });
}

function noop() {}

function extractDataFromURL() {
  const timeURLPattern = new URLPattern({
    pathname: "/:continent/:state/:extra*",
  });

  if (!timeURLPattern.test(location.href)) {
    return [];
  }

  const {
    continent,
    state,
    extra: extraString,
  } = timeURLPattern.exec(location.href).pathname.groups;

  const extra = extraString.split("/");

  let timeString = undefined;
  let remoteTZ = undefined;

  try {
    remoteTZ = Temporal.TimeZone.from(
      `${continent}/${state.toLowerCase() === "kyiv" ? "Kiev" : state}`
    );

    timeString = extra[0];
  } catch (e) {
    if (e instanceof RangeError) {
      try {
        remoteTZ = Temporal.TimeZone.from(`${continent}/${state}/${extra[0]}`);
        timeString = extra[1];
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
  if (localTZ.toString() === "Europe/Kiev") {
    return new URL(`/Europe/Kyiv/${formatDT(localDateTime)}`, location.href);
  }

  return new URL(
    `/${localTZ.toString()}/${formatDT(localDateTime)}`,
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

function getLocationFromTimezone(tz) {
  const parts = tz.toString().split("/");

  const location = parts.length === 3 ? `${parts[1]}/${parts[2]}` : parts[1];

  if (location === "Kiev") {
    return "Kyiv";
  } else if (location === "Sao_Paulo") {
    return "São Paulo";
  }

  return location.replace(/^St_/, "St. ").replace(/_/g, " ");
}
