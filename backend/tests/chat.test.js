const test = require("node:test");
const assert = require("node:assert");
const Chat = require("../static/js/chat.js");
const Cat = require("../static/js/catalog-verified.js");
const Plan = require("../static/js/plan.js");

const programs = Cat.CATALOG.map(function (p) { return { id: p.id, name: p.name }; });
const P = function (t) { return Chat.parseIntent(t, { programs: programs }); };

test("주민번호·계좌번호·전화번호를 가린다", function () {
  const r = Chat.maskSensitive("제 번호는 900101-1234567이고 계좌는 302-1234-5678-91, 전화 010-1234-5678");
  assert.ok(r.text.indexOf("900101") < 0);
  assert.ok(r.text.indexOf("1234567") < 0);
  assert.ok(r.text.indexOf("302-1234") < 0);
  assert.ok(r.text.indexOf("010-1234") < 0);
  assert.deepStrictEqual(r.found.sort(), ["계좌번호", "전화번호", "주민번호"].sort());
});

test("날짜나 금액은 가리지 않는다", function () {
  const r = Chat.maskSensitive("2026-11-08에 월급 380만 원, 아이 12개월");
  assert.strictEqual(r.text, "2026-11-08에 월급 380만 원, 아이 12개월");
  assert.deepStrictEqual(r.found, []);
});

test("월급 문장을 원 단위로 읽는다", function () {
  assert.strictEqual(Chat.parseWage("월급 380만 원으로 바꿔줘"), 3800000);
  assert.strictEqual(Chat.parseWage("월급 3,200,000원"), 3200000);
  assert.strictEqual(Chat.parseWage("월급 5원"), null);
});

test("의도 분류", function () {
  assert.strictEqual(P("이달 신청할 제도 보여줘").intent, "apply_list");
  assert.strictEqual(P("신청 순서 알려줘").intent, "apply_order");
  assert.strictEqual(P("왜 확인 필요예요?").intent, "eligibility");
  assert.strictEqual(P("왜 확인 필요예요?").slots.group, "확인 필요");
  const g = P("강원 수당은 왜 빠졌어요");
  assert.strictEqual(g.intent, "eligibility");
  assert.deepStrictEqual(g.slots.programIds, ["P06"]);
  const w = P("월급 380만 원으로 바꿔줘");
  assert.strictEqual(w.intent, "set_wage");
  assert.strictEqual(w.slots.wage, 3800000);
  assert.strictEqual(P("둘째 낳으면 얼마 더 받아요?").intent, "second_child");
  const s = P("12개월에 복직하면 어때요");
  assert.strictEqual(s.intent, "simulate");
  assert.strictEqual(s.slots.returnAge, 12);
  assert.strictEqual(P("다음 전환 시기가 언제예요").intent, "calendar");
  const c = P("부모급여랑 아동수당 비교해줘");
  assert.strictEqual(c.intent, "compare");
  assert.deepStrictEqual(c.slots.programIds.sort(), ["P01", "P03"]);
  assert.strictEqual(P("12개월 차에는 얼마 받아요").slots.month, 12);
  assert.strictEqual(P("부모급여 휴직급여 차이").intent, "compare");
});

test("모르는 질문은 fallback이고 숫자 슬롯을 만들지 않는다", function () {
  const r = P("오늘 날씨 어때요");
  assert.strictEqual(r.intent, "fallback");
  assert.deepStrictEqual(r.slots, {});
  assert.strictEqual(P("").intent, "fallback");
});

test("월급 변경 후 합계는 엔진을 직접 부른 값과 같다", function () {
  const a = Object.assign({}, Cat.DEMO_ANSWERS);
  const parsed = P("월급 380만 원으로 바꿔줘");
  const next = Object.assign({}, a, { wage: parsed.slots.wage });
  const opts = { today: Cat.TODAY, horizon: 36 - a.childMonths, returnAge: 12 };
  const direct = Plan.monthlySchedule(Cat.CATALOG, Object.assign({}, a, { wage: 3800000 }), opts);
  const viaChat = Plan.monthlySchedule(Cat.CATALOG, next, opts);
  assert.strictEqual(viaChat.cashTotal, direct.cashTotal);
});

test("합계에서 빠진 이유 질문은 excluded 모드", function () {
  const r = P("합계에서 뺀 제도는 왜 빠졌어요?");
  assert.strictEqual(r.intent, "eligibility");
  assert.strictEqual(r.slots.excluded, true);
});
