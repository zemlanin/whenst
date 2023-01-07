import { Temporal } from "@js-temporal/polyfill";
import { loadSettings, addTimezone } from "./api";

export const RELATIVE_UTC_ID_REGEX = /^[+-][0-1]?[0-9](:[0-5][0-9])?$/;
export const STRICT_RELATIVE_UTC_ID_REGEX = /^[+-][0-1][0-9](:[0-5][0-9])?$/;

export async function init(datetime, remoteTZ) {
  const localTZ = Temporal.Now.timeZone();
  const root = document.getElementById("saved-timezones");

  const { timezones } = await loadSettings();

  for (const { label, timezone } of timezones) {
    if (timezone === localTZ) {
      continue;
    }

    if (timezone === "unix") {
      continue;
    }

    const row = renderTimezoneRow(timezone, label);

    if (row) {
      root.appendChild(row);
    }
  }

  updateSavedTimezoneDatetimes(datetime);

  if (
    remoteTZ &&
    remoteTZ !== "unix" &&
    !timezones.some(
      (entry) => entry.timezone.toString() === remoteTZ.toString()
    )
  ) {
    suggestSaving(remoteTZ);
  }
}

function suggestSaving(tz) {
  if (tz === "unix") {
    return;
  }

  const root = document.getElementById("saved-timezones");

  const row = document.createElement("div");
  row.role = "listitem";
  row.className = "timezone-row";

  const anchor = document.createElement("a");
  anchor.className = "timezone-label";
  anchor.href = new URL(getPathnameFromTimezone(tz), location.href);
  anchor.innerText = getLocationFromTimezone(tz);
  row.appendChild(anchor);

  const saveButton = document.createElement("button");
  saveButton.innerText = "Save";
  saveButton.addEventListener("click", function () {
    addTimezone({ timezone: tz }).then(() => {
      location.reload();
    });
  });
  row.appendChild(saveButton);

  root.appendChild(row);
}

export function updateSavedTimezoneDatetimes(datetime) {
  const timestamps = document
    .getElementById("saved-timezones")
    .querySelectorAll(".timezone-row div[data-tz]");

  for (const el of timestamps) {
    try {
      el.textContent = datetime
        .withTimeZone(Temporal.TimeZone.from(el.dataset.tz))
        .toPlainDateTime()
        .toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch (e) {
      console.error(e);
      el.textContent = "";
    }
  }
}

export function getLocationFromTimezone(tz) {
  if (tz.toString() === "UTC") {
    return "UTC";
  }

  if (tz.toString().match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "UTC" + tz.toString().replace(/^([+-])0?(1?[0-9]):00$/, "$1$2");
  }

  const parts = tz.toString().split("/");

  const location = parts.length === 3 ? `${parts[1]}/${parts[2]}` : parts[1];

  if (!location) {
    // fallback for invalidly saved timezones
    return tz.toString();
  }

  if (location === "Kiev") {
    return "Kyiv";
  } else if (location === "Sao_Paulo") {
    return "São Paulo";
  }

  return location.replace(/^St_/, "St. ").replace(/_/g, " ");
}

export function getPathnameFromTimezone(tz) {
  if (tz.toString() === "UTC") {
    return "/UTC";
  }

  if (tz.toString().match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "/UTC" + tz.toString().replace(/^([+-])0?(1?[0-9]):00$/, "$1$2");
  }

  if (tz.toString() === "Europe/Kiev") {
    return "/Europe/Kyiv";
  }

  return `/${tz}`;
}

function renderTimezoneRow(tz, labelText) {
  if (tz === "unix") {
    return;
  }

  try {
    Temporal.TimeZone.from(tz);
  } catch (e) {
    return;
  }

  const row = document.createElement("div");
  row.role = "listitem";
  row.className = "timezone-row";

  const anchor = document.createElement("a");
  anchor.className = "timezone-label";
  anchor.href = new URL(getPathnameFromTimezone(tz), location.href);
  anchor.innerText = labelText
    ? `${labelText} (${getLocationFromTimezone(tz)})`
    : getLocationFromTimezone(tz);
  row.appendChild(anchor);

  const dt = document.createElement("div");
  dt.dataset.tz = tz;
  dt.textContent = "";
  row.appendChild(dt);

  return row;
}
