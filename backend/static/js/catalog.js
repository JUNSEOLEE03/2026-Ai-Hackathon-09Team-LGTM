(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // 전부 가상 데이터입니다. 제도 결정표(③)가 오면 같은 형식으로 교체합니다.
  // 금액은 계산 흐름 확인용이며 실제 지급액이 아닙니다.
  const TODAY = "2026-11-08";

  function program(fields) {
    return Object.assign({
      region: "원주시",
      level: "원주시", // 운영 주체: "중앙정부" | "강원도" | "원주시" (화면 필터용)
      amountKind: "정액",
      amountPolicy: "fixed",
      sourceType: "가상",
      verification: "미검토",
      confirmedOn: TODAY,
      periodStart: null,
      periodEnd: null,
      periodEndVerified: true,
      overlapUnverified: false,
      documents: [],
      apply: null,
      method: "확인 필요",
      office: "확인 필요",
      virtualPath: null,
      timeline: null
    }, fields);
  }

  const CATALOG = [
    program({
      id: "V1",
      level: "중앙정부",
      apply: { channel: "온라인 또는 방문", where: "복지로 또는 주민센터", url: "https://www.bokjiro.go.kr", bundle: "출생 묶음 신청 (행복출산 원스톱 예시)", bundleUntilAgeMonths: 2, bundleNote: "출생신고 때 주민센터나 정부24에서 여러 제도를 한 번에 신청하는 방식입니다. 이미 출생신고를 했다면 각각 신청합니다." },
      name: "가상 영아 양육 수당",
      agency: "가상 중앙 부처",
      supportKind: "현금",
      payUnit: "월",
      amount: null,
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 24, requiresReturn: false, requiresChildcare: false },
      deadlines: [
        { beforeAgeMonths: 2, title: "가상 영아 양육 수당 소급 신청 기한", text: "출생 후 60일 안에 신청해야 태어난 달부터 받습니다 (가상 규칙. 공식 확인 필요)." }
      ],
      timeline: {
        phase: "any",
        voucherWhenChildcare: true,
        amountByAge: [
          { from: 0, to: 12, amount: 1000000 },
          { from: 12, to: 24, amount: 500000 }
        ]
      },
      evidence: [
        { topic: "연령", location: "가상 문서 V1", text: "0개월 이상 24개월 미만" },
        { topic: "금액", location: "가상 문서 V1", text: "0~11개월 월 100만 원, 12~23개월 월 50만 원 (가상). 어린이집 이용 시 바우처로 전환" }
      ]
    }),
    program({
      id: "V2",
      level: "중앙정부",
      apply: { channel: "온라인 또는 방문", where: "복지로 또는 주민센터", url: "https://www.bokjiro.go.kr", bundle: "출생 묶음 신청 (행복출산 원스톱 예시)", bundleUntilAgeMonths: 2, bundleNote: "출생신고 때 주민센터나 정부24에서 여러 제도를 한 번에 신청하는 방식입니다. 이미 출생신고를 했다면 각각 신청합니다." },
      name: "가상 아동 기본 수당",
      agency: "가상 중앙 부처",
      supportKind: "현금",
      payUnit: "월",
      amount: 100000,
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 96, requiresReturn: false, requiresChildcare: false },
      timeline: { phase: "any" },
      evidence: [
        { topic: "연령", location: "가상 문서 V2", text: "0개월 이상 96개월 미만" },
        { topic: "금액", location: "가상 문서 V2", text: "월 10만 원 (가상)" }
      ]
    }),
    program({
      id: "V3",
      level: "중앙정부",
      apply: { channel: "온라인", where: "고용24 (회사가 확인서 제출 후 본인 신청)", url: "https://www.work24.go.kr" },
      name: "가상 휴직 중 소득 보전",
      agency: "가상 고용 기관",
      supportKind: "현금",
      payUnit: "월",
      amountKind: "임금 비례",
      amountPolicy: "wage",
      amount: null,
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 96, requiresReturn: true, requiresChildcare: false },
      timeline: {
        phase: "before_return",
        leavePay: {
          rate: 0.8,
          floor: 700000,
          caps: [
            { fromMonth: 1, toMonth: 3, cap: 2500000 },
            { fromMonth: 4, toMonth: 6, cap: 2000000 },
            { fromMonth: 7, toMonth: 99, cap: 1600000 }
          ],
          maxMonths: 12,
          maxMonthsWithSpouse: 18,
          deferredRatio: 0,
          special: {
            withinChildMonths: 18,
            rate: 1.0,
            caps: [
              { fromMonth: 1, toMonth: 1, cap: 2000000 },
              { fromMonth: 2, toMonth: 2, cap: 2500000 },
              { fromMonth: 3, toMonth: 3, cap: 3000000 },
              { fromMonth: 4, toMonth: 4, cap: 3500000 },
              { fromMonth: 5, toMonth: 5, cap: 4000000 },
              { fromMonth: 6, toMonth: 6, cap: 4500000 }
            ]
          }
        }
      },
      evidence: [
        { topic: "금액", location: "가상 문서 V3", text: "통상임금의 80%, 휴직 1~3개월 상한 250만 원, 4~6개월 200만 원, 7개월부터 160만 원, 하한 70만 원 (가상 구조. 공식 확인 필요)" },
        { topic: "기간", location: "가상 문서 V3", text: "최대 12개월, 배우자도 휴직하면 18개월 (가상)" },
        { topic: "특례", location: "가상 문서 V3", text: "배우자도 아이 18개월 안에 휴직하면 첫 6개월은 통상임금 100%, 상한 200만~450만 원 (가상 구조. 공식 확인 필요)" },
        { topic: "사후지급", location: "가상 문서 V3", text: "사후지급 비율 0%로 가정. 제도 개정 여부 공식 확인 필요" }
      ]
    }),
    program({
      id: "V4",
      level: "원주시",
      apply: { channel: "방문 필수", where: "가상 원주시 창구 (평일 9~18시)", url: null },
      name: "가상 원주 복직 돌봄 지원",
      agency: "가상 원주시 창구",
      supportKind: "현금",
      payUnit: "월",
      amount: 120000,
      rules: { requiresWonju: true, minMonths: 12, maxMonthsExclusive: 36, requiresReturn: true, requiresChildcare: false },
      timeline: { phase: "after_return" },
      evidence: [
        { topic: "연령", location: "가상 문서 V4", text: "12개월 이상 36개월 미만" },
        { topic: "거주", location: "가상 문서 V4", text: "원주시 거주" },
        { topic: "복직", location: "가상 문서 V4", text: "보호자 복직 후 지급" },
        { topic: "금액", location: "가상 문서 V4", text: "월 12만 원 (가상)" }
      ]
    }),
    program({
      id: "V5",
      level: "중앙정부",
      apply: { channel: "온라인 또는 방문", where: "정부24 또는 주민센터", url: "https://www.gov.kr", bundle: "출생 묶음 신청 (행복출산 원스톱 예시)", bundleUntilAgeMonths: 2, bundleNote: "출생신고 때 주민센터나 정부24에서 여러 제도를 한 번에 신청하는 방식입니다. 이미 출생신고를 했다면 각각 신청합니다." },
      name: "가상 출생 축하 일시금",
      agency: "가상 중앙 부처",
      supportKind: "현금",
      payUnit: "일시",
      amount: 2000000,
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 12, requiresReturn: false, requiresChildcare: false },
      evidence: [
        { topic: "연령", location: "가상 문서 V5", text: "출생 후 12개월 미만 신청" },
        { topic: "금액", location: "가상 문서 V5", text: "일시금 200만 원 (가상)" }
      ]
    }),
    program({
      id: "V6",
      level: "원주시",
      apply: { channel: "온라인", where: "원주시청 누리집", url: "https://www.wonju.go.kr" },
      name: "가상 원주 양육 추가 수당",
      agency: "가상 원주시 창구",
      supportKind: "현금",
      payUnit: "월",
      amount: 50000,
      overlapUnverified: true,
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 36, requiresReturn: false, requiresChildcare: false },
      timeline: { phase: "any" },
      evidence: [
        { topic: "거주", location: "가상 문서 V6", text: "원주시 거주" },
        { topic: "중복", location: "가상 문서 V6", text: "다른 수당과 중복 가능 여부 미확인 (가상)" }
      ]
    })
  ];

  const DEMO_ANSWERS = {
    livesInWonju: "yes",
    childMonths: 6,
    wage: 3000000,
    leaveStartAge: 3,
    spouseLeave: "no",
    returnToWork: "yes",
    returnTiming: "within_6",
    singleChild: "yes",
    childcare: "no"
  };

  return { TODAY: TODAY, CATALOG: CATALOG, DEMO_ANSWERS: DEMO_ANSWERS };
});
