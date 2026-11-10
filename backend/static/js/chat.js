/* 원주 육아 혜택 비서: 챗봇의 순수 로직 (화면과 무관, node 테스트 가능)
 * - maskSensitive: 주민번호·전화번호·계좌번호를 전송·표시 전에 가립니다.
 * - parseIntent: 문장을 의도와 슬롯으로 바꿉니다. 금액은 만들지 않습니다.
 *   나중에 Bedrock(/api/chat)으로 바꿀 때는 이 함수만 교체하면 됩니다. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WonjuChat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const INTENTS = ["apply_list", "apply_order", "eligibility", "compare", "simulate", "second_child", "set_wage", "calendar", "analyze_doc", "return_prep", "fallback"];

  /* 제도별로 사람들이 줄여 부르는 말 */
  const ALIASES = {
    P01: ["부모급여"],
    P02: ["첫만남", "첫 만남"],
    P03: ["아동수당"],
    P04: ["보육료"],
    P05: ["아이돌봄", "돌봄서비스", "돌봄 서비스"],
    P06: ["강원", "육아기본수당", "기본수당"],
    P07: ["출생축하금", "축하금"],
    P09: ["육아휴직", "휴직급여", "휴직 급여"],
    P10: ["가정양육", "양육수당"],
    P12: ["농축산물", "산모 출산"]
  };

  function digitsOf(s) { return (s.match(/\d/g) || []).length; }

  function maskSensitive(input) {
    let text = String(input == null ? "" : input);
    const found = [];
    function note(kind) { if (found.indexOf(kind) < 0) found.push(kind); }

    /* 주민등록번호: 6자리-7자리 (하이픈 없이 13자리 포함) */
    /* 옛 Safari는 (?<!…) 문법을 몰라 파일 전체가 멈추므로, 앞 글자(pre)를 함께 잡아 되돌려 줌 */
    text = text.replace(/(\d{6}\s*-\s*\d{7})|(^|\D)(\d{6}[1-8]\d{6})(?!\d)/g, function (m, dashed, pre) { note("주민번호"); return (dashed ? "" : pre) + "[주민번호 가림]"; });
    /* 휴대전화·유선전화 */
    text = text.replace(/(^|\D)(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4})(?!\d)/g, function (m, pre, num) {
      if (digitsOf(num) < 9) return m;
      note("전화번호"); return pre + "[전화번호 가림]";
    });
    /* 계좌번호: 숫자 묶음 3~4개, 숫자 10자리 이상 (날짜 2026-11-08 같은 짧은 묶음은 그대로) */
    text = text.replace(/(^|\D)(\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,4})?)(?!\d)/g, function (m, pre, num) {
      if (digitsOf(num) < 10) return m;
      note("계좌번호"); return pre + "[계좌번호 가림]";
    });
    return { text: text, found: found };
  }

  /* "380만 원", "380만원", "3,800,000원" → 원 단위 숫자. 범위를 벗어나면 null */
  function parseWage(text) {
    const s = String(text || "");
    let n = null;
    const man = s.match(/(\d[\d,]*(?:\.\d+)?)\s*만/);
    if (man) n = Math.round(Number(man[1].replace(/,/g, "")) * 10000);
    else {
      const won = s.match(/(\d{1,3}(?:,\d{3})+|\d{6,9})\s*원?/);
      if (won) n = Number(won[1].replace(/,/g, ""));
    }
    if (n == null || !isFinite(n)) return null;
    if (n < 500000 || n > 20000000) return null;
    return n;
  }

  /* "12개월" → 12 (0~35만 허용) */
  function parseMonths(text) {
    const m = String(text || "").match(/(\d{1,2})\s*개월/);
    if (!m) return null;
    const v = Number(m[1]);
    return v >= 0 && v <= 35 ? v : null;
  }

  function findPrograms(text, programs) {
    const s = String(text || "").replace(/\s+/g, "");
    const ids = [];
    (programs || []).forEach(function (p) {
      const names = [p.name].concat(p.aliases || ALIASES[p.id] || []);
      const hit = names.some(function (n) { return n && s.indexOf(String(n).replace(/\s+/g, "")) >= 0; });
      if (hit && ids.indexOf(p.id) < 0) ids.push(p.id);
    });
    return ids;
  }

  function has(s, re) { return re.test(s); }

  function parseIntent(input, ctx) {
    const text = String(input || "").trim();
    const c = ctx || {};
    if (!text) return { intent: "fallback", slots: {} };
    /* 공고 주소를 붙여 넣거나 공고문 분석을 부탁하면 공고문 AI 분석 카드를 엽니다 */
    const link = text.match(/https?:\/\/\S+/i);
    if (link) return { intent: "analyze_doc", slots: { url: link[0] } };
    if (has(text, /공고문|공고\s*(분석|요약|읽|정리)|pdf|hwp|한글\s*파일/i)) return { intent: "analyze_doc", slots: {} };
    const month = parseMonths(text);

    if (has(text, /월급|급여|임금|통상임금|소득|연봉/) && !has(text, /부모급여|휴직\s*급여|휴직급여/)) {
      const wage = parseWage(text);
      if (wage != null) return { intent: "set_wage", slots: { wage: wage } };
    }
    if (has(text, /둘째|셋째|다음\s*아이|아이를\s*더|동생/)) return { intent: "second_child", slots: {} };
    if (has(text, /복직\s*준비|d-?day|디데이|역산|준비\s*일정/i)) return { intent: "return_prep", slots: {} };
    if (has(text, /복직/)) return { intent: "simulate", slots: { returnAge: month } };
    if (has(text, /순서|뭐부터|무엇부터|어떤\s*것부터|먼저\s*(해|할|신청)/)) return { intent: "apply_order", slots: {} };
    if (has(text, /일정|마감|전환|달력|캘린더|\.ics|언제부터|언제까지|바뀌는\s*달|바뀌는\s*시기/)) return { intent: "calendar", slots: { month: month } };

    const ids = findPrograms(text, c.programs);
    if (ids.length >= 2 && has(text, /비교|차이/)) return { intent: "compare", slots: { programIds: ids, month: month } };
    if (ids.length) return { intent: "eligibility", slots: { programIds: ids } };
    if (has(text, /빠졌|빠진|제외|합계에서/)) return { intent: "eligibility", slots: { excluded: true } };
    if (has(text, /확인\s*필요|왜|판정|자격|안\s*돼|안\s*되|못\s*받/)) {
      return { intent: "eligibility", slots: { group: has(text, /확인\s*필요/) ? "확인 필요" : null } };
    }
    if (has(text, /신청할|신청\s*가능|뭐\s*신청|무엇을\s*신청|받을\s*수\s*있|혜택|제도/)) return { intent: "apply_list", slots: {} };
    if (has(text, /비교|얼마|내역|이번\s*달|이달|개월/)) return { intent: "compare", slots: { programIds: [], month: month } };
    return { intent: "fallback", slots: {} };
  }

  return {
    INTENTS: INTENTS,
    ALIASES: ALIASES,
    maskSensitive: maskSensitive,
    parseWage: parseWage,
    parseMonths: parseMonths,
    findPrograms: findPrograms,
    parseIntent: parseIntent
  };
});
