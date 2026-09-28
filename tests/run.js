import assert from "node:assert";
import { groupsOf, andOf } from "../logic.js";
import { step, close } from "../logicrun.js";
import { render } from "../app.js";

function freshState() {
  return { vars: [], records: [], ledger: [], applied: [] };
}

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("groupsOf splits or-groups and flags bad syntax", () => {
  assert.deepStrictEqual(groupsOf("a|b&c"), [[["a", false]], [["b", false], ["c", false]]]);
  assert.deepStrictEqual(groupsOf("!a&b"), [[["a", true], ["b", false]]]);
  for (const bad of ["", "a&", "|a", "a&&b", "!0", "!", "a||b", "a&|b"]) {
    assert.throws(() => groupsOf(bad), (e) => e.code === "E_BAD_EXPR");
  }
});

check("andOf short-circuits and reports missing", () => {
  assert.deepStrictEqual(andOf([["a", false], ["b", false]], { a: 1, b: 1 }),
    { value: true, evals: 2, missing: null });
  assert.deepStrictEqual(andOf([["a", false], ["b", false]], { a: 0, b: 1 }),
    { value: false, evals: 1, missing: null }); // 遇假即停
  assert.deepStrictEqual(andOf([["a", true]], { a: 0 }),
    { value: true, evals: 1, missing: null }); // 非号取反
  assert.deepStrictEqual(andOf([["a", false], ["b", false]], { a: 1 }),
    { value: false, evals: 1, missing: "b" }); // 没登记的字母
});

check("step applies budget, orders vars, and ledgers the rest", () => {
  const spec = { budget: 2, state: freshState(), events: [
    { id: 1, kind: "set", name: "b", value: 0 },
    { id: 2, kind: "set", name: "a", value: 1 },
    { id: 3, kind: "set", name: "a", value: 1 },
    { id: 4, kind: "eval", text: "a|b&c" }
  ] };
  const got = step(spec);
  assert.strictEqual(got.served, 2);
  assert.deepStrictEqual(got.state.vars, [["a", 1], ["b", 0]]);
  assert.deepStrictEqual(got.ledger, [["set", "a", 1, null], ["eval", null, null, "a|b&c"]]);
  assert.ok(got.judged <= got.judged_bound);
  // 不回改入参状态
  assert.deepStrictEqual(spec.state, freshState());
  const done = close({ state: got.state, events: [] });
  assert.strictEqual(done.catchup, 2);
  assert.strictEqual(done.state.ledger.length, 0);
  assert.deepStrictEqual(done.state.records, [["a|b&c", 1, 1]]);
});

check("step validates first and uses spec error codes", () => {
  const bad = (events, code) => {
    const spec = { budget: 2, state: freshState(), events,
      codes: { name: "E_BAD_NAME", value: "E_BAD_VALUE", expr: "E_BAD_EXPR",
               unknown: "E_UNKNOWN", event: "E_BAD_EVENT" } };
    assert.throws(() => step(spec), (e) => e.code === code);
    assert.deepStrictEqual(spec.state, freshState()); // 校验失败不动状态
  };
  bad([{ kind: "peek" }], "E_BAD_EVENT");
  bad([{ kind: "set", name: "A", value: 1 }], "E_BAD_NAME");
  bad([{ kind: "set", name: "a", value: 2 }], "E_BAD_VALUE");
  bad([{ kind: "eval", text: "a&" }], "E_BAD_EXPR");
  // 求值轮到没登记的字母：非号取反不短路，仍会撞到 b
  bad([{ kind: "eval", text: "!a&b" }], "E_UNKNOWN");
});

check("render keeps the eighteen-key contract", () => {
  const spec = JSON.parse(JSON.stringify({
    budget: 2, state: freshState(), events: [
      { id: 1, kind: "set", name: "a", value: 1 },
      { id: 2, kind: "set", name: "b", value: 0 },
      { id: 3, kind: "set", name: "c", value: 1 },
      { id: 4, kind: "eval", text: "a|b&c" },
      { id: 5, kind: "eval", text: "b&c" }
    ]
  }));
  const view = render(spec);
  assert.deepStrictEqual(Object.keys(view), [
    "vars", "records", "count", "served_first", "served_wide", "pair_differs",
    "ledger_before", "ledger", "catchup", "ledger_after", "mid_differs",
    "closed_equal", "replay_new", "judged", "judged_bound", "full_diff",
    "count_events", "tail"
  ]);
  assert.strictEqual(view.count_events, 5);
  assert.strictEqual(view.full_diff, 0);
  assert.strictEqual(view.ledger_after, 0);
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
