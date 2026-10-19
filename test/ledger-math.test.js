import test from "node:test";
import assert from "node:assert/strict";
import { allocateByWeights, calculateLedger, remapMemberId, remapSplitWeights, settlementTransfers } from "../public/ledger-math.js";

const members = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" }
];

test("equal split preserves every dollar", () => {
  const shares = allocateByWeights(100, members.map(member => member.id), { a: 1, b: 1, c: 1 });
  assert.deepEqual(shares, { a: 34, b: 33, c: 33 });
  assert.equal(Object.values(shares).reduce((sum, value) => sum + value, 0), 100);
});

test("weighted split uses largest remainder rounding", () => {
  assert.deepEqual(allocateByWeights(100, ["a", "b"], { a: 2, b: 1 }), { a: 67, b: 33 });
  assert.deepEqual(allocateByWeights(1, ["a", "b", "c"], {}), { a: 1, b: 0, c: 0 });
});

test("ledger balances and category totals remain zero-sum", () => {
  const totals = calculateLedger({
    members,
    categories: ["餐費", "交通"],
    expenses: [{ payerId: "a", splitWeights: { a: 1, b: 1, c: 1 }, items: { 餐費: 100, 交通: 2 } }],
    payments: [{ payerId: "b", debtorId: "a", amount: 10 }]
  });

  assert.deepEqual(totals.owed, { a: 35, b: 34, c: 33 });
  assert.deepEqual(totals.balance, { a: 57, b: -24, c: -33 });
  assert.equal(Object.values(totals.balance).reduce((sum, value) => sum + value, 0), 0);
  assert.equal(Object.values(totals.categoryTotals.餐費).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(Object.values(totals.categoryTotals.交通).reduce((sum, value) => sum + value, 0), 2);
});

test("settlement transfers fully clear all balances", () => {
  const transfers = settlementTransfers({ a: 57, b: -24, c: -33 }, members);
  assert.deepEqual(transfers, [
    { fromId: "b", toId: "a", amount: 24 },
    { fromId: "c", toId: "a", amount: 33 }
  ]);
  assert.equal(transfers.reduce((sum, transfer) => sum + transfer.amount, 0), 57);
});

test("four-member mixed weights reconcile categories and multiple transfers", () => {
  const fourMembers = [...members, { id: "d", name: "D" }];
  const totals = calculateLedger({
    members: fourMembers,
    categories: ["餐費", "交通"],
    expenses: [
      { payerId: "a", splitWeights: { a: 2, b: 1, c: 1, d: 0 }, items: { 餐費: 101, 交通: 11 } },
      { payerId: "d", splitWeights: { a: 1, b: 1, c: 1, d: 1 }, items: { 餐費: 40 } }
    ],
    payments: [{ payerId: "b", debtorId: "c", amount: 7 }]
  });

  assert.deepEqual(totals.owed, { a: 66, b: 38, c: 38, d: 10 });
  assert.deepEqual(totals.balance, { a: 46, b: -31, c: -45, d: 30 });
  assert.equal(Object.values(totals.categoryTotals.餐費).reduce((sum, value) => sum + value, 0), 141);
  assert.equal(Object.values(totals.categoryTotals.交通).reduce((sum, value) => sum + value, 0), 11);
  assert.equal(Object.values(totals.balance).reduce((sum, value) => sum + value, 0), 0);

  const transfers = settlementTransfers(totals.balance, fourMembers);
  assert.deepEqual(transfers, [
    { fromId: "b", toId: "a", amount: 31 },
    { fromId: "c", toId: "a", amount: 15 },
    { fromId: "c", toId: "d", amount: 30 }
  ]);
});

test("legacy member references remap to Google accounts without changing weights", () => {
  const idMap = {
    "legacy-high": "zzdanny781024@gmail.com",
    "legacy-n": "ben155373@gmail.com"
  };
  const weights = remapSplitWeights({ "legacy-high": 34500, "legacy-n": 28000 }, idMap);

  assert.equal(remapMemberId("legacy-high", idMap), "zzdanny781024@gmail.com");
  assert.equal(remapMemberId("zzdanny781024@gmail.com", idMap), "zzdanny781024@gmail.com");
  assert.deepEqual(weights, {
    "zzdanny781024@gmail.com": 34500,
    "ben155373@gmail.com": 28000
  });
  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 62500);
  assert.deepEqual(remapSplitWeights(weights, idMap), weights);
});