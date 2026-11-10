const test = require("node:test");
const assert = require("node:assert/strict");
const cat = require("../static/js/catalog-verified.js");
const plan = require("../static/js/plan.js");
const rules = require("../static/js/rules.js");

const C = cat.CATALOG;
const DAY = cat.TODAY;
const base = { livesInWonju: "yes", singleChild: "yes", childcare: "no", gangwon1y: "yes", birthOrder: "first", returnToWork: "no" };
const ids = function (list) { return list.map(function (x) { return x.id; }).sort(); };

test("검증 카탈로그는 형식 검사를 통과한다", function () {
  assert.deepEqual(plan.validateCatalog(C), []);
  assert.ok(C.every(function (p) { return p.sourceType !== "가상"; }));
});

test("6개월 가정 양육: 부모급여 100만 + 아동수당 10.5만, 강원 수당은 해당 없음, 일시금은 첫만남 200만 + 원주 출생축하금 30만", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 6 }), DAY);
  assert.equal(s.monthlyCash, 1105000);
  assert.equal(s.lumpSum, 2300000);
  assert.deepEqual(ids(s.included), ["P01", "P02", "P03", "P07"]);
});

test("둘째 이상이면 첫만남이용권 300만", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 6, birthOrder: "second_plus" }), DAY);
  assert.equal(s.lumpSum, 3500000, "첫만남 300만 + 출생축하금 둘째 50만");
});

test("15개월: 강원 수당 월 50만 원이 부모급여와 함께 합계에 들어간다", function () {
  const a = Object.assign({}, base, { childMonths: 15 });
  const s = plan.summarize(C, a, DAY);
  assert.equal(s.monthlyCash, 500000 + 500000 + 105000);
  assert.ok(s.included.some(function (e) { return e.id === "P06" && e.amount === 500000; }));
});

test("강원도 1년 미만 거주면 강원 수당은 들어가지 않는다", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 15, gangwon1y: "no" }), DAY);
  assert.ok(!s.included.some(function (e) { return e.id === "P06"; }));
});
test("강원 1년 미만이면 강원 수당은 조건 불일치", function () {
  const r = rules.judgeProgram(C.find(function (p) { return p.id === "P06"; }), Object.assign({}, base, { childMonths: 15, gangwon1y: "no" }), DAY);
  assert.equal(r.status, "조건 불일치");
});

test("어린이집 이용 0세: 부모급여는 현금 41.6만 + 바우처 58.4만으로 나뉜다", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 6, childcare: "yes" }), DAY);
  const it = s.included.find(function (e) { return e.id === "P01"; });
  assert.equal(it.kind, "split");
  assert.equal(it.cash, 416000);
  assert.equal(it.voucher, 584000);
  assert.equal(s.monthlyVoucher, 584000);
});

test("30개월 가정 양육: 강원 수당 50만과 가정양육수당 10만이 함께 들어간다", function () {
  const home = plan.summarize(C, Object.assign({}, base, { childMonths: 30 }), DAY);
  assert.ok(home.included.some(function (e) { return e.id === "P06" && e.amount === 500000; }));
  assert.ok(home.included.some(function (e) { return e.id === "P10" && e.amount === 100000; }));
  assert.equal(home.monthlyCash, 500000 + 100000 + 105000);
});

test("강원도 1년 미만 거주 30개월: 가정양육수당 10만이 그대로 들어간다", function () {
  const home = plan.summarize(C, Object.assign({}, base, { childMonths: 30, gangwon1y: "no" }), DAY);
  assert.ok(home.included.some(function (e) { return e.id === "P10" && e.amount === 100000; }));
});

test("월별 일정: 24~47개월에 가정양육수당과 강원 수당이 함께 들어간다", function () {
  const m = plan.monthlySchedule(C, Object.assign({}, base, { childMonths: 20, returnToWork: "no" }), { returnAge: Infinity, today: DAY });
  m.months.filter(function (r) { return r.ageMonths >= 24 && r.ageMonths < 36; }).forEach(function (r) {
    assert.ok(r.items.some(function (i) { return i.id === "P10"; }), r.ageMonths + "개월 P10");
    assert.ok(r.items.some(function (i) { return i.id === "P06"; }), r.ageMonths + "개월 P06");
  });
});

test("육아휴직급여: 통상임금 300만, 휴직 3개월 시작, 부모 함께 휴직이면 6+6 상한", function () {
  const a = Object.assign({}, base, { childMonths: 4, returnToWork: "yes", wage: 3000000, leaveStartAge: 3, spouseLeave: "yes" });
  const s = plan.monthlySchedule(C, a, { returnAge: 12, today: DAY });
  const leave = function (age) { const m = s.months.find(function (x) { return x.ageMonths === age; }); const it = m && m.items.find(function (i) { return i.id === "P09"; }); return it ? it.amount : 0; };
  assert.equal(leave(4), 2500000, "휴직 2개월차 6+6 상한 250만");
});

test("답이 없으면 보류이고 합계에서 빠진다", function () {
  const s = plan.summarize(C, { livesInWonju: "yes", childMonths: 6, singleChild: "yes", childcare: "no", returnToWork: "no" }, DAY);
  assert.ok(!s.included.some(function (e) { return e.id === "P02"; }));
});

test("30개월 어린이집: 보육료 바우처 42.6만이 들어가고 가정양육수당은 빠진다", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 30, childcare: "yes" }), DAY);
  const it = s.included.find(function (e) { return e.id === "P04"; });
  assert.equal(it.kind, "voucher");
  assert.equal(it.amount, 426000);
  assert.ok(!s.included.some(function (e) { return e.id === "P10"; }));
});

test("0~23개월에는 보육료를 따로 더하지 않는다(부모급여에 포함)", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 10, childcare: "yes" }), DAY);
  assert.ok(!s.included.some(function (e) { return e.id === "P04"; }));
  assert.ok(s.included.some(function (e) { return e.id === "P01" && e.kind === "split"; }));
});

test("아이돌봄: 3개월 이상이면 '확인 필요'로 보이되 합계에서 빠지고, 3개월 미만이면 해당 없음", function () {
  const p = C.find(function (x) { return x.id === "P05"; });
  assert.equal(rules.judgeProgram(p, Object.assign({}, base, { childMonths: 6 }), DAY).status, "확인 필요");
  assert.equal(rules.judgeProgram(p, Object.assign({}, base, { childMonths: 2 }), DAY).status, "조건 불일치");
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 6 }), DAY);
  assert.ok(s.excluded.some(function (e) { return e.id === "P05"; }));
});

test("원주 출생축하금: 둘째는 50만, 조례에 신청 기한이 없어 12개월을 넘어도 합계에 넣는다", function () {
  const p = C.find(function (x) { return x.id === "P07"; });
  const young = Object.assign({}, base, { childMonths: 3, birthOrder: "second" });
  assert.equal(rules.judgeProgram(p, young, DAY).status, "조건 일치");
  const s = plan.summarize(C, young, DAY);
  assert.equal(s.lumpSum, 3500000, "첫만남 300만 + 출생축하금 50만");
  const late = Object.assign({}, base, { childMonths: 15, birthOrder: "second" });
  assert.equal(rules.judgeProgram(p, late, DAY).status, "조건 일치");
  const s2 = plan.summarize(C, late, DAY);
  assert.ok(s2.included.some(function (e) { return e.id === "P07" && e.amount === 500000; }));
  assert.equal(s2.lumpSum, 3500000, "첫만남 300만 + 출생축하금 50만");
});

test("셋째 이상이면 첫만남이용권 300만 + 출생축하금 100만", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 3, birthOrder: "third_plus" }), DAY);
  assert.equal(s.lumpSum, 4000000);
});

test("출산축하 농축산물은 현물이라 합계에 들어가지 않는다", function () {
  const s = plan.summarize(C, Object.assign({}, base, { childMonths: 3 }), DAY);
  assert.ok(s.excluded.some(function (e) { return e.id === "P12"; }));
  assert.ok(!s.included.some(function (e) { return e.id === "P12"; }));
});
