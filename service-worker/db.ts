import { openDB, deleteDB, IDBPDatabase } from "idb";

initDb();

export async function sync() {
  if (!navigator.onLine) {
    console.log("offline. skipping sync");
    return;
  }

  const db = await initDb();
  await pushWorldClock(db);
  await pullWorldClock(db);
}

function initDb() {
  return openDB("whenst", 1, {
    upgrade(db, oldVersion, _newVersion, _transaction, _event) {
      if (oldVersion < 1) {
        const worldClockStore = db.createObjectStore("world-clock", {
          keyPath: "id",
        });
        worldClockStore.createIndex("position", "position");
        worldClockStore.createIndex("stale", "stale");

        db.createObjectStore("sync-states", {
          keyPath: "name",
        });
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
}

async function getSyncState<T extends "world-clock">(
  db: IDBPDatabase,
  name: T,
): Promise<{ name: T; next: string } | undefined> {
  const tx = db.transaction(["sync-states"], "readonly");
  const syncStatesStore = tx.objectStore("sync-states");
  return syncStatesStore.get(name);
}

async function pullWorldClock(db: IDBPDatabase) {
  const syncState = await getSyncState(db, "world-clock");
  let next = syncState?.next ?? "/api/sync/world-clock";

  do {
    const resp = await fetch(next);
    if (!resp.ok) {
      throw new Error(`failed to fetch ${next}`);
    }

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
      syncStatesStore.put({
        name: worldClockStore.name,
        next,
      });
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
    method: "PATCH",
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
