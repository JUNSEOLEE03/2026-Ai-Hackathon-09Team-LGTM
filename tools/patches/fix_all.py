#!/usr/bin/env python3
"""
fix_all.py — 원주 육아 혜택 비서: 통합 점검에서 찾은 문제를 한 번에 고치는 스크립트

사용법 (EC2 터미널)
    cd ~/wonju-on-cloud/backend
    python3 fix_all.py            # 고칠 곳을 모두 찾은 뒤에만 파일을 바꿈
    python3 fix_all.py --check    # 바꾸지 않고 찾기만 함

안전장치
  - 꼭 필요한 수정(★)의 원래 문장을 하나라도 못 찾으면 아무 파일도 바꾸지 않고 멈춥니다.
  - 선택 수정(·)은 못 찾으면 건너뛰고 알려 줍니다.
  - 이미 고친 파일에 다시 실행해도 같은 수정을 두 번 하지 않습니다.
  - 되돌리기: git checkout -- app/ static/   (커밋 전이라면)
  - AI 비서 화면에는 새 CSS를 넣지 않습니다. 기존 스타일 그대로 기능만 더합니다. (CSS 변경은 로고 색·경고 수정뿐)
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
CHECK_ONLY = "--check" in sys.argv

PATCHES = []  # (파일, 설명, 원래 글, 바꿀 글, 필수 여부)


def patch(path, desc, old, new, required=True):
    PATCHES.append((path, desc, old, new, required))


# =====================================================================
# 1. plan-ui.js — 시작 화면 카드 갱신, 서버 AI 연결, 안 쓰는 함수 정리
# =====================================================================
UI = "static/js/plan-ui.js"

patch(UI, "시작 화면 카드: 계산 결과를 받아서 그릴 수 있게",
"""  function buildHero() {
        const pv = previewModel();""",
"""  function buildHero(given) {
        const pv = given || previewModel();""")

patch(UI, "시작 화면 카드: 결과가 바뀌면 다시 그리는 함수 추가",
"""  function mountPersistentIntro() {""",
"""  /* 결과가 바뀌면 시작 화면 카드 4개도 같은 계산 결과로 다시 그림.
     (예전에는 처음 연 순간의 '예시 가구' 숫자가 진단 뒤에도 그대로 남았음) 내용이 같으면 그대로 둠 */
  function refreshHero(m) {
    const oldHero = introTopBox && introTopBox.querySelector(".hero-wrap");
    if (!oldHero) return;
    const pv = { m: m, specs: kpiSpecs(m), demo: !!state.demo };
    const key = JSON.stringify(pv.specs) + "|" + pv.demo;
    if (ui.heroKey === key) return;
    ui.heroKey = key;
    oldHero.replaceWith(buildHero(pv));
  }

  function mountPersistentIntro() {""")

patch(UI, "시작 화면 카드: 결과를 그릴 때마다 갱신",
"""    const m = buildModel();
    ui.lastModel = m;
""",
"""    const m = buildModel();
    ui.lastModel = m;
    refreshHero(m);
""")

patch(UI, "AI 비서: 질문 원문을 넘겨줌",
"""    runIntent(parsed);""",
"""    runIntent(parsed, text);""")

patch(UI, "AI 비서: 규칙으로 못 알아들은 질문은 서버 AI(Bedrock)로",
"""  function runIntent(p) {""",
r"""  /* 규칙으로 이해하지 못한 질문은 서버 AI(/api/chat, Bedrock)에게 물어봅니다.
     금액·판정의 기준은 언제나 화면의 규칙 엔진이고, 서버 AI 답은 참고로 보여 줍니다.
     서버가 꺼져 있거나 실패하면 예전처럼 예시 질문을 보여 줍니다. */
  function fallbackChips(box) {
    clear(box);
    box.appendChild(el("p", { class: "muted", text: "아직 이 질문은 이해하지 못했어요. 추측해서 답하지 않을게요. 이런 걸 물어볼 수 있어요." }));
    box.appendChild(el("div", { class: "chat-suggest" }, chipButtons(CHIPS.concat(MORE_CHIPS), "chat-chip")));
  }

  /* 서버 AI 답을 카드에 그림. 새 스타일 없이 AI 비서 카드에 이미 있는 모양만 씀
     (목록 doc-list, 소제목 mb-ex-title, 합계 줄 msg-sum, 안내 muted)
     순서: 답변 문장 → 해당하는 혜택 → 확인이 필요한 혜택 → AI 기준 합계와 화면 계산 비교 → AI가 이해한 조건 → 안내 */
  function aiList(title, items, lineOf) {
    if (!items || !items.length) return null;
    return el("div", { class: "msg-sub" }, [
      el("p", { class: "mb-ex-title", text: title }),
      el("ul", { class: "doc-list" }, items.map(function (x) { return el("li", { text: lineOf(x) }); }))
    ]);
  }

  function renderAiAnswer(box, data) {
    clear(box);
    box.appendChild(el("p", { text: data.reply }));
    [
      aiList("해당하는 혜택", data.matched, function (x) { return x.title + (x.amount_text ? " · " + x.amount_text : ""); }),
      aiList("확인이 필요한 혜택", data.check, function (x) { return x.title + (x.reason ? " · " + x.reason : ""); })
    ].forEach(function (n) { if (n) box.appendChild(n); });

    if (data.total_monthly || data.total_once) {
      box.appendChild(el("p", { class: "msg-sum" }, [
        "AI 기준 합계 ",
        el("strong", { text: "매월 " + won(Number(data.total_monthly) || 0) }),
        data.total_once ? " · 일시금 " + won(Number(data.total_once)) : null
      ]));
    }
    const m = ui.lastModel;
    if (m && m.sched && m.sched.months.length) {
      const cash0 = m.sched.months[0].cash;
      box.appendChild(el("p", { class: "msg-sum" }, [
        "화면 계산 ",
        el("strong", { text: "이번 달 현금 " + won(cash0) }),
        m.sched.lumpTotal ? " · 일시금 " + won(m.sched.lumpTotal) : null
      ]));
      if ((Number(data.total_monthly) || 0) !== cash0) {
        box.appendChild(el("p", { class: "muted", text: "두 금액이 달라요. 서버 AI는 별도 혜택 목록으로 계산하고, 화면은 복직 시점·어린이집·출생 순서까지 반영해 계산해요. 금액은 화면 계산을 기준으로 보세요." }));
      }
    }
    const pf = data.extracted_profile;
    if (pf) {
      const bits = [
        pf.child_months != null ? "생후 " + pf.child_months + "개월" : null,
        pf.work_status || null,
        pf.income_level && pf.income_level !== "모름" ? "소득 " + pf.income_level : null,
        pf.region || null
      ].filter(Boolean);
      if (bits.length) box.appendChild(el("p", { class: "muted", text: "AI가 이해한 조건: " + bits.join(" · ") }));
    }
    box.appendChild(el("p", { class: "muted", text: data.disclaimer || "정확한 지급 여부는 담당 부서에서 확인해 주세요." }));
  }

  function askServerAi(text) {
    let holder = null;
    addBot("서버 AI에게 물어보고 있어요…", {
      render: function (x, box) {
        holder = box;
        clear(box);
        box.appendChild(el("p", { class: "muted", text: "AI가 답을 정리하고 있어요. 잠시만 기다려 주세요." }));
      },
      note: "규칙으로 바로 답하지 못한 질문이라 서버 AI(Bedrock)에게 보냈어요. 우리 집 조건 요약과 질문만 보내고, 서버에 저장하지 않아요."
    });
    if (!holder) return;
    const titleEl = holder.parentNode ? holder.parentNode.querySelector(".msg-title") : null;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "우리 가족 상황: " + summaryText() + "\n질문: " + text }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (!data || data.status !== "success" || !data.reply) throw new Error("ai");
      if (titleEl) titleEl.textContent = "서버 AI의 답변이에요.";
      renderAiAnswer(holder, data);
    }).catch(function () {
      if (titleEl) titleEl.textContent = "이 질문은 아직 답하지 못했어요.";
      fallbackChips(holder);
    }).then(function () {
      clearTimeout(timer);
      setTimeout(scrollLog, 0);
    });
  }

  function runIntent(p, rawText) {""")

patch(UI, "AI 비서: 기본 응답을 서버 AI 호출로",
"""      default:
        addBot("아직 이 질문은 이해하지 못했어요. 추측해서 답하지 않을게요. 이런 걸 물어볼 수 있어요.", {
          render: function (x, box) { clear(box); box.appendChild(el("div", { class: "chat-suggest" }, chipButtons(CHIPS.concat(MORE_CHIPS), "chat-chip"))); }
        });""",
"""      default:
        askServerAi(rawText || "");""")

# 안 쓰는 함수 정리 (못 찾아도 동작에는 영향 없음)
patch(UI, "안 쓰는 함수 buildBellIcon 삭제",
"""  function buildBellIcon() {
    return svgEl("svg", { viewBox: "0 0 24 24", class: "fp-bell-svg", "aria-hidden": "true" }, [
      svgEl("path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" }),
      svgEl("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" }),
      svgEl("circle", { cx: "18", cy: "5", r: "3", class: "fp-bell-dot" })
    ]);
  }

""", "", required=False)

patch(UI, "안 쓰는 함수 heroStats·heroAmountRows 삭제",
"""  /* 항상 맨 위에 렌더링되는 서비스 소개(Hero) 섹션 */
  function heroStats() {
    let official = 0, partial = 0;
    CATALOG.forEach(function (p) {
      if (p.verification === "공식 확인") official++;
      else if (p.verification === "부분 확인") partial++;
    });
    return { total: CATALOG.length, official: official, partial: partial };
  }

  function heroAmountRows() {
    function find(id) { return CATALOG.filter(function (p) { return p.id === id; })[0]; }
    const rows = [];
    const p1 = find("P01"), p2 = find("P02"), p3 = find("P03");
    if (p1 && p1.amount) rows.push(["부모급여 월", won(p1.amount)]);
    if (p2 && p2.timeline && p2.timeline.amountByOrder) rows.push(["첫만남이용권", won(p2.timeline.amountByOrder.first)]);
    if (p3 && p3.amount) rows.push(["아동수당 월", won(p3.amount)]);
    return rows;
  }

""", "", required=False)

patch(UI, "안 쓰는 함수 deadlineText 삭제",
"""  function deadlineText(m, prog) {
    const ev = deadlineOf(m, prog.id);
    if (ev) return approxMonthLabel(ev.date) + "까지";
    if (prog.deadlines && prog.deadlines.length) return "아이 " + prog.deadlines[0].beforeAgeMonths + "개월 전까지" + (state.answers.childMonths >= prog.deadlines[0].beforeAgeMonths ? " (지남)" : "");
    if (prog.payUnit === "일시" && prog.rules && prog.rules.maxMonthsExclusive != null) return "아이 " + prog.rules.maxMonthsExclusive + "개월 전까지";
    return "기한 정보 없음 · 기관 확인";
  }

""", "", required=False)

patch(UI, "부모급여(어린이집 이용 시 일부 바우처) 아이콘을 바우처로",
"""    if (state.answers.childcare === "yes" && prog.timeline && prog.timeline.voucherWhenChildcare) return "voucher";""",
"""    if (state.answers.childcare === "yes" && prog.timeline && (prog.timeline.voucherWhenChildcare || prog.timeline.childcareVoucherByAge)) return "voucher";""",
required=False)

# =====================================================================
# 2. chat.js — 옛 아이폰(iOS 16.3 이하)에서도 동작하도록 정규식 수정 (결과는 똑같음)
# =====================================================================
CHAT = "static/js/chat.js"

patch(CHAT, "주민번호 가리기: 옛 Safari 호환 정규식",
r"""    text = text.replace(/\d{6}\s*-\s*\d{7}|(?<!\d)\d{6}[1-8]\d{6}(?!\d)/g, function () { note("주민번호"); return "[주민번호 가림]"; });""",
r"""    /* 옛 Safari는 (?<!…) 문법을 몰라 파일 전체가 멈추므로, 앞 글자(pre)를 함께 잡아 되돌려 줌 */
    text = text.replace(/(\d{6}\s*-\s*\d{7})|(^|\D)(\d{6}[1-8]\d{6})(?!\d)/g, function (m, dashed, pre) { note("주민번호"); return (dashed ? "" : pre) + "[주민번호 가림]"; });""")

patch(CHAT, "전화번호 가리기: 옛 Safari 호환 정규식",
r"""    text = text.replace(/(?<!\d)0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/g, function (m) {
      if (digitsOf(m) < 9) return m;
      note("전화번호"); return "[전화번호 가림]";
    });""",
r"""    text = text.replace(/(^|\D)(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4})(?!\d)/g, function (m, pre, num) {
      if (digitsOf(num) < 9) return m;
      note("전화번호"); return pre + "[전화번호 가림]";
    });""")

patch(CHAT, "계좌번호 가리기: 옛 Safari 호환 정규식",
r"""    text = text.replace(/(?<!\d)\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,4})?(?!\d)/g, function (m) {
      if (digitsOf(m) < 10) return m;
      note("계좌번호"); return "[계좌번호 가림]";
    });""",
r"""    text = text.replace(/(^|\D)(\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,4})?)(?!\d)/g, function (m, pre, num) {
      if (digitsOf(num) < 10) return m;
      note("계좌번호"); return pre + "[계좌번호 가림]";
    });""")

# =====================================================================
# 3. plan.html — 서버 AI를 쓰게 되었으므로 안내 문구를 사실대로
# =====================================================================
HTML = "static/plan.html"

patch(HTML, "꼬리말 개인정보 안내",
"""      <p>입력한 내용과 신청 표시는 이 화면에만 있으며, 저장하거나 서버로 보내지 않습니다. 외부 서비스와 통신하지 않습니다.</p>""",
"""      <p>입력한 내용과 신청 표시는 이 화면에만 있으며 저장하지 않습니다. AI 비서가 규칙으로 답하지 못한 질문(조건 요약 포함)과, 공고문 AI 분석에 올린 공고문·주소만 서버 AI로 보내며 서버에 저장하지 않습니다.</p>""", required=False)

patch(HTML, "꼬리말 개인정보 안내 (1차 수정본 → 공고문 분석 포함)",
"""      <p>입력한 내용과 신청 표시는 이 화면에만 있으며 저장하지 않습니다. AI 비서가 규칙으로 답하지 못한 질문만 조건 요약과 함께 서버 AI로 보내며, 서버에 저장하지 않습니다.</p>""",
"""      <p>입력한 내용과 신청 표시는 이 화면에만 있으며 저장하지 않습니다. AI 비서가 규칙으로 답하지 못한 질문(조건 요약 포함)과, 공고문 AI 분석에 올린 공고문·주소만 서버 AI로 보내며 서버에 저장하지 않습니다.</p>""", required=False)

patch(HTML, "AI 비서 입력창 아래 안내",
"""        <p class="chat-note">주민번호와 계좌번호는 입력해도 자동으로 가려요. 답에 나오는 금액과 판정은 규칙 엔진이 계산한 값이에요.</p>""",
"""        <p class="chat-note">주민번호와 계좌번호는 입력해도 자동으로 가려요. 답에 나오는 금액과 판정은 규칙 엔진이 계산한 값이에요. 규칙으로 답하지 못한 질문과 공고문 분석만 서버 AI로 보내요.</p>""", required=False)

patch(HTML, "AI 비서 안내 (1차 수정본 → 공고문 분석 포함)",
"""        <p class="chat-note">주민번호와 계좌번호는 입력해도 자동으로 가려요. 답에 나오는 금액과 판정은 규칙 엔진이 계산한 값이에요. 규칙으로 답하지 못한 질문만 서버 AI로 보내요.</p>""",
"""        <p class="chat-note">주민번호와 계좌번호는 입력해도 자동으로 가려요. 답에 나오는 금액과 판정은 규칙 엔진이 계산한 값이에요. 규칙으로 답하지 못한 질문과 공고문 분석만 서버 AI로 보내요.</p>""", required=False)

# =====================================================================
# 4. plan.css — 로고 가운데 사람 연한 주황 + VS Code appearance 경고
# =====================================================================
CSS = "static/css/plan.css"

patch(CSS, "로고 가운데 사람(머리) 연한 주황",
""".logo-sub {
  fill: #38BDF8;
}""",
""".logo-sub {
  fill: #FDBA74;
}""")

patch(CSS, "로고 가운데 사람(몸) 연한 주황",
""".logo-arc-sub {
  fill: none;
  stroke: #38BDF8;""",
""".logo-arc-sub {
  fill: none;
  stroke: #FDBA74;""")

patch(CSS, "숫자 입력칸 표준 appearance 추가 (경고 제거)",
"""  -moz-appearance: textfield;
}""",
"""  -moz-appearance: textfield;
  appearance: textfield;
}""")

patch(CSS, "숫자 입력 화살표 표준 appearance 추가",
"""  -webkit-appearance: none;
  margin: 0;
}""",
"""  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}""", required=False)

# =====================================================================
# 5. main.py — 주소만 치면(/) 진단 화면(plan.html)으로
# =====================================================================
MAIN = "app/main.py"

patch(MAIN, "RedirectResponse 가져오기",
"""from fastapi.responses import JSONResponse, Response""",
"""from fastapi.responses import JSONResponse, RedirectResponse, Response""")

patch(MAIN, "첫 주소(/)를 plan.html로 보내기 (옛 화면은 /index.html)",
"""if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")""",
"""if os.path.exists(STATIC_DIR):
    # 주소만 치면 진단 화면으로. 공고 읽기 화면은 /index.html 로 들어갑니다. (마운트보다 먼저 등록해야 동작)
    @app.get("/", include_in_schema=False)
    async def go_plan():
        return RedirectResponse("/plan.html")

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")""")

# =====================================================================
# 6. app.js (index.html) — 옛 안내 문구, 서버가 꺼졌을 때 PDF 읽기
# =====================================================================
APP = "static/js/app.js"

patch(APP, "서버가 꺼져 있어도 PDF는 브라우저 안에서 읽도록",
"""  async function readSummaryPdf(buffer, name) {
    const response = await fetch("/api/read-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buffer
    });""",
"""  async function readSummaryPdf(buffer, name) {
    let response;
    try {
      response = await fetch("/api/read-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer
      });
    } catch (error) {
      return false; // 서버에 연결하지 못하면 호출한 쪽이 브라우저 안 PDF 읽기로 넘어감
    }""")

patch(APP, "요약집을 못 읽었을 때 안내 문구가 나오도록",
"""        return readSummaryPdf(buffer, "원주시 영유아 주기별 지원혜택 핵심 요약집.pdf");""",
"""        return readSummaryPdf(buffer, "원주시 영유아 주기별 지원혜택 핵심 요약집.pdf").then(function (ok) {
          if (!ok) throw new Error("summary");
        });""")

patch(APP, "안내 문구: 공고 문서 읽기 실패",
"""이 공고 문서에서 글을 읽지 못했습니다. python3 server.py 로 연 뒤 다시 올려 주세요.""",
"""이 공고 문서에서 글을 읽지 못했습니다. 서버(uvicorn)가 켜져 있는지 확인한 뒤 다시 올려 주세요.""")

patch(APP, "안내 문구: 주소 읽기 서버 없음",
"""주소 읽기 서버가 없습니다. python3 server.py 로 연 뒤 다시 시도하거나, 공고 문서를 올려 주세요.""",
"""주소 읽기 서버에 연결하지 못했습니다. 서버(uvicorn)가 켜져 있는지 확인하거나, 공고 문서를 올려 주세요.""")

patch(APP, "안내 문구: 요약집 열기 실패",
"""요약집을 열지 못했습니다. python3 server.py 로 이 폴더를 열어 주세요.""",
"""요약집을 열지 못했습니다. static/samples/wonju-summary.pdf 파일이 있는지, 서버가 켜져 있는지 확인해 주세요.""")

# =====================================================================
# 7. data.js — 기준일을 plan.html(catalog-verified.js)과 같은 날로
# =====================================================================
patch("static/js/data.js", "기준일 2026-11-07 → 2026-11-08",
"""  const TODAY = "2026-11-07";""",
"""  const TODAY = "2026-11-08";""", required=False)

# =====================================================================
# 8. mock_data.py — 서버 AI가 쓰는 혜택 값을 화면(catalog-verified.js)과 맞춤
# =====================================================================
MOCK = "app/mock_data.py"

patch(MOCK, "아동수당 배지", '"badge_text": "월 10만 원",', '"badge_text": "월 10.5만 원",', required=False)
patch(MOCK, "아동수당 한 줄 요약",
'"one_line_summary": "만 8세 미만(0~95개월) 모든 아동에게 소득과 관계없이 매월 10만 원의 아동수당을 현금으로 지급합니다.",',
'"one_line_summary": "만 9세 미만(0~107개월) 모든 아동에게 소득과 관계없이 매월 10.5만 원(비수도권 기준)의 아동수당을 현금으로 지급합니다.",',
required=False)
patch(MOCK, "아동수당 나이·금액",
'''"child_months": {"min": 0, "max": 95},
            "work_status": ["전체"],
            "region": "원주시",
            "income_rule": "없음",
            "need_check": []
        },
        "amount": {
            "type": "monthly",
            "value": 100000,''',
'''"child_months": {"min": 0, "max": 107},
            "work_status": ["전체"],
            "region": "원주시",
            "income_rule": "없음",
            "need_check": []
        },
        "amount": {
            "type": "monthly",
            "value": 105000,''', required=False)
patch(MOCK, "아동수당 금액 설명",
'''"text": "월 10만 원 (부모급여와 중복 수령 가능)",
            "months": 96''',
'''"text": "월 10.5만 원 (비수도권 기준, 부모급여와 중복 수령 가능)",
            "months": 108''', required=False)
patch(MOCK, "아동수당 상세 요약",
'"one_line_summary": "만 8세 미만(생후 0~95개월) 모든 아동에게 매월 25일 10만 원씩 현금으로 지원합니다.",',
'"one_line_summary": "만 9세 미만(생후 0~107개월) 모든 아동에게 매월 25일 10.5만 원(비수도권 기준)씩 현금으로 지원합니다.",',
required=False)
patch(MOCK, "아동수당 확인 질문",
'"현재 자녀가 만 8세 미만(생후 0~95개월)인가요?",',
'"현재 자녀가 만 9세 미만(생후 0~107개월)인가요?",', required=False)
patch(MOCK, "아동수당 대상",
'"target": "원주시 거주 만 8세 미만(0~95개월) 모든 아동 (부모급여와 별도로 추가 지급)",',
'"target": "원주시 거주 만 9세 미만(0~107개월) 모든 아동 (부모급여와 별도로 추가 지급)",', required=False)
patch(MOCK, "아동수당 혜택",
'"benefit": "아동 1인당 매월 10만 원 현금 지급 (매월 25일 입금)",',
'"benefit": "아동 1인당 매월 10.5만 원 현금 지급 (비수도권 기준, 매월 25일 입금)",', required=False)
patch(MOCK, "아동수당 용어 풀이",
'아동수당 십만 원을 추가로 다 받을 수 있다는 뜻입니다.',
'아동수당 십만 오천 원을 추가로 다 받을 수 있다는 뜻입니다.', required=False)
patch(MOCK, "아동수당 음성 대본",
'만 팔 세 미만 아동을 키우시는 모든 가정에 소득과 상관없이 매달 십만 원을 현금으로 드립니다.',
'만 구 세 미만 아동을 키우시는 모든 가정에 소득과 상관없이 매달 십만 오천 원을 현금으로 드립니다.', required=False)
patch(MOCK, "육아휴직급여 금액 설명",
'"text": "통상임금 기준 월 150만~250만 원",',
'"text": "1~6개월 통상임금 100%(월 상한 250·200만 원), 7개월부터 80%(월 상한 160만 원)",', required=False)


# =====================================================================
# 9. 공고문 AI 분석 — 예전 ai-assist.js 기능을 AI 비서 팝업 안으로 옮김
#    파일(PDF·HWP·HWPX) → /api/analyze, 공고 주소 → /api/analyze-url (Bedrock)
# =====================================================================
patch(CHAT, "질문 이해: '공고문 분석'·공고 주소는 공고문 AI 분석으로",
"""    const month = parseMonths(text);""",
r"""    /* 공고 주소를 붙여 넣거나 공고문 분석을 부탁하면 공고문 AI 분석 카드를 엽니다 */
    const link = text.match(/https?:\/\/\S+/i);
    if (link) return { intent: "analyze_doc", slots: { url: link[0] } };
    if (has(text, /공고문|공고\s*(분석|요약|읽|정리)|pdf|hwp|한글\s*파일/i)) return { intent: "analyze_doc", slots: {} };
    const month = parseMonths(text);""")

patch(CHAT, "의도 목록에 analyze_doc 추가",
"""\"calendar\", \"fallback\"];""",
"""\"calendar\", \"analyze_doc\", \"fallback\"];""", required=False)

patch(UI, "예시 질문에 '공고문 AI 분석' 추가 (사이드 메뉴·팝업 모두)",
"""  const CHIPS = ["이달 신청할 제도 보여줘", "신청 순서 알려줘", "왜 확인 필요예요?"];""",
"""  const CHIPS = ["이달 신청할 제도 보여줘", "신청 순서 알려줘", "왜 확인 필요예요?", "공고문 AI 분석"];""")

patch(UI, "공고문 AI 분석 카드 (파일·주소 → 서버 AI 요약)",
"""  function nextBirthOrder(o) {""",
r"""  /* ---------- 공고문 AI 분석 (예전 ai-assist.js 기능을 AI 비서 안으로) ----------
   * 파일(PDF·HWP·HWPX, 15MB 이하) → POST /api/analyze, 공고 주소 → POST /api/analyze-url
   * 결과: 제목·태그·한 줄 요약·대상·혜택·방법·서류·문의처·확인할 점·어려운 말 풀이·소리로 듣기
   * 서버·AI가 준 글은 모두 textContent로만 넣습니다. */
  const DOC_MAX = 15 * 1024 * 1024;
  const DOC_TIMEOUT = 90000;
  const TTS_LABEL = "소리로 듣기";

  /* 서버를 부르고 JSON을 돌려줌. 실패하면 사용자에게 보여 줄 문장으로 Error를 던짐 */
  function callAiApi(url, options) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DOC_TIMEOUT);
    return fetch(url, Object.assign({}, options, { signal: ctrl ? ctrl.signal : undefined }))
      .catch(function (e) {
        throw new Error(e && e.name === "AbortError"
          ? "AI 응답이 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."
          : "AI 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.");
      })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!data) throw new Error("서버 응답을 읽지 못했어요. (HTTP " + res.status + ")");
          if (data.status === "error") throw new Error([data.user_message, data.suggestion].filter(Boolean).join(" "));
          if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했어요. (HTTP " + res.status + ")");
          return data;
        });
      })
      .then(function (data) { clearTimeout(timer); return data; }, function (e) { clearTimeout(timer); throw e; });
  }

  /* 결과 한 줄 "제목: 내용" (판정 근거 목록과 같은 evidence 모양). 비어 있으면 그리지 않음 */
  function docFact(label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return null;
    return el("li", {}, [el("strong", { text: label + ": " }), Array.isArray(value) ? value.map(String).join(" / ") : String(value)]);
  }

  /* 브라우저 음성 합성으로 요약 읽기. 지원하지 않으면 버튼을 만들지 않음 */
  function ttsButton(script) {
    if (!script || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
    const btn = el("button", { type: "button", class: "msg-act", text: TTS_LABEL });
    btn.addEventListener("click", function () {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.textContent = TTS_LABEL;
        return;
      }
      const u = new SpeechSynthesisUtterance(script);
      u.lang = "ko-KR";
      u.rate = 0.95;
      u.onend = u.onerror = function () { btn.textContent = TTS_LABEL; };
      window.speechSynthesis.speak(u);
      btn.textContent = "듣기 멈추기";
    });
    return btn;
  }

  function renderDocResult(box, data, sourceLabel) {
    clear(box);
    const tags = (data.tags || []).map(function (t) { return el("span", { class: "chat-cond", text: t }); });
    const glossary = (data.glossary || []).filter(function (g) { return g && g.term; });
    box.appendChild(el("p", { class: "muted", text: sourceLabel }));
    box.appendChild(el("p", { class: "msg-sum" }, [el("strong", { text: data.title || "제목을 찾지 못한 공고" })]));
    if (tags.length) box.appendChild(el("div", { class: "chat-conds" }, tags));
    if (data.one_line_summary) box.appendChild(el("p", { text: data.one_line_summary }));
    box.appendChild(el("ul", { class: "evidence" }, [
      docFact("지원 대상", data.target),
      docFact("지원 내용", data.benefit),
      docFact("신청 방법", data.method),
      docFact("제출 서류", data.documents),
      docFact("문의처", data.contact),
      docFact("신청 전 확인할 점", data.checklist)
    ]));
    if (glossary.length) {
      box.appendChild(el("details", { class: "elig-why" }, [
        el("summary", { text: "어려운 말 풀이 " + glossary.length + "개" }),
        el("ul", { class: "evidence" }, glossary.map(function (g) {
          return el("li", {}, [el("strong", { text: g.term + ": " }), g.easy || g.easy_term || g.description || ""]);
        }))
      ]));
    }
    const tts = ttsButton(data.tts_full_script);
    if (tts) box.appendChild(el("div", { class: "msg-acts" }, [tts]));
    box.appendChild(el("p", { class: "muted", text: "AI가 공고문을 요약한 내용이에요. 틀릴 수 있으니 원문과 담당 부서에서 확인하세요." }));
  }

  /* 공고문 AI 분석 입력 카드. preUrl이 있으면 바로 그 주소를 분석 */
  function renderDocForm(box, preUrl) {
    clear(box);
    const status = el("p", { class: "msg-note", role: "status", hidden: true });
    const result = el("div", { class: "msg-sub", hidden: true });
    const fileIn = el("input", { type: "file", accept: ".pdf,.hwp,.hwpx,application/pdf", "aria-label": "공고문 파일" });
    const urlIn = el("input", { type: "url", inputmode: "url", placeholder: "https://www.wonju.go.kr/...", "aria-label": "공고 페이지 주소", value: preUrl || null });
    const fileBtn = el("button", { type: "button", class: "msg-act", text: "파일 분석" });
    const urlBtn = el("button", { type: "button", class: "msg-act", text: "주소로 분석" });
    let busy = false;

    function show(text, kind) {
      status.hidden = !text;
      status.textContent = text || "";
      status.className = "msg-note"; // 진행·오류 모두 기존 안내 글 모양 (문장으로 구분)
    }
    function run(request, label) {
      if (busy) return;
      busy = true;
      fileBtn.disabled = urlBtn.disabled = true;
      show("AI가 공고문을 읽고 있어요. 길면 1분 정도 걸릴 수 있어요…", "loading");
      request().then(function (data) {
        show("", null);
        result.hidden = false;
        renderDocResult(result, data, label);
        setTimeout(scrollLog, 0);
      }).catch(function (e) {
        show(e.message, "error");
      }).then(function () {
        busy = false;
        fileBtn.disabled = urlBtn.disabled = false;
      });
    }
    function goUrl() {
      const u = urlIn.value.trim();
      if (!/^https?:\/\/\S+$/i.test(u)) {
        show("http:// 또는 https:// 로 시작하는 공고 페이지 주소를 넣어 주세요.", "error");
        urlIn.focus();
        return;
      }
      run(function () {
        return callAiApi("/api/analyze-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });
      }, "공고 주소 · " + u);
    }

    fileBtn.addEventListener("click", function () {
      const f = fileIn.files && fileIn.files[0];
      if (!f) { show("분석할 공고문 파일을 먼저 골라 주세요.", "error"); fileIn.focus(); return; }
      if (!/\.(pdf|hwp|hwpx)$/i.test(f.name)) { show("PDF 또는 한글(HWP, HWPX) 파일만 분석할 수 있어요.", "error"); return; }
      if (f.size > DOC_MAX) { show("파일 용량이 너무 커요. 15MB 이하 파일만 올릴 수 있어요.", "error"); return; }
      const body = new FormData();
      body.append("file", f, f.name);
      run(function () { return callAiApi("/api/analyze", { method: "POST", body: body }); }, "올린 파일 · " + f.name);
    });
    urlBtn.addEventListener("click", goUrl);
    urlIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goUrl(); } });

    box.appendChild(el("p", { class: "muted", text: "시청·행정복지센터 공고문(PDF, HWP, HWPX, 15MB 이하)을 올리거나 공고 페이지 주소를 넣으면 대상, 혜택, 신청 방법, 서류를 쉽게 정리해요. 개인 서류가 아닌 공고문만 올려 주세요." }));
    /* 입력칸은 AI 비서 입력창(chat-form)과 같은 모양, 버튼은 카드의 msg-act 버튼 */
    box.appendChild(el("div", { class: "side-chips" }, [
      el("div", { class: "chat-form" }, [fileIn, fileBtn]),
      el("div", { class: "chat-form" }, [urlIn, urlBtn])
    ]));
    box.appendChild(status);
    box.appendChild(result);
    if (preUrl) goUrl();
  }

  function nextBirthOrder(o) {""")

patch(UI, "AI 비서: 공고문 분석 의도 처리",
"""      case "calendar":""",
"""      case "analyze_doc":
        addBot(s.url ? "이 공고 주소를 AI로 분석할게요." : "공고문을 올리거나 주소를 넣으면 AI가 쉽게 정리해 드려요.", {
          render: function (x, box) { renderDocForm(box, s.url); },
          note: "올린 파일은 글자만 읽은 뒤 서버에 저장하지 않아요. AI 요약은 문서에 없는 내용은 비워 두도록 했지만 틀릴 수 있어요."
        });
        break;
      case "calendar":""")

patch(HTML, "AI 비서 입력창 예시에 공고문 분석 추가",
"""placeholder="예: 이달 신청할 제도 보여줘, 월급 380만 원으로 바꿔줘">""",
"""placeholder="예: 이달 신청할 제도 보여줘, 공고문 분석해줘, 공고 주소 붙여넣기">""", required=False)



# =====================================================================
# 0. 예전 버전(1·2차)을 이미 실행한 서버를 이번 버전으로 올리기 (해당 없으면 건너뜀)
#    git으로 되돌리지 않아도 되도록, 예전에 넣은 코드만 이번 코드로 바꿉니다.
# =====================================================================
UP = []
UP.append(("static/js/plan-ui.js", "업그레이드: 서버 AI 답 표시 (확인 필요·합계·비교·조건)", '      if (titleEl) titleEl.textContent = "서버 AI의 답변이에요.";\n      clear(holder);\n      holder.appendChild(el("p", { text: data.reply }));\n      const lines = (data.matched || []).map(function (x) { return x.title + (x.amount_text ? " · " + x.amount_text : ""); });\n      if (lines.length) holder.appendChild(el("ul", { class: "doc-list" }, lines.map(function (t) { return el("li", { text: t }); })));\n      holder.appendChild(el("p", { class: "muted", text: "서버 AI는 별도 혜택 목록으로 답해서 화면의 계산 결과와 다를 수 있어요. 금액과 판정은 화면의 계산 결과를 기준으로 보세요." }));', '      if (titleEl) titleEl.textContent = "서버 AI의 답변이에요.";\n      renderAiAnswer(holder, data);'))
UP.append(("static/js/plan-ui.js", "업그레이드: 답 표시 함수 추가", "  function askServerAi(text) {", '  /* 서버 AI 답을 카드에 그림. 새 스타일 없이 AI 비서 카드에 이미 있는 모양만 씀\n     (목록 doc-list, 소제목 mb-ex-title, 합계 줄 msg-sum, 안내 muted)\n     순서: 답변 문장 → 해당하는 혜택 → 확인이 필요한 혜택 → AI 기준 합계와 화면 계산 비교 → AI가 이해한 조건 → 안내 */\n  function aiList(title, items, lineOf) {\n    if (!items || !items.length) return null;\n    return el("div", { class: "msg-sub" }, [\n      el("p", { class: "mb-ex-title", text: title }),\n      el("ul", { class: "doc-list" }, items.map(function (x) { return el("li", { text: lineOf(x) }); }))\n    ]);\n  }\n\n  function renderAiAnswer(box, data) {\n    clear(box);\n    box.appendChild(el("p", { text: data.reply }));\n    [\n      aiList("해당하는 혜택", data.matched, function (x) { return x.title + (x.amount_text ? " · " + x.amount_text : ""); }),\n      aiList("확인이 필요한 혜택", data.check, function (x) { return x.title + (x.reason ? " · " + x.reason : ""); })\n    ].forEach(function (n) { if (n) box.appendChild(n); });\n\n    if (data.total_monthly || data.total_once) {\n      box.appendChild(el("p", { class: "msg-sum" }, [\n        "AI 기준 합계 ",\n        el("strong", { text: "매월 " + won(Number(data.total_monthly) || 0) }),\n        data.total_once ? " · 일시금 " + won(Number(data.total_once)) : null\n      ]));\n    }\n    const m = ui.lastModel;\n    if (m && m.sched && m.sched.months.length) {\n      const cash0 = m.sched.months[0].cash;\n      box.appendChild(el("p", { class: "msg-sum" }, [\n        "화면 계산 ",\n        el("strong", { text: "이번 달 현금 " + won(cash0) }),\n        m.sched.lumpTotal ? " · 일시금 " + won(m.sched.lumpTotal) : null\n      ]));\n      if ((Number(data.total_monthly) || 0) !== cash0) {\n        box.appendChild(el("p", { class: "muted", text: "두 금액이 달라요. 서버 AI는 별도 혜택 목록으로 계산하고, 화면은 복직 시점·어린이집·출생 순서까지 반영해 계산해요. 금액은 화면 계산을 기준으로 보세요." }));\n      }\n    }\n    const pf = data.extracted_profile;\n    if (pf) {\n      const bits = [\n        pf.child_months != null ? "생후 " + pf.child_months + "개월" : null,\n        pf.work_status || null,\n        pf.income_level && pf.income_level !== "모름" ? "소득 " + pf.income_level : null,\n        pf.region || null\n      ].filter(Boolean);\n      if (bits.length) box.appendChild(el("p", { class: "muted", text: "AI가 이해한 조건: " + bits.join(" · ") }));\n    }\n    box.appendChild(el("p", { class: "muted", text: data.disclaimer || "정확한 지급 여부는 담당 부서에서 확인해 주세요." }));\n  }\n\n' + "  function askServerAi(text) {"))
UP.append(("static/js/plan-ui.js", "업그레이드: 공고문 분석 카드를 기존 스타일로", '  /* ---------- 공고문 AI 분석 (예전 ai-assist.js 기능을 AI 비서 안으로) ----------\n   * 파일(PDF·HWP·HWPX, 15MB 이하) → POST /api/analyze, 공고 주소 → POST /api/analyze-url\n   * 결과: 제목·태그·한 줄 요약·대상·혜택·방법·서류·문의처·확인할 점·어려운 말 풀이·소리로 듣기\n   * 서버·AI가 준 글은 모두 textContent로만 넣습니다. */\n  const DOC_MAX = 15 * 1024 * 1024;\n  const DOC_TIMEOUT = 90000;\n  const TTS_LABEL = "소리로 듣기";\n\n  /* 서버를 부르고 JSON을 돌려줌. 실패하면 사용자에게 보여 줄 문장으로 Error를 던짐 */\n  function callAiApi(url, options) {\n    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;\n    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DOC_TIMEOUT);\n    return fetch(url, Object.assign({}, options, { signal: ctrl ? ctrl.signal : undefined }))\n      .catch(function (e) {\n        throw new Error(e && e.name === "AbortError"\n          ? "AI 응답이 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."\n          : "AI 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.");\n      })\n      .then(function (res) {\n        return res.json().catch(function () { return null; }).then(function (data) {\n          if (!data) throw new Error("서버 응답을 읽지 못했어요. (HTTP " + res.status + ")");\n          if (data.status === "error") throw new Error([data.user_message, data.suggestion].filter(Boolean).join(" "));\n          if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했어요. (HTTP " + res.status + ")");\n          return data;\n        });\n      })\n      .then(function (data) { clearTimeout(timer); return data; }, function (e) { clearTimeout(timer); throw e; });\n  }\n\n  /* 결과 한 줄 (제목 + 내용). 비어 있으면 그리지 않음 */\n  function docFact(label, value) {\n    if (!value || (Array.isArray(value) && !value.length)) return null;\n    const body = Array.isArray(value)\n      ? el("ul", { class: "doc-list" }, value.map(function (v) { return el("li", { text: String(v) }); }))\n      : el("p", { text: String(value) });\n    return el("div", { class: "ai-fact" }, [el("dt", { text: label }), el("dd", {}, [body])]);\n  }\n\n  /* 브라우저 음성 합성으로 요약 읽기. 지원하지 않으면 버튼을 만들지 않음 */\n  function ttsButton(script) {\n    if (!script || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;\n    const btn = el("button", { type: "button", class: "btn-ghost-sm", text: TTS_LABEL });\n    btn.addEventListener("click", function () {\n      if (window.speechSynthesis.speaking) {\n        window.speechSynthesis.cancel();\n        btn.textContent = TTS_LABEL;\n        return;\n      }\n      const u = new SpeechSynthesisUtterance(script);\n      u.lang = "ko-KR";\n      u.rate = 0.95;\n      u.onend = u.onerror = function () { btn.textContent = TTS_LABEL; };\n      window.speechSynthesis.speak(u);\n      btn.textContent = "듣기 멈추기";\n    });\n    return btn;\n  }\n\n  function renderDocResult(box, data, sourceLabel) {\n    clear(box);\n    const tags = (data.tags || []).map(function (t) { return el("span", { class: "ai-doc-tag", text: t }); });\n    const glossary = (data.glossary || []).filter(function (g) { return g && g.term; });\n    box.appendChild(el("p", { class: "muted", text: sourceLabel }));\n    box.appendChild(el("p", { class: "ai-doc-title", text: data.title || "제목을 찾지 못한 공고" }));\n    if (tags.length) box.appendChild(el("div", { class: "ai-doc-tags" }, tags));\n    if (data.one_line_summary) box.appendChild(el("p", { class: "ai-doc-summary", text: data.one_line_summary }));\n    box.appendChild(el("dl", { class: "ai-facts" }, [\n      docFact("지원 대상", data.target),\n      docFact("지원 내용", data.benefit),\n      docFact("신청 방법", data.method),\n      docFact("제출 서류", data.documents),\n      docFact("문의처", data.contact),\n      docFact("신청 전 확인할 점", data.checklist)\n    ]));\n    if (glossary.length) {\n      box.appendChild(el("details", { class: "ai-glossary elig-why" }, [\n        el("summary", { text: "어려운 말 풀이 " + glossary.length + "개" }),\n        el("dl", { class: "ai-facts" }, glossary.map(function (g) {\n          return el("div", { class: "ai-fact" }, [el("dt", { text: g.term }), el("dd", { text: g.easy || g.easy_term || g.description || "" })]);\n        }))\n      ]));\n    }\n    box.appendChild(el("div", { class: "ai-doc-foot" }, [\n      ttsButton(data.tts_full_script),\n      el("p", { class: "muted", text: "AI가 공고문을 요약한 내용이에요. 틀릴 수 있으니 원문과 담당 부서에서 확인하세요." })\n    ]));\n  }\n\n  /* 공고문 AI 분석 입력 카드. preUrl이 있으면 바로 그 주소를 분석 */\n  function renderDocForm(box, preUrl) {\n    clear(box);\n    const status = el("p", { class: "ai-doc-status", role: "status", hidden: true });\n    const result = el("div", { class: "ai-doc-result", hidden: true });\n    const fileIn = el("input", { type: "file", accept: ".pdf,.hwp,.hwpx,application/pdf", class: "ai-doc-input", "aria-label": "공고문 파일" });\n    const urlIn = el("input", { type: "url", inputmode: "url", placeholder: "https://www.wonju.go.kr/...", class: "ai-doc-input", "aria-label": "공고 페이지 주소", value: preUrl || null });\n    const fileBtn = el("button", { type: "button", class: "btn-primary-sm", text: "파일 분석" });\n    const urlBtn = el("button", { type: "button", class: "btn-ghost-sm", text: "주소로 분석" });\n    let busy = false;\n\n    function show(text, kind) {\n      status.hidden = !text;\n      status.textContent = text || "";\n      status.className = "ai-doc-status" + (kind ? " is-" + kind : "");\n    }\n    function run(request, label) {\n      if (busy) return;\n      busy = true;\n      fileBtn.disabled = urlBtn.disabled = true;\n      show("AI가 공고문을 읽고 있어요. 길면 1분 정도 걸릴 수 있어요…", "loading");\n      request().then(function (data) {\n        show("", null);\n        result.hidden = false;\n        renderDocResult(result, data, label);\n        setTimeout(scrollLog, 0);\n      }).catch(function (e) {\n        show(e.message, "error");\n      }).then(function () {\n        busy = false;\n        fileBtn.disabled = urlBtn.disabled = false;\n      });\n    }\n    function goUrl() {\n      const u = urlIn.value.trim();\n      if (!/^https?:\\/\\/\\S+$/i.test(u)) {\n        show("http:// 또는 https:// 로 시작하는 공고 페이지 주소를 넣어 주세요.", "error");\n        urlIn.focus();\n        return;\n      }\n      run(function () {\n        return callAiApi("/api/analyze-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });\n      }, "공고 주소 · " + u);\n    }\n\n    fileBtn.addEventListener("click", function () {\n      const f = fileIn.files && fileIn.files[0];\n      if (!f) { show("분석할 공고문 파일을 먼저 골라 주세요.", "error"); fileIn.focus(); return; }\n      if (!/\\.(pdf|hwp|hwpx)$/i.test(f.name)) { show("PDF 또는 한글(HWP, HWPX) 파일만 분석할 수 있어요.", "error"); return; }\n      if (f.size > DOC_MAX) { show("파일 용량이 너무 커요. 15MB 이하 파일만 올릴 수 있어요.", "error"); return; }\n      const body = new FormData();\n      body.append("file", f, f.name);\n      run(function () { return callAiApi("/api/analyze", { method: "POST", body: body }); }, "올린 파일 · " + f.name);\n    });\n    urlBtn.addEventListener("click", goUrl);\n    urlIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goUrl(); } });\n\n    box.appendChild(el("p", { class: "muted", text: "시청·행정복지센터 공고문(PDF, HWP, HWPX, 15MB 이하)을 올리거나 공고 페이지 주소를 넣으면 대상, 혜택, 신청 방법, 서류를 쉽게 정리해요. 개인 서류가 아닌 공고문만 올려 주세요." }));\n    box.appendChild(el("div", { class: "ai-doc-row" }, [fileIn, fileBtn]));\n    box.appendChild(el("div", { class: "ai-doc-row" }, [urlIn, urlBtn]));\n    box.appendChild(status);\n    box.appendChild(result);\n    if (preUrl) goUrl();\n  }\n\n', '  /* ---------- 공고문 AI 분석 (예전 ai-assist.js 기능을 AI 비서 안으로) ----------\n   * 파일(PDF·HWP·HWPX, 15MB 이하) → POST /api/analyze, 공고 주소 → POST /api/analyze-url\n   * 결과: 제목·태그·한 줄 요약·대상·혜택·방법·서류·문의처·확인할 점·어려운 말 풀이·소리로 듣기\n   * 서버·AI가 준 글은 모두 textContent로만 넣습니다. */\n  const DOC_MAX = 15 * 1024 * 1024;\n  const DOC_TIMEOUT = 90000;\n  const TTS_LABEL = "소리로 듣기";\n\n  /* 서버를 부르고 JSON을 돌려줌. 실패하면 사용자에게 보여 줄 문장으로 Error를 던짐 */\n  function callAiApi(url, options) {\n    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;\n    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DOC_TIMEOUT);\n    return fetch(url, Object.assign({}, options, { signal: ctrl ? ctrl.signal : undefined }))\n      .catch(function (e) {\n        throw new Error(e && e.name === "AbortError"\n          ? "AI 응답이 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."\n          : "AI 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.");\n      })\n      .then(function (res) {\n        return res.json().catch(function () { return null; }).then(function (data) {\n          if (!data) throw new Error("서버 응답을 읽지 못했어요. (HTTP " + res.status + ")");\n          if (data.status === "error") throw new Error([data.user_message, data.suggestion].filter(Boolean).join(" "));\n          if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했어요. (HTTP " + res.status + ")");\n          return data;\n        });\n      })\n      .then(function (data) { clearTimeout(timer); return data; }, function (e) { clearTimeout(timer); throw e; });\n  }\n\n  /* 결과 한 줄 "제목: 내용" (판정 근거 목록과 같은 evidence 모양). 비어 있으면 그리지 않음 */\n  function docFact(label, value) {\n    if (!value || (Array.isArray(value) && !value.length)) return null;\n    return el("li", {}, [el("strong", { text: label + ": " }), Array.isArray(value) ? value.map(String).join(" / ") : String(value)]);\n  }\n\n  /* 브라우저 음성 합성으로 요약 읽기. 지원하지 않으면 버튼을 만들지 않음 */\n  function ttsButton(script) {\n    if (!script || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;\n    const btn = el("button", { type: "button", class: "msg-act", text: TTS_LABEL });\n    btn.addEventListener("click", function () {\n      if (window.speechSynthesis.speaking) {\n        window.speechSynthesis.cancel();\n        btn.textContent = TTS_LABEL;\n        return;\n      }\n      const u = new SpeechSynthesisUtterance(script);\n      u.lang = "ko-KR";\n      u.rate = 0.95;\n      u.onend = u.onerror = function () { btn.textContent = TTS_LABEL; };\n      window.speechSynthesis.speak(u);\n      btn.textContent = "듣기 멈추기";\n    });\n    return btn;\n  }\n\n  function renderDocResult(box, data, sourceLabel) {\n    clear(box);\n    const tags = (data.tags || []).map(function (t) { return el("span", { class: "chat-cond", text: t }); });\n    const glossary = (data.glossary || []).filter(function (g) { return g && g.term; });\n    box.appendChild(el("p", { class: "muted", text: sourceLabel }));\n    box.appendChild(el("p", { class: "msg-sum" }, [el("strong", { text: data.title || "제목을 찾지 못한 공고" })]));\n    if (tags.length) box.appendChild(el("div", { class: "chat-conds" }, tags));\n    if (data.one_line_summary) box.appendChild(el("p", { text: data.one_line_summary }));\n    box.appendChild(el("ul", { class: "evidence" }, [\n      docFact("지원 대상", data.target),\n      docFact("지원 내용", data.benefit),\n      docFact("신청 방법", data.method),\n      docFact("제출 서류", data.documents),\n      docFact("문의처", data.contact),\n      docFact("신청 전 확인할 점", data.checklist)\n    ]));\n    if (glossary.length) {\n      box.appendChild(el("details", { class: "elig-why" }, [\n        el("summary", { text: "어려운 말 풀이 " + glossary.length + "개" }),\n        el("ul", { class: "evidence" }, glossary.map(function (g) {\n          return el("li", {}, [el("strong", { text: g.term + ": " }), g.easy || g.easy_term || g.description || ""]);\n        }))\n      ]));\n    }\n    const tts = ttsButton(data.tts_full_script);\n    if (tts) box.appendChild(el("div", { class: "msg-acts" }, [tts]));\n    box.appendChild(el("p", { class: "muted", text: "AI가 공고문을 요약한 내용이에요. 틀릴 수 있으니 원문과 담당 부서에서 확인하세요." }));\n  }\n\n  /* 공고문 AI 분석 입력 카드. preUrl이 있으면 바로 그 주소를 분석 */\n  function renderDocForm(box, preUrl) {\n    clear(box);\n    const status = el("p", { class: "msg-note", role: "status", hidden: true });\n    const result = el("div", { class: "msg-sub", hidden: true });\n    const fileIn = el("input", { type: "file", accept: ".pdf,.hwp,.hwpx,application/pdf", "aria-label": "공고문 파일" });\n    const urlIn = el("input", { type: "url", inputmode: "url", placeholder: "https://www.wonju.go.kr/...", "aria-label": "공고 페이지 주소", value: preUrl || null });\n    const fileBtn = el("button", { type: "button", class: "msg-act", text: "파일 분석" });\n    const urlBtn = el("button", { type: "button", class: "msg-act", text: "주소로 분석" });\n    let busy = false;\n\n    function show(text, kind) {\n      status.hidden = !text;\n      status.textContent = text || "";\n      status.className = "msg-note"; // 진행·오류 모두 기존 안내 글 모양 (문장으로 구분)\n    }\n    function run(request, label) {\n      if (busy) return;\n      busy = true;\n      fileBtn.disabled = urlBtn.disabled = true;\n      show("AI가 공고문을 읽고 있어요. 길면 1분 정도 걸릴 수 있어요…", "loading");\n      request().then(function (data) {\n        show("", null);\n        result.hidden = false;\n        renderDocResult(result, data, label);\n        setTimeout(scrollLog, 0);\n      }).catch(function (e) {\n        show(e.message, "error");\n      }).then(function () {\n        busy = false;\n        fileBtn.disabled = urlBtn.disabled = false;\n      });\n    }\n    function goUrl() {\n      const u = urlIn.value.trim();\n      if (!/^https?:\\/\\/\\S+$/i.test(u)) {\n        show("http:// 또는 https:// 로 시작하는 공고 페이지 주소를 넣어 주세요.", "error");\n        urlIn.focus();\n        return;\n      }\n      run(function () {\n        return callAiApi("/api/analyze-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });\n      }, "공고 주소 · " + u);\n    }\n\n    fileBtn.addEventListener("click", function () {\n      const f = fileIn.files && fileIn.files[0];\n      if (!f) { show("분석할 공고문 파일을 먼저 골라 주세요.", "error"); fileIn.focus(); return; }\n      if (!/\\.(pdf|hwp|hwpx)$/i.test(f.name)) { show("PDF 또는 한글(HWP, HWPX) 파일만 분석할 수 있어요.", "error"); return; }\n      if (f.size > DOC_MAX) { show("파일 용량이 너무 커요. 15MB 이하 파일만 올릴 수 있어요.", "error"); return; }\n      const body = new FormData();\n      body.append("file", f, f.name);\n      run(function () { return callAiApi("/api/analyze", { method: "POST", body: body }); }, "올린 파일 · " + f.name);\n    });\n    urlBtn.addEventListener("click", goUrl);\n    urlIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goUrl(); } });\n\n    box.appendChild(el("p", { class: "muted", text: "시청·행정복지센터 공고문(PDF, HWP, HWPX, 15MB 이하)을 올리거나 공고 페이지 주소를 넣으면 대상, 혜택, 신청 방법, 서류를 쉽게 정리해요. 개인 서류가 아닌 공고문만 올려 주세요." }));\n    /* 입력칸은 AI 비서 입력창(chat-form)과 같은 모양, 버튼은 카드의 msg-act 버튼 */\n    box.appendChild(el("div", { class: "side-chips" }, [\n      el("div", { class: "chat-form" }, [fileIn, fileBtn]),\n      el("div", { class: "chat-form" }, [urlIn, urlBtn])\n    ]));\n    box.appendChild(status);\n    box.appendChild(result);\n    if (preUrl) goUrl();\n  }\n\n'))
UP.append(("static/css/plan.css", "업그레이드: 예전에 넣은 공고문 분석 CSS 삭제", '.demo-note { margin: 0 0 18px; padding: 12px 16px; border-radius: 14px; background: #EEF5FF; border: 1px solid #C9DBFD; color: #1D4F9E; font-size: 13.5px; }\n\n/* ---------- AI 비서 · 공고문 AI 분석 ---------- */\n.ai-doc-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }\n.ai-doc-input { flex: 1 1 220px; min-width: 0; min-height: 44px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 12px; background: #fff; font: inherit; font-size: 13.5px; }\n.ai-doc-status { margin: 12px 0 0; padding: 10px 14px; border-radius: 12px; background: var(--mist); font-size: 13.5px; color: var(--ink-2); }\n.ai-doc-status.is-loading { background: var(--brand-tint); color: var(--brand-ink); }\n.ai-doc-status.is-error { background: var(--danger-tint); color: var(--danger-text); }\n.ai-doc-result { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--rule); display: grid; gap: 8px; }\n.ai-doc-title { margin: 0; font-size: 17px; font-weight: 800; color: var(--ap-ink); }\n.ai-doc-tags { display: flex; flex-wrap: wrap; gap: 6px; }\n.ai-doc-tag { padding: 3px 10px; border-radius: 999px; background: var(--brand-tint); color: var(--brand-ink); font-size: 12px; font-weight: 700; }\n.ai-doc-summary { margin: 0; font-weight: 700; color: var(--ink); }\n.ai-facts { margin: 0; display: grid; }\n.ai-fact { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-top: 1px solid var(--rule); }\n.ai-fact dt { font-size: 13px; font-weight: 800; color: var(--ink-3); }\n.ai-fact dd { margin: 0; font-size: 14px; color: var(--ink); }\n.ai-fact dd p { margin: 0; }\n.ai-doc-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 6px; }\n@media (max-width: 560px) { .ai-fact { grid-template-columns: minmax(0, 1fr); gap: 2px; } }', '.demo-note { margin: 0 0 18px; padding: 12px 16px; border-radius: 14px; background: #EEF5FF; border: 1px solid #C9DBFD; color: #1D4F9E; font-size: 13.5px; }'))


def upgrade_old_versions(texts):
    done = []
    for path, desc, old, new in UP:
        t = texts.get(path)
        if t is None or old not in t:
            continue
        if desc.startswith("업그레이드: 답 표시 함수 추가"):
            if "function renderAiAnswer" in t:
                continue
        texts[path] = t.replace(old, new, 1)
        done.append(f"{path}  {desc}")
    return done

# =====================================================================
# 실행
# =====================================================================
def main():
    texts, crlf = {}, {}
    missing_files = set()
    for path, *_ in PATCHES:
        if path in texts or path in missing_files:
            continue
        full = os.path.join(BASE, path)
        if not os.path.exists(full):
            missing_files.add(path)
            continue
        with open(full, encoding="utf-8", newline="") as f:
            raw = f.read()
        crlf[path] = "\r\n" in raw
        texts[path] = raw.replace("\r\n", "\n")
    for path, *_ in UP:   # 업그레이드 대상 파일도 읽어 둠
        full = os.path.join(BASE, path)
        if path not in texts and os.path.exists(full):
            with open(full, encoding="utf-8", newline="") as f:
                raw = f.read()
            crlf[path] = "\r\n" in raw
            texts[path] = raw.replace("\r\n", "\n")
    upgraded = upgrade_old_versions(texts)

    planned, problems, skipped = [], [], []
    for path, desc, old, new, required in PATCHES:
        if path in missing_files:
            (problems if required else skipped).append(f"{path}: 파일 없음 — {desc}")
            continue
        text = texts[path]
        if new and new in text:
            skipped.append(f"{path}: 이미 고쳐져 있음 — {desc}")
            continue
        count = text.count(old)
        if count == 1:
            planned.append((path, desc, old, new))
            texts[path] = text.replace(old, new)
        elif count == 0:
            (problems if required else skipped).append(f"{path}: 원래 문장을 못 찾음 — {desc}")
        else:
            problems.append(f"{path}: 같은 문장이 {count}곳 있어 어디를 고칠지 모름 — {desc}")

    print("고칠 곳")
    for u in upgraded:
        print(f"  ✓ {u}")
    for path, desc, *_ in planned:
        print(f"  ✓ {path}  {desc}")
    if skipped:
        print("건너뜀")
        for s in skipped:
            print(f"  · {s}")
    if problems:
        print("멈춤 — 아래 꼭 필요한 수정의 원래 문장을 찾지 못했습니다. 파일은 하나도 바꾸지 않았습니다.")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    if CHECK_ONLY:
        print("--check: 찾기만 하고 바꾸지 않았습니다.")
        return
    for path in {p for p, *_ in planned} | {u.split("  ")[0] for u in upgraded}:
        out = texts[path].replace("\n", "\r\n") if crlf[path] else texts[path]
        with open(os.path.join(BASE, path), "w", encoding="utf-8", newline="") as f:
            f.write(out)
    print(f"완료: {len(planned) + len(upgraded)}곳 수정. 서버를 다시 켜고(main.py가 바뀜) 브라우저에서 Ctrl+Shift+R 하세요.")


if __name__ == "__main__":
    main()
