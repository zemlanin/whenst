import { Temporal } from "@js-temporal/polyfill";

export function init(datetime) {
  const localTZ = Temporal.Now.timeZone();
  const root = document.getElementById("saved-timezones");

  const timezones = getSavedTimezones();

  if (timezones.length === 0) {
    root.querySelector("a").textContent = "Add";
  }

  for (const { label, timezone } of getSavedTimezones()) {
    if (timezone === localTZ) {
      continue;
    }

    const row = renderTimezoneRow(timezone, label);

    root.appendChild(row);
  }

  updateSavedTimezoneDatetimes(datetime);
}

function getSavedTimezones() {
  const timezones = Intl.supportedValuesOf("timeZone");

  try {
    const raw = localStorage.getItem("whenst.saved-timezones");

    if (!raw) {
      return [];
    }

    return JSON.parse(raw)
      .map((d) => {
        return {
          id: d.id,
          label: d.label || "",
          timezone: d.timezone,
        };
      })
      .filter(
        ({ id, timezone }) => id && timezone && timezones.includes(timezone)
      );
  } catch (e) {
    console.error(e);
    return [];
  }
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

function renderTimezoneRow(tz, labelText) {
  const row = document.createElement("div");
  row.role = "listitem";
  row.className = "timezone-row";

  const anchor = document.createElement("a");
  anchor.className = "timezone-label";
  const TZstring = tz.toString();
  anchor.href = `/${TZstring === "Europe/Kiev" ? "Europe/Kyiv" : TZstring}`;
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
