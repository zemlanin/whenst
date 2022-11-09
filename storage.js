import { Temporal } from "@js-temporal/polyfill";

export function saveTimezoneToLocalStorage({ timezone, label }) {
  if (timezone instanceof Temporal.TimeZone) {
    timezone = timezone.toString();
  }

  const current = getSavedTimezones();
  localStorage.setItem(
    "whenst.saved-timezones",
    JSON.stringify([
      {
        id: `${+new Date()}${Math.random().toString().slice(1)}`,
        label: label ?? "",
        timezone,
      },
      ...current,
    ])
  );
}

export function getSavedTimezones() {
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
