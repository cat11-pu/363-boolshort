// logic.js：式子拆段与逐段求值
// 语法：项 = 可选单个非号 "!" 后接单个小写字母；项之间用 "&"（与）或 "|"（或）连接。
// 优先级：非号最紧、与号紧于竖线、同层从左到右。
const EXPR_CODE = "E_BAD_EXPR";

function exprError() {
  return Object.assign(new Error("bad expression"), { code: EXPR_CODE });
}

function isLowerLetter(ch) {
  return typeof ch === "string" && ch.length === 1 && ch >= "a" && ch <= "z";
}

// 按竖线切成若干与段；每段是 [字母, 是否取非] 的列表。写法不合法抛 E_BAD_EXPR。
export function groupsOf(text) {
  if (typeof text !== "string" || text.length === 0) throw exprError();
  const groups = [[]];
  let i = 0;
  let wantTerm = true;
  while (i < text.length) {
    const ch = text[i];
    if (wantTerm) {
      let negated = false;
      if (ch === "!") {
        negated = true;
        i += 1;
        if (i >= text.length) throw exprError(); // 非号落单
      }
      const letter = text[i];
      if (!isLowerLetter(letter)) throw exprError(); // 非号后不是字母 / 运算符落单或连用
      groups[groups.length - 1].push([letter, negated]);
      i += 1;
      wantTerm = false;
    } else if (ch === "&" || ch === "|") {
      if (ch === "|") groups.push([]);
      i += 1;
      wantTerm = true; // 运算符后必须再跟一项，否则收尾时报错
    } else {
      throw exprError(); // 项后出现字母、非号或杂字符
    }
  }
  if (wantTerm) throw exprError(); // 空式子或运算符结尾
  return groups;
}

// 求一段与：从左到右，遇假即停。
// 返回 { value, evals, missing }；missing 是第一个没登记的字母（没有则 null）。
export function andOf(group, table) {
  let evals = 0;
  for (const [letter, negated] of group) {
    if (!Object.prototype.hasOwnProperty.call(table, letter)) {
      return { value: false, evals, missing: letter };
    }
    evals += 1;
    const truth = table[letter] === 1;
    if (!(negated ? !truth : truth)) {
      return { value: false, evals, missing: null };
    }
  }
  return { value: true, evals, missing: null };
}
