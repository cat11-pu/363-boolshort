// logicrun.js：按处理预算处理并留账
import { groupsOf, andOf } from "./logic.js";

function codesOf(spec) {
  spec = spec || {};
  return {
    event: spec.event_error_code || "E_BAD_EVENT",
    name: spec.bad_name_code || "E_BAD_NAME",
    value: spec.bad_value_code || "E_BAD_VALUE",
    expr: spec.bad_expr_code || "E_BAD_EXPR",
    unknown: spec.unknown_code || "E_UNKNOWN"
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function copyState(prev) {
  const state = prev || {};
  return {
    vars: (state.vars || []).map(function (row) { return [row[0], row[1]]; }),
    records: (state.records || []).map(function (row) { return [row[0], row[1], row[2]]; }),
    ledger: (state.ledger || []).map(function (row) { return [row[0], row[1], row[2], row[3]]; }),
    applied: (state.applied || []).slice()
  };
}

// 先校验结构、名字、值、式子写法，通过的事件规整成 [kind, name, value, text]。
function normalize(event, codes) {
  if (!event || typeof event !== "object") fail(codes.event, "event must be an object");
  if (event.kind === "set") {
    if (event.name === undefined) fail(codes.event, "set event needs a name");
    if (typeof event.name !== "string" || !/^[a-z]$/.test(event.name)) {
      fail(codes.name, "name must be a single lowercase letter");
    }
    if (event.value === undefined) fail(codes.event, "set event needs a value");
    if (event.value !== 0 && event.value !== 1) fail(codes.value, "value must be 0 or 1");
    return ["set", event.name, event.value, null];
  }
  if (event.kind === "eval") {
    if (event.text === undefined) fail(codes.event, "eval event needs text");
    if (typeof event.text !== "string") fail(codes.event, "eval text must be a string");
    try {
      groupsOf(event.text);
    } catch (error) {
      if (error && error.code === "E_BAD_EXPR") fail(codes.expr, error.message);
      throw error;
    }
    return ["eval", null, null, event.text];
  }
  fail(codes.event, "unknown event kind");
}

function keyOf(item) {
  return JSON.stringify(item);
}

function tableOf(vars) {
  const table = Object.create(null);
  for (const row of vars) table[row[0]] = row[1];
  return table;
}

function setVar(vars, name, value) {
  for (const row of vars) {
    if (row[0] === name) { row[1] = value; return; }
  }
  vars.push([name, value]);
  vars.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
}

// 处理一条规整后的事件，返回这次求值看过的变量个数。
function applyItem(state, item, codes) {
  if (item[0] === "set") {
    setVar(state.vars, item[1], item[2]);
    return 0;
  }
  const groups = groupsOf(item[3]);
  const table = tableOf(state.vars);
  let evals = 0;
  let result = 0;
  for (const group of groups) {
    const part = andOf(group, table);
    evals += part.evals;
    if (part.missing !== null) fail(codes.unknown, "unknown variable " + part.missing);
    if (part.value) { result = 1; break; }
  }
  state.records.push([item[3], result, evals]);
  return evals;
}

function termsOf(item) {
  if (item[0] !== "eval") return 0;
  return groupsOf(item[3]).reduce(function (sum, group) { return sum + group.length; }, 0);
}

export function step(spec) {
  const codes = codesOf(spec);
  const state = copyState(spec && spec.state);
  const events = (spec && spec.events) || [];
  const seen = new Set(state.applied);
  const queued = new Set(state.ledger.map(keyOf));
  const incoming = [];
  for (const event of events) {
    const item = normalize(event, codes);
    const key = keyOf(item);
    if (seen.has(key) || queued.has(key)) continue;
    queued.add(key);
    incoming.push(item);
  }
  const queue = state.ledger.concat(incoming);
  const budget = !spec || spec.budget === undefined ? queue.length : spec.budget;
  let served = 0;
  let judged = 0;
  let judged_bound = 0;
  for (const item of queue) judged_bound += termsOf(item);
  const rest = [];
  for (const item of queue) {
    if (served >= budget) { rest.push(item); continue; }
    judged += applyItem(state, item, codes);
    state.applied.push(keyOf(item));
    served += 1;
  }
  state.ledger = rest;
  return {
    state: state, served: served,
    ledger_before: rest.length, ledger: rest,
    judged: judged, judged_bound: judged_bound
  };
}

export function close(spec) {
  const codes = codesOf(spec);
  const state = copyState(spec && spec.state);
  const queue = state.ledger;
  state.ledger = [];
  let catchup = 0;
  for (const item of queue) {
    applyItem(state, item, codes);
    state.applied.push(keyOf(item));
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
