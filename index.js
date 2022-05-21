import {
  Temporal,
  Intl,
  toTemporalInstant,
} from "https://unpkg.com/@js-temporal/polyfill@0.4.1?module";

import "https://unpkg.com/urlpattern-polyfill@4.0.3?module";

const timeURLPattern = new URLPattern({ pathname: "/:continent/:city/:time?" });

const browserCalendar = "iso8601";

const localTZ = Temporal.Now.timeZone();
let localDateTime = Temporal.Now.zonedDateTime(browserCalendar);

if (timeURLPattern.test(location.href)) {
  const { continent, city, time } = timeURLPattern.exec(location.href).pathname
    .groups;

  const remoteTZ = Temporal.TimeZone.from(`${continent}/${city}`);

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

  document.getElementById("remote-time").textContent = remoteDateTime
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
  document.getElementById("remote-place").textContent = remoteTZ
    .toString()
    .split("/")[1];
  document.getElementById("remote-url").href = new URL(
    `/${remoteTZ.toString()}/${
      document.getElementById("remote-time").textContent
    }`,
    location.href
  );
  document.getElementById("remote-label").hidden = false;

  localDateTime = remoteDateTime.withTimeZone(localTZ);
}

document.getElementById("local-time").value = localDateTime
  .toPlainDateTime()
  .toString({ smallestUnit: "minute", calendarName: "never" });

document.getElementById("local-place").textContent = localTZ
  .toString()
  .split("/")[1];

document.getElementById("local-url").href = new URL(
  `/${localTZ.toString()}/${document.getElementById("local-time").value}`,
  location.href
);

document.getElementById("local-label").hidden = false;

document.getElementById("local-time").addEventListener("change", (event) => {
  const input = event.target;

  document.getElementById("remote-label").hidden = true;

  const localURL = new URL(
    `/${localTZ.toString()}/${input.value}`,
    location.href
  );

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

    const payload = { url: document.getElementById("local-url").href };

    if (navigator.canShare(payload)) {
      navigator.share(payload).then(noop, noop);
    } else {
      button.hidden = true;
    }
  });
}

function noop() {}
