import t, { Test } from "tap";
import Database, { Statement } from "better-sqlite3";
import {
  Repo,
  StorageAdapterInterface,
  StorageKey,
  Chunk,
  DocumentId,
} from "@automerge/automerge-repo";

import type { Database as DatabaseInstance } from "better-sqlite3";
import Fastify from "fastify";
import * as automerge from "@automerge/automerge";
import { AddressInfo } from "node:net";

function bufferToUint8Array(buf: Buffer): Uint8Array {
  return new Uint8Array(
    buf.buffer,
    buf.byteOffset,
    buf.length / Uint8Array.BYTES_PER_ELEMENT,
  );
}

class BetterSqliteStorageAdapter implements StorageAdapterInterface {
  #db: DatabaseInstance;
  #load_stmt: Statement<[string], { data: Buffer } | undefined>;
  #save_stmt: Statement<{ key: string; data: Uint8Array }>;
  #remove_stmt: Statement<[string]>;
  #loadRange_stmt: Statement<[string], { key: string; data: Buffer }>;
  #removeRange_stmt: Statement<[string]>;

  constructor(db: DatabaseInstance, tableName = "automerge_documents") {
    this.#db = db;

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        key TEXT PRIMARY KEY,
        data BLOB NOT NULL
      ) WITHOUT ROWID, STRICT;
    `);
    this.#db.exec(`CREATE INDEX idx ON ${tableName}(key);`);

    this.#load_stmt = this.#db.prepare(
      `SELECT data FROM ${tableName} WHERE key = ?;`,
    );
    this.#save_stmt = this.#db.prepare(`
      INSERT INTO ${tableName} VALUES (@key, @data)
      ON CONFLICT DO UPDATE SET data = @data WHERE key = @key;
    `);
    this.#remove_stmt = this.#db.prepare(
      `DELETE FROM ${tableName} WHERE key = ?;`,
    );
    this.#loadRange_stmt = this.#db.prepare(
      `SELECT key, data FROM ${tableName} WHERE key GLOB ?;`,
    );
    this.#removeRange_stmt = this.#db.prepare(
      `DELETE FROM ${tableName} WHERE key GLOB ?;`,
    );
  }

  static KEY_SEPARATOR = ".";

  static #keyToString(key: StorageKey): string {
    return key.join(BetterSqliteStorageAdapter.KEY_SEPARATOR);
  }

  static #stringToKey(key: string): StorageKey {
    return key.split(BetterSqliteStorageAdapter.KEY_SEPARATOR);
  }

  async load(keyArray: StorageKey): Promise<Uint8Array | undefined> {
    const key = BetterSqliteStorageAdapter.#keyToString(keyArray);
    const result = this.#load_stmt.get(key);
    if (!result) {
      return undefined;
    }
    return bufferToUint8Array(result.data);
  }

  async save(keyArray: StorageKey, data: Uint8Array): Promise<void> {
    const key = BetterSqliteStorageAdapter.#keyToString(keyArray);
    this.#save_stmt.run({ key, data });
  }

  async remove(keyArray: StorageKey): Promise<void> {
    const key = BetterSqliteStorageAdapter.#keyToString(keyArray);
    this.#remove_stmt.run(key);
  }

  /**
   * Load all values with keys that start with `keyPrefix`.
   *
   * @remarks
   * The `keyprefix` will match any key that starts with the given array. For example:
   * - `[documentId, "incremental"]` will match all incremental saves
   * - `[documentId]` will match all data for a given document.
   *
   * Be careful! `[documentId]` would also match something like `[documentId, "syncState"]`! We
   * aren't using this yet but keep it in mind.)
   */
  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    const prefix = BetterSqliteStorageAdapter.#keyToString(keyPrefix);
    const result = this.#loadRange_stmt.all(`${prefix}*`);

    return result.map(({ key, data }) => ({
      key: BetterSqliteStorageAdapter.#stringToKey(key),
      data: bufferToUint8Array(data),
    }));
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    const prefix = BetterSqliteStorageAdapter.#keyToString(keyPrefix);
    this.#removeRange_stmt.run(`${prefix}*`);
  }
}

async function setup(t: Test) {
  const db = new Database(":memory:", {});
  db.pragma("journal_mode = WAL");

  const serverRepo = new Repo({
    storage: new BetterSqliteStorageAdapter(db),
  });

  const fastify = await getServer(serverRepo);
  t.after(async () => {
    await fastify.close();
  });

  const clientRepo = new Repo({
    storage: undefined,
  });

  const initialValue = { changedOnServer: 0, changedOnClient: 0 };
  const dd = automerge.from(initialValue);
  automerge.change(dd, (doc) => {
    doc.changedOnServer = 1;
    doc.changedOnClient = 1;
  });
  const serverDocHandle = serverRepo.import<typeof initialValue>(
    automerge.save(dd),
  );
  const documentId = serverDocHandle.documentId;

  const clientDocHandle = clientRepo.import<typeof initialValue>(
    automerge.save(dd),
    { docId: documentId },
  );

  const address = fastify.server.address() as AddressInfo | null;

  return {
    serverRepo,
    serverDocHandle,
    clientDocHandle,
    baseURL: new URL(`http://localhost:${address?.port}/`),
  };
}

t.test("changes on both server and client", async (t) => {
  const { serverDocHandle, clientDocHandle, baseURL } = await setup(t);

  serverDocHandle.change((doc) => {
    doc.changedOnServer = 2;
  });

  clientDocHandle.change((doc) => {
    doc.changedOnClient = 2;
  });

  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });
  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 2 });

  const syncState = automerge.initSyncState();
  const [newSyncState, syncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    syncState,
  );

  t.ok(syncMessage);
  if (!syncMessage) {
    return;
  }

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: syncMessage,
    },
  );

  t.equal(resp.status, 200);

  const respSyncMessage = await resp.arrayBuffer();
  const [newDoc, newNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newSyncState,
    new Uint8Array(respSyncMessage),
  );

  clientDocHandle.update(() => newDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });

  const [newNewNewSyncState, outgoingSyncMessage] =
    automerge.generateSyncMessage(clientDocHandle.doc(), newNewSyncState);

  t.ok(outgoingSyncMessage);
  if (!outgoingSyncMessage) {
    return;
  }

  const resp2 = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: outgoingSyncMessage,
    },
  );

  t.equal(resp.status, 200);

  const resp2SyncMessage = await resp2.arrayBuffer();
  const [newNewDoc, newNewNewNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newNewNewSyncState,
    new Uint8Array(resp2SyncMessage),
  );

  clientDocHandle.update(() => newNewDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });

  const [, outgoing2SyncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    newNewNewNewSyncState,
  );

  t.notOk(outgoing2SyncMessage);
});

t.test("no changes", async (t) => {
  const { serverDocHandle, clientDocHandle, baseURL } = await setup(t);

  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });
  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });

  const syncState = automerge.initSyncState();
  const [newSyncState, syncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    syncState,
  );

  t.ok(syncMessage);
  if (!syncMessage) {
    return;
  }

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: syncMessage,
    },
  );

  t.equal(resp.status, 200);

  const respSyncMessage = await resp.arrayBuffer();
  const [newDoc, newNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newSyncState,
    new Uint8Array(respSyncMessage),
  );

  clientDocHandle.update(() => newDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });
  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });

  const [, outgoingSyncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    newNewSyncState,
  );

  t.notOk(outgoingSyncMessage);
});

t.test("changes on client", async (t) => {
  const { serverDocHandle, clientDocHandle, baseURL } = await setup(t);

  clientDocHandle.change((doc) => {
    doc.changedOnClient = 2;
  });

  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });
  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 2 });

  const syncState = automerge.initSyncState();
  const [newSyncState, syncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    syncState,
  );

  t.ok(syncMessage);
  if (!syncMessage) {
    return;
  }

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: syncMessage,
    },
  );

  t.equal(resp.status, 200);

  const respSyncMessage = await resp.arrayBuffer();
  const [newDoc, newNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newSyncState,
    new Uint8Array(respSyncMessage),
  );

  clientDocHandle.update(() => newDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 2 });
  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });

  const [newNewNewSyncState, outgoingSyncMessage] =
    automerge.generateSyncMessage(clientDocHandle.doc(), newNewSyncState);

  t.ok(outgoingSyncMessage);
  if (!outgoingSyncMessage) {
    return;
  }

  const resp2 = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: outgoingSyncMessage,
    },
  );

  t.equal(resp.status, 200);

  const resp2SyncMessage = await resp2.arrayBuffer();
  const [newNewDoc, newNewNewNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newNewNewSyncState,
    new Uint8Array(resp2SyncMessage),
  );

  clientDocHandle.update(() => newNewDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 2 });
  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 2 });

  const [, outgoing2SyncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    newNewNewNewSyncState,
  );

  t.notOk(outgoing2SyncMessage);
});

t.test("changes on server", async (t) => {
  const { serverDocHandle, clientDocHandle, baseURL } = await setup(t);

  serverDocHandle.change((doc) => {
    doc.changedOnServer = 2;
  });

  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });
  t.same(clientDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });

  const syncState = automerge.initSyncState();
  const [newSyncState, syncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    syncState,
  );

  t.ok(syncMessage);
  if (!syncMessage) {
    return;
  }

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: syncMessage,
    },
  );

  t.equal(resp.status, 200);

  const respSyncMessage = await resp.arrayBuffer();
  const [newDoc, newNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newSyncState,
    new Uint8Array(respSyncMessage),
  );

  clientDocHandle.update(() => newDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });

  const [, outgoingSyncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    newNewSyncState,
  );

  t.ok(outgoingSyncMessage);
  if (!outgoingSyncMessage) {
    return;
  }

  const resp2 = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: outgoingSyncMessage,
    },
  );

  t.equal(resp.status, 200);

  const resp2SyncMessage = await resp2.arrayBuffer();

  t.notOk(new Uint8Array(resp2SyncMessage).length);
});

t.test("absent on client", async (t) => {
  const { serverDocHandle, baseURL } = await setup(t);

  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });

  serverDocHandle.change((doc) => {
    doc.changedOnServer = 2;
  });

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: serverDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "get",
      headers: {
        // 'content-type': 'application/vnd.automerge'
      },
    },
  );

  t.equal(resp.status, 200);

  const respDoc = await resp.arrayBuffer();
  const newDoc = automerge.load(new Uint8Array(respDoc));

  t.same(newDoc, { changedOnServer: 2, changedOnClient: 1 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });
});

t.test("load and change on client", async (t) => {
  const { serverDocHandle, baseURL } = await setup(t);

  t.same(serverDocHandle.doc(), { changedOnServer: 1, changedOnClient: 1 });

  serverDocHandle.change((doc) => {
    doc.changedOnServer = 2;
  });

  const respGet = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: serverDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "get",
      headers: {
        // 'content-type': 'application/vnd.automerge'
      },
    },
  );

  t.equal(respGet.status, 200);

  const respDoc = await respGet.arrayBuffer();
  const initDoc = automerge.load(new Uint8Array(respDoc));

  t.same(initDoc, { changedOnServer: 2, changedOnClient: 1 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });

  const clientRepo = new Repo({
    storage: undefined,
  });
  const clientDocHandle = clientRepo.import<{
    changedOnServer: number;
    changedOnClient: number;
  }>(automerge.save(initDoc), { docId: serverDocHandle.documentId });

  clientDocHandle.change((doc) => {
    doc.changedOnClient = 2;
  });

  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });
  t.same(clientDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });

  const syncState = automerge.initSyncState();
  const [newSyncState, syncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    syncState,
  );

  t.ok(syncMessage);
  if (!syncMessage) {
    return;
  }

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: syncMessage,
    },
  );

  t.equal(resp.status, 200);

  const respSyncMessage = await resp.arrayBuffer();
  const [newDoc, newNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newSyncState,
    new Uint8Array(respSyncMessage),
  );

  clientDocHandle.update(() => newDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 1 });

  const [newNewNewSyncState, outgoingSyncMessage] =
    automerge.generateSyncMessage(clientDocHandle.doc(), newNewSyncState);

  t.ok(outgoingSyncMessage);
  if (!outgoingSyncMessage) {
    return;
  }

  const resp2 = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: clientDocHandle.documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: outgoingSyncMessage,
    },
  );

  t.equal(resp.status, 200);

  const resp2SyncMessage = await resp2.arrayBuffer();
  const [newNewDoc, newNewNewNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newNewNewSyncState,
    new Uint8Array(resp2SyncMessage),
  );

  clientDocHandle.update(() => newNewDoc);

  t.same(clientDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });
  t.same(serverDocHandle.doc(), { changedOnServer: 2, changedOnClient: 2 });

  const [, outgoing2SyncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    newNewNewNewSyncState,
  );

  t.notOk(outgoing2SyncMessage);
});

t.test("create and sync a new client doc", async (t) => {
  const { baseURL, serverRepo } = await setup(t);

  const clientRepo = new Repo({
    storage: undefined,
  });

  const initialValue = { createdOnClient: 1 };
  const doc = automerge.from(initialValue);
  const clientDocHandle = clientRepo.import<typeof initialValue>(
    automerge.save(doc),
  );
  const documentId = clientDocHandle.documentId;

  t.same(clientDocHandle.doc(), { createdOnClient: 1 });

  clientDocHandle.change((doc) => {
    doc.createdOnClient = 2;
  });

  const respGet = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "get",
      headers: {
        // 'content-type': 'application/vnd.automerge'
      },
    },
  );

  t.equal(respGet.status, 404);

  const syncState = automerge.initSyncState();
  const [newSyncState, syncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    syncState,
  );

  t.ok(syncMessage);
  if (!syncMessage) {
    return;
  }

  const resp = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: syncMessage,
    },
  );

  t.equal(resp.status, 200);

  const respSyncMessage = await resp.arrayBuffer();
  const [newDoc, newNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newSyncState,
    new Uint8Array(respSyncMessage),
  );

  clientDocHandle.update(() => newDoc);

  t.same(clientDocHandle.doc(), { createdOnClient: 2 });
  t.ok(
    (
      await serverRepo.find(documentId, { allowableStates: ["unavailable"] })
    ).isUnavailable(),
  );

  const [newNewNewSyncState, outgoingSyncMessage] =
    automerge.generateSyncMessage(clientDocHandle.doc(), newNewSyncState);

  t.ok(outgoingSyncMessage);
  if (!outgoingSyncMessage) {
    return;
  }

  const resp2 = await fetch(
    new URL(
      `/api/sync?${new URLSearchParams({
        document_id: documentId.toString(),
      })}`,
      baseURL,
    ),
    {
      method: "put",
      headers: {
        "content-type": "application/vnd.automerge",
      },
      body: outgoingSyncMessage,
    },
  );

  t.equal(resp.status, 200);

  const resp2SyncMessage = await resp2.arrayBuffer();
  const [newNewDoc, newNewNewNewSyncState] = automerge.receiveSyncMessage(
    clientDocHandle.doc(),
    newNewNewSyncState,
    new Uint8Array(resp2SyncMessage),
  );

  clientDocHandle.update(() => newNewDoc);

  t.same(clientDocHandle.doc(), { createdOnClient: 2 });
  t.same((await serverRepo.find(documentId)).doc(), { createdOnClient: 2 });

  const [, outgoing2SyncMessage] = automerge.generateSyncMessage(
    clientDocHandle.doc(),
    newNewNewNewSyncState,
  );

  t.notOk(outgoing2SyncMessage);
});

async function getServer(repo: Repo) {
  // TODO: move to db?
  let syncState = automerge.initSyncState();

  const fastify = Fastify({
    logger: true,
    trustProxy: true,
  });

  fastify.addContentTypeParser(
    "application/vnd.automerge",
    { parseAs: "buffer" },
    function (req, body, done) {
      done(null, body);
    },
  );

  await fastify
    .get("/api/sync", async (req, reply) => {
      const { document_id } = req.query as {
        document_id?: string;
      };

      if (!document_id) {
        reply.status(404);
        return reply.send();
      }

      const docHandle = await repo
        .find(document_id as DocumentId)
        .catch(() => null);
      if (!docHandle) {
        reply.status(404);
        return reply.send();
      }

      const doc = docHandle.doc();

      return reply.send(automerge.save(doc));
    })
    .put("/api/sync", async (req, reply) => {
      const { document_id } = req.query as {
        document_id?: string;
      };

      const sync = req.body;

      if (!document_id) {
        reply.status(404);
        return reply.send();
      }

      if (!sync) {
        reply.status(404);
        return reply.send();
      }

      if (!(sync instanceof Buffer)) {
        reply.status(400);
        return reply.send();
      }

      let docHandle = await repo
        .find(document_id as DocumentId)
        .catch(() => null);
      let doc = docHandle?.doc();
      if (!doc) {
        doc = automerge.init();
      }
      if (!docHandle) {
        docHandle = repo.import(automerge.save(doc), {
          docId: document_id as DocumentId,
        });
      }

      const incomingSyncMessage = bufferToUint8Array(sync);
      const [newDoc, newSyncState] = automerge.receiveSyncMessage(
        doc,
        syncState,
        incomingSyncMessage,
      );
      syncState = newSyncState;

      docHandle.update(() => newDoc);

      const [newNewSyncState, outgoingSyncMessage] =
        automerge.generateSyncMessage(doc, syncState);
      syncState = newNewSyncState;

      if (!outgoingSyncMessage) {
        return reply.send();
      }

      return reply.send(outgoingSyncMessage);
    })
    .listen();

  return fastify;
}
