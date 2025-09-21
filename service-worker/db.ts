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
  blocked(_currentVersion, _blockedVersion, _event) {},
  blocking(_currentVersion, _blockedVersion, _event) {},
  terminated() {},
});

dbPromise.then(async (db) => {
  await push(db);
  await pull(db);
});

/** @ts-expect-error - debug function */
globalThis._deleteDB = async () => {
  return deleteDB("whenst", { blocked: console.error });
};

/** @ts-expect-error - debug function */
globalThis._pull = async () => {
  return pull(await dbPromise);
};

/** @ts-expect-error - debug function */
globalThis._push = async () => {
  return pull(await dbPromise);
};

async function getSyncState(
  db: IDBPDatabase,
  key: "timezones",
): Promise<string | undefined> {
  const tx = db.transaction(["syncStates"], "readonly");
  const syncStatesStore = tx.objectStore("syncStates");
  return syncStatesStore.get(key);
}

async function pull(db: IDBPDatabase) {
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
    tx.commit();
  } while (next);
}

async function push(db: IDBPDatabase) {
  const tx = db.transaction(["timezones"], "readonly");
  let cursor = await tx.objectStore("timezones").index("stale").openCursor();

  while (cursor) {
    console.log(cursor);
    cursor = await cursor.continue();
  }
}
