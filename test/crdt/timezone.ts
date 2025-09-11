import t from "tap";

type ClientID = string;
type ISODatetime = string;
type Timestamp = [ClientID, ISODatetime];

/** Last-Write-Wins */
class LWWDT<T = unknown> {
  __type = "LWWDT";
  timestamp: Timestamp;
  value: T;

  constructor(value: T, timestamp: Timestamp) {
    this.value = value;
    this.timestamp = timestamp;
  }

  copy(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  merged<U extends LWWDT>(other: U): U | this {
    const [tc, tdt] = this.timestamp;
    const [oc, odt] = other.timestamp;

    if (odt > tdt) {
      return other.copy();
    }

    if (tdt > odt) {
      return this.copy();
    }

    if (oc > tc) {
      return other.copy();
    }

    if (tc > oc) {
      return this.copy();
    }

    return this.copy();
  }
}

class TombstoneDT extends LWWDT<null> {
  __type = "TombstoneDT";

  constructor(timestamp: Timestamp) {
    super(null, timestamp);
  }
}

class StringDT extends LWWDT<string> {
  __type = "StringDT";
}

class HashmapDT<T extends Record<string, LWWDT>> extends LWWDT<T> {
  __type = "HashmapDT";
  id?: string;

  constructor(id: string | undefined, value: T, timestamp: Timestamp) {
    super(value, timestamp);
    this.id = id;
  }

  merged<U extends LWWDT>(other: U): this | U {
    if (!(other instanceof HashmapDT)) {
      return super.merged(other);
    }

    if (this.id !== other.id) {
      throw new Error("Can't merge `HashmapDT`s with different `id`s");
    }

    const clone = super.merged(other);

    const keys = new Set([
      ...Object.keys(this.value),
      ...Object.keys(other.value),
    ]);
    const value: Record<string, LWWDT> = {};

    for (const k of keys) {
      const t = this.value[k];
      const o = other.value[k];

      if (t && !o) {
        value[k] = t.copy();
        continue;
      }

      if (!t && o) {
        value[k] = o.copy();
        continue;
      }

      // if (t && o)
      value[k] = t.merged(o);
    }

    clone.value = value as T & U;

    return clone;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reviver(key: string, value: any, _context?: { source: string }) {
  if (value?.__type === "StringDT") {
    return new StringDT(value.value, value.timestamp);
  }

  if (value?.__type === "HashmapDT") {
    return new HashmapDT(value.id, value.value, value.timestamp);
  }

  if (value?.__type === "TombstoneDT") {
    return new TombstoneDT(value.timestamp);
  }

  if (value?.__type === "LWWDT") {
    return new LWWDT(value.value, value.timestamp);
  }

  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prettyReviver(key: string, value: any, _context?: { source: string }) {
  if (value?.__type === "StringDT") {
    return value.value;
  }

  if (value?.__type === "HashmapDT") {
    return value.value;
  }

  if (value?.__type === "TombstoneDT") {
    return value.value;
  }

  if (value?.__type === "LWWDT") {
    return value.value;
  }

  return value;
}

class TimezoneDT extends HashmapDT<{ tz: StringDT; label: StringDT }> {
  constructor(
    { id, tz, label }: { id: string; tz: string; label: string },
    timestamp: Timestamp,
  ) {
    super(
      id,
      {
        tz: new StringDT(tz, timestamp),
        label: new StringDT(label, timestamp),
      },
      timestamp,
    );
  }
}

t.test("StringDT", async (t) => {
  const a = new StringDT("hello", ["a", "2025-09-11T15:38:08+03:00"]);
  const b = new StringDT("world", ["b", "2025-09-10T15:38:08+03:00"]);
  const c = new StringDT("dummy", ["c", "2025-09-12T15:38:08+03:00"]);

  t.same(a.merged(b), b.merged(a));
  t.same(a.merged(a), a);
  t.same(a.merged(b).merged(c), a.merged(b.merged(c)));

  t.same(JSON.parse(JSON.stringify(a), reviver), a);
});

t.test("same updated", async (t) => {
  const a = new StringDT("hello", ["a", "2025-09-11T15:38:08+03:00"]);
  const b = new StringDT("world", ["b", "2025-09-11T15:38:08+03:00"]);

  t.same(a.merged(b), b.merged(a));
  t.same(a.merged(a), a);
});

t.test("HashmapDT", async (t) => {
  const a = new HashmapDT(
    undefined,
    { a: new StringDT("hello", ["a", "2025-09-11T15:38:08+03:00"]) },
    ["a", "2025-09-11T15:38:08+03:00"],
  );
  const b = new HashmapDT(
    undefined,
    { a: new StringDT("hello", ["b", "2025-09-10T15:38:08+03:00"]) },
    ["b", "2025-09-10T15:38:08+03:00"],
  );
  const c = new HashmapDT(
    undefined,
    { b: new StringDT("hello", ["c", "2025-09-12T15:38:08+03:00"]) },
    ["c", "2025-09-12T15:38:08+03:00"],
  );

  t.same(a.merged(b), b.merged(a));
  t.same(a.merged(a), a);
  t.same(a.merged(b).merged(c), a.merged(b.merged(c)));

  t.same(JSON.parse(JSON.stringify(a), reviver), a);
});

t.test("TombstoneDT", async (t) => {
  const a = new HashmapDT(
    undefined,
    { a: new StringDT("hello", ["a", "2025-09-11T15:38:08+03:00"]) },
    ["a", "2025-09-11T15:38:08+03:00"],
  );
  const b = new TombstoneDT(["b", "2025-09-12T15:38:08+03:00"]);
  const c = new HashmapDT(
    undefined,
    { a: new StringDT("hello", ["c", "2025-09-11T16:38:08+03:00"]) },
    ["c", "2025-09-11T16:38:08+03:00"],
  );

  t.same(a.merged(b), b.merged(a));
  t.same(b.merged(b), b);
  t.same(a.merged(b).merged(c), a.merged(b.merged(c)));

  t.same(a.merged(b).merged(c).value, null);
  t.same(JSON.parse(JSON.stringify(b), reviver), b);
  t.same(
    JSON.parse(JSON.stringify(a.merged(b).merged(c), prettyReviver)),
    null,
  );
});

t.test("timezone", async (t) => {
  const id = "a78b371f-917e-4c35-9537-2dc6f4381258";

  const a = new TimezoneDT(
    {
      id,
      tz: "Europe/London",
      label: "",
    },
    ["a", "2025-09-11T15:00:59+03:00"],
  );

  const b = new TimezoneDT(
    {
      id,
      tz: "Europe/London",
      label: "",
    },
    ["b", "2025-09-10T15:00:59+03:00"],
  );

  const c = new TimezoneDT(
    {
      id,
      tz: "Europe/London",
      label: "",
    },
    ["c", "2025-08-10T12:00:59+03:00"],
  );

  t.same(a.merged(b), b.merged(a));
  t.same(a.merged(a), a);
  t.same(a.merged(b).merged(c), a.merged(b.merged(c)));

  t.same(JSON.parse(JSON.stringify(a), reviver), a);
});
