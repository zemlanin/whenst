import {
  Temporal,
  Intl,
  toTemporalInstant,
} from "https://unpkg.com/@js-temporal/polyfill?module";

import "https://unpkg.com/urlpattern-polyfill?module";

const timeURLPattern = new URLPattern({ pathname: "/:continent/:city/:time" });

const browserCalendar = new Intl.DateTimeFormat().resolvedOptions().calendar;
const today = Temporal.Now.plainDate(browserCalendar);

const localTZ = Temporal.Now.timeZone();
let localDateTime = undefined;

if (timeURLPattern.test(location.href)) {
  const { continent, city, time } = timeURLPattern.exec(location.href).pathname
    .groups;

  const remoteTZ = Temporal.TimeZone.from(`${continent}/${city}`);
  const remoteDateTime = today.toZonedDateTime({
    plainTime: Temporal.PlainTime.from(time),
    timeZone: remoteTZ,
  });

  document.getElementById("remote-time").textContent = remoteDateTime
    .toPlainTime()
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
} else {
  localDateTime = Temporal.Now.zonedDateTime(browserCalendar);
}

document.getElementById("local-time").value = localDateTime
  .toPlainTime()
  .toString({ smallestUnit: "minute" });
document.getElementById("local-place").textContent = localTZ
  .toString()
  .split("/")[1];

document.getElementById("url-input").value = new URL(
  `/${localTZ.toString()}/${document.getElementById("local-time").value}`,
  location.href
);

document.getElementById("local-label").hidden = false;

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

  navigator.clipboard
    .writeText(document.getElementById("url-input").value)
    .then(
      () => {
        button.textContent = "Done";
        scheduleTextContentRestore();
      },
      () => {
        button.textContent = "Error";
        scheduleTextContentRestore();
      }
    );
});
