import assert from "node:assert";
import { groupsOf, andOf } from "../logic.js";
import { step, close } from "../logicrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { vars: [], records: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "set", name: "a", value: 1 }],
  bad_name_code: "E_BAD_NAME", bad_value_code: "E_BAD_VALUE",
  bad_expr_code: "E_BAD_EXPR", unknown_code: "E_UNKNOWN",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("groupsOf returns a list", () => {
  assert.ok(Array.isArray(groupsOf("a|b")));
});

check("andOf returns value and evals", () => {
  const got = andOf([["a", false]], { a: 1 });
  assert.strictEqual(typeof got.value, "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
