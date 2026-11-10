const test = require("node:test");
const assert = require("node:assert/strict");

const plan = require("../static/js/plan.js");
const cat = require("../static/js/catalog.js");
const data = require("../static/js/data.js");
const rules = require("../static/js/rules.js");

const C = cat.CATALOG;
const A = cat.DEMO_ANSWERS;
const T = cat.TODAY;

test("판정 다섯 상태가 화면용 네 그룹으로 묶인다", function () {
  assert.equal(plan.toGroup("조건 일치"), "해당");
  assert.equal(plan.toGroup("보류"), "확인 필요");
  assert.equal(plan.toGroup("확인 필요"), "확인 필요");
  assert.equal(plan.toGroup("조건 불일치"), "비해당");
  assert.equal(plan.toGroup("신청 기간 종료"), "기간 종료");
  const grouped = plan.groupResults(rules.judgeAll(data.DEMO_ANSWERS));
  assert.deepEqual(Object.keys(grouped), plan.GROUPS);
  assert.equal(grouped["확인 필요"].length, 2);
});

test("현재 합계는 확인된 항목만 더하고 월 현금과 일시금을 나눈다", function () {
  const s = plan.summarize(C, A, T);
  assert.equal(s.monthlyCash, 1000000 + 100000 + 2000000);
  assert.equal(s.lumpSum, 2000000);
  assert.equal(s.monthlyVoucher, 0);
  assert.ok(s.excluded.some(function (e) { return e.id === "V6"; }), "중복 미확인 항목은 합계에서 빠진다");
  assert.ok(!s.included.some(function (e) { return e.id === "V4"; }), "12개월 미만이면 복직 지원은 해당 없음");
});

test("어린이집을 이용하면 양육 수당은 현금이 아니라 바우처로 따로 잡힌다", function () {
  const s = plan.summarize(C, Object.assign({}, A, { childcare: "yes" }), T);
  assert.equal(s.monthlyCash, 100000 + 2000000);
  assert.equal(s.monthlyVoucher, 1000000);
});

test("월별 배열은 복직 전후로 항목이 바뀐다", function () {
  const r = plan.monthlySchedule(C, A, { today: T, returnAge: 12, horizon: 18 });
  assert.equal(r.months.length, 18);
  const m6 = r.months[0];
  assert.equal(m6.ageMonths, 6);
  assert.ok(m6.items.some(function (i) { return i.id === "V3"; }), "복직 전에는 휴직 중 소득 보전이 있다");
  const m12 = r.months[6];
  assert.equal(m12.ageMonths, 12);
  assert.ok(!m12.items.some(function (i) { return i.id === "V3"; }), "복직 후에는 소득 보전이 없다");
  assert.ok(m12.items.some(function (i) { return i.id === "V4"; }), "복직 후 원주 돌봄 지원이 시작된다");
  assert.equal(m12.cash, 500000 + 100000 + 120000);
  assert.equal(r.lumpTotal, 2000000);
  assert.ok(!m6.items.some(function (i) { return i.id === "V6"; }), "확인 필요 항목은 월별 합계에도 없다");
});

test("복직 시점을 바꾸면 총액 차이가 계산된다", function () {
  const c = plan.compareReturn(C, A, 12, 18, { today: T, horizon: 18 });
  const expected = 3 * 1600000 - 6 * 120000;
  assert.equal(c.cashDiff, expected);
  assert.equal(c.a.lumpTotal, c.b.lumpTotal);
});

test("복직 계획이 없으면 복직 후 지원은 계산에 들어가지 않는다", function () {
  const r = plan.monthlySchedule(C, Object.assign({}, A, { returnToWork: "no" }), { today: T, horizon: 18 });
  r.months.forEach(function (m) {
    assert.ok(!m.items.some(function (i) { return i.id === "V4"; }));
  });
});

test("월 날짜 계산은 해를 넘긴다", function () {
  assert.equal(plan.addMonths("2026-11-08", 2), "2027-01-01");
  assert.equal(plan.addMonths("2026-12-01", 12), "2027-12-01");
});

test("가상 카탈로그는 형식 검사를 통과하고, 실제 데이터는 근거 URL이 필요하다", function () {
  assert.deepEqual(plan.validateCatalog(C), []);
  const real = Object.assign({}, C[1], { id: "R1", sourceType: "공식" });
  const problems = plan.validateCatalog([real]);
  assert.ok(problems.some(function (p) { return p.indexOf("근거 URL") >= 0; }));
  const broken = Object.assign({}, C[0], { id: "B1", timeline: { amountByAge: [{ from: 12, to: 6, amount: 1 }] } });
  assert.ok(plan.validateCatalog([broken]).some(function (p) { return p.indexOf("구간") >= 0; }));
});

test("휴직 소득은 기간 상한이 있어, 복직을 아무리 늦춰도 계속 늘지 않는다", function () {
  const c18 = plan.monthlySchedule(C, A, { today: T, returnAge: 18 });
  const c35 = plan.monthlySchedule(C, A, { today: T, returnAge: 35 });
  assert.ok(c35.cashTotal < c18.cashTotal, "18개월 이후 복직을 미루면 복직 후 지원만 줄어든다");
});

test("이미 복직했으면 현재 합계에 휴직 중 소득이 들어가지 않는다", function () {
  const s = plan.summarize(C, A, T, { returnAge: 6 });
  assert.ok(!s.included.some(function (i) { return i.id === "V3"; }));
  assert.equal(s.monthlyCash, 1000000 + 100000);
});

test("자녀가 여러 명이어도 가장 어린 아이 기준으로 똑같이 계산한다", function () {
  const one = plan.summarize(C, Object.assign({}, A, { singleChild: "yes" }), T);
  const many = plan.summarize(C, Object.assign({}, A, { singleChild: "no" }), T);
  assert.equal(many.monthlyCash, one.monthlyCash);
  assert.ok(many.monthlyCash > 0);
  assert.ok(many.excluded.every(function (e) { return e.reason.indexOf("자녀가 한 명이 아니라") < 0; }));
});

test("휴직 급여는 통상임금과 휴직 개월차에 따라 상한이 바뀌고 하한이 있다", function () {
  const r = plan.monthlySchedule(C, A, { today: T, returnAge: 30, horizon: 12 });
  const v3 = function (age) { const m = r.months.find(function (x) { return x.ageMonths === age; }); const it = m.items.find(function (i) { return i.id === "V3"; }); return it ? it.amount : 0; };
  assert.equal(v3(6), 2000000, "4개월차: 240만 원이 상한 200만 원에 걸림");
  assert.equal(v3(9), 1600000, "7개월차: 상한 160만 원");
  assert.equal(v3(14), 1600000, "12개월차까지 지급");
  assert.equal(v3(15), 0, "13개월차부터 없음");
  const low = plan.monthlySchedule(C, Object.assign({}, A, { wage: 800000 }), { today: T, returnAge: 30, horizon: 1 });
  assert.equal(low.months[0].items.find(function (i) { return i.id === "V3"; }).amount, 700000, "하한 70만 원");
});

test("통상임금을 모르면 휴직 급여는 합계에서 빼고 이유를 알려 준다", function () {
  const s = plan.summarize(C, Object.assign({}, A, { wage: null }), T);
  assert.ok(!s.included.some(function (i) { return i.id === "V3"; }));
  assert.ok(s.excluded.some(function (e) { return e.id === "V3" && e.reason.indexOf("통상임금") >= 0; }));
});

test("배우자도 휴직하면 특례 상한과 18개월 기간이 적용된다", function () {
  const B = Object.assign({}, A, { spouseLeave: "yes" });
  const r = plan.monthlySchedule(C, B, { today: T, returnAge: 30, horizon: 20 });
  const v3 = function (age) { const m = r.months.find(function (x) { return x.ageMonths === age; }); const it = m.items.find(function (i) { return i.id === "V3"; }); return it ? it.amount : 0; };
  assert.equal(v3(6), 3000000, "4개월차 특례: 통상임금 100%, 상한 350만 원 안");
  assert.equal(v3(9), 1600000, "7개월차부터 일반 상한");
  assert.equal(v3(20), 1600000, "18개월차까지 지급");
  assert.equal(v3(21), 0);
});

test("사후지급 비율이 있으면 복직 6개월 뒤에 모아서 지급한다", function () {
  const custom = JSON.parse(JSON.stringify(C));
  custom.find(function (p) { return p.id === "V3"; }).timeline.leavePay.deferredRatio = 0.25;
  const r = plan.monthlySchedule(custom, A, { today: T, returnAge: 9, horizon: 12 });
  const m6 = r.months[0].items.find(function (i) { return i.id === "V3"; });
  assert.equal(m6.amount, 1500000, "휴직 중에는 75%만");
  const paid = r.months.find(function (m) { return m.ageMonths === 15; }).items.find(function (i) { return i.deferred; });
  assert.equal(paid.amount, 3 * 500000, "복직 6개월 뒤 25%분 합산");
  const full = plan.monthlySchedule(C, A, { today: T, returnAge: 9, horizon: 12 });
  assert.equal(r.cashTotal, full.cashTotal, "기간 안이면 총액은 같다");
});

test("앞으로 챙길 일: 금액 변경, 복직, 지급 끝, 신청 마감이 시점 순으로 나온다", function () {
  const ev = plan.events(C, A, { today: T, returnAge: 12 });
  const titles = ev.map(function (e) { return e.offset + ":" + e.type + ":" + e.programId; });
  assert.ok(titles.indexOf("3:change:V3") >= 0, "휴직 7개월차에 상한이 바뀐다");
  assert.ok(titles.indexOf("5:deadline:V5") >= 0, "일시금은 12개월 전 마감");
  assert.ok(titles.indexOf("6:return:null") >= 0);
  assert.ok(titles.indexOf("6:end:V3") >= 0);
  assert.ok(titles.indexOf("6:start:V4") >= 0, "복직 후 원주 지원 시작");
  assert.ok(titles.indexOf("18:end:V1") >= 0, "24개월에 양육 수당 끝");
  for (let i = 1; i < ev.length; i += 1) assert.ok(ev[i - 1].offset <= ev[i].offset);
  assert.equal(ev.find(function (e) { return e.programId === "V5"; }).date, "2027-04-01");
});

test("출생 직후라면 소급 기한이 가장 급한 일로 잡힌다", function () {
  const B = Object.assign({}, A, { childMonths: 1, leaveStartAge: 0 });
  const ev = plan.events(C, B, { today: T, returnAge: 12 });
  const dl = ev.find(function (e) { return e.type === "deadline" && e.programId === "V1"; });
  assert.ok(dl && dl.urgent && dl.offset === 0);
  const order = plan.applyOrder(["V1", "V2", "V3", "V5"], C, ev, 1);
  assert.equal(order[0].title, "마감이 가까운 것부터");
  assert.deepEqual(order[0].ids, ["V1"]);
  assert.ok(order[1].title.indexOf("한 번에 신청") === 0, "출생 직후에는 묶음 신청을 권한다");
});

test("출생신고가 지난 뒤에는 묶음 신청 대신 따로 신청하도록 안내한다", function () {
  const ev = plan.events(C, A, { today: T, returnAge: 12 });
  const order = plan.applyOrder(["V1", "V2", "V3", "V5"], C, ev, 6);
  assert.ok(order.every(function (g) { return g.title.indexOf("한 번에 신청") < 0; }));
  const all = order.reduce(function (a, g) { return a.concat(g.ids); }, []).sort();
  assert.deepEqual(all, ["V1", "V2", "V3", "V5"], "모든 제도가 빠짐없이 한 번씩 들어간다");
  assert.deepEqual(plan.upcoming(["V1", "V2", "V3", "V5"], ev).map(function (e) { return e.programId; }), ["V4"]);
});

test("달력 파일은 규격에 맞고 마감에는 일주일 전 알림이 붙는다", function () {
  const ev = plan.events(C, A, { today: T, returnAge: 12 });
  const ics = plan.toICS(ev, { stamp: T });
  const lines = ics.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, ev.length);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, ev.filter(function (e) { return e.type === "deadline"; }).length);
  assert.ok(lines.every(function (l) { return Buffer.byteLength(l, "utf8") <= 75; }), "한 줄 75바이트 이하");
  assert.ok(ics.indexOf("2\\,000\\,000") >= 0, "쉼표는 이스케이프된다");
});

test("한 제도의 금액이 몇 달 연속 바뀌면 일정 하나로 묶는다", function () {
  const B = Object.assign({}, A, { childMonths: 0, leaveStartAge: 0, spouseLeave: "yes" });
  const ev = plan.events(C, B, { today: T, returnAge: 12 });
  const changes = ev.filter(function (e) { return e.type === "change" && e.programId === "V3"; });
  assert.equal(changes.length, 2, "1~2개월 연속 변경은 하나, 6개월 변경은 따로");
  assert.ok(changes[0].detail.indexOf("→") > 0);
});
