import { Temporal } from "@js-temporal/polyfill";
import { IDBPDatabase, IDBPObjectStore, openDB } from "idb";

import {
  getMidpointPosition,
  POSITION_ALPHABET_START,
} from "./shared/getMidpointPosition.js";
import { Signal } from "@preact/signals";

const dbUpdateChannel = new BroadcastChannel("whenst_db_update");

export const worldClockSignal = new Signal(
  [] as { id: string; position: string; timezone: string; label: string }[],
);
connectSignal(worldClockSignal, async (db: IDBPDatabase) => {
  const worldClock = await db
    .transaction(["world-clock"], "readonly")
    .objectStore("world-clock")
    .index("position")
    .getAll();

  return worldClock.filter(({ tombstone }) => !tombstone);
});

export const accountSignal = new Signal(null as { id: string } | null);
connectSignal(accountSignal, async (db: IDBPDatabase) => {
  return (
    (await db
      .transaction(["account"], "readonly")
      .objectStore("account")
      .get("")) ?? null
  );
});

async function connectSignal<T>(
  signal: Signal<T>,
  callback: (db: IDBPDatabase) => Promise<T>,
) {
  if (await dbExists()) {
    const db = await openDB("whenst");
    try {
      signal.value = await callback(db);
    } finally {
      db.close();
    }
  }

  dbUpdateChannel.addEventListener("message", async () => {
    const db = await openDB("whenst");
    try {
      signal.value = await callback(db);
    } finally {
      db.close();
    }
  });
}

async function dbExists() {
  return (await indexedDB.databases()).some((db) => db.name === "whenst");
}

export async function wipeDatabase() {
  if (!(await dbExists())) {
    return;
  }

  const db = await openDB("whenst");
  for (const storeName of db.objectStoreNames) {
    const tx = db.transaction([storeName], "readwrite");
    await tx.objectStore(storeName).clear();
    await tx.done;
  }
  db.close();
  await sendSyncMessage();
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

  const pointB = cursor ? cursor.key.toString() : null;

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

  if (!(await dbExists())) {
    throw new Error(`db does not exist`);
  }

  const db = await openDB("whenst");
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
  if (!(await dbExists())) {
    throw new Error(`db does not exist`);
  }

  const db = await openDB("whenst");
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
  if (!(await dbExists())) {
    throw new Error(`db does not exist`);
  }

  const db = await openDB("whenst");
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
  if (!(await dbExists())) {
    throw new Error(`db does not exist`);
  }

  const db = await openDB("whenst");
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
  if (!(await dbExists())) {
    throw new Error(`db does not exist`);
  }

  const db = await openDB("whenst");
  const tx = db.transaction(["world-clock", "account"], "readwrite");
  const worldClockStore = tx.objectStore("world-clock");

  const worldClocks = await worldClockStore.getAll();
  for (const worldClock of worldClocks) {
    worldClock.stale = 1;
    await worldClockStore.put(worldClock);
  }

  const accountStore = tx.objectStore("account");
  if (!(await accountStore.get(""))) {
    await accountStore.put({}, "");
  }

  await tx.done;

  db.close();
  await sendAuthCheckMessage();
  await sendSyncMessage();
}

async function sendSyncMessage() {
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage("sync");
}

export async function sendAuthCheckMessage() {
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage("authCheck");
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
