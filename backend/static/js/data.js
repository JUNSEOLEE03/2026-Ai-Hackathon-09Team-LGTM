(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TODAY = "2026-11-08";

  const PROGRAMS = [
    {
      id: "A",
      name: "가상 영유아 복직 돌봄 지원",
      agency: "가상 원주 육아지원 창구",
      region: "원주시",
      supportKind: "현금",
      payUnit: "월",
      amountKind: "정액",
      amount: 120000,
      amountPolicy: "fixed",
      sourceType: "가상",
      verification: "미검토",
      confirmedOn: "2026-11-07",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      periodEndVerified: true,
      overlapUnverified: false,
      documents: ["가상 복직 예정 확인서", "가상 주민등록등본", "가상 자녀 관계 확인 서류"],
      method: "가상 온라인 접수 또는 가상 방문 창구",
      office: "가상 원주 육아지원 창구 (실제 기관 아님)",
      virtualPath: "예시-가상/복직-돌봄-접수",
      rules: { requiresWonju: true, minMonths: 12, maxMonthsExclusive: 36, requiresReturn: true, requiresChildcare: false },
      evidence: [
        { topic: "연령", location: "가상 규칙 문서 A · 조건 표 1행", text: "12개월 이상 36개월 미만" },
        { topic: "거주", location: "가상 규칙 문서 A · 조건 표 2행", text: "원주시 거주" },
        { topic: "복직", location: "가상 규칙 문서 A · 조건 표 3행", text: "보호자가 복직 예정" },
        { topic: "금액", location: "가상 규칙 문서 A · 금액 표 1행", text: "월 정액 120000원 (가상 금액)" },
        { topic: "기간", location: "가상 규칙 문서 A · 기간", text: "2026-01-01부터 2026-12-31까지. 종료일 확정" },
        { topic: "서류", location: "가상 규칙 문서 A · 서류 목록", text: "가상 복직 예정 확인서, 가상 주민등록등본, 가상 자녀 관계 확인 서류" }
      ]
    },
    {
      id: "B",
      name: "가상 보육 시설 연계 지원",
      agency: "가상 원주 육아지원 창구",
      region: "원주시",
      supportKind: "바우처",
      payUnit: "월",
      amountKind: "상한",
      amount: 80000,
      amountPolicy: "fixed",
      sourceType: "가상",
      verification: "미검토",
      confirmedOn: "2026-11-07",
      periodStart: "2026-03-01",
      periodEnd: "2026-12-31",
      periodEndVerified: true,
      overlapUnverified: false,
      documents: ["가상 보육 시설 이용 확인 메모"],
      method: "가상 방문 창구",
      office: "가상 원주 육아지원 창구 (실제 기관 아님)",
      virtualPath: "예시-가상/보육-시설-연계",
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 36, requiresReturn: false, requiresChildcare: true },
      evidence: [
        { topic: "연령", location: "가상 규칙 문서 B · 조건 표 1행", text: "0개월 이상 36개월 미만" },
        { topic: "거주", location: "가상 규칙 문서 B · 조건 표 2행", text: "원주시 거주" },
        { topic: "보육", location: "가상 규칙 문서 B · 조건 표 3행", text: "보육 시설 이용 여부가 있어야 판정" },
        { topic: "금액", location: "가상 규칙 문서 B · 금액 표 1행", text: "월 바우처 상한 80000원 (가상 금액, 현금 합산 아님)" },
        { topic: "기간", location: "가상 규칙 문서 B · 기간", text: "2026-03-01부터 2026-12-31까지. 종료일 확정" }
      ]
    },
    {
      id: "C",
      name: "가상 중복 가능 돌봄 수당",
      agency: "가상 원주 육아지원 창구",
      region: "원주시",
      supportKind: "현금",
      payUnit: "월",
      amountKind: "미정",
      amount: null,
      amountPolicy: "unavailable",
      sourceType: "가상",
      verification: "미검토",
      confirmedOn: "2026-11-07",
      periodStart: null,
      periodEnd: null,
      periodEndVerified: false,
      overlapUnverified: true,
      documents: ["가상 중복 여부 확인 메모"],
      method: "확인할 접수처가 가상 규칙에 없음",
      office: "가상 안내 (실제 기관 아님)",
      virtualPath: "예시-가상/중복-확인",
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 36, requiresReturn: false, requiresChildcare: false },
      evidence: [
        { topic: "연령", location: "가상 규칙 문서 C · 조건 표 1행", text: "0개월 이상 36개월 미만" },
        { topic: "거주", location: "가상 규칙 문서 C · 조건 표 2행", text: "원주시 거주" },
        { topic: "중복", location: "가상 규칙 문서 C · 미확인 표 1행", text: "가상 영유아 복직 돌봄 지원과 중복 가능 여부가 원문에 없음" },
        { topic: "기간", location: "가상 규칙 문서 C · 미확인 표 2행", text: "신청 종료일을 확인할 문장이 없음" },
        { topic: "금액", location: "가상 규칙 문서 C · 금액", text: "근거 위치가 없어 산출 불가" }
      ]
    },
    {
      id: "D",
      name: "가상 영아 초기 집중 지원",
      agency: "가상 원주 육아지원 창구",
      region: "원주시",
      supportKind: "현금",
      payUnit: "일회성",
      amountKind: "정액",
      amount: 200000,
      amountPolicy: "fixed",
      sourceType: "가상",
      verification: "미검토",
      confirmedOn: "2026-11-07",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      periodEndVerified: true,
      overlapUnverified: false,
      documents: ["가상 자녀 개월 수 메모"],
      method: "가상 온라인 접수",
      office: "가상 원주 육아지원 창구 (실제 기관 아님)",
      virtualPath: "예시-가상/영아-초기",
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 12, requiresReturn: false, requiresChildcare: false },
      evidence: [
        { topic: "연령", location: "가상 규칙 문서 D · 조건 표 1행", text: "0개월 이상 12개월 미만" },
        { topic: "거주", location: "가상 규칙 문서 D · 조건 표 2행", text: "원주시 거주" },
        { topic: "금액", location: "가상 규칙 문서 D · 금액 표 1행", text: "일회성 정액 200000원 (가상 금액)" },
        { topic: "기간", location: "가상 규칙 문서 D · 기간", text: "2026-01-01부터 2026-12-31까지. 종료일 확정" }
      ]
    },
    {
      id: "E",
      name: "가상 상반기 한정 육아 물품",
      agency: "가상 원주 육아지원 창구",
      region: "원주시",
      supportKind: "물품",
      payUnit: "일회성",
      amountKind: "현물",
      amount: null,
      amountPolicy: "in_kind",
      inKindLabel: "가상 돌봄 꾸러미 1회",
      sourceType: "가상",
      verification: "미검토",
      confirmedOn: "2026-11-07",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      periodEndVerified: true,
      overlapUnverified: false,
      documents: ["가상 수령 확인 메모"],
      method: "가상 방문 창구",
      office: "가상 원주 육아지원 창구 (실제 기관 아님)",
      virtualPath: "예시-가상/상반기-물품",
      rules: { requiresWonju: true, minMonths: 0, maxMonthsExclusive: 36, requiresReturn: false, requiresChildcare: false },
      evidence: [
        { topic: "기간", location: "가상 규칙 문서 E · 기간", text: "2026-06-30 종료. 종료일 확정" },
        { topic: "연령", location: "가상 규칙 문서 E · 조건 표 1행", text: "0개월 이상 36개월 미만" },
        { topic: "물품", location: "가상 규칙 문서 E · 지원 표 1행", text: "가상 돌봄 꾸러미 1회. 원화로 환산하지 않음" }
      ]
    }
  ];

  const QUESTIONS = [
    {
      id: "livesInWonju",
      prompt: "원주에 살고 계신가요?",
      help: "상세 주소는 묻지 않습니다.",
      options: [
        { value: "yes", label: "예, 원주에 삽니다" },
        { value: "no", label: "아니오" }
      ]
    },
    {
      id: "childMonths",
      prompt: "자녀는 몇 개월인가요?",
      help: "생년월일 대신 개월 수만 받습니다. 한 명 기준입니다.",
      kind: "months"
    },
    {
      id: "returnToWork",
      prompt: "복직을 준비 중인가요?",
      help: "맞벌이만 쓸 수 있다는 뜻이 아닙니다. 이 질문은 가상 규칙의 복직 조건을 보는 용도입니다.",
      options: [
        { value: "yes", label: "예" },
        { value: "no", label: "아니오" },
        { value: "na", label: "해당 없음" }
      ]
    },
    {
      id: "returnTiming",
      prompt: "복직 예정 시점은 언제인가요?",
      help: "복직 준비가 예일 때만 답하면 됩니다. 시점 자체로 탈락시키지 않습니다.",
      when: "returnYes",
      options: [
        { value: "this_quarter", label: "이번 분기" },
        { value: "next_quarter", label: "다음 분기" },
        { value: "unknown", label: "아직 모름" }
      ]
    },
    {
      id: "singleChild",
      prompt: "이번 검토를 자녀 1명 기준으로 볼 수 있나요?",
      help: "여러 자녀를 한 서류에 자동으로 합치지 않기 위한 질문입니다.",
      options: [
        { value: "yes", label: "예, 1명 기준" },
        { value: "no", label: "아니오, 여러 명" }
      ]
    }
  ];

  const FOLLOWUP = {
    id: "childcare",
    prompt: "어린이집 등 보육 시설을 이용 중인가요?",
    help: "가상 보육 시설 연계 지원을 보류에서 풀 때만 묻습니다.",
    options: [
      { value: "yes", label: "이용 중" },
      { value: "no", label: "이용하지 않음" }
    ]
  };

  const DEMO_ANSWERS = {
    livesInWonju: "yes",
    childMonths: 23,
    returnToWork: "yes",
    returnTiming: "next_quarter",
    singleChild: "yes",
    childcare: null
  };

  const GUIDE = {
    mode: "합성 시연",
    programName: "가상 영유아 복직 돌봄 지원",
    version: "v0-합성",
    reviewedOn: "2026-11-07",
    validUntil: "2026-11-14",
    verification: "미검토",
    imageType: "가상 장면",
    virtualPath: "예시-가상/복직-돌봄-접수",
    scenes: [
      {
        id: "G1",
        title: "시작",
        body: "공식 사이트를 직접 여는 단계입니다. 이 화면은 합성 시연이라 실제 주소가 아닙니다.",
        highlights: [
          { n: 1, text: "대상 제도와 안내 버전을 확인합니다." },
          { n: 2, text: "기관이 만들거나 승인한 안내가 아님을 확인합니다." }
        ]
      },
      {
        id: "G2",
        title: "로그인",
        body: "로그인과 본인 인증은 공식 사이트에서 직접 합니다. 여기에는 아이디, 비밀번호, 인증번호 칸이 없습니다.",
        highlights: [
          { n: 1, text: "아이디 칸의 위치만 설명합니다. 값은 받지 않습니다." },
          { n: 2, text: "비밀번호 칸의 뜻만 설명합니다. 예시 값도 없습니다." },
          { n: 3, text: "인증번호 칸의 위치만 설명합니다. 입력칸이 아닙니다." }
        ]
      },
      {
        id: "G3",
        title: "입력",
        body: "공식 화면에 어떤 종류의 정보를 넣는지만 알려 줍니다. 자녀 정보 값은 받지 않습니다.",
        highlights: [
          { n: 1, text: "자녀 생년월일 종류의 정보를 넣는 자리입니다." },
          { n: 2, text: "보호자 연락처 종류의 자리입니다. 번호를 적지 않습니다." },
          { n: 3, text: "다음으로 넘어가는 버튼의 위치입니다." }
        ]
      },
      {
        id: "G4",
        title: "첨부",
        body: "어느 칸에 어떤 서류를 첨부하는지만 보여 줍니다. 파일은 여기서 받지 않습니다.",
        highlights: [
          { n: 1, text: "가상 복직 예정 확인서를 첨부하는 칸입니다." },
          { n: 2, text: "파일 형식 주의: 공식 사이트의 안내를 따르세요. 여기서 검사하지 않습니다." }
        ]
      },
      {
        id: "G5",
        title: "제출 전",
        body: "제출 전 확인할 항목과 누를 버튼의 위치입니다. 이 서비스가 대신 제출하지 않습니다.",
        highlights: [
          { n: 1, text: "입력한 종류가 맞는지 공식 화면에서 직접 확인합니다." },
          { n: 2, text: "첨부 파일이 붙었는지 공식 화면에서 직접 확인합니다." },
          { n: 3, text: "제출 버튼의 위치입니다. 여기서 누르는 버튼이 아닙니다." }
        ]
      },
      {
        id: "G6",
        title: "끝",
        body: "안내 진행을 모두 확인해도 기관 접수가 된 것은 아닙니다. 접수증을 받으면 대시보드에 올려 따로 등록할 수 있습니다.",
        highlights: [
          { n: 1, text: "접수증을 파일 근거로 올리라는 안내입니다." },
          { n: 2, text: "이 진행 체크는 신청·선정 상태와 별개입니다." }
        ]
      }
    ]
  };

  const SAMPLES = [
    { file: "samples/notice-a.pdf", label: "합성 공고문 A", note: "조건·서류·마감만 있습니다. 신청·선정 상태가 되면 안 됩니다." },
    { file: "samples/receipt-a.pdf", label: "합성 접수증 A", note: "신청함 초안입니다. 문장을 확인한 뒤에만 등록됩니다." },
    { file: "samples/selection-a.pdf", label: "합성 선정 통지서 A", note: "선정과 지급 예정 금액입니다. 수령 합계에 넣지 않습니다." },
    { file: "samples/unknown-c.pdf", label: "합성 근거 미확인 안내", note: "상태를 판단할 문장이 없습니다." },
    { file: "samples/multi.pdf", label: "합성 복수 제도", note: "제도가 둘이라 자동으로 합치지 않습니다." },
    { file: "samples/blank.pdf", label: "텍스트 없는 PDF", note: "처리 불가로 두고 서버로 보내지 않습니다." }
  ];

  return {
    TODAY,
    PROGRAMS,
    QUESTIONS,
    FOLLOWUP,
    DEMO_ANSWERS,
    GUIDE,
    SAMPLES,
    PII_EXCLUDED: ["이름", "주민등록번호", "계좌", "상세 주소"]
  };
});
