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

    const row = renderTimezoneRow(timezone, label);

    root.appendChild(row);
  }

  updateSavedTimezoneDatetimes(datetime);

  if (
    remoteTZ &&
    !timezones.some(
      (entry) => entry.timezone.toString() === remoteTZ.toString()
    )
  ) {
    suggestSaving(remoteTZ);
  }
}

function suggestSaving(tz) {
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
  const inputs = document
    .getElementById("saved-timezones")
    .querySelectorAll('.timezone-row input[type="datetime-local"]');

  for (const input of inputs) {
    input.value = formatDT(datetime.withTimeZone(input.dataset.tz));
  }
}

function formatDT(dt) {
  return dt
    .toPlainDateTime()
    .toString({ smallestUnit: "minute", calendarName: "never" });
}

export function getLocationFromTimezone(tz) {
  if (tz.toString() === "UTC") {
    return "UTC";
  }

  if (tz.toString().match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "UTC" + tz;
  }

  const parts = tz.toString().split("/");

  const location = parts.length === 3 ? `${parts[1]}/${parts[2]}` : parts[1];

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
    return "/UTC" + tz;
  }

  if (tz.toString() === "Europe/Kiev") {
    return "/Europe/Kyiv";
  }

  return `/${tz}`;
}

function renderTimezoneRow(tz, labelText) {
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

  const dt = document.createElement("input");
  dt.type = "datetime-local";
  dt.readOnly = true;
  dt.dataset.tz = tz;
  dt.value = new Date();
  row.appendChild(dt);

  return row;
}
