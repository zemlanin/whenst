import t, { Test } from "tap";
import Database from "better-sqlite3";

import { getMidpointPosition } from "../shared/getMidpointPosition.js";

const db = new Database(":memory:");
const order2ByStatement = db.prepare(
  `WITH t(position) AS (VALUES (?), (?))
    SELECT position FROM t ORDER BY position ASC;`,
);
const order3ByStatement = db.prepare(
  `WITH t(position) AS (VALUES (?), (?), (?))
    SELECT position FROM t ORDER BY position ASC;`,
);

t.test("getMidpointPosition", async (t) => {
  good(t, "0", "z", "U");
  good(t, "A", "E", "C");
  good(t, "G", "G", "GU");
  good(t, "0", null, "V");
  good(t, "0", "1", "0U");
  good(t, "0A", "1", "0a");
  good(t, "0", "RR", "D");
  good(t, "000", "0001", "0000U");
  good(t, "000", "0002", "0001");
  good(t, "000", "0001", "0000U");
  good(t, "z", "z", "zU");
  good(t, "z", "", "zU");
  good(t, "z", null, "zU");
  good(t, "z", "z1", "z0U");
  good(t, "z", "z0U", "z0F");
  good(t, "z", "z01", "z00U");
  good(t, "y", undefined, "z");
  good(t, "U", "", "k");
  good(t, "zz", undefined, "zzU");
  good(t, "za", undefined, "zn");
  good(t, "z", "zz", "zU");

  bad(t, "0", "0");
  bad(t, "0", "00");
  bad(t, "0", "0000");
  bad(t, "00", "00");
  bad(t, "000", "0");
  bad(t, "x", "0");
  bad(t, "K", "K0");
  bad(t, "", "");
  bad(t, "", null);
  bad(t, "", "X");
});

function good(t: Test, a: string, b: string | undefined | null, r: string) {
  t.equal(getMidpointPosition(a, b), r);

  if (a === b || !b) {
    const shuffled = [r, a];
    const expectedOrder = [a, r];

    t.same(shuffled.toSorted(), expectedOrder);
    t.same(order2ByStatement.pluck().all(...shuffled), expectedOrder);
  } else {
    const shuffled = [r, b, a];
    const expectedOrder = [a, r, b];

    t.same(shuffled.toSorted(), expectedOrder);
    t.same(order3ByStatement.pluck().all(...shuffled), expectedOrder);
  }
}

function bad(t: Test, a: string, b: string | undefined | null) {
  t.throws(() => getMidpointPosition(a, b));
}
