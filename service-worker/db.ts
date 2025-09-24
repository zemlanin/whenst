import { openDB, deleteDB, IDBPDatabase } from "idb";

export const dbPromise = openDB("whenst", 1, {
  upgrade(db, oldVersion, _newVersion, _transaction, _event) {
    if (oldVersion < 1) {
      const worldClockStore = db.createObjectStore("world-clock", {
        keyPath: "id",
      });
      worldClockStore.createIndex("position", "position");
      worldClockStore.createIndex("stale", "stale");

      db.createObjectStore("sync-states");
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
  await pushWorldClock(db);
  await pullWorldClock(db);
}

async function getSyncState(
  db: IDBPDatabase,
  key: "world-clock",
): Promise<string | undefined> {
  const tx = db.transaction(["sync-states"], "readonly");
  const syncStatesStore = tx.objectStore("sync-states");
  return syncStatesStore.get(key);
}

async function pullWorldClock(db: IDBPDatabase) {
  const syncState = await getSyncState(db, "world-clock");
  let next = syncState ?? "/api/sync/world-clock";

  do {
    const resp = await fetch(next);
    const payload = (await resp.json()) as {
      next: string;
      changes: { id: string; tombstone: 0 | 1 }[];
    };

    const changes = payload.changes;
    next = payload.next;

    const tx = db.transaction(["world-clock", "sync-states"], "readwrite");
    const worldClockStore = tx.objectStore("world-clock");
    const syncStatesStore = tx.objectStore("sync-states");
    for (const change of changes) {
      if (change.tombstone) {
        worldClockStore.delete(change.id);
      } else {
        worldClockStore.put(change);
      }
    }
    if (next) {
      syncStatesStore.put(next, worldClockStore.name);
    }
    await tx.done;
  } while (next);
}

async function pushWorldClock(db: IDBPDatabase) {
  const tx = db.transaction(["world-clock"], "readonly");
  const staleTimezones = await tx
    .objectStore("world-clock")
    .index("stale")
    .getAll();

  if (!staleTimezones.length) {
    return;
  }

  return fetch("/api/sync/world-clock", {
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
