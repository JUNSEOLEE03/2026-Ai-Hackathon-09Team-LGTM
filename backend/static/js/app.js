(function () {
  const Data = globalThis.WonjuData;
  const Rules = globalThis.WonjuRules;
  const Files = globalThis.WonjuFiles;
  const Ledger = globalThis.WonjuLedger;
  const Pdf = globalThis.WonjuPdf;
  const Announce = globalThis.WonjuAnnounce;

  const VIEWS = [
    ["start", "시작"],
    ["announce", "공고"],
    ["questions", "상황"],
    ["results", "후보"],
    ["prep", "준비"],
    ["files", "파일"],
    ["dashboard", "대시보드"],
    ["guide", "절차 안내"]
  ];

  const STATUS_CLASS = {
    "조건 일치": "ok",
    "보류": "hold",
    "확인 필요": "check",
    "조건 불일치": "no",
    "신청 기간 종료": "end"
  };

  const TIMING = {
    this_quarter: "이번 분기",
    next_quarter: "다음 분기",
    unknown: "아직 모름"
  };

  const YESNO = { yes: "예", no: "아니오", na: "해당 없음" };

  const state = {
    view: "start",
    announce: emptyAnnounce(),
    draft: emptyDraft(),
    answers: null,
    judgments: [],
    evidenceId: null,
    prepProgramId: null,
    prepChecks: {},
    prepSelf: {},
    session: Ledger.createSession(),
    files: {},
    activeDocId: null,
    highlightId: null,
    flash: null,
    receipt: {
      programName: Data.PROGRAMS[0].name,
      kind: "현금",
      amount: "",
      date: "2026-11-02",
      periodKey: "2026-11"
    },
    filterMode: "month",
    guideIndex: 0,
    guideMemo: "",
    guideMismatch: "",
    editingId: null,
    editAmount: "",
    clawId: null,
    clawAmount: "",
    seq: 1
  };

  function emptyAnnounce() {
    return {
      stage: "input",
      paste: "",
      url: "",
      rawText: "",
      briefing: null,
      programs: [],
      answers: {},
      docChecks: {},
      stepIndex: 0,
      stopped: false,
      confirmed: {},
      mismatch: ""
    };
  }

  function emptyDraft() {
    return {
      livesInWonju: "",
      childMonths: "",
      returnToWork: "",
      returnTiming: "",
      singleChild: "",
      childcare: ""
    };
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function won(amount) {
    const sign = amount < 0 ? "-" : "";
    return sign + String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
  }

  function programById(id) {
    return Data.PROGRAMS.find(function (item) { return item.id === id; });
  }

  function flashHtml() {
    if (!state.flash) return "";
    return '<div class="flash ' + esc(state.flash.kind || "info") + '" role="status">' + esc(state.flash.text) + "</div>";
  }

  function render() {
    document.getElementById("nav").innerHTML = VIEWS.map(function (item) {
      const current = item[0] === state.view ? ' aria-current="page"' : "";
      return '<button type="button" data-action="nav" data-view="' + item[0] + '"' + current + ">" + item[1] + "</button>";
    }).join("");
    const views = {
      start: renderStart,
      announce: renderAnnounce,
      questions: renderQuestions,
      results: renderResults,
      evidence: renderEvidence,
      prep: renderPrep,
      files: renderFiles,
      dashboard: renderDashboard,
      guide: renderGuide
    };
    document.getElementById("main").innerHTML = '<div class="panel">' + (views[state.view] || renderStart)() + "</div>";
    document.getElementById("foot").innerHTML = renderFoot();
  }

  function renderStart() {
    return flashHtml() + [
      "<h2>공고를 올리면, 그 글을 보고 준비를 돕습니다</h2>",
      '<p class="lede">공고 사이트 주소나 공고 문서를 올리면, 그 안에서 찾은 문장만으로 설명하고 필요한 답을 받은 뒤 신청 절차를 안내합니다. 문서에 없는 대상·금액·절차는 만들지 않습니다.</p>',
      '<div class="grid-2">',
      '<div><h3>공고를 올린 뒤</h3><ol>',
      "<li>설명과 근거 문장</li><li>필요한 정보 수집</li><li>문서에 적힌 절차 안내</li>",
      "<li>주민번호·계좌·비밀번호는 받지 않음</li>",
      "</ol></div>",
      '<div class="muted-box"><h3>하지 않는 일</h3><ul>',
      "<li>예상 지원금 합계</li><li>공식 신청서 자동 작성, 자동 제출, 전자서명</li>",
      "<li>이름, 주민등록번호, 계좌, 상세 주소 입력</li>",
      "<li>기관 조회, 로그인 중계, 비밀번호나 인증번호 수집</li>",
      "</ul></div></div>",
      '<p class="help">이름과 주민등록번호 없이 필요한 상황만 알려 주세요. 저장과 전송에 관한 말은 설계 목표이며, 검증 전의 약속으로 적지 않습니다.</p>',
      '<div class="actions"><button type="button" class="primary" data-action="nav" data-view="announce">공고 올리기</button>',
      '<button type="button" data-action="nav" data-view="questions">가상 규칙 시연</button>',
      '<button type="button" data-action="nav" data-view="guide">합성 절차 안내 보기</button></div>'
    ].join("");
  }

  function renderQuestions() {
    const draft = state.draft;
    const blocks = Data.QUESTIONS.filter(function (item) {
      return item.when !== "returnYes" || draft.returnToWork === "yes";
    }).map(function (item) {
      if (item.kind === "months") {
        return '<div class="field"><label class="label" for="child-months">' + esc(item.prompt) + '</label><input id="child-months" type="number" min="0" max="84" inputmode="numeric" data-bind="draft.childMonths" value="' + esc(draft.childMonths) + '"><p class="help">' + esc(item.help) + "</p></div>";
      }
      const choices = item.options.map(function (option) {
        const checked = draft[item.id] === option.value ? " checked" : "";
        return '<label class="choice"><input type="radio" name="' + esc(item.id) + '" data-bind="draft.' + esc(item.id) + '" data-render="true" value="' + esc(option.value) + '"' + checked + "><span>" + esc(option.label) + "</span></label>";
      }).join("");
      return '<fieldset class="field"><legend>' + esc(item.prompt) + '</legend><div class="choices">' + choices + '</div><p class="help">' + esc(item.help) + "</p></fieldset>";
    }).join("");
    return flashHtml() + [
      "<h2>상황 질문</h2>",
      '<p class="lede">질문 6개 중 5개를 먼저 묻습니다. 보육 시설 이용은 보류를 풀 때만 묻습니다. 시연 기준일은 ' + Data.TODAY + "입니다.</p>",
      '<div id="question-form">' + blocks + "</div>",
      '<div class="actions"><button type="button" data-action="demo">시연 예시 채우기</button>',
      '<button type="button" class="primary" data-action="judge">결과 보기</button></div>'
    ].join("");
  }

  function renderResults() {
    if (!state.judgments.length) {
      return flashHtml() + '<h2>후보와 확인할 조건</h2><p>상황 질문에 답하면 후보가 나옵니다.</p><button type="button" class="primary" data-action="nav" data-view="questions">상황 질문으로</button>';
    }
    const cards = state.judgments.map(function (item) {
      const klass = STATUS_CLASS[item.status] || "end";
      const follow = item.programId === "B" && item.missing.indexOf("보육 시설 이용 여부") !== -1
        ? '<div class="actions"><span>보류를 풀 질문: 어린이집 등 보육 시설을 이용 중인가요?</span><button type="button" data-action="childcare" data-value="yes">이용 중</button><button type="button" data-action="childcare" data-value="no">이용하지 않음</button></div>'
        : "";
      return [
        '<article class="ticket ' + klass + '">',
        "<header><div><span class=\"chip " + klass + "\">" + esc(item.status) + "</span> ",
        '<h3>' + esc(item.name) + "</h3>",
        '<p class="fine">' + esc(item.d1Label) + " · 출처 " + esc(item.sourceType) + " · 검증 " + esc(item.verification) + "</p></div>",
        '<div class="amount">' + esc(item.amountLine) + "<div class=\"fine\">항목별 금액 · 합계 아님</div></div></header>",
        "<ul class=\"list\">" + item.reasons.map(function (reason) { return "<li>" + esc(reason) + "</li>"; }).join("") + "</ul>",
        follow,
        '<div class="actions"><button type="button" data-action="evidence" data-id="' + esc(item.programId) + '">근거 보기</button>',
        '<button type="button" data-action="open-prep" data-id="' + esc(item.programId) + '">준비 묶음</button></div>',
        "</article>"
      ].join("");
    }).join("");
    return flashHtml() + [
      "<h2>우리 집 지원 후보와 아직 확인할 조건</h2>",
      '<p class="lede">예상 지원금은 항목별로만 보여 줍니다. 합계는 계산하지 않습니다. 조건 일치는 수급 확정이 아닙니다.</p>',
      '<div class="cards">' + cards + "</div>"
    ].join("");
  }

  function renderEvidence() {
    const item = state.judgments.find(function (row) { return row.programId === state.evidenceId; });
    if (!item) return renderResults();
    const rows = item.evidence.map(function (ref) {
      return "<div class=\"evidence\"><b>" + esc(ref.topic) + "</b> · " + esc(ref.location) + "<p>" + esc(ref.text) + "</p><p class=\"fine\">출처 유형 " + esc(item.sourceType) + " · 검증 수준 " + esc(item.verification) + " · 확인일 " + esc(item.confirmedOn) + "</p></div>";
    }).join("");
    const failed = (item.failed || []).map(function (fail) {
      return "<li>" + esc(fail.detail) + " 근거: " + esc(fail.location || "없음") + "</li>";
    }).join("");
    return flashHtml() + [
      "<h2>" + esc(item.name) + "</h2>",
      '<p><span class="chip ' + (STATUS_CLASS[item.status] || "") + '">' + esc(item.status) + "</span></p>",
      failed ? "<h3>맞지 않는 조건</h3><ul>" + failed + "</ul>" : "",
      "<h3>조건, 금액, 서류 근거</h3>",
      rows,
      '<p class="help">기관 원문과 기관 확인은 아직 없습니다. 이 근거는 가상 규칙입니다.</p>',
      '<button type="button" data-action="nav" data-view="results">후보로 돌아가기</button>'
    ].join("");
  }

  function renderPrep() {
    const program = programById(state.prepProgramId);
    if (!program) {
      return flashHtml() + "<h2>준비 묶음</h2><p>후보에서 제도를 고르면 정리표가 만들어집니다.</p>";
    }
    const judgment = state.judgments.find(function (item) { return item.programId === program.id; });
    const checks = checksFor(program.id);
    const self = !!state.prepSelf[program.id];
    const status = Ledger.prepStatus(checks, self);
    const answers = state.answers || {};
    const docs = program.documents.map(function (doc, index) {
      const checked = checks[index] ? " checked" : "";
      return '<label class="checkline"><input type="checkbox" data-prep-doc="' + index + '"' + checked + "><span>" + esc(doc) + "</span></label>";
    }).join("");
    const warn = judgment && judgment.status !== "조건 일치"
      ? '<div class="flash warn">이 제도는 지금 "' + esc(judgment.status) + '"입니다. 정리표는 초안이며 신청 자격이 확정된 것이 아닙니다.</div>'
      : "";
    return flashHtml() + warn + [
      "<h2>준비 묶음</h2>",
      "<p class=\"lede\">" + esc(program.name) + "</p>",
      "<h3>신청정보 정리표 초안</h3>",
      '<p class="fine">초안입니다. 제출 전 본인이 확인하세요. 개인정보 칸은 비워 둡니다.</p>',
      '<div class="blank-row"><b>제도</b><span>' + esc(program.name) + "</span></div>",
      '<div class="blank-row"><b>대상 지역</b><span>원주시 · 답변 ' + esc(YESNO[answers.livesInWonju] || "없음") + "</span></div>",
      '<div class="blank-row"><b>자녀 개월 수</b><span>' + esc(answers.childMonths == null ? "없음" : answers.childMonths) + "개월</span></div>",
      '<div class="blank-row"><b>복직</b><span>' + esc(YESNO[answers.returnToWork] || "없음") + (answers.returnTiming ? " · " + esc(TIMING[answers.returnTiming] || answers.returnTiming) : "") + "</span></div>",
      '<div class="blank-row"><b>신청인 이름</b><span>(비움) 공식 서류에 본인이 직접 적습니다. 여기서는 받지 않습니다.</span></div>',
      '<div class="blank-row"><b>주민등록번호</b><span>(비움) 받지 않습니다.</span></div>',
      '<div class="blank-row"><b>상세 주소</b><span>(비움) 받지 않습니다.</span></div>',
      '<div class="blank-row"><b>계좌</b><span>(비움) 받지 않습니다.</span></div>',
      '<div class="blank-row"><b>출처</b><span>가상 · 검증 미검토 · 확인일 ' + esc(program.confirmedOn) + "</span></div>",
      "<h3>서류 체크리스트</h3>",
      docs,
      "<h3>공식 접수처 안내</h3>",
      '<div class="muted-box"><p>' + esc(program.office) + "</p><p>" + esc(program.method) + '</p><p>가상 경로: ' + esc(program.virtualPath) + "</p><p class=\"fine\">실제 주소와 전화번호는 적지 않습니다. 기관이 만들거나 승인한 안내가 아닙니다.</p></div>",
      '<label class="checkline"><input type="checkbox" data-self="true"' + (self ? " checked" : "") + "><span>정리표와 서류 체크를 내가 확인했습니다. 이것은 접수가 아닙니다.</span></label>",
      status.ready ? '<div class="flash">' + esc(status.message) + "</div>" : '<p class="help">서류 체크와 본인 확인을 모두 하면 준비 완료로 표시됩니다.</p>'
    ].join("");
  }

  function renderFiles() {
    const samples = Data.SAMPLES.map(function (sample) {
      return '<button type="button" class="sample" data-action="sample" data-file="' + esc(sample.file) + '" data-label="' + esc(sample.label) + '"><b>' + esc(sample.label) + "</b><small>" + esc(sample.note) + "</small></button>";
    }).join("");
    return flashHtml() + [
      "<h2>파일에서 초안 만들기</h2>",
      '<p class="lede">추출 초안입니다. 항목마다 원문을 확인하세요. 확인 전에는 대시보드에 등록되지 않습니다.</p>',
      '<p class="help">이 화면은 파일 내용을 서버로 보내는 기능을 넣지 않았습니다. 보안 검증을 마친 상태는 아닙니다. 개인 증빙을 올리지 말고 합성 문서를 사용하세요.</p>',
      '<div class="field"><label class="label" for="file-input">텍스트 PDF 선택</label><input id="file-input" type="file" accept="application/pdf,.pdf"></div>',
      '<div class="samples">' + samples + "</div>",
      renderActiveDoc()
    ].join("");
  }

  function renderActiveDoc() {
    const doc = state.session.documents.find(function (item) { return item.id === state.activeDocId; });
    if (!doc) return '<p class="help">아직 연 파일이 없습니다.</p>';
    const file = state.files[doc.id];
    const highlight = doc.fields.find(function (field) { return field.id === state.highlightId; });
    const text = file ? highlighted(file.text, highlight && highlight.sentence) : "";
    const fields = doc.fields.map(function (field) {
      const checked = doc.confirmed[field.id] ? " checked" : "";
      return '<label class="checkline"><input type="checkbox" data-confirm="' + esc(field.id) + '"' + checked + "><span><b>" + esc(field.label) + "</b> " + esc(field.value) + '<span class="fine">PDF ' + esc(field.pdfPage) + "쪽 · 인쇄 " + esc(field.printedPage || "없음") + "쪽 · 표 " + esc(field.tableNo || "없음") + " · " + esc(field.row) + "행 " + esc(field.col) + "열</span></span></label>";
    }).join("");
    const frame = file ? '<iframe class="pdf-frame" title="원문 PDF" src="' + esc(file.blobUrl) + '"></iframe>' : "";
    return [
      '<section class="dash-block">',
      "<h3>" + esc(doc.fileName) + "</h3>",
      '<p><span class="chip">' + esc(doc.docTypeRaw) + "</span> " + (doc.synthetic ? '<span class="chip">합성</span>' : "") + (doc.invalidated ? ' <span class="chip no">근거 무효</span>' : "") + "</p>",
      doc.hold ? '<div class="flash warn">' + esc(doc.hold) + "</div>" : "",
      doc.blockedReason ? '<div class="flash warn">' + esc(doc.blockedReason) + "</div>" : "",
      '<p class="fine">내용 해시 ' + esc(shortHash(doc.hash)) + " · 해시는 같은 파일인지 맞추는 용도이며 진위나 실제 신청을 증명하지 않습니다.</p>",
      "<h3>추출 초안</h3>",
      fields,
      '<div class="actions"><button type="button" class="primary" data-action="register-doc">확인한 항목 등록</button>',
      '<button type="button" class="danger" data-action="invalidate-doc">이 파일 근거 제거</button></div>',
      "<h3>원문</h3>",
      '<p class="fine">이 내용은 ' + esc(doc.fileName) + "에서 나왔습니다." + (highlight ? " 지금 표시: " + esc(highlight.sentence) : "") + "</p>",
      '<div class="doc-text">' + text + "</div>",
      frame,
      "</section>"
    ].join("");
  }

  function highlighted(text, sentence) {
    const safe = esc(text);
    if (!sentence) return safe;
    const token = esc(sentence);
    const at = safe.indexOf(token);
    if (at < 0) return safe;
    return safe.slice(0, at) + "<mark>" + token + "</mark>" + safe.slice(at + token.length);
  }

  function shortHash(hash) {
    if (!hash) return "";
    return hash.slice(0, 8) + "…" + hash.slice(-6);
  }

  function renderDashboard() {
    const filterNote = state.filterMode === "month" ? "2026-11" : state.filterMode === "year" ? "2026" : "전체";
    const summary = Ledger.cashSummary(state.session.receipts, filterOf());
    return flashHtml() + [
      "<h2>파일 근거 대시보드</h2>",
      '<p class="lede">신청, 선정, 수령을 섞지 않습니다. 자동 등록은 기관 조회가 아닙니다. 저장 방식은 현재 세션 메모리이며 재방문 저장은 미정입니다.</p>',
      '<div class="dash-block" id="d1"><h3>D1 신청 후보와 준비</h3>', renderD1(), "</div>",
      '<div class="dash-block" id="d2"><h3>D2 신청한 제도</h3>', renderStatusList(state.session.d2, "접수 파일로 확인한 신청이 없습니다. 공고문만으로는 신청 상태가 생기지 않습니다."), "</div>",
      '<div class="dash-block" id="d3"><h3>D3 선정된 제도</h3>', renderStatusList(state.session.d3, "선정 통지서로 확인한 선정이 없습니다."), "</div>",
      '<div class="dash-block" id="d4"><h3>D4 직접 기록한 수령</h3>',
      '<p class="fine">직접 기록 (자가 보고)이며 기관 확정값이 아닙니다. 예상·선정·지급 예정 금액은 여기 합계에 넣지 않습니다.</p>',
      '<div class="actions"><button type="button" data-action="filter" data-mode="month"' + pressed("month") + ">이번 달</button>",
      '<button type="button" data-action="filter" data-mode="year"' + pressed("year") + ">올해</button>",
      '<button type="button" data-action="filter" data-mode="all"' + pressed("all") + ">전체</button></div>",
      '<p class="fine">선택 기간 ' + esc(filterNote) + "</p>",
      summary.included.length ? '<p class="sum">' + esc(won(summary.sum)) + "</p>" : "<p class=\"sum\">합계에 포함된 현금 기록이 없습니다.</p>",
      '<p class="help">금액 미입력 ' + summary.missingAmount + "건은 합계에서 빼 두었습니다. 0원으로 넣지 않았습니다.</p>",
      renderNonCash(summary),
      renderDuplicate(summary),
      renderReceiptForm(),
      renderReceiptList(),
      "</div>"
    ].join("");
  }

  function pressed(mode) {
    return state.filterMode === mode ? ' aria-pressed="true"' : ' aria-pressed="false"';
  }

  function filterOf() {
    if (state.filterMode === "year") return { mode: "year", year: "2026" };
    if (state.filterMode === "all") return { mode: "all" };
    return { mode: "month", month: "2026-11" };
  }

  function renderD1() {
    if (!state.judgments.length && !state.session.d1Files.length) {
      return "<p>상황 질문을 하거나 공고문을 확인하면 후보가 나타납니다.</p>";
    }
    const cards = state.judgments.map(function (item) {
      const files = state.session.d1Files.filter(function (file) { return file.programId === item.programId; });
      const fileHtml = files.map(function (file) {
        return '<div class="source"><p>' + esc(file.active ? "파일에서 확인한 항목" : "확인 필요 / 근거 무효") + " · " + esc(file.fileName) + "</p><p class=\"fine\">출처 " + esc(file.sourceType) + " · 검증 " + esc(file.evidenceStatus) + " · PDF " + esc(file.pdfPage) + "쪽 · 인쇄 " + esc(file.printedPage || "없음") + "쪽</p><ul>" + file.fields.map(function (field) {
          return "<li>" + esc(field.label) + ": " + esc(field.value) + "</li>";
        }).join("") + "</ul></div>";
      }).join("");
      return '<article class="ticket ' + (STATUS_CLASS[item.status] || "") + '"><header><div><span class="chip">' + esc(item.d1Label) + '</span><h3>' + esc(item.name) + "</h3><p>" + esc(item.status) + "</p></div><div class=\"amount\">" + esc(item.amountLine) + "</div></header>" + fileHtml + "</article>";
    }).join("");
    return '<div class="cards">' + cards + "</div>";
  }

  function renderStatusList(list, empty) {
    if (!list.length) return "<p>" + esc(empty) + "</p>";
    return '<div class="cards">' + list.map(function (item) {
      const planned = item.plannedAmount != null ? '<p>지급 예정 ' + esc(won(item.plannedAmount)) + " · " + esc(item.plannedUnit || "") + " · 수령 합계에 넣지 않음</p>" : "";
      return '<article class="ticket"><h3>' + esc(item.programName) + '</h3><p><span class="chip">' + esc(item.active ? item.label : "확인 필요 / 근거 무효") + "</span></p><p>" + esc(item.sentence || "") + "</p>" + planned + '<p class="fine">' + esc(item.fileName) + " · PDF " + esc(item.pdfPage) + "쪽 · 인쇄 " + esc(item.printedPage || "없음") + "쪽 · " + esc(item.evidenceStatus) + "</p></article>";
    }).join("") + "</div>";
  }

  function renderNonCash(summary) {
    if (!summary.nonCash.length) return "<p class=\"fine\">비현금 지원 기록은 종류별로 따로 두며, 원화로 바꾸지 않습니다.</p>";
    return "<ul>" + summary.nonCash.map(function (item) {
      return "<li>" + esc(item.kind) + " · " + esc(item.programName) + " · " + esc(item.date) + " · 직접 기록 · 금액 환산 안 함</li>";
    }).join("") + "</ul>";
  }

  function renderDuplicate(summary) {
    if (!summary.duplicates.length) return "";
    return '<div class="flash warn">같은 지급 회차 ' + summary.duplicates.length + "건은 자동으로 합산하지 않습니다.</div>";
  }

  function renderReceiptForm() {
    const options = Data.PROGRAMS.map(function (program) {
      const selected = state.receipt.programName === program.name ? " selected" : "";
      return '<option value="' + esc(program.name) + '"' + selected + ">" + esc(program.name) + "</option>";
    }).join("");
    const kinds = ["현금", "바우처", "서비스", "물품"].map(function (kind) {
      const selected = state.receipt.kind === kind ? " selected" : "";
      return '<option value="' + kind + '"' + selected + ">" + kind + "</option>";
    }).join("");
    const amount = state.receipt.kind === "현금"
      ? '<label class="label" for="receipt-amount">금액 (비우면 금액 미입력)</label><input id="receipt-amount" type="text" inputmode="numeric" data-bind="receipt.amount" value="' + esc(state.receipt.amount) + '">'
      : "<p class=\"help\">비현금은 금액을 받지 않고 종류만 기록합니다.</p>";
    return [
      "<h3>수령 기록 추가</h3>",
      '<div class="field"><label class="label" for="receipt-program">제도</label><select id="receipt-program" data-bind="receipt.programName">' + options + "</select></div>",
      '<div class="field"><label class="label" for="receipt-kind">종류</label><select id="receipt-kind" data-bind="receipt.kind" data-render="true">' + kinds + "</select></div>",
      '<div class="field">' + amount + "</div>",
      '<div class="field"><label class="label" for="receipt-date">수령일</label><input id="receipt-date" type="date" data-bind="receipt.date" value="' + esc(state.receipt.date) + '"></div>',
      '<div class="field"><label class="label" for="receipt-period">지급 회차</label><input id="receipt-period" type="text" data-bind="receipt.periodKey" value="' + esc(state.receipt.periodKey) + '"></div>',
      '<button type="button" class="primary" data-action="add-receipt">직접 기록으로 추가</button>'
    ].join("");
  }

  function renderReceiptList() {
    if (!state.session.receipts.length) return "<p>기록된 수령이 없습니다.</p>";
    return state.session.receipts.map(function (item) {
      const bits = ["직접 기록"];
      if (item.status === "cancelled") bits.push("취소");
      if (item.excludedDuplicate) bits.push("중복 · 합산 안 함");
      if (item.adjustmentOf) bits.push("환수 조정");
      if (item.kind === "현금" && item.amount == null) bits.push("금액 미입력");
      const amount = item.kind !== "현금" ? "금액 환산 안 함" : item.amount == null ? "금액 미입력" : won(item.amount);
      const edit = state.editingId === item.id
        ? '<input id="edit-amount" type="text" value="' + esc(state.editAmount) + '"><button type="button" data-action="save-edit" data-id="' + esc(item.id) + '">수정 반영</button>'
        : '<button type="button" data-action="edit-receipt" data-id="' + esc(item.id) + '">수정</button>';
      const claw = state.clawId === item.id
        ? '<input id="claw-amount" type="text" value="' + esc(state.clawAmount) + '"><button type="button" data-action="save-claw" data-id="' + esc(item.id) + '">환수 반영</button>'
        : '<button type="button" data-action="claw-receipt" data-id="' + esc(item.id) + '">환수</button>';
      return '<article class="evidence"><b>' + esc(item.programName) + "</b> · " + esc(item.kind) + " · " + esc(amount) + "<p class=\"fine\">" + esc(item.date) + " · 회차 " + esc(item.periodKey) + " · " + esc(bits.join(" · ")) + "</p><div class=\"actions\">" + edit + claw + '<button type="button" data-action="cancel-receipt" data-id="' + esc(item.id) + '">취소</button></div></article>';
    }).join("");
  }

  function renderGuide() {
    const guide = Data.GUIDE;
    const scene = guide.scenes[state.guideIndex];
    const stopped = state.session.guideStopped;
    const confirmedCount = Object.keys(state.session.guideConfirmed).length;
    const progress = Ledger.guideProgress(confirmedCount, guide.scenes.length, stopped);
    const highlights = scene.highlights.map(function (item) {
      return '<div class="hl" data-n="' + item.n + '">' + esc(item.text) + '<div class="placeholder"></div></div>';
    }).join("");
    const d2count = state.session.d2.filter(function (item) { return item.active; }).length;
    const stopBlock = stopped
      ? '<div class="flash bad"><p>화면이 안내와 다릅니다: ' + esc(state.guideMismatch) + '</p><p>이 사용자의 이 흐름만 멈췄습니다. 서비스 전체 중지가 아니며, 확인 내용은 운영자에게 보내지 않습니다.</p><p>공식 안내를 우선하세요. 가상 경로: ' + esc(guide.virtualPath) + "</p><p>파일 근거 상태는 바꾸지 않았습니다. 현재 신청 기록 " + d2count + '건.</p><button type="button" data-action="reset-guide">안내만 처음부터</button></div>'
      : "";
    return flashHtml() + [
      "<h2>절차 안내</h2>",
      '<p class="lede">합성 시연 모드입니다. 모든 장면은 가상 — 실제 화면 아님. 실제 신청 따라가기에는 쓰지 않습니다.</p>',
      '<div class="source"><p>기관이 만들거나 승인한 안내가 아닙니다.</p><p>제도 ' + esc(guide.programName) + " · 버전 " + esc(guide.version) + " · 검수일 " + esc(guide.reviewedOn) + " · 유효 기한 " + esc(guide.validUntil) + "</p><p>검증 " + esc(guide.verification) + " · 모드 " + esc(guide.mode) + " · 이미지 " + esc(guide.imageType) + "</p><p>가상 경로 " + esc(guide.virtualPath) + "</p><p class=\"fine\">진행 " + confirmedCount + "/" + guide.scenes.length + " · " + esc(progress.label) + "</p></div>",
      progress.done ? '<div class="flash">안내 진행 완료입니다. 기관 접수나 선정의 증거가 아니며, 신청·선정 상태는 바뀌지 않습니다.</div>' : "",
      stopBlock,
      '<div class="fake-screen"><div class="fake-ribbon">가상 — 실제 화면 아님</div><div class="fake-top"><span>' + esc(scene.id) + " " + esc(scene.title) + '</span><span>합성 장면</span></div><div class="fake-body"><p>' + esc(scene.body) + "</p>" + highlights + "</div></div>",
      '<p class="help">공식 사이트에서 직접 입력하세요. 이 화면은 값을 받지 않습니다.</p>',
      stopped ? "" : '<div class="actions"><button type="button" data-action="guide-prev">이전</button><button type="button" data-action="guide-next">다음</button><button type="button" class="primary" data-action="guide-confirm">이 장면 확인</button></div>',
      stopped ? "" : '<div class="field"><label class="label" for="guide-mismatch">화면이 안내와 다름</label><select id="guide-mismatch"><option value="">선택</option><option value="버튼 위치 다름">버튼 위치 다름</option><option value="입력 항목 다름">입력 항목 다름</option><option value="단계 없음">단계 없음</option></select><button type="button" data-action="guide-stop">이 흐름만 중지</button><p class="fine">화면 캡처나 파일 업로드는 받지 않습니다.</p></div>',
      '<div class="field"><label class="label" for="guide-memo">불일치 메모</label><textarea id="guide-memo" data-bind="guide.memo">' + esc(state.guideMemo) + '</textarea><p class="help">이 탭의 세션 안에만 있습니다. 외부로 보내지 않으며 재방문 때 남지 않습니다. 삭제는 세션을 비울 때 이루어지고, 탭을 닫은 뒤의 삭제는 검증하지 않았습니다.</p></div>'
    ].join("");
  }

  function renderAnnounce() {
    const announce = state.announce;
    if (announce.stage === "programs" && announce.programs.length) return renderPrograms();
    if (announce.stage === "briefing" && announce.briefing) return renderBriefing();
    if (announce.stage === "questions" && announce.briefing) return renderAnnounceQuestions();
    if (announce.stage === "result" && announce.briefing) return renderAnnounceResult();
    if (announce.stage === "steps" && announce.briefing) return renderAnnounceSteps();
    return flashHtml() + [
      "<h2>공고 올리기</h2>",
      '<p class="lede">공고 사이트 주소, 공고 문서, 또는 공고 글을 올리면 그 내용만 읽고 설명합니다. 비밀번호와 인증번호는 받지 않습니다.</p>',
      '<div class="field"><label class="label" for="announce-url">공고 사이트 주소</label>',
      '<input id="announce-url" type="url" inputmode="url" placeholder="https://" data-bind="announce.url" value="' + esc(announce.url) + '">',
      '<p class="help">이 컴퓨터의 로컬 서버가 공개 페이지만 읽습니다. 내부망 주소는 열지 않습니다.</p></div>',
      '<div class="actions"><button type="button" class="primary" data-action="read-url">이 주소 읽기</button></div>',
      '<div class="field"><label class="label" for="announce-file">공고 문서</label>',
      '<input id="announce-file" type="file" accept=".pdf,.hwp,.hwpx,.txt,.md,.html,.htm,application/pdf,text/plain,text/html">',
      '<p class="help">PDF, 한글 문서, 텍스트, 저장한 웹 페이지를 읽습니다. 표와 한글 문서는 이 컴퓨터에서만 다시 읽고, 파일은 저장하지 않습니다. 개인 증빙이 아닌 공고 문서를 올려 주세요.</p></div>',
      '<div class="field"><label class="label" for="announce-paste">공고 글 붙여넣기</label>',
      '<textarea id="announce-paste" data-bind="announce.paste">' + esc(announce.paste) + "</textarea></div>",
      '<div class="actions"><button type="button" class="primary" data-action="read-paste">이 글 읽기</button>',
      '<button type="button" data-action="read-sample">시연용 가상 공고 열기</button>',
      '<button type="button" data-action="read-summary">원주시 요약집 열기</button></div>'
    ].join("");
  }

  function renderPrograms() {
    const cards = state.announce.programs.map(function (program, index) {
      return [
        '<article class="ticket">',
        "<header><div><h3>" + esc(program.name) + "</h3>",
        "<p>" + esc(program.summary || "한 줄 요약을 표에서 찾지 못했습니다.") + "</p>",
        '<p class="fine">혜택 · ' + esc(program.benefit || "표에서 찾지 못함") + "</p>",
        '<p class="fine">대상 · ' + esc(program.target || "표에서 찾지 못함") + "</p>",
        '<p class="fine">요약집 ' + esc(program.page) + "쪽</p></div></header>",
        '<div class="actions"><button type="button" class="primary" data-action="open-program" data-index="' + index + '">이 사업 안내</button></div>',
        "</article>"
      ].join("");
    }).join("");
    return flashHtml() + [
      "<h2>요약집에서 찾은 사업</h2>",
      "<p class=\"lede\">표의 사업명, 대상, 혜택, 신청 방법, 서류만 나누었습니다. 칸 끝에서 문장이 잘리면 그 부분은 확인이 필요합니다. 예상 금액은 사업마다 따로 보여 주고 합산하지 않습니다.</p>",
      cards,
      '<div class="actions"><button type="button" data-action="announce-reset">다른 공고 올리기</button></div>'
    ].join("");
  }

  function renderBriefing() {
    const briefing = state.announce.briefing;
    const needed = (briefing.needed || []).map(function (group) {
      return '<article class="source"><h3>' + esc(group.label) + '</h3><ul class="list">' + group.items.map(function (item) {
        return "<li>" + esc(item) + "</li>";
      }).join("") + "</ul></article>";
    }).join("");
    const sections = needed ? "" : briefing.sections.map(function (section) {
      return '<article class="source"><h3>' + esc(section.label) + '</h3><p class="fine">' + esc(section.location) + '</p><p>' + esc(section.text) + "</p></article>";
    }).join("");
    const missing = briefing.missing.length
      ? '<p class="help">페이지에서 찾지 못한 항목: ' + esc(briefing.missing.join(", ")) + ". 없는 내용은 만들지 않습니다.</p>"
      : "";
    const benefit = "";
    const selfServe = briefing.selfServe.length
      ? '<div class="muted-box"><h3>공식 화면에서 직접 다룰 항목</h3><ul>' + briefing.selfServe.map(function (item) {
        return "<li>" + esc(item.label) + " — 여기서는 값을 받지 않습니다.</li>";
      }).join("") + "</ul></div>"
      : "";
    const next = briefing.questions.length || briefing.documents.length
      ? '<button type="button" class="primary" data-action="announce-ask">필요한 정보 답하기</button>'
      : "";
    const steps = briefing.steps.length
      ? '<button type="button" data-action="announce-steps">문서의 절차 안내</button>'
      : "";
    return flashHtml() + [
      "<h2>" + esc(briefing.title.text || "공고 설명") + "</h2>",
      '<p class="fine">' + esc(sourceLabel(briefing)) + (briefing.title.location ? " · " + esc(briefing.title.location) : "") + "</p>",
      '<p class="lede">신청에 필요한 조건, 금액, 서류, 방법만 골랐습니다. 금액은 항목별로만 보여주고 합산하지 않습니다.</p>',
      needed,
      missing,
      benefit,
      sections,
      selfServe,
      '<div class="actions">' + next + steps + (state.announce.programs.length ? '<button type="button" data-action="announce-programs">사업 목록</button>' : "") + '<button type="button" data-action="announce-reset">다른 공고 올리기</button></div>'
    ].join("");
  }

  function renderAnnounceQuestions() {
    const briefing = state.announce.briefing;
    const answers = state.announce.answers;
    const questions = briefing.questions.map(function (question) {
      if (question.kind === "months") {
        return '<div class="field"><label class="label" for="announce-months">' + esc(question.prompt) + '</label><input id="announce-months" type="number" min="0" max="144" inputmode="numeric" value="' + esc(answers.childMonths || "") + '"><p class="help">' + esc(question.help) + "</p><p class=\"fine\">문서 문장: " + esc(question.quote) + "</p></div>";
      }
      const choices = question.options.map(function (option) {
        const checked = answers[question.id] === option.value ? " checked" : "";
        return '<label class="choice"><input type="radio" name="aq-' + esc(question.id) + '" value="' + esc(option.value) + '"' + checked + "><span>" + esc(option.label) + "</span></label>";
      }).join("");
      return '<fieldset class="field"><legend>' + esc(question.prompt) + '</legend><div class="choices">' + choices + '</div><p class="help">' + esc(question.help) + '</p><p class="fine">문서 문장: ' + esc(question.quote) + "</p></fieldset>";
    }).join("");
    const docs = briefing.documents.map(function (doc, index) {
      const checked = state.announce.docChecks[String(index)] ? " checked" : "";
      return '<label class="checkline"><input type="checkbox" data-announce-doc="' + index + '"' + checked + "><span>" + esc(doc.name) + "</span></label>";
    }).join("");
    const docBlock = docs
      ? '<div class="field"><span class="label">공고에 적힌 제출 서류</span><p class="help">준비했는지만 선택으로 표시합니다. 체크하지 않아도 다음으로 갈 수 있고, 만족도·배너·담당자 정보는 항목이 아닙니다.</p>' + docs + "</div>"
      : "";
    const empty = !questions && !docs
      ? "<p>문서에서 물어볼 조건과 서류 목록을 찾지 못했습니다.</p>"
      : "";
    return flashHtml() + [
      "<h2>필요한 정보</h2>",
      "<p class=\"lede\">질문은 올린 공고의 대상 문장에서만 만들었습니다. 이름, 주민등록번호, 계좌, 상세 주소, 비밀번호는 묻지 않습니다.</p>",
      '<div id="announce-questions">' + questions + docBlock + empty + "</div>",
      '<div class="actions"><button type="button" data-action="announce-back-brief">설명으로</button>',
      '<button type="button" class="primary" data-action="announce-compare">답과 문서 비교</button></div>'
    ].join("");
  }

  function renderAnnounceResult() {
    const compared = Announce.compareAnswers(state.announce.briefing, state.announce.answers, Data.TODAY);
    const cards = compared.items.map(function (item) {
      return [
        '<article class="ticket ' + esc(item.tone) + '">',
        '<header><div><span class="chip ' + esc(item.tone) + '">' + esc(item.status) + "</span>",
        "<h3>" + esc(item.prompt) + "</h3>",
        "<p>" + esc(item.detail) + "</p>",
        '<p class="fine">문서 문장: ' + esc(item.quote) + "</p></div></header>",
        "</article>"
      ].join("");
    }).join("");
    const checks = state.announce.briefing.documents.map(function (doc, index) {
      const done = state.announce.docChecks[String(index)] ? "표시함" : "아직 표시 안 함";
      return "<li>" + esc(doc.name) + " — " + done + "</li>";
    }).join("");
    const docList = checks ? "<h3>서류 준비 표시</h3><ul>" + checks + "</ul>" : "";
    return flashHtml() + [
      "<h2>문서와 답을 나란히 본 결과</h2>",
      "<p>" + esc(compared.note) + "</p>",
      cards || "<p>비교할 조건 문장이 없습니다.</p>",
      docList,
      '<div class="actions"><button type="button" data-action="announce-ask">답 고치기</button>',
      '<button type="button" class="primary" data-action="announce-steps">절차 안내</button></div>'
    ].join("");
  }

  function renderAnnounceSteps() {
    const briefing = state.announce.briefing;
    if (!briefing.steps.length) {
      return flashHtml() + [
        "<h2>절차 안내</h2>",
        "<p>신청 방법 문장을 문서에서 찾지 못해 절차를 만들지 않았습니다. 공식 안내를 직접 확인해 주세요.</p>",
        '<div class="actions"><button type="button" data-action="announce-back-brief">설명으로</button></div>'
      ].join("");
    }
    const index = Math.min(state.announce.stepIndex, briefing.steps.length - 1);
    const step = briefing.steps[index];
    const stopped = state.announce.stopped;
    const links = briefing.links.map(function (url) {
      return '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + "</a></li>";
    }).join("");
    const notes = [];
    if (step.login) notes.push("로그인과 인증은 공식 사이트에서 직접 합니다. 이 화면에는 비밀번호나 인증번호 칸이 없습니다.");
    if (step.input) notes.push("입력은 공식 화면에서 직접 합니다. 이 안내는 값을 받지 않습니다.");
    if (step.attach) notes.push("첨부도 공식 화면에서 직접 합니다. 서류 원본을 여기서 받지 않습니다.");
    if (step.submit) notes.push("제출은 공식 화면에서 직접 합니다. 이 확인은 접수 완료가 아닙니다.");
    const confirmed = state.announce.confirmed[step.id] ? '<p class="fine">이 단계를 확인했습니다. 신청·선정 상태는 바뀌지 않습니다.</p>' : "";
    return flashHtml() + [
      "<h2>문서에서 읽은 절차</h2>",
      '<p class="fine">기관이 만들거나 승인한 안내가 아닙니다. 공식 화면을 복제하지 않으며, 대신 입력하거나 제출하지 않습니다. ' + (index + 1) + " / " + briefing.steps.length + "</p>",
      stopped ? '<div class="flash warn">이 절차 안내만 멈췄습니다. 공식 안내를 직접 확인해 주세요. 서비스 전체나 대시보드 상태는 바꾸지 않습니다.</div>' : "",
      '<article class="ticket"><header><div><span class="chip">' + step.index + "단계</span><h3>" + esc(step.text) + "</h3></div></header>",
      notes.map(function (note) { return "<p>" + esc(note) + "</p>"; }).join(""),
      confirmed,
      "</article>",
      links ? "<h3>문서 또는 입력에 있던 주소</h3><ul>" + links + '</ul><p class="help">주소는 직접 확인하고 직접 여세요.</p>' : "",
      stopped ? "" : '<div class="actions"><button type="button" data-action="step-prev">이전</button><button type="button" data-action="step-next">다음</button><button type="button" class="primary" data-action="step-confirm">이 단계 확인</button></div>',
      stopped ? "" : '<div class="field"><label class="label" for="announce-mismatch">안내와 다름</label><select id="announce-mismatch"><option value="">선택</option><option value="버튼 위치 다름">버튼 위치 다름</option><option value="입력 항목 다름">입력 항목 다름</option><option value="단계 없음">단계 없음</option></select><button type="button" data-action="step-stop">이 흐름만 중지</button><p class="fine">화면 캡처나 파일은 받지 않습니다.</p></div>',
      '<div class="actions"><button type="button" data-action="announce-back-brief">설명으로</button></div>'
    ].join("");
  }

  function sourceLabel(briefing) {
    if (briefing.sourceKind === "url") return "공고 주소에서 읽음" + (briefing.sourceUrl ? " · " + briefing.sourceUrl : "");
    if (briefing.sourceName) return "공고 문서 · " + briefing.sourceName;
    return "붙여 넣은 공고 글";
  }

  function applyBriefing(text, meta) {
    const briefing = Announce.readAnnouncement(text, meta);
    state.announce.rawText = text;
    state.announce.briefing = briefing;
    state.announce.answers = {};
    state.announce.docChecks = {};
    state.announce.stepIndex = 0;
    state.announce.stopped = false;
    state.announce.confirmed = {};
    state.announce.mismatch = "";
    if (!meta || !meta.keepPrograms) state.announce.programs = [];
    state.announce.stage = "briefing";
    state.view = "announce";
    state.flash = briefing.tooShort
      ? { kind: "warn", text: "본문이 거의 없어 절차를 만들지 않았습니다." }
      : { kind: "info", text: "올린 글에서 찾은 항목만 설명합니다." };
    render();
  }

  function readAnnounceAnswers() {
    const months = document.getElementById("announce-months");
    if (months) state.announce.answers.childMonths = months.value.trim();
    document.querySelectorAll("#announce-questions input[type=radio]:checked").forEach(function (el) {
      state.announce.answers[el.name.slice(3)] = el.value;
    });
  }

  async function readAnnounceFile(file) {
    const buffer = await file.arrayBuffer();
    const name = file.name || "공고 문서";
    if (/\.hwp$/i.test(name) || /\.hwpx$/i.test(name) || /\.pdf$/i.test(name) || file.type === "application/pdf") {
      const readOnThisComputer = await readSummaryPdf(buffer, name);
      if (readOnThisComputer) return;
      if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
        const extracted = await Pdf.extractPdfText(buffer);
        if (extracted.ok) {
          applyBriefing(extracted.text, { kind: "document", name: name });
          return;
        }
      }
      state.flash = { kind: "bad", text: "이 공고 문서에서 글을 읽지 못했습니다. 서버(uvicorn)가 켜져 있는지 확인한 뒤 다시 올려 주세요." };
      render();
      return;
    }
    applyBriefing(new TextDecoder("utf-8", { fatal: false }).decode(buffer), { kind: "document", name: name });
  }

  function programToText(program) {
    return [
      "사업명: " + (program.name || ""),
      "지원대상: " + (program.target || ""),
      "지원내용: " + [program.summary, program.benefit].filter(Boolean).join(" "),
      "신청방법: " + (program.method || ""),
      "제출서류: " + (program.documents || "")
    ].join("\n");
  }

  async function readSummaryPdf(buffer, name) {
    let response;
    try {
      response = await fetch("/api/read-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer
      });
    } catch (error) {
      return false; // 서버에 연결하지 못하면 호출한 쪽이 브라우저 안 PDF 읽기로 넘어감
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }
    if (!payload.ok) return false;
    if (payload.programs && payload.programs.length) {
      state.announce.programs = payload.programs;
      state.announce.briefing = null;
      state.announce.stage = "programs";
      state.view = "announce";
      state.flash = { kind: "info", text: "요약집에서 사업 " + payload.programs.length + "개를 읽었습니다. 하나를 고르면 그 칸의 문장만으로 안내합니다." };
      render();
      return true;
    }
    applyBriefing(payload.text || "", { kind: "document", name: name, title: payload.title || "" });
    return true;
  }

  async function readAnnounceUrl() {
    const input = document.getElementById("announce-url");
    const url = (input ? input.value : state.announce.url).trim();
    state.announce.url = url;
    if (!/^https?:\/\//i.test(url)) {
      state.flash = { kind: "warn", text: "http 또는 https로 시작하는 공고 주소만 읽을 수 있습니다." };
      render();
      return;
    }
    state.flash = { kind: "info", text: "공고 페이지를 읽는 중입니다." };
    render();
    try {
      const response = await fetch("/api/read-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });
      const payload = await response.json();
      if (!payload.ok) {
        state.flash = { kind: "bad", text: payload.error || "주소를 읽지 못했습니다. 공고 문서를 올려 주세요." };
        render();
        return;
      }
      applyBriefing(payload.text, { kind: "url", name: payload.url, url: payload.url, title: payload.title || "" });
    } catch (error) {
      state.flash = { kind: "bad", text: "주소 읽기 서버에 연결하지 못했습니다. 서버(uvicorn)가 켜져 있는지 확인하거나, 공고 문서를 올려 주세요." };
      render();
    }
  }

  function renderFoot() {
    return "<p>시연 기준일 " + Data.TODAY + ". 기록은 이 탭의 메모리에만 있습니다. 재방문 저장은 켜져 있지 않습니다. 탭을 닫은 뒤의 삭제는 검증하지 않았습니다.</p>" +
      '<button type="button" data-action="clear-session">세션 비우기</button>';
  }

  function checksFor(id) {
    const program = programById(id);
    if (!state.prepChecks[id]) state.prepChecks[id] = program.documents.map(function () { return false; });
    return state.prepChecks[id];
  }

  function assignBind(path, value) {
    const parts = path.split(".");
    if (parts[0] === "guide" && parts[1] === "memo") {
      state.guideMemo = value;
      return;
    }
    state[parts[0]][parts[1]] = value;
  }

  function validate(draft) {
    if (draft.livesInWonju !== "yes" && draft.livesInWonju !== "no") return "원주 거주 여부를 선택해 주세요.";
    const months = Number(draft.childMonths);
    if (draft.childMonths === "" || !Number.isInteger(months) || months < 0 || months > 84) {
      return "자녀 개월 수는 0에서 84 사이의 정수로 입력해 주세요.";
    }
    if (!draft.returnToWork) return "복직 준비 여부를 선택해 주세요.";
    if (draft.returnToWork === "yes" && !draft.returnTiming) return "복직 예정 시점을 선택해 주세요.";
    if (draft.singleChild !== "yes" && draft.singleChild !== "no") return "자녀 1명 기준인지 선택해 주세요.";
    return "";
  }

  function readDraftFromDom() {
    const months = document.getElementById("child-months");
    if (months) state.draft.childMonths = months.value;
    document.querySelectorAll("#question-form input[type=radio]:checked").forEach(function (el) {
      state.draft[el.name] = el.value;
    });
  }

  function readReceiptFromDom() {
    const program = document.getElementById("receipt-program");
    const kind = document.getElementById("receipt-kind");
    const amount = document.getElementById("receipt-amount");
    const date = document.getElementById("receipt-date");
    const period = document.getElementById("receipt-period");
    if (program) state.receipt.programName = program.value;
    if (kind) state.receipt.kind = kind.value;
    if (amount) state.receipt.amount = amount.value;
    if (date) state.receipt.date = date.value;
    if (period) state.receipt.periodKey = period.value;
  }

  function judge() {
    readDraftFromDom();
    const message = validate(state.draft);
    if (message) {
      state.flash = { kind: "warn", text: message };
      state.view = "questions";
      render();
      return;
    }
    state.answers = Rules.normalizeAnswers(state.draft);
    state.judgments = Rules.judgeAll(state.answers);
    state.view = "results";
    state.flash = { kind: "info", text: "가상 규칙으로 판정했습니다. 조건 일치는 수급 확정이 아닙니다." };
    render();
  }

  async function sha256(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  async function ingest(name, buffer) {
    const hash = await sha256(buffer);
    const extracted = await Pdf.extractPdfText(buffer);
    if (!extracted.ok) {
      state.flash = { kind: "warn", text: extracted.reason };
      state.view = "files";
      render();
      return;
    }
    const parsed = Files.parseDocument(extracted.text, { pdfPage: 1 });
    const id = "doc-" + state.seq;
    state.seq += 1;
    const added = Ledger.addDocument(state.session, parsed, { id: id, fileName: name, hash: hash });
    if (!added.ok) {
      state.flash = { kind: "warn", text: added.message };
      state.activeDocId = added.existingId;
      state.view = "files";
      render();
      return;
    }
    const blob = new Blob([buffer], { type: "application/pdf" });
    state.files[id] = { text: extracted.text, blobUrl: URL.createObjectURL(blob) };
    state.activeDocId = id;
    state.highlightId = null;
    state.view = "files";
    state.flash = { kind: "info", text: "추출 초안입니다. 항목마다 원문을 확인하세요." };
    render();
  }

  async function loadSample(file, label) {
    const response = await fetch(file);
    if (!response.ok) throw new Error("샘플을 열지 못했습니다.");
    await ingest(label + ".pdf", await response.arrayBuffer());
  }

  function registerDoc() {
    const result = Ledger.registerDocument(state.session, state.activeDocId, Data.PROGRAMS);
    state.flash = { kind: result.ok ? "info" : "warn", text: result.ok ? result.area + "에 확인한 항목만 등록했습니다." : result.message };
    if (result.ok) state.view = "dashboard";
    render();
  }

  function addReceipt() {
    readReceiptFromDom();
    const draft = state.receipt;
    const result = Ledger.addReceipt(state.session, {
      id: "receipt-" + state.seq,
      programName: draft.programName,
      kind: draft.kind,
      amount: draft.kind === "현금" ? draft.amount : "",
      date: draft.date,
      periodKey: draft.periodKey
    });
    state.seq += 1;
    if (!result.ok) {
      state.flash = { kind: "bad", text: result.message };
    } else {
      state.flash = { kind: result.warning ? "warn" : "info", text: result.warning || "직접 기록으로 추가했습니다. 기관 확정값이 아닙니다." };
      state.receipt.amount = "";
    }
    render();
  }

  function clearSession() {
    Object.keys(state.files).forEach(function (id) {
      URL.revokeObjectURL(state.files[id].blobUrl);
    });
    state.files = {};
    state.session = Ledger.createSession();
    state.answers = null;
    state.judgments = [];
    state.evidenceId = null;
    state.prepProgramId = null;
    state.prepChecks = {};
    state.prepSelf = {};
    state.activeDocId = null;
    state.guideIndex = 0;
    state.guideMemo = "";
    state.guideMismatch = "";
    state.editingId = null;
    state.clawId = null;
    state.announce = emptyAnnounce();
    state.view = "start";
    state.flash = { kind: "info", text: "이 탭의 기록을 비웠습니다." };
    render();
  }

  document.addEventListener("input", function (event) {
    const el = event.target;
    if (el.id === "edit-amount") state.editAmount = el.value;
    if (el.id === "claw-amount") state.clawAmount = el.value;
    if (el.id === "announce-months") state.announce.answers.childMonths = el.value.trim();
    if (el.dataset.bind && el.dataset.render !== "true") assignBind(el.dataset.bind, el.value);
  });

  document.addEventListener("change", function (event) {
    const el = event.target;
    if (el.id === "file-input" && el.files && el.files[0]) {
      const file = el.files[0];
      file.arrayBuffer().then(function (buffer) {
        return ingest(file.name, buffer);
      }).catch(function () {
        state.flash = { kind: "bad", text: "파일을 읽지 못했습니다." };
        render();
      });
      el.value = "";
      return;
    }
    if (el.id === "announce-file" && el.files && el.files[0]) {
      const picked = el.files[0];
      readAnnounceFile(picked).catch(function () {
        state.flash = { kind: "bad", text: "공고 문서를 읽지 못했습니다." };
        render();
      });
      el.value = "";
      return;
    }
    if (el.dataset.announceDoc != null) {
      state.announce.docChecks[el.dataset.announceDoc] = el.checked;
      return;
    }
    if (el.name && el.name.indexOf("aq-") === 0) {
      state.announce.answers[el.name.slice(3)] = el.value;
      return;
    }
    if (el.id === "guide-mismatch") {
      state.guideMismatch = el.value;
      return;
    }
    if (el.dataset.confirm) {
      Ledger.confirmField(state.session, state.activeDocId, el.dataset.confirm, el.checked);
      if (el.checked) state.highlightId = el.dataset.confirm;
      render();
      return;
    }
    if (el.dataset.prepDoc != null && state.prepProgramId) {
      const checks = checksFor(state.prepProgramId);
      checks[Number(el.dataset.prepDoc)] = el.checked;
      render();
      return;
    }
    if (el.dataset.self && state.prepProgramId) {
      state.prepSelf[state.prepProgramId] = el.checked;
      render();
      return;
    }
    if (el.dataset.bind) {
      assignBind(el.dataset.bind, el.value);
      if (el.dataset.render === "true") render();
    }
  });

  document.addEventListener("click", function (event) {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "nav") {
      state.view = el.dataset.view;
      state.flash = null;
      render();
      return;
    }
    if (action === "demo") {
      state.draft = {
        livesInWonju: "yes",
        childMonths: "23",
        returnToWork: "yes",
        returnTiming: "next_quarter",
        singleChild: "yes",
        childcare: ""
      };
      state.flash = { kind: "info", text: "시연 예시를 채웠습니다. 원주 거주, 23개월, 다음 분기 복직, 자녀 1명입니다." };
      render();
      return;
    }
    if (action === "judge") {
      judge();
      return;
    }
    if (action === "childcare") {
      state.draft.childcare = el.dataset.value;
      if (state.answers) state.answers.childcare = el.dataset.value;
      state.judgments = Rules.judgeAll(state.answers || state.draft);
      state.flash = null;
      render();
      return;
    }
    if (action === "evidence") {
      state.evidenceId = el.dataset.id;
      state.view = "evidence";
      render();
      return;
    }
    if (action === "open-prep") {
      state.prepProgramId = el.dataset.id;
      checksFor(el.dataset.id);
      state.view = "prep";
      render();
      return;
    }
    if (action === "sample") {
      loadSample(el.dataset.file, el.dataset.label).catch(function () {
        state.flash = { kind: "bad", text: "샘플을 열지 못했습니다. 이 폴더에서 웹 서버로 열어 주세요." };
        render();
      });
      return;
    }
    if (action === "register-doc") {
      registerDoc();
      return;
    }
    if (action === "invalidate-doc") {
      Ledger.invalidateDocument(state.session, state.activeDocId);
      state.flash = { kind: "warn", text: "이 파일에서 나온 근거를 무효화했습니다. 직접 기록한 수령은 그대로입니다." };
      render();
      return;
    }
    if (action === "filter") {
      state.filterMode = el.dataset.mode;
      render();
      return;
    }
    if (action === "add-receipt") {
      addReceipt();
      return;
    }
    if (action === "edit-receipt") {
      const record = state.session.receipts.find(function (item) { return item.id === el.dataset.id; });
      state.editingId = el.dataset.id;
      state.editAmount = record && record.amount != null ? String(record.amount) : "";
      render();
      return;
    }
    if (action === "save-edit") {
      const editInput = document.getElementById("edit-amount");
      if (editInput) state.editAmount = editInput.value;
      Ledger.updateReceipt(state.session, el.dataset.id, { amount: state.editAmount });
      state.editingId = null;
      state.flash = { kind: "info", text: "기록을 수정하고 합계를 다시 계산했습니다." };
      render();
      return;
    }
    if (action === "cancel-receipt") {
      Ledger.cancelReceipt(state.session, el.dataset.id);
      state.flash = { kind: "info", text: "기록을 취소하고 합계를 다시 계산했습니다. 이력은 남습니다." };
      render();
      return;
    }
    if (action === "claw-receipt") {
      state.clawId = el.dataset.id;
      state.clawAmount = "";
      render();
      return;
    }
    if (action === "save-claw") {
      const clawInput = document.getElementById("claw-amount");
      if (clawInput) state.clawAmount = clawInput.value;
      const original = state.session.receipts.find(function (item) { return item.id === el.dataset.id; });
      const amount = Number(state.clawAmount);
      if (!original || !Number.isInteger(amount) || amount <= 0) {
        state.flash = { kind: "warn", text: "환수 금액은 1 이상의 정수로 입력해 주세요. 원래 기록은 지우지 않습니다." };
        render();
        return;
      }
      Ledger.addReceipt(state.session, {
        id: "claw-" + state.seq,
        programName: original.programName,
        kind: "현금",
        amount: -amount,
        date: original.date,
        periodKey: original.periodKey + "-환수",
        adjustmentOf: original.id
      });
      state.seq += 1;
      state.clawId = null;
      state.flash = { kind: "info", text: "환수 조정을 추가했습니다. 원래 기록은 남아 있고 합계만 다시 계산했습니다." };
      render();
      return;
    }
    if (action === "guide-prev") {
      state.guideIndex = Math.max(0, state.guideIndex - 1);
      render();
      return;
    }
    if (action === "guide-next") {
      if (!state.session.guideStopped) {
        state.guideIndex = Math.min(Data.GUIDE.scenes.length - 1, state.guideIndex + 1);
      }
      render();
      return;
    }
    if (action === "guide-confirm") {
      const scene = Data.GUIDE.scenes[state.guideIndex];
      state.session.guideConfirmed[scene.id] = true;
      state.flash = { kind: "info", text: "이 장면을 확인했습니다. 신청·선정 상태는 바뀌지 않습니다." };
      render();
      return;
    }
    if (action === "guide-stop") {
      const select = document.getElementById("guide-mismatch");
      const value = select ? select.value : "";
      if (!value) {
        state.flash = { kind: "warn", text: "어떤 점이 다른지 선택해 주세요." };
        render();
        return;
      }
      state.guideMismatch = value;
      state.session.guideStopped = true;
      state.flash = null;
      render();
      return;
    }
    if (action === "reset-guide") {
      state.session.guideConfirmed = {};
      state.session.guideStopped = false;
      state.guideIndex = 0;
      state.guideMismatch = "";
      state.flash = { kind: "info", text: "절차 안내만 처음부터 다시 봅니다. 대시보드 기록은 그대로입니다." };
      render();
      return;
    }
    if (action === "read-paste") {
      const paste = document.getElementById("announce-paste");
      if (paste) state.announce.paste = paste.value;
      if (!state.announce.paste.trim()) {
        state.flash = { kind: "warn", text: "읽을 공고 글을 붙여 넣어 주세요." };
        render();
        return;
      }
      applyBriefing(state.announce.paste, { kind: "paste", name: "붙여 넣은 글" });
      return;
    }
    if (action === "read-url") {
      readAnnounceUrl();
      return;
    }
    if (action === "read-summary") {
      fetch("samples/wonju-summary.pdf").then(function (response) {
        if (!response.ok) throw new Error("summary");
        return response.arrayBuffer();
      }).then(function (buffer) {
        return readSummaryPdf(buffer, "원주시 영유아 주기별 지원혜택 핵심 요약집.pdf").then(function (ok) {
          if (!ok) throw new Error("summary");
        });
      }).catch(function () {
        state.flash = { kind: "bad", text: "요약집을 열지 못했습니다. static/samples/wonju-summary.pdf 파일이 있는지, 서버가 켜져 있는지 확인해 주세요." };
        render();
      });
      return;
    }
    if (action === "announce-programs") {
      state.announce.stage = "programs";
      state.flash = null;
      render();
      return;
    }
    if (action === "open-program") {
      const program = state.announce.programs[Number(el.dataset.index)];
      if (!program) return;
      applyBriefing(programToText(program), {
        kind: "document",
        name: program.name,
        keepPrograms: true
      });
      return;
    }
    if (action === "read-sample") {
      fetch("samples/sample-announcement.txt").then(function (response) {
        if (!response.ok) throw new Error("sample");
        return response.text();
      }).then(function (text) {
        applyBriefing(text, { kind: "document", name: "sample-announcement.txt" });
      }).catch(function () {
        state.flash = { kind: "bad", text: "시연 공고를 열지 못했습니다. 이 폴더에서 웹 서버로 열어 주세요." };
        render();
      });
      return;
    }
    if (action === "announce-reset") {
      const keptUrl = state.announce.url;
      state.announce = emptyAnnounce();
      state.announce.url = keptUrl;
      state.flash = null;
      render();
      return;
    }
    if (action === "announce-ask") {
      state.announce.stage = "questions";
      state.flash = null;
      render();
      return;
    }
    if (action === "announce-back-brief") {
      state.announce.stage = "briefing";
      state.flash = null;
      render();
      return;
    }
    if (action === "announce-compare") {
      readAnnounceAnswers();
      state.announce.stage = "result";
      state.flash = null;
      render();
      return;
    }
    if (action === "announce-steps") {
      readAnnounceAnswers();
      state.announce.stage = "steps";
      state.flash = null;
      render();
      return;
    }
    if (action === "step-prev") {
      state.announce.stepIndex = Math.max(0, state.announce.stepIndex - 1);
      render();
      return;
    }
    if (action === "step-next") {
      if (!state.announce.stopped && state.announce.briefing) {
        state.announce.stepIndex = Math.min(state.announce.briefing.steps.length - 1, state.announce.stepIndex + 1);
      }
      render();
      return;
    }
    if (action === "step-confirm") {
      const steps = state.announce.briefing ? state.announce.briefing.steps : [];
      const step = steps[state.announce.stepIndex];
      if (step) state.announce.confirmed[step.id] = true;
      state.flash = { kind: "info", text: "이 단계를 확인했습니다. 신청·선정 상태는 바뀌지 않습니다." };
      render();
      return;
    }
    if (action === "step-stop") {
      const select = document.getElementById("announce-mismatch");
      const value = select ? select.value : "";
      if (!value) {
        state.flash = { kind: "warn", text: "어떤 점이 다른지 선택해 주세요." };
        render();
        return;
      }
      state.announce.mismatch = value;
      state.announce.stopped = true;
      state.flash = null;
      render();
      return;
    }
    if (action === "clear-session") clearSession();
  });

  render();
})();
