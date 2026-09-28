// logic.js：式子拆段与逐段求值
const NOT_CHARS = "!~";

function badExpr(message) {
  const error = new Error(message || "bad expression");
  error.code = "E_BAD_EXPR";
  return error;
}

function isLetter(ch) {
  return ch >= "a" && ch <= "z";
}

// 把式子按竖线切成若干与段，每段是 [字母, 取非与否] 列表。
// 空式子、落单运算符、连着两个运算符、非号后不是字母都算写法不合法。
export function groupsOf(text) {
  if (typeof text !== "string") throw badExpr("expression must be a string");
  const src = text.replace(/\s+/g, "");
  if (src.length === 0) throw badExpr("empty expression");
  const groups = [[]];
  let expectTerm = true;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (NOT_CHARS.indexOf(ch) !== -1) {
      if (!expectTerm) throw badExpr("operator expected before " + ch);
      const next = src[i + 1];
      if (next === undefined || !isLetter(next)) {
        throw badExpr("negation must be followed by a letter");
      }
      groups[groups.length - 1].push([next, true]);
      i += 2;
      expectTerm = false;
    } else if (isLetter(ch)) {
      if (!expectTerm) throw badExpr("operator expected before " + ch);
      groups[groups.length - 1].push([ch, false]);
      i += 1;
      expectTerm = false;
    } else if (ch === "&" || ch === "|") {
      if (expectTerm) throw badExpr("term expected before " + ch);
      if (ch === "|") groups.push([]);
      i += 1;
      expectTerm = true;
    } else {
      throw badExpr("unexpected character " + ch);
    }
  }
  if (expectTerm) throw badExpr("expression ends with an operator");
  return groups;
}

// 求一段与段：遇假即停；missing 记第一个没登记的字母。
export function andOf(group, table) {
  let evals = 0;
  for (const term of group) {
    const letter = term[0];
    const neg = term[1];
    if (!table || !Object.prototype.hasOwnProperty.call(table, letter)) {
      return { value: false, evals: evals, missing: letter };
    }
    let v = table[letter];
    if (neg) v = v ? 0 : 1;
    evals += 1;
    if (!v) return { value: false, evals: evals, missing: null };
  }
  return { value: true, evals: evals, missing: null };
}
