import { Temporal } from "@js-temporal/polyfill";

export async function loadSettings() {
  await transferLocalTimezones();

  const resp = await fetch("/api/settings");
  const settings = await resp.json();

  return settings;
}

export async function addTimezone({ id, timezone, label }) {
  if (timezone instanceof Temporal.TimeZone) {
    timezone = timezone.toString();
  }

  const resp = await fetch("/api/timezones", {
    method: "put",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: id || `${+new Date()}${Math.random().toString().slice(1)}`,
      timezone,
      label: label || "",
    }),
  });

  if (resp.status >= 400) {
    throw resp;
  }
}

export async function deleteTimezone({ id }) {
  const resp = await fetch("/api/timezones", {
    method: "delete",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ id }),
  });

  if (resp.status >= 400) {
    throw resp;
  }
}

export async function transferLocalTimezones() {
  const knownTimezones = Intl.supportedValuesOf("timeZone");
  let timezones = [];

  try {
    const raw = localStorage.getItem("whenst.saved-timezones");

    if (raw) {
      timezones = JSON.parse(raw)
        .map((d) => {
          return {
            id: d.id,
            label: d.label || "",
            timezone: d.timezone,
          };
        })
        .filter(
          ({ id, timezone }) =>
            id && timezone && knownTimezones.includes(timezone)
        );
    }
  } catch (e) {
    console.error(e);
  }

  try {
    for (const { id, label, timezone } of timezones) {
      await addTimezone({ id, label, timezone });
    }

    localStorage.removeItem("whenst.saved-timezones");
  } catch (e) {
    console.error(e);
  }
}
