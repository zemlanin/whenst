import t from "tap";

import { getMidpointPosition } from "../shared/getMidpointPosition.js";

t.test("", async (t) => {
  t.equal(getMidpointPosition("0", "z"), "U");
  t.same(["0", "z", "U"].toSorted(), ["0", "U", "z"]);

  t.equal(getMidpointPosition("A", "E"), "C");
  t.same(["A", "E", "C"].toSorted(), ["A", "C", "E"]);

  t.equal(getMidpointPosition("G", "G"), "GU");
  t.same(["G", "GU"].toSorted(), ["G", "GU"]);

  t.equal(getMidpointPosition("0", null), "V");
  t.same(["0", "V"].toSorted(), ["0", "V"]);

  t.equal(getMidpointPosition("0", "1"), "0U");
  t.same(["0", "1", "0U"].toSorted(), ["0", "0U", "1"]);

  t.equal(getMidpointPosition("0A", "1"), "0a");
  t.same(["0A", "1", "0a"].toSorted(), ["0A", "0a", "1"]);

  t.equal(getMidpointPosition("0", "RR"), "D");
  t.same(["0", "RR", "D"].toSorted(), ["0", "D", "RR"]);

  t.equal(getMidpointPosition("000", "0001"), "0000U");
  t.same(["000", "0001", "0000U"].toSorted(), ["000", "0000U", "0001"]);

  t.equal(getMidpointPosition("000", "0002"), "0001");
  t.same(["000", "0002", "0001"].toSorted(), ["000", "0001", "0002"]);

  t.equal(getMidpointPosition("000", "0001"), "0000U");
  t.same(["000", "0001", "0000U"].toSorted(), ["000", "0000U", "0001"]);

  t.equal(getMidpointPosition("z", "z"), "zU");
  t.same(["z", "zU"].toSorted(), ["z", "zU"]);

  t.equal(getMidpointPosition("z", ""), "zU");
  t.same(["z", "zU"].toSorted(), ["z", "zU"]);

  t.equal(getMidpointPosition("z", null), "zU");
  t.same(["z", "zU"].toSorted(), ["z", "zU"]);

  t.equal(getMidpointPosition("z", "z1"), "z0U");
  t.same(["z", "z1", "z0U"].toSorted(), ["z", "z0U", "z1"]);

  t.equal(getMidpointPosition("z", "z0U"), "z0F");
  t.same(["z", "z0U", "z0F"].toSorted(), ["z", "z0F", "z0U"]);

  t.equal(getMidpointPosition("z", "z01"), "z00U");
  t.same(["z", "z01", "z00U"].toSorted(), ["z", "z00U", "z01"]);

  t.equal(getMidpointPosition("y", undefined), "z");
  t.same(["y", "z"].toSorted(), ["y", "z"]);

  t.equal(getMidpointPosition("U", ""), "k");
  t.same(["U", "k"].toSorted(), ["U", "k"]);

  t.equal(getMidpointPosition("zz", undefined), "zzU");
  t.same(["zz", "zzU"].toSorted(), ["zz", "zzU"]);

  t.equal(getMidpointPosition("za", undefined), "zn");
  t.same(["za", "zn"].toSorted(), ["za", "zn"]);

  t.equal(getMidpointPosition("z", "zz"), "zU");
  t.same(["z", "zz", "zU"].toSorted(), ["z", "zU", "zz"]);

  t.throws(() => getMidpointPosition("0", "0"));
  t.throws(() => getMidpointPosition("0", "00"));
  t.throws(() => getMidpointPosition("0", "0000"));
  t.throws(() => getMidpointPosition("00", "00"));
  t.throws(() => getMidpointPosition("000", "0"));
  t.throws(() => getMidpointPosition("x", "0"));
  t.throws(() => getMidpointPosition("K", "K0"));
  t.throws(() => getMidpointPosition("", ""));
  t.throws(() => getMidpointPosition("", null));
  t.throws(() => getMidpointPosition("", "X"));
});
