import { openDB, deleteDB, IDBPDatabase } from "idb";

export const dbPromise = openDB("whenst", 1, {
  upgrade(db, oldVersion, _newVersion, _transaction, _event) {
    if (oldVersion < 1) {
      const timezonesStore = db.createObjectStore("timezones", {
        keyPath: "id",
      });
      timezonesStore.createIndex("position", "position");
      timezonesStore.createIndex("stale", "stale");

      db.createObjectStore("syncStates");
    }
  },
  blocked(_currentVersion, _blockedVersion, _event) {
    console.log("blocked");
  },
  blocking(_currentVersion, _blockedVersion, _event) {
    console.log("blocking");
  },
  terminated() {},
});

export async function sync() {
  if (!navigator.onLine) {
    console.log("offline. skipping sync");
    return;
  }

  const db = await dbPromise;
  await pushTimezones(db);
  await pullTimezones(db);
}

async function getSyncState(
  db: IDBPDatabase,
  key: "timezones",
): Promise<string | undefined> {
  const tx = db.transaction(["syncStates"], "readonly");
  const syncStatesStore = tx.objectStore("syncStates");
  return syncStatesStore.get(key);
}

async function pullTimezones(db: IDBPDatabase) {
  const syncState = await getSyncState(db, "timezones");
  let next = syncState ?? "/api/sync/timezones";

  do {
    const resp = await fetch(next);
    const payload = (await resp.json()) as {
      next: string;
      changes: { id: string; tombstone: 0 | 1 }[];
    };

    const changes = payload.changes;
    next = payload.next;

    const tx = db.transaction(["timezones", "syncStates"], "readwrite");
    const timezonesStore = tx.objectStore("timezones");
    const syncStatesStore = tx.objectStore("syncStates");
    for (const change of changes) {
      if (change.tombstone) {
        timezonesStore.delete(change.id);
      } else {
        timezonesStore.put(change);
      }
    }
    if (next) {
      syncStatesStore.put(next, timezonesStore.name);
    }
    await tx.done;
  } while (next);
}

async function pushTimezones(db: IDBPDatabase) {
  const tx = db.transaction(["timezones"], "readonly");
  const staleTimezones = await tx
    .objectStore("timezones")
    .index("stale")
    .getAll();

  if (!staleTimezones.length) {
    return;
  }

  return fetch("/api/sync/timezones", {
    method: "patch",
    body: JSON.stringify(staleTimezones),
    headers: {
      "content-type": "application/json",
    },
  });
}

/** @ts-expect-error - debug function */
self._deleteDB = async () => {
  return deleteDB("whenst", { blocked: console.error });
};

/** @ts-expect-error - debug function */
self._sync = async () => {
  return sync();
};
