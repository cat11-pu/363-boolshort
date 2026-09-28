// logicrun.js：按处理预算处理事件，预算用尽把剩余事件连着载压账；收尾不限预算做完账。
import { groupsOf, andOf } from "./logic.js";

const CODE_FIELDS = {
  name: "bad_name_code", value: "bad_value_code", expr: "bad_expr_code",
  unknown: "unknown_code", event: "event_error_code"
};

function codeOf(spec, key, fallback) {
  const codes = spec && spec.codes;
  if (codes && typeof codes[key] === "string" && codes[key].length > 0) return codes[key];
  const field = CODE_FIELDS[key];
  if (spec && field && typeof spec[field] === "string" && spec[field].length > 0) return spec[field];
  return fallback;
}

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

// 先做全部校验：结构 → 名字 → 值（set）；式子写法（eval）。
function validateEvent(event, spec) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw error(codeOf(spec, "event", "E_BAD_EVENT"), "bad event");
  }
  if (event.kind === "set") {
    if (typeof event.name !== "string" || event.name.length !== 1
        || event.name < "a" || event.name > "z") {
      throw error(codeOf(spec, "name", "E_BAD_NAME"), "bad name");
    }
    if (event.value !== 0 && event.value !== 1) {
      throw error(codeOf(spec, "value", "E_BAD_VALUE"), "bad value");
    }
    return { kind: "set", name: event.name, value: event.value };
  }
  if (event.kind === "eval") {
    let groups;
    try {
      groups = groupsOf(event.text);
    } catch (cause) {
      throw error(codeOf(spec, "expr", (cause && cause.code) || "E_BAD_EXPR"), "bad expression");
    }
    return { kind: "eval", text: event.text, groups };
  }
  throw error(codeOf(spec, "event", "E_BAD_EVENT"), "bad event");
}

// 账上行四元组：set → [kind, name, value, null]，eval → [kind, null, null, text]。
function toRow(event) {
  if (event.kind === "set") return ["set", event.name, event.value, null];
  return ["eval", null, null, event.text];
}

function rowToEvent(row) {
  if (row[0] === "set") return { kind: "set", name: row[1], value: row[2] };
  return { kind: "eval", text: row[3], groups: groupsOf(row[3]) };
}

function sameRow(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function cloneState(state) {
  const src = state || {};
  return {
    vars: Array.isArray(src.vars) ? src.vars.map((row) => [row[0], row[1]]) : [],
    records: Array.isArray(src.records) ? src.records.map((row) => [row[0], row[1], row[2]]) : [],
    ledger: Array.isArray(src.ledger) ? src.ledger.map((row) => row.slice()) : [],
    applied: Array.isArray(src.applied) ? src.applied.map((row) => row.slice()) : []
  };
}

function setVar(state, name, value) {
  const pos = state.vars.findIndex((row) => row[0] === name);
  if (pos >= 0) state.vars[pos][1] = value;
  else {
    state.vars.push([name, value]);
    state.vars.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
}

// 把一条已校验事件落到状态上；求值时按当前变量表短路，轮到没登记的字母抛 E_UNKNOWN。
function applyEvent(state, event, spec) {
  if (event.kind === "set") {
    setVar(state, event.name, event.value);
    return;
  }
  const table = {};
  for (const [name, value] of state.vars) table[name] = value;
  let result = 0;
  let seen = 0;
  for (const group of event.groups) {
    const part = andOf(group, table);
    if (part.missing !== null) {
      throw error(codeOf(spec, "unknown", "E_UNKNOWN"), "unknown variable " + part.missing);
    }
    seen += part.evals;
    if (part.value) {
      result = 1;
      break; // 竖线里某段为真就停，后面不再看
    }
  }
  state.records.push([event.text, result, seen]);
}

// 按预算处理一轮：先清账，再处理本批事件；预算用尽后剩余事件连着载压账。
export function step(spec) {
  const state = cloneState(spec && spec.state);
  const rawEvents = (spec && spec.events) || [];
  const budget = Math.max(0, Number((spec && spec.budget) || 0) || 0);

  // 所有事件先校验（任何一条不合法都不动状态）。
  const events = rawEvents.map((event) => validateEvent(event, spec));
  const rows = events.map(toRow);

  const work = [];
  state.ledger.forEach((row) => work.push({ row, event: rowToEvent(row), fromLedger: true }));
  events.forEach((event, idx) => {
    if (!state.applied.some((row) => sameRow(row, rows[idx]))) {
      work.push({ event, row: rows[idx], fromLedger: false });
    }
  });

  let remaining = budget;
  let served = 0;
  let pending = null;
  for (const item of work) {
    if (remaining <= 0) { pending = item; break; }
    if (item.fromLedger) state.ledger.shift();
    applyEvent(state, item.event, spec);
    state.applied.push(item.row);
    remaining -= 1;
    served += 1;
  }
  if (pending) {
    for (let i = work.indexOf(pending); i < work.length; i += 1) {
      const item = work[i];
      if (!item.fromLedger) state.ledger.push(item.row);
    }
  }

  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map((row) => row.slice()),
    judged: served,
    judged_bound: budget
  };
}

// 收尾：不限预算，把账上的事件按序全部做完，返回补齐条数。
export function close(spec) {
  const state = cloneState(spec && spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const row = state.ledger.shift();
    let event;
    event = rowToEvent(row);
    applyEvent(state, event, spec);
    state.applied.push(row.slice());
    catchup += 1;
  }
  return { state, catchup };
}
