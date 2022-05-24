import "https://unpkg.com/urlpattern-polyfill@4.0.3?module";
import { Temporal } from "https://unpkg.com/@js-temporal/polyfill@0.4.1?module";

const browserCalendar = "iso8601";

const localTZ = Temporal.Now.timeZone();
let localDateTime = Temporal.Now.zonedDateTime(browserCalendar);

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
