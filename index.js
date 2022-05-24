import "https://unpkg.com/urlpattern-polyfill@4.0.3?module";
import { Temporal } from "https://unpkg.com/@js-temporal/polyfill@0.4.1?module";

const timeURLPattern = new URLPattern({ pathname: "/:continent/:city/:time?" });

const browserCalendar = "iso8601";

const localTZ = Temporal.Now.timeZone();
let localDateTime = Temporal.Now.zonedDateTime(browserCalendar);

if (timeURLPattern.test(location.href)) {
  const { continent, city, time } = timeURLPattern.exec(location.href).pathname
    .groups;

  const remoteTZ = Temporal.TimeZone.from(
    `${continent}/${city.toLowerCase() === "kyiv" ? "Kiev" : city}`
  );

  const today = Temporal.Now.plainDate(browserCalendar);
  let remoteDate = undefined;
  try {
    remoteDate = Temporal.PlainDate.from(time);
  } catch (e) {
    //
  }

  const remoteDateTime = (remoteDate || today).toZonedDateTime({
    plainTime: time
      ? Temporal.PlainTime.from(time)
      : localDateTime.toPlainTime(),
    timeZone: remoteTZ,
  });

  document.getElementById("remote-time").textContent = formatDT(remoteDateTime);
  document.getElementById("remote-place").textContent =
    getLocationFromTimezone(remoteTZ);
  document.getElementById("remote-url").href = new URL(
    `/${remoteTZ.toString()}/${
      document.getElementById("remote-time").textContent
    }`,
    location.href
  );
  document.getElementById("remote-label").hidden = false;

  localDateTime = remoteDateTime.withTimeZone(localTZ);
  updateTitle(remoteDateTime, remoteTZ);
}

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

function itsKyivNotKiev(str) {
  if (str && str === "Kiev") {
    return "Kyiv";
  }

  return str;
}

function updateTitle(dt, tz) {
  const timeStr = formatDT(dt || localDateTime);

  const placeStr = getLocationFromTimezone(tz || localTZ);

  document.title = `${timeStr} in ${placeStr} | when.st`;
}

function getLocationFromTimezone(tz) {
  return itsKyivNotKiev(tz.toString().split("/")[1]).replace(/_/g, " ");
}
