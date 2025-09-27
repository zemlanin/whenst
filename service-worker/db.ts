import { openDB, deleteDB, IDBPDatabase } from "idb";

Promise.resolve() // deleteDB('whenst')
  .then(() => sync());

export async function sync() {
  if (!navigator.onLine) {
    console.log("offline. skipping sync");
    return;
  }

  await legacyMigration();

  const db = await initDb();
  const account = await getAccount(db);

  if (!account) {
    db.close();
    return;
  }

  try {
    await Promise.all([
      pullAccount(db),
      (async () => {
        await pushWorldClock(db);
        await pullWorldClock(db);
      })(),
    ]);
  } finally {
    db.close();

    const bc = new BroadcastChannel("whenst_db_update");
    bc.postMessage({});
  }
}

export async function authCheck() {
  if (!navigator.onLine) {
    console.log("offline. skipping auth check");
    return;
  }

  const db = await initDb();
  await pullAccount(db);
  db.close();

  const bc = new BroadcastChannel("whenst_db_update");
  bc.postMessage({});
}

// prepopulate local db for users with account-less sessions
async function legacyMigration() {
  const dbs = await indexedDB.databases();

  if (dbs.some((db) => db.name === "whenst")) {
    return;
  }

  const db = await initDb();

  try {
    await pullWorldClock(db);
    await pullAccount(db, { keepData: true });
  } catch (_e) {
    //
  } finally {
    db.close();

    const bc = new BroadcastChannel("whenst_db_update");
    bc.postMessage({});
  }
}

async function initDb() {
  return openDB("whenst", 2, {
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

      if (oldVersion < 2) {
        db.createObjectStore("account");
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

async function getSyncState<T extends "world-clock" | "account">(
  db: IDBPDatabase,
  name: T,
): Promise<{ name: T; next: string } | undefined> {
  const tx = db.transaction(["sync-states"], "readonly");
  const syncStatesStore = tx.objectStore("sync-states");
  return syncStatesStore.get(name);
}

async function getAccount(db: IDBPDatabase) {
  const tx = db.transaction(["account"], "readonly");
  const accountStore = tx.objectStore("account");
  const account = accountStore.get("") ?? null;
  await tx.done;

  return account;
}

async function pullAccount(
  db: IDBPDatabase,
  options: { keepData?: boolean } = {},
) {
  const next = "/api/account";

  const resp = await fetch(next);

  if (resp.status === 401) {
    if (!options.keepData) {
      for (const storeName of db.objectStoreNames) {
        const tx = db.transaction([storeName], "readwrite");
        await tx.objectStore(storeName).clear();
        await tx.done;
      }
    }

    return null;
  }

  if (!resp.ok) {
    throw new Error(`failed to fetch ${next}`);
  }

  const payload = (await resp.json()) as {
    id: string;
  };

  const tx = db.transaction(["account"], "readwrite");
  const accountStore = tx.objectStore("account");
  accountStore.put(payload, "");
  await tx.done;

  return payload;
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
