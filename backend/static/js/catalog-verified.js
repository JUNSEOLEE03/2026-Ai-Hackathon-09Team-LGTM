(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // 공식 자료로 확인한 제도만 담은 목록입니다. 근거 URL과 확인 수준은 제도마다 적었습니다.
  // 확인 수준: "공식 확인" = 공식 페이지에서 직접 확인, "부분 확인" = 일부 값은 공식 페이지에서 확인하지 못함.
  // 금액은 2026년 기준 안내값이며 실제 지급액과 다를 수 있습니다.
  const TODAY = "2026-11-08";
  const SRC = "공식 자료";
  const BUNDLE = {
    bundle: "출생 묶음 신청 (행복출산 원스톱)",
    bundleUntilAgeMonths: 2,
    bundleNote: "출생신고 때 주민센터나 정부24에서 여러 제도를 한 번에 신청할 수 있습니다. 이미 출생신고를 했다면 각각 신청합니다."
  };

  function program(fields) {
    return Object.assign({
      region: "원주시",
      level: "중앙정부",
      amountKind: "정액",
      amountPolicy: "fixed",
      sourceType: SRC,
      verification: "공식 확인",
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
      id: "P01",
      apply: Object.assign({ channel: "온라인 또는 방문", where: "복지로, 정부24 또는 행정복지센터", url: "https://www.bokjiro.go.kr" }, BUNDLE),
      name: "부모급여",
      agency: "보건복지부",
      supportKind: "현금",
      payUnit: "월",
      amount: 1000000,
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 24, requiresReturn: false, requiresChildcare: false },
      deadlines: [
        { beforeAgeMonths: 2, title: "부모급여 소급 신청 기한", text: "출생일을 포함해 60일 안에 신청하면 태어난 달부터 받습니다. 늦으면 신청한 달부터 받습니다." }
      ],
      timeline: {
        phase: "any",
        childcareVoucherByAge: [
          { from: 0, to: 12, voucher: 584000 },
          { from: 12, to: 24, voucher: 515000 }
        ],
        amountByAge: [
          { from: 0, to: 12, amount: 1000000 },
          { from: 12, to: 24, amount: 500000 }
        ]
      },
      evidence: [
        { topic: "연령", location: "https://www.korea.kr/multi/visualNewsView.do?newsId=148957936", text: "0~11개월 월 100만 원, 12~23개월 월 50만 원" },
        { topic: "보육", location: "https://www.korea.kr/multi/visualNewsView.do?newsId=148957936", text: "어린이집을 이용하면 보육료 바우처를 먼저 쓰고 차액만 현금으로 받습니다 (0개월반 58.4만 원, 1세반 51.5만 원 기준)" }
      ]
    }),
    program({
      id: "P03",
      apply: Object.assign({ channel: "온라인 또는 방문", where: "복지로, 정부24 또는 행정복지센터", url: "https://www.bokjiro.go.kr" }, BUNDLE),
      name: "아동수당",
      agency: "보건복지부",
      supportKind: "현금",
      payUnit: "월",
      amount: 105000,
      verification: "공식 확인",
      overlapUnverified: false,
      confirmNote: "원주는 인구감소지역이 아니라 비수도권(월 10.5만 원)으로 계산했습니다. 2021년 지정 목록과 2026년 10월 재지정(92곳, 신규는 금정구·동두천시·통영시)에 원주가 없습니다.",
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 108, requiresReturn: false, requiresChildcare: false },
      timeline: { phase: "any" },
      evidence: [
        { topic: "연령", location: "https://www.mohw.go.kr/menu.es?mid=a10711030100", text: "만 9세 미만 (0~107개월)" },
        { topic: "금액", location: "https://www.mohw.go.kr/menu.es?mid=a10711030100", text: "수도권 10만 원, 비수도권 10.5만 원, 인구감소지역은 11만~12만 원" },
        { topic: "지역", location: "https://biz.sbs.co.kr/amp/article/20000338722", text: "2026년 10월 7일 인구감소지역 재지정: 89곳에 부산 금정구·동두천시·통영시 3곳 추가(원주 해당 없음)" },
        { topic: "개정", location: "https://www.bokjiro.go.kr/ssis-tbu/cms/pc/news/news/1309692_1114.html", text: "2026년 3월 20일 개정으로 9세 미만 확대, 비수도권·인구감소지역은 월 최대 2만 원 추가 (복지로 정책브리핑)" }
      ]
    }),
    program({
      id: "P09",
      apply: { channel: "온라인", where: "고용24 (휴직 시작 1개월 후부터 종료 후 12개월 안에 신청)", url: "https://www.work24.go.kr" },
      name: "육아휴직급여",
      agency: "고용노동부",
      supportKind: "현금",
      payUnit: "월",
      amountKind: "임금 비례",
      amountPolicy: "wage",
      amount: null,
      verification: "부분 확인",
      confirmNote: "하한액은 고용노동부가 매년 고시하는 금액이라 월 70만 원은 최종 확인이 필요합니다. 사후지급금(복직 후 6개월 뒤 25%)은 시행령 개정으로 폐지되어 매월 전액 받는 것으로 계산합니다. 한부모 특례(첫 3개월 월 상한 300만 원)는 계산에 넣지 않았습니다.",
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 108, requiresReturn: true, requiresChildcare: false },
      timeline: {
        phase: "before_return",
        leavePay: {
          rate: 0.8,
          rates: [
            { fromMonth: 1, toMonth: 6, rate: 1 },
            { fromMonth: 7, toMonth: 99, rate: 0.8 }
          ],
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
              { fromMonth: 1, toMonth: 1, cap: 2500000 },
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
        { topic: "금액", location: "https://m.work24.go.kr/cm/c/f/1100/selecSystInfo.do?systClId=SC00000251&systId=SI00000402", text: "1~3개월 통상임금 100%(상한 250만 원), 4~6개월 100%(상한 200만 원), 7개월부터 80%(상한 160만 원)" },
        { topic: "특례", location: "https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202410151243158000916", text: "부모가 함께 휴직하면(아이 18개월 안) 첫 6개월 월 상한 250/250/300/350/400/450만 원" },
        { topic: "기간", location: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/999000000008", text: "휴직 시작 1개월 후부터 종료 후 12개월 안에 신청, 고용보험 피보험단위기간 180일 이상" }
      ]
    }),
    program({
      id: "P10",
      apply: { channel: "온라인 또는 방문", where: "복지로 또는 행정복지센터", url: "https://www.bokjiro.go.kr" },
      name: "가정양육수당",
      agency: "보건복지부",
      supportKind: "현금",
      payUnit: "월",
      amount: 100000,
      verification: "부분 확인",
      confirmNote: "월 10만 원은 지자체 공식 안내(동대문구·금천구 등)로 확인했습니다. 강원 육아기본수당과는 함께 받는 것으로 계산했습니다(2026-11-10 원주시 담당 부서 전화 확인, 24개월 이상 가정양육 기준). 복지부 안내의 '기타 양육수당' 범위는 서면으로 확인하지 못했습니다.",
      rules: { requiresWonju: false, minMonths: 24, maxMonthsExclusive: 86, requiresReturn: false, requiresChildcare: false, forbidsChildcare: true },
      timeline: { phase: "any", amountByAge: [{ from: 24, to: 86, amount: 100000 }] },
      evidence: [
        { topic: "연령", location: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00003253", text: "24개월부터 (그 전에는 부모급여)" },
        { topic: "금액", location: "https://www.ddm.go.kr/www/contents.do?key=761", text: "동대문구청 가정양육수당 안내: 24~35개월 10만 원, 36개월 이상 86개월 미만 10만 원 (금천구청 등 다른 지자체 공식 안내도 월 10만 원)" },
        { topic: "보육", location: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00003253", text: "어린이집·유치원·종일제 아이돌봄을 이용하지 않는 가정" },
        { topic: "중복", location: "가정양육수당 공식 안내 페이지(팀 확인, 2026-11-10)", text: "보육료, 부모급여(영아수당), 기타 양육수당, 유아학비와 중복지원 불가. 지자체 육아기본수당이 기타 양육수당에 들어가는지는 명시되어 있지 않음" },
        { topic: "중복", location: "원주시 담당 부서 전화 문의(2026-11-10, 통화 녹취 전사본 보관)", text: "강원 육아기본수당을 받는 24개월 이상 아동이 어린이집을 이용하지 않으면 가정양육수당도 함께 받을 수 있다고 안내받음. 서면 근거는 아님" }
      ]
    }),
    program({
      id: "P02",
      apply: Object.assign({ channel: "온라인 또는 방문", where: "복지로 또는 행정복지센터", url: "https://www.bokjiro.go.kr" }, BUNDLE),
      name: "첫만남이용권",
      agency: "보건복지부",
      supportKind: "바우처",
      payUnit: "일시",
      amount: 2000000,
      overlapUnverified: false,
      lumpDeadlineText: "출생일부터 2년 안에 쓸 수 있으므로 서두르는 편이 좋습니다. 신청 마감일은 따로 확인하지 못했습니다.",
      rules: { requiresWonju: false, minMonths: 0, maxMonthsExclusive: 24, requiresReturn: false, requiresChildcare: false, requiresBirthOrder: true },
      timeline: { phase: "any", amountByOrder: { first: 2000000, secondPlus: 3000000 } },
      evidence: [
        { topic: "금액", location: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00004656", text: "첫째 200만 원, 둘째 이상 300만 원 (국민행복카드 바우처)" },
        { topic: "연령", location: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00004656", text: "사용기간은 출생일부터 2년 (2024년 이후 출생)" }
      ]
    }),
    program({
      id: "P04",
      level: "중앙정부",
      apply: { channel: "온라인 또는 방문", where: "복지로 또는 행정복지센터 (국민행복카드 필요)", url: "https://www.bokjiro.go.kr" },
      name: "영유아 보육료 (어린이집)",
      agency: "보건복지부",
      supportKind: "바우처",
      payUnit: "월",
      amount: 426000,
      verification: "부분 확인",
      confirmNote: "보육료 반은 출생연도 기준이라 개월 수와 조금 어긋날 수 있습니다. 0~23개월은 부모급여에 바우처가 포함되어 따로 더하지 않습니다.",
      rules: { requiresWonju: false, minMonths: 24, maxMonthsExclusive: 72, requiresReturn: false, requiresChildcare: true },
      timeline: {
        phase: "any",
        amountByAge: [
          { from: 24, to: 36, amount: 426000 },
          { from: 36, to: 72, amount: 280000 }
        ]
      },
      evidence: [
        { topic: "금액", location: "https://www.daegu.go.kr/woman/index.do?menu_id=00050122", text: "2026년 부모보육료 2세반 42.6만 원, 3~5세반 28만 원" },
        { topic: "보육", location: "https://www.daegu.go.kr/woman/index.do?menu_id=00050122", text: "어린이집을 이용하는 영유아에게 지원 (가정양육수당과는 택일)" }
      ]
    }),
    program({
      id: "P05",
      level: "중앙정부",
      apply: { channel: "온라인 또는 방문", where: "아이돌봄 누리집, 복지로 또는 행정복지센터 (소득 유형 판정 먼저)", url: "https://www.idolbom.go.kr" },
      name: "아이돌봄서비스",
      agency: "성평등가족부",
      supportKind: "서비스 이용료 지원",
      payUnit: "시간",
      amountKind: "이용 시간 비례",
      amountPolicy: "unavailable",
      amount: null,
      needsCheck: "맞벌이 등 양육 공백 가정이어야 하고, 소득 유형(가~마형)을 먼저 판정받아야 합니다. 이용 시간을 알 수 없어 금액은 합계에 넣지 않습니다.",
      confirmNote: "시간당 12,790원 기준 정부 지원 비율(미취학): 가형 85%, 나형 60%, 다형 30%, 라형 15%, 마형 지원 없음. 원주시 추가 지원은 확인하지 못했습니다.",
      rules: { requiresWonju: false, minMonths: 3, maxMonthsExclusive: 156, requiresReturn: false, requiresChildcare: false },
      timeline: { phase: "any" },
      evidence: [
        { topic: "금액", location: "https://www.incheon.go.kr/welfare/WE0903052", text: "2026년 시간제 12,790원/시간. 정부 지원 가형 85%, 나형 60%, 다형 30%, 라형 15%, 마형 0%" },
        { topic: "연령", location: "https://www.daegu.go.kr/woman/index.do?menu_id=00933197", text: "영아종일제 만 3개월~36개월, 시간제 만 3개월~12세" }
      ]
    }),
    program({
      id: "P07",
      level: "원주시",
      apply: { channel: "방문", where: "읍·면·동 행정복지센터 (출생신고 때 함께 신청, 보육아동과 033-737-2581)", url: null },
      name: "원주시 출생축하금",
      agency: "원주시",
      supportKind: "현금",
      payUnit: "일시",
      amount: 300000,
      confirmNote: "출생일 기준으로 원주에 주민등록을 두고 사는 부 또는 모가 대상이고, 예산 범위에서 지급합니다(조례 '지원할 수 있다'). 신청한 날부터 15일 안에 통장으로 입금됩니다. 둘째는 50만 원, 셋째 이상은 100만 원입니다.",
      lumpDeadlineText: "조례에 신청 기간 제한이 없어, 출생 12개월 이후에 신청해도 됩니다(원주시청 담당 부서 전화 확인). 다만 요즘은 출생신고 때 서비스를 한 번에 신청하도록 절차가 바뀌어 대부분 그때 신청합니다. 신청 후 15일 안에 입금됩니다.",
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 36, requiresReturn: false, requiresChildcare: false, requiresBirthOrder: true },
      timeline: { phase: "any", amountByOrder: { first: 300000, second: 500000, secondPlus: 500000, thirdPlus: 1000000 } },
      evidence: [
        { topic: "금액", location: "https://www.law.go.kr/LSW//ordinInfoP.do?ordinSeq=1788917&chrClsCd=010202&gubun=ELIS", text: "원주시 출생축하금 및 출생아 건강보험료 지원 등에 관한 조례(시행 2025.12.31, 제2592호) 제4조: 첫째 30만 원, 둘째 50만 원, 셋째 이상 100만 원, 다태아는 출생 순서별" },
        { topic: "거주", location: "https://www.law.go.kr/LSW//ordinInfoP.do?ordinSeq=1788917&chrClsCd=010202&gubun=ELIS", text: "제3조: 출생아의 출생일을 기준으로 시 관내에 주민등록을 두고 거주하는 부 또는 모. 제5조: 읍·면·동장이 출생신고서 접수 때 신청 절차를 안내하고 신청인은 통합처리신청서를 제출(신청 기한 규정 없음). 제6조: 신청한 날부터 15일 안에 통장 입금" },
        { topic: "기간", location: "원주시청 담당 부서 전화 확인(2026-11-10, 통화 전사본 보관)", text: "현재 조례상 신청 기간 규정이 없어 출생 후 12개월 시점에 신청해도 무방하다고 안내받음. 출생신고 때 서비스를 한 번에 신청하도록 절차가 바뀌어 대부분 출산 때 신청함" }
      ]
    }),
    program({
      id: "P12",
      level: "원주시",
      apply: { channel: "방문", where: "읍·면·동 행정복지센터 (출생신고 때 함께 신청, 로컬푸드과 033-737-4414)", url: null },
      name: "산모 출산축하 지역 농축산물 지원",
      agency: "원주시",
      supportKind: "현물",
      payUnit: "일시",
      amountPolicy: "in_kind",
      inKindLabel: "출산축하선물 택배(토토미, 치악산 한우, 들기름, 간장, 미역 등)",
      amount: null,
      needsCheck: "현물이라 금액으로 더하지 않습니다. 신청 기한은 가이드북에 적혀 있지 않아 출생신고 때 함께 신청하는 것이 안전합니다. 국외 출생 자녀와 출생 후 1개월 안에 신고하지 않은 경우는 제외됩니다.",
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 36, requiresReturn: false, requiresChildcare: false },
      timeline: { phase: "any" },
      evidence: [
        { topic: "거주", location: "https://www.wonju.go.kr", text: "2026 원주시 생애주기별 가이드북 8쪽: 원주시에 주민등록이 있고 원주시에 출생신고한 가정" },
        { topic: "금액", location: "https://www.wonju.go.kr", text: "출산축하선물 택배 배송(토토미, 치악산 한우, 들기름, 간장, 미역 등)" }
      ]
    }),
    program({
      id: "P06",
      level: "강원도",
      apply: { channel: "온라인 또는 방문", where: "행정복지센터 또는 강원혜택이지", url: "https://easy.gwd.go.kr" },
      name: "강원 육아기본수당",
      agency: "강원특별자치도",
      supportKind: "현금",
      payUnit: "월",
      amount: 500000,
      overlapUnverified: false,
      rules: { requiresWonju: false, minMonths: 12, maxMonthsExclusive: 96, requiresReturn: false, requiresChildcare: false, requiresGangwon1y: true },
      timeline: {
        phase: "any",
        amountByAge: [
          { from: 12, to: 48, amount: 500000 },
          { from: 48, to: 72, amount: 300000 },
          { from: 72, to: 96, amount: 100000 }
        ]
      },
      evidence: [
        { topic: "거주", location: "https://www.wonju.go.kr/welfare/contents.do?key=3743", text: "신청일 기준 부 또는 모가 강원도에 1년 이상 거주" },
        { topic: "중복", location: "강원특별자치도 육아기본수당 사업안내(팀 조사 증빙 2026)", text: "0~11개월은 부모급여로 대체해 미지급, 12개월 이상은 월 50만 원 정상 지급. 12~23개월은 부모급여와 함께 받음" },
        { topic: "중복", location: "https://state.gwd.go.kr/portal/partinfo/welfare/child/nurtureCare", text: "강원도 안내: (0~11개월) 부모급여, (12~47개월) 월 50만 원. 가정양육수당과는 중복 지원 불가(보건복지부 보육사업안내, 팀 조사 증빙)" },
        { topic: "연령", location: "https://state.gwd.go.kr/portal/partinfo/welfare/child/nurtureCare", text: "12~47개월 월 50만 원, 48~71개월 30만 원, 72~95개월 10만 원" }
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
    returnTiming: 6,
    singleChild: "yes",
    childcare: "no",
    gangwon1y: "yes",
    birthOrder: "first"
  };

  return { TODAY: TODAY, CATALOG: CATALOG, DEMO_ANSWERS: DEMO_ANSWERS };
});
