import { Temporal } from "@js-temporal/polyfill";

export async function loadSettings() {
  await transferLocalTimezones();

  const resp = await fetch("/api/settings", {
    headers: {
      accept: "application/json",
    },
  });
  const settings = await resp.json();

  return settings;
}

export async function addTimezone({ id, timezone, label }) {
  if (timezone instanceof Temporal.TimeZone) {
    timezone = timezone.toString();
  }

  const resp = await fetch("/api/timezones", {
    method: "PUT",
    headers: {
      accept: "application/json",
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
    method: "DELETE",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ id }),
  });

  if (resp.status >= 400) {
    throw resp;
  }
}

export async function reorderTimezone({ id, index }) {
  const resp = await fetch("/api/timezones", {
    method: "PATCH",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ id, index }),
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

export async function sqrapInit() {
  const resp = await fetch("/api/sqrap/init", {
    method: "POST",
    headers: {
      accept: "application/json",
    },
  });
  const { code } = await resp.json();

  return { code };
}

export async function sqrapStatus({ code }) {
  const resp = await fetch(
    "/api/sqrap/status?" + new URLSearchParams({ code }),
    {
      headers: {
        accept: "application/json",
      },
    }
  );

  if (200 <= resp.status && resp.status < 300) {
    // { "done": boolean }
    return await resp.json();
  }

  throw resp;
}

export async function sqrapCode({ code }) {
  const resp = await fetch("/api/sqrap/code", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  if (200 <= resp.status && resp.status < 300) {
    // { "done": true }
    return await resp.json();
  }

  throw resp;
}
