import { Temporal } from "@js-temporal/polyfill";
import { IDBPObjectStore, openDB } from "idb";

import {
  getMidpointPosition,
  POSITION_ALPHABET_END,
  POSITION_ALPHABET_START,
} from "./shared/getMidpointPosition.js";

export async function loadSession() {
  await transferLocalWorldClocks();

  const resp = await fetch("/api/session", {
    headers: {
      accept: "application/json",
    },
  });
  const session: { signedIn: boolean } = await resp.json();

  return session;
}

export async function getSavedWorldClock() {
  const db = await openDB("whenst", 1);
  const worldClock = await db
    .transaction(["world-clock"], "readonly")
    .objectStore("world-clock")
    .index("position")
    .getAll();
  db.close();

  return worldClock.filter(({ tombstone }) => !tombstone);
}

export async function wipeDatabase() {
  const db = await openDB("whenst", 1);
  for (const storeName of db.objectStoreNames) {
    const tx = db.transaction([storeName], "readwrite");
    await tx.objectStore(storeName).clear();
    await tx.done;
  }
  db.close();
}

async function computePosition(
  store: IDBPObjectStore<
    unknown,
    string[],
    "world-clock",
    "readonly" | "readwrite"
  >,
  options: { after: string },
) {
  const keyRange = IDBKeyRange.lowerBound(options.after, true);
  const cursor = await store.index("position").openCursor(keyRange);

  const pointA = options.after;

  const pointB = cursor ? cursor.key.toString() : POSITION_ALPHABET_END;

  return getMidpointPosition(pointA, pointB);
}

export async function addWorldClock({
  id,
  timezone,
  label,
}: {
  id: string | undefined;
  timezone: string | Temporal.TimeZone;
  label: string;
}) {
  if (timezone instanceof Temporal.TimeZone) {
    timezone = timezone.toString();
  }

  const db = await openDB("whenst", 1);
  const tx = db.transaction(["world-clock"], "readwrite");
  const store = tx.objectStore("world-clock");
  const position = await computePosition(store, {
    after: POSITION_ALPHABET_START,
  });
  await store.put({
    id: id || `${+new Date()}${Math.random().toString().slice(1)}`,
    updated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    tombstone: 0,
    timezone,
    label,
    position,
    stale: 1,
  });
  await tx.done;

  db.close();
  await sendSyncMessage();
}

export async function deleteWorldClock({ id }: { id: string }) {
  const db = await openDB("whenst", 1);
  const tx = db.transaction(["world-clock"], "readwrite");
  const store = tx.objectStore("world-clock");
  await store.put({
    id,
    updated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    tombstone: 1,
    stale: 1,
  });
  await tx.done;

  db.close();
  await sendSyncMessage();
}

export async function reorderWorldClock({
  id,
  after,
}: {
  id: string;
  after: string;
}) {
  const db = await openDB("whenst", 1);
  const tx = db.transaction(["world-clock"], "readwrite");
  const store = tx.objectStore("world-clock");

  const timezone = await store.get(id);
  timezone.position = await computePosition(store, { after });
  timezone.updated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  timezone.stale = 1;
  await store.put(timezone);
  await tx.done;

  db.close();
  await sendSyncMessage();
}

export async function changeWorldClockLabel({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const db = await openDB("whenst", 1);
  const tx = db.transaction(["world-clock"], "readwrite");
  const store = tx.objectStore("world-clock");

  const timezone = await store.get(id);
  timezone.label = label;
  timezone.updated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  timezone.stale = 1;
  await store.put(timezone);
  await tx.done;

  db.close();
  await sendSyncMessage();
}

export async function syncEverything() {
  const db = await openDB("whenst", 1);
  const tx = db.transaction(["world-clock"], "readwrite");
  const store = tx.objectStore("world-clock");

  const worldClocks = await store.getAll();
  for (const worldClock of worldClocks) {
    worldClock.stale = 1;
    await store.put(worldClock);
  }
  await tx.done;

  db.close();
  await sendSyncMessage();
}

async function sendSyncMessage() {
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage("sync");
}

export async function transferLocalWorldClocks() {
  const knownTimezones = window.Intl.supportedValuesOf("timeZone");
  let worldClock: { id: string; label: string; timezone: string }[] = [];

  try {
    const raw = localStorage.getItem("whenst.saved-timezones");

    if (raw) {
      worldClock = (
        JSON.parse(raw) as {
          id: string;
          label: string | undefined;
          timezone: string;
        }[]
      )
        .map((d) => {
          return {
            id: d.id,
            label: d.label || "",
            timezone: d.timezone,
          };
        })
        .filter(
          ({ id, timezone }) =>
            id && timezone && knownTimezones.includes(timezone),
        );
    }
  } catch (e) {
    console.error(e);
  }

  try {
    for (const { id, label, timezone } of worldClock) {
      await addWorldClock({ id, label, timezone });
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
  const { code } = (await resp.json()) as { code: string };

  return { code };
}

export async function sqrapStatus({ code }: { code: string }) {
  const resp = await fetch(
    "/api/sqrap/status?" + new URLSearchParams({ code }),
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (200 <= resp.status && resp.status < 300) {
    return (await resp.json()) as { done: boolean };
  }

  throw resp;
}

export async function sqrapCode({ code }: { code: string }) {
  const resp = await fetch("/api/sqrap/code", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  if (200 <= resp.status && resp.status < 300) {
    return (await resp.json()) as { done: true };
  }

  throw resp;
}

export async function signOut() {
  const resp = await fetch("/api/session", {
    method: "DELETE",
    headers: {
      accept: "application/json",
    },
  });

  if (200 <= resp.status && resp.status < 300) {
    return (await resp.json()) as { done: true };
  }

  throw resp;
}
