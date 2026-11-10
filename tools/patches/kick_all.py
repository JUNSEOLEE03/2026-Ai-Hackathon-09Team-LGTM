#!/usr/bin/env python3
"""
kick_all.py — 원주 육아 혜택 비서: 두 번째 킥 기능 추가
  ① 복직 D-Day 역산 준비 일정 (규칙으로 계산 + AI 비서 설명)
  ② 복직 시점 Top 3를 테마별 추천으로 (실수령 극대화형 · 경력·수익 균형형 · 집중 돌봄형)
  + AI 답변의 **굵은 글씨** 기호를 실제 굵은 글씨로 표시

먼저 fix_all.py가 적용되어 있어야 합니다.

사용법 (EC2 터미널)
    cd ~/wonju-on-cloud/backend
    python3 kick_all.py --check     # 바꾸지 않고 찾기만
    python3 kick_all.py             # 실제 적용 (고칠 곳을 모두 찾은 뒤에만 파일을 바꿈)

협업자 11/10 버전(카드형 Top 3, 헤드셋 아이콘)에도 그대로 적용됩니다. 카드 디자인은 바꾸지 않습니다.

원칙
  - 날짜·금액은 모두 규칙으로 계산합니다. 데이터에 없는 제도(예: 조기복직수당)나 값은 쓰지 않습니다.
  - AI는 계산된 일정만 보고 설명하며, 새 일정·날짜·금액을 만들지 않도록 지시합니다.
  - 새 CSS는 넣지 않습니다. 기존 화면 모양(top3 카드, 일정 달력, AI 비서 카드)을 그대로 씁니다.
  - 두 번 실행해도 같은 수정이 두 번 들어가지 않습니다.
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
CHECK_ONLY = "--check" in sys.argv
PATCHES = []
UP = []


def patch(path, desc, old, new, required=True):
    PATCHES.append((path, desc, old, new, required))


# 이전 kick_all.py(885b4…)를 이미 적용한 서버: 바뀐 한 줄만 고쳐서 새 버전과 같게 만듦
UP.append(("static/js/plan-ui.js", "Top 3 근거: 최대와 같은 금액이면 '0원 적게' 대신 '최대와 같은 금액'",
           '''      facts.push("최대보다 현금 " + won(max.cash - t.p.cash) + " 적게");''', '''      facts.push(t.p.cash === max.cash ? "최대와 같은 금액" : "최대보다 현금 " + won(max.cash - t.p.cash) + " 적게");'''))


def upgrade_old_versions(texts):
    done = []
    for path, desc, old, new in UP:
        t = texts.get(path)
        if t is not None and old in t and new not in t:
            texts[path] = t.replace(old, new)
            done.append(path + "  " + desc)
    return done


UI = "static/js/plan-ui.js"
CHAT = "static/js/chat.js"
HTML = "static/plan.html"
MAIN = "app/main.py"

# =====================================================================
# ① 복직 D-Day 역산 준비 일정
# =====================================================================
patch(UI, "일정 종류에 '복직 준비' 추가",
"""    tip: "바우처 안내",
    prep: "서류 준비 권장"
  };""",
"""    tip: "바우처 안내",
    prep: "서류 준비 권장",
    dday: "복직 준비"
  };""")

patch(UI, "복직 시점이 정해지면 준비 일정을 거꾸로 계산해 일정에 넣기",
"""    const evs = evsAll.filter(function (e) { return !(e.type === "deadline" && state.applied[e.programId]); });
    state.events = evs;""",
"""    const evs = evsAll.filter(function (e) { return !(e.type === "deadline" && state.applied[e.programId]); })
      .concat(simOn ? returnPrepEvents(answers, returnAge) : []);
    /* 복직 준비 일정은 날짜(일)까지 있으므로 날짜순으로 다시 정렬 (같은 날짜는 원래 순서 유지) */
    evs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    state.events = evs;""")

patch(UI, "복직 D-Day 역산 규칙",
"""  function resultOf(m, id) {""",
r"""  /* ---------- 복직 D-Day 역산 준비 일정 (규칙으로 계산) ----------
   * 복직 시뮬레이터에서 고른 복직 달의 1일을 D-Day로 보고, 그 전에 해야 할 행정 일정을 거꾸로 계산합니다.
   * 날짜는 매번 같은 규칙으로 계산하며 AI가 만들지 않습니다. (AI 비서는 이 목록을 설명만 함)
   * 권장 시점이 이미 지났으면 '지금 바로'로 이번 달에 넣습니다. */
  function dayShift(dateStr, days) {
    const p = dateStr.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }

  function monthsBetween(a, b) {
    const x = a.split("-").map(Number), y = b.split("-").map(Number);
    return (y[0] - x[0]) * 12 + (y[1] - x[1]);
  }

  function dayLabel(date) {
    const p = date.split("-");
    return p[0] + "년 " + Number(p[1]) + "월 " + Number(p[2]) + "일경";
  }

  /* when(answers, 복직 때 아이 개월 수): 이 일정이 필요한 가정인지 */
  const RETURN_PREP = [
    {
      d: -90, url: "https://www.childcare.go.kr",
      when: function (a) { return a.childcare !== "yes"; },
      title: function () { return "어린이집 입소 대기 신청"; },
      detail: function () { return "인기 어린이집은 대기가 길어 복직 3개월 전에는 입소 대기를 걸어 두는 것을 권장해요. 아이사랑(임신육아종합포털)에서 여러 곳을 함께 신청할 수 있어요."; }
    },
    {
      d: -30, url: "https://www.bokjiro.go.kr",
      when: function (a) { return a.childcare !== "yes"; },
      title: function (age) { return age < 24 ? "부모급여 → 보육료 바우처 전환 신청" : "영유아 보육료(바우처) 신청"; },
      detail: function (age) {
        return age < 24
          ? "어린이집에 다니기 시작하면 부모급여 일부가 보육료 바우처로 바뀌어요. 복지로나 행정복지센터에서 보육료를 신청하고 국민행복카드를 준비하세요."
          : "어린이집을 이용하려면 보육료(바우처)를 신청해야 해요. 어린이집을 다니면 가정양육수당은 함께 받을 수 없어요.";
      }
    },
    {
      d: -30, url: null,
      when: function () { return !!leaveProgram(); },
      title: function () { return "회사에 복직일 확인·통보"; },
      detail: function () { return "휴직을 연장하려면 보통 종료 예정일 30일 전까지 회사에 신청해야 해요. 인사팀과 복직일, 근무 형태(단축근무 등)를 미리 정해 두세요. 회사 규정을 꼭 확인하세요."; }
    },
    {
      d: -14, url: null,
      when: function (a) { return a.childcare !== "yes"; },
      title: function () { return "어린이집 적응 기간 시작"; },
      detail: function () { return "처음 등원하면 보통 1~2주 적응 기간이 필요해요. 복직 2주 전부터 짧게 등원해 보는 것을 권장해요."; }
    },
    {
      d: 0, url: "https://www.work24.go.kr",
      when: function (a) { return !!leaveProgram() && !!a.wage; },
      title: function () { return "육아휴직급여 신청 기한 확인"; },
      detail: function () { return "육아휴직급여는 휴직이 끝난 뒤 12개월 안에 고용24에서 신청해야 해요. 아직 신청하지 않은 달이 있는지 확인하세요."; }
    }
  ];

  function returnPrepEvents(answers, returnAge) {
    const age = answers.childMonths;
    if (returnAge == null || !isFinite(returnAge) || age == null || returnAge <= age) return [];
    const rDate = dateAtAge(returnAge);
    const out = [];
    RETURN_PREP.forEach(function (it) {
      if (it.when && !it.when(answers, returnAge)) return;
      let date = dayShift(rDate, it.d);
      const late = date < TODAY;
      if (late) date = TODAY;
      const offset = Math.max(0, monthsBetween(TODAY, date));
      const tag = it.d < 0 ? "복직 D" + it.d : it.d === 0 ? "복직 당일" : "복직 D+" + it.d;
      out.push({
        offset: offset,
        ageMonths: age + offset,
        date: date,
        type: "dday",
        programId: null,
        name: null,
        dday: it.d,
        url: it.url,
        title: tag + " · " + it.title(returnAge) + (late ? " (지금 바로)" : " (" + dayLabel(date) + ")"),
        detail: (late ? "권장 시점이 이미 지났어요. 지금 바로 챙기세요. " : "") + it.detail(returnAge),
        urgent: false
      });
    });
    return out;
  }

  /* 복직 준비 일정 카드 (AI 비서 안에서 씀) */
  function renderPrepCard(m, box) {
    clear(box);
    if (!m || !m.simOn) {
      box.appendChild(el("p", { class: "empty", text: state.returned ? "이미 복직해서 복직 준비 일정은 만들지 않아요." : "복직 예정으로 답하면 복직 시점에 맞춰 준비 일정을 만들어 드려요." }));
      return;
    }
    const list = m.evs.filter(function (e) { return e.type === "dday"; });
    if (!list.length) {
      box.appendChild(el("p", { class: "empty", text: "지금 고른 복직 시점 기준으로 따로 챙길 준비 일정이 없어요." }));
      return;
    }
    box.appendChild(el("ul", { class: "cal-events" }, list.map(function (e) {
      return el("li", { class: "cev cev-dday" }, [
        el("span", { class: "tag cev-tag", text: EVENT_LABEL.dday }),
        el("p", { class: "cev-title", text: e.title }),
        el("p", { class: "muted", text: e.detail })
      ]);
    })));
  }

  /* AI 답의 **굵게** 표시를 실제 굵은 글씨로 (글자는 그대로 textContent로만 넣음) */
  function mdBold(text) {
    return String(text || "").split(/\*\*(.+?)\*\*/g).map(function (part, i) {
      return i % 2 ? el("strong", { text: part }) : part;
    }).filter(function (x) { return x !== ""; });
  }

  /* 계산된 복직 준비 일정을 서버 AI(/api/explain-schedule)가 쉬운 말로 설명. 실패하면 일정 목록만 보여 줌 */
  function explainPrepWithAi() {
    const m = ui.lastModel;
    const items = (m && m.evs ? m.evs : []).filter(function (e) { return e.type === "dday"; });
    addUser("복직 준비 일정을 설명해 줘", false);
    if (!items.length) {
      addBot("지금은 설명할 복직 준비 일정이 없어요.", { note: "복직 예정으로 답하면 고른 복직 시점에 맞춰 준비 일정을 만들어 드려요." });
      setTimeout(scrollLog, 0);
      return;
    }
    let holder = null;
    addBot("AI가 복직 준비 일정을 설명하고 있어요…", {
      render: function (x, box) { holder = box; renderPrepCard(ui.lastModel, box); },
      note: "일정과 날짜는 규칙으로 계산했고, AI는 이 일정만 보고 설명해요. 새 일정이나 금액을 만들지 않도록 했어요."
    });
    const titleEl = holder && holder.parentNode ? holder.parentNode.querySelector(".msg-title") : null;
    fetch("/api/explain-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: summaryText(),
        items: items.map(function (e) { return { date: e.date, title: e.title, detail: e.detail }; })
      })
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (!data || data.status !== "success" || !data.reply) throw new Error("ai");
      if (titleEl) titleEl.textContent = "AI 비서가 복직 준비 일정을 설명해 드릴게요.";
      holder.insertBefore(el("p", {}, mdBold(data.reply)), holder.firstChild);
    }).catch(function () {
      if (titleEl) titleEl.textContent = "복직 준비 일정이에요. (AI 설명은 지금 불러오지 못했어요)";
    }).then(function () {
      setTimeout(scrollLog, 0);
    });
  }

  function resultOf(m, id) {""")

patch(UI, "달력 칸의 점: 복직 준비는 '복직' 점으로 (새 색 없이)",
"""        list.forEach(function (e) { types[e.type === "deadline" && e.urgent ? "urgent" : e.type] = true; });""",
"""        list.forEach(function (e) { types[e.type === "deadline" && e.urgent ? "urgent" : e.type === "dday" ? "return" : e.type] = true; });""")

patch(UI, "일정 자세히: 복직 준비 일정에 공식 사이트·AI 설명 버튼",
"""  function eventAction(m, e) {""",
"""  function eventAction(m, e) {
    if (e.type === "dday") {
      return el("div", { class: "msg-acts" }, [
        e.url ? el("a", { class: "btn-ghost-sm", href: e.url, target: "_blank", rel: "noopener noreferrer", "aria-label": e.title + " 공식 사이트 (새 창)" }, ["공식 사이트", icon(ICONS.external, "ico-sm")]) : null,
        el("button", { type: "button", class: "btn-ghost-sm", onclick: function (ev) { openChat(ev.currentTarget); explainPrepWithAi(); } }, [icon(ICONS.spark, "ico-sm"), "AI 비서에게 설명 듣기"])
      ]);
    }""")

patch(UI, "AI 비서: '복직 준비 일정' 질문 처리",
"""      case "calendar":""",
"""      case "return_prep":
        addBot(m.simOn ? "아이 " + m.returnAge + "개월 복직 기준으로 거꾸로 계산한 준비 일정이에요." : "복직 준비 일정을 만들 수 없어요.", {
          render: renderPrepCard,
          live: true,
          page: m.simOn ? "sec-events" : null,
          extra: m.simOn ? [el("button", { type: "button", class: "msg-act", onclick: function () { explainPrepWithAi(); } }, [icon(ICONS.spark, "ico-sm"), "AI 설명 듣기"])] : []
        });
        break;
      case "calendar":""")

patch(UI, "AI 비서 예시 질문에 '복직 준비 일정 보여줘' 추가",
"""  const MORE_CHIPS = ["12개월에 복직하면 얼마예요?",""",
"""  const MORE_CHIPS = ["복직 준비 일정 보여줘", "12개월에 복직하면 얼마예요?",""")

patch(UI, "AI 답변의 **굵게** 기호를 실제 굵은 글씨로",
"""    box.appendChild(el("p", { text: data.reply }));""",
"""    box.appendChild(el("p", {}, mdBold(data.reply)));""")

patch(CHAT, "질문 이해: 복직 준비·D-Day·역산 → 복직 준비 일정",
"""    if (has(text, /복직/)) return { intent: "simulate", slots: { returnAge: month } };""",
r"""    if (has(text, /복직\s*준비|d-?day|디데이|역산|준비\s*일정/i)) return { intent: "return_prep", slots: {} };
    if (has(text, /복직/)) return { intent: "simulate", slots: { returnAge: month } };""")

patch(CHAT, "의도 목록에 return_prep 추가",
"""\"analyze_doc\", \"fallback\"];""",
"""\"analyze_doc\", \"return_prep\", \"fallback\"];""", required=False)

# 서버: 계산된 일정을 쉬운 말로 설명하는 AI 주소
patch(MAIN, "call_llm 가져오기",
"""    mask_pdf_sensitive_info,
    PDFProcessError
)""",
"""    mask_pdf_sensitive_info,
    call_llm,
    PDFProcessError
)""")

patch(MAIN, "새 주소 /api/explain-schedule (복직 준비 일정 AI 설명)",
"""# =====================================================================
# 정적 프론트엔드(plan.html, index.html, css, js) 통합 서빙""",
'''class ScheduleExplainRequest(BaseModel):
    context: str = ""
    items: list = []


@app.post("/api/explain-schedule")
async def explain_schedule(req: ScheduleExplainRequest):
    """[킥 기능] 화면이 규칙으로 계산한 복직 준비 일정을 AI가 쉬운 말로 설명 (새 일정·날짜·금액은 만들지 않음)"""
    lines = []
    for it in (req.items or [])[:12]:
        if isinstance(it, dict):
            lines.append(f"- {str(it.get('date', ''))[:10]} {str(it.get('title', ''))[:100]}: {str(it.get('detail', ''))[:240]}")
    if not lines:
        return make_error_response("SERVER_ERROR", "설명할 일정이 없어요.")
    system = (
        "당신은 원주시 육아 혜택 안내 상담원입니다. 아래 [준비 일정]에 있는 항목과 날짜만 사용해, "
        "각 일정을 왜 그 시점에 해야 하는지 쉬운 존댓말 4~6문장으로 설명하세요. "
        "목록에 없는 일정, 날짜, 금액, 제도는 절대 만들지 마세요. 마크다운 기호(**, #, -)는 쓰지 마세요."
    )
    user = f"[가족 상황]\\n{(req.context or '')[:500]}\\n\\n[준비 일정]\\n" + "\\n".join(lines)
    try:
        async with AI_SLOTS:
            reply = await run_in_threadpool(call_llm, system, user, 0.2, 700)
    except Exception:
        logger.exception("explain-schedule failed")
        return make_error_response("AI_FAILED", "AI 설명을 만들지 못했어요. 잠시 후 다시 시도해 주세요.")
    return {"status": "success", "reply": reply}


# =====================================================================
# 정적 프론트엔드(plan.html, index.html, css, js) 통합 서빙''')

# =====================================================================
# ② 복직 시점 Top 3 → 테마별 추천 (계산되는 값만)
# =====================================================================
patch(UI, "Top 3: 테마별 추천으로 교체",
"""  function renderTop3(m) {
    const box = $("top3-list");
    clear(box);
    if (!m.simOn || !m.curve) return;
    if (m.curve.every(function (p) { return p.cash === m.curve[0].cash; })) {
      box.appendChild(el("li", { class: "top3-flat", text: "복직 시점을 옮겨도 받는 지원금 합계가 같아서 순위를 매기지 않았어요." }));
      return;
    }
    const sorted = m.curve.slice().sort(function (a, b) { return b.cash - a.cash || a.age - b.age; });
    const seen = {};
    const top = [];
    sorted.forEach(function (p) {
      if (top.length >= 3 || seen[p.cash]) return;
      seen[p.cash] = true;
      top.push(p);
    });
    top.forEach(function (p, i) {
      const isCur = p.age === m.returnAge;
      box.appendChild(el("li", { class: "top3-item" + (i === 0 ? " is-top" : "") }, [
        el("span", { class: "top3-rank", text: i === 0 ? "가장 많이" : (i + 1) + "순위" }),""",
"""  /* 복직 시점 Top 3 테마 (모두 계산값만 사용)
   *   1 실수령 극대화형: 아이 35개월까지 현금 합계가 가장 큰 시점 (같으면 더 이른 시점)
   *   2 경력·수익 균형형: 최대 합계의 90% 이상을 받으면서 가장 일찍 복직하는 시점
   *   3 집중 돌봄형: 아이 24개월(만 2세)까지 집에서 돌보는 시점 (이미 지났거나 겹치면 가장 늦은 시점) */
  function top3Themes(m) {
    const pts = m.curve;
    const max = pts.reduce(function (b, p) { return p.cash > b.cash ? p : b; }, pts[0]);
    const used = {};
    used[max.age] = true;
    let bal = null;
    pts.forEach(function (p) { if (!bal && !used[p.age] && p.cash >= max.cash * 0.9) bal = p; });
    if (!bal) pts.forEach(function (p) { if (!bal && !used[p.age]) bal = p; });
    if (bal) used[bal.age] = true;
    const target = m.age < 24 ? 24 : 35;
    let care = pts.find(function (p) { return p.age === target && !used[p.age]; }) || null;
    for (let i = pts.length - 1; !care && i >= 0; i -= 1) { if (!used[pts[i].age]) care = pts[i]; }
    return [
      { theme: "실수령 극대화형", p: max },
      bal ? { theme: "경력·수익 균형형", p: bal } : null,
      care ? { theme: "집중 돌봄형", p: care } : null
    ].filter(Boolean);
  }

  /* 테마 카드에 붙일 근거 (계산값): 금액 차이, 복직 시기 차이, 휴직 급여 개월, 특례, 집에서 돌보는 기간, 3월 신학기 */
  function themeFacts(m, t, max) {
    const pts = m.curve;
    const facts = [];
    if (t.p.age === max.age) {
      const gain = max.cash - pts[0].cash;
      facts.push(gain > 0 ? "바로 복직보다 현금 +" + won(gain) : "가장 많이 받는 시점");
    } else {
      facts.push(t.p.cash === max.cash ? "최대와 같은 금액" : "최대보다 현금 " + won(max.cash - t.p.cash) + " 적게");
      const gap = max.age - t.p.age;
      facts.push(gap > 0 ? gap + "개월 일찍 복직" : (-gap) + "개월 더 돌봄");
    }
    const s = Plan.monthlySchedule(CATALOG, m.answers, { today: TODAY, horizon: m.horizon, returnAge: t.p.age });
    const ls = leaveStats(s);
    if (ls && ls.count) facts.push("휴직 급여 " + ls.count + "개월");
    const lp = leaveProgram();
    const start = m.answers.leaveStartAge == null ? 0 : m.answers.leaveStartAge;
    if (lp && lp.timeline.leavePay.special && m.answers.wage && m.answers.spouseLeave === "yes" && start < lp.timeline.leavePay.special.withinChildMonths) facts.push("부모 함께 휴직 특례 반영");
    facts.push("집에서 " + (t.p.age - m.age) + "개월 돌봄");
    const mo = Number(dateAtAge(t.p.age).slice(5, 7));
    if (mo === 2 || mo === 3) facts.push("3월 신학기 어린이집 입소 시기");
    return facts;
  }

  function renderTop3(m) {
    const box = $("top3-list");
    clear(box);
    if (!m.simOn || !m.curve) return;
    if (m.curve.every(function (p) { return p.cash === m.curve[0].cash; })) {
      box.appendChild(el("li", { class: "top3-flat", text: "복직 시점을 옮겨도 받는 지원금 합계가 같아서 순위를 매기지 않았어요." }));
      return;
    }
    const themes = top3Themes(m);
    const max = themes[0].p;
    themes.forEach(function (t, i) {
      const p = t.p;
      const isCur = p.age === m.returnAge;
      box.appendChild(el("li", { class: "top3-item" + (i === 0 ? " is-top" : "") }, [
        el("span", { class: "top3-rank", text: (i + 1) + "순위 " + t.theme }),
        el("strong", { class: "top3-age", text: "아이 " + p.age + "개월 복직" }),
        el("span", { class: "top3-when", text: approxMonthLabel(dateAtAge(p.age)) + " · " + themeFacts(m, t, max).join(" · ") }),
        el("span", { class: "top3-cash", text: "현금 약 " + won(p.cash) }),
        el("button", {
          type: "button", class: "top3-pick", disabled: isCur ? "disabled" : null,
          "aria-label": t.theme + ", 아이 " + p.age + "개월 복직으로 옮겨서 보기",
          text: isCur ? "지금 고른 시점" : "이 시점으로 보기",
          onclick: function () { slider.value = String(p.age); renderResults(false); goTo("sec-sim", "#sim-total"); }
        })
      ]));
    });
    /* 고른 복직 시점 기준 D-Day 준비 일정이 일정에 들어갔음을 알려 줌 (두 기능이 이어지는 지점) */
    const prep = m.evs.filter(function (e) { return e.type === "dday"; });
    if (prep.length) {
      box.appendChild(el("li", { class: "top3-flat" }, [
        "아이 " + m.returnAge + "개월 복직 기준 준비 일정 " + prep.length + "건(어린이집 대기·보육료 전환 등)을 일정에 넣었어요. ",
        el("button", { type: "button", class: "btn-ghost-sm", text: "일정에서 보기", onclick: function () { ui.calView = "grid"; ui.calKey = monthKey(prep[0].date); renderCalendar(ui.lastModel); goTo("sec-events", "#cal-detail"); } })
      ]));
    }
  }

  /* 예전 '금액 순위' 방식 (참고용으로 남겨 둠, 화면에서는 쓰지 않음) */
  function renderTop3Legacy(m) {
    const box = $("top3-list");
    clear(box);
    if (!m.simOn || !m.curve) return;
    if (m.curve.every(function (p) { return p.cash === m.curve[0].cash; })) {
      box.appendChild(el("li", { class: "top3-flat", text: "복직 시점을 옮겨도 받는 지원금 합계가 같아서 순위를 매기지 않았어요." }));
      return;
    }
    const sorted = m.curve.slice().sort(function (a, b) { return b.cash - a.cash || a.age - b.age; });
    const seen = {};
    const top = [];
    sorted.forEach(function (p) {
      if (top.length >= 3 || seen[p.cash]) return;
      seen[p.cash] = true;
      top.push(p);
    });
    top.forEach(function (p, i) {
      const isCur = p.age === m.returnAge;
      box.appendChild(el("li", { class: "top3-item" + (i === 0 ? " is-top" : "") }, [
        el("span", { class: "top3-rank", text: i === 0 ? "가장 많이" : (i + 1) + "순위" }),""")

patch(HTML, "Top 3 안내 문구",
"""<p class="top3-lead">받는 지원금 합계(현금)가 큰 순서입니다. 복직 후 월급은 넣지 않은 값이에요.</p>""",
"""<p class="top3-lead">세 가지 기준으로 고른 복직 시점이에요. 금액은 아이 35개월까지 받는 지원금(현금) 합계이고, 복직 후 월급은 넣지 않았어요.</p>""")


# =====================================================================
# 실행
# =====================================================================
# =====================================================================
# 협업자 11/10 카드형 Top 3 화면 대응: 카드 디자인은 그대로 두고 내용만 테마별 추천으로
#   (목록형 화면이면 위 패치, 카드형 화면이면 아래 패치 중 하나가 적용됨)
# =====================================================================
for _i, (_p, _d, _o, _n, _r) in enumerate(PATCHES):
    if _d == "Top 3: 테마별 추천으로 교체":
        PATCHES[_i] = (_p, _d + " (목록형 화면)", _o, _n, False)
patch(UI, "Top 3: 테마별 추천으로 교체 (카드형 화면)",
"""  function renderTop3(m) {
    const box = $("top3-list");
    clear(box);
    if (!m.simOn || !m.curve) return;
    if (m.curve.every(function (p) { return p.cash === m.curve[0].cash; })) {
      box.appendChild(el("li", { class: "top3-flat", text: "복직 시점을 옮겨도 받는 지원금 합계가 같아서 순위를 매기지 않았어요." }));
      return;
    }
    const sorted = m.curve.slice().sort(function (a, b) { return b.cash - a.cash || a.age - b.age; });
    const seen = {};
    const top = [];
    sorted.forEach(function (p) {
      if (top.length >= 3 || seen[p.cash]) return;
      seen[p.cash] = true;
      top.push(p);
    });
    const baseRow = m.curve.find(function (p) { return p.age === state.baseAge; });
    const BADGE = ["가장 많이 · 1순위", "2순위 추천", "3순위 추천"];
    top.forEach(function (p, i) {
      /* 강조는 지금 고른 복직 시점과 같은 카드 하나뿐입니다 (1순위 고정 강조 없음) */
      const isSel = p.age === m.returnAge;
      let diffText = null;
      if (baseRow) {
        const d = p.cash - baseRow.cash;
        diffText = d === 0 ? "비교 기준과 같음" : (d > 0 ? "+" : "−") + won(Math.abs(d));
      }
      box.appendChild(el("li", {}, [el("button", {
        type: "button",
        class: "top3-card" + (isSel ? " is-selected" : ""),
        "aria-pressed": isSel ? "true" : "false",
        "aria-label": "아이 " + p.age + "개월 복직, 현금 약 " + won(p.cash) + (isSel ? ", 선택됨" : ", 이 시점 보기"),
        onclick: function () { slider.value = String(p.age); renderResults(false); }
      }, [
        el("span", { class: "top3-top" }, [
          el("span", { class: "top3-badge", text: BADGE[i] }),
          el("span", { class: "top3-state" }, isSel ? [icon(ICONS.check, "ico-sm"), "선택됨"] : ["이 시점 보기"])
        ]),
        el("strong", { class: "top3-age", text: "아이 " + p.age + "개월 복직" }),
        el("span", { class: "top3-when", text: approxMonthLabel(dateAtAge(p.age)) + " 예정" }),
        el("span", { class: "top3-bottom" }, [
          el("span", { class: "top3-cap", text: "35개월까지 현금 합계" }),
          el("span", { class: "top3-row" }, [
            el("span", { class: "top3-cash", text: "약 " + won(p.cash) }),
            diffText ? el("span", { class: "top3-diff", text: diffText }) : null
          ])
        ])
      ])]));
    });
  }
""",
"""  /* 복직 시점 Top 3 테마 (모두 계산값만 사용)
   *   1 실수령 극대화형: 아이 35개월까지 현금 합계가 가장 큰 시점 (같으면 더 이른 시점)
   *   2 경력·수익 균형형: 최대 합계의 90% 이상을 받으면서 가장 일찍 복직하는 시점
   *   3 집중 돌봄형: 아이 24개월(만 2세)까지 집에서 돌보는 시점 (이미 지났거나 겹치면 가장 늦은 시점) */
  function top3Themes(m) {
    const pts = m.curve;
    const max = pts.reduce(function (b, p) { return p.cash > b.cash ? p : b; }, pts[0]);
    const used = {};
    used[max.age] = true;
    let bal = null;
    pts.forEach(function (p) { if (!bal && !used[p.age] && p.cash >= max.cash * 0.9) bal = p; });
    if (!bal) pts.forEach(function (p) { if (!bal && !used[p.age]) bal = p; });
    if (bal) used[bal.age] = true;
    const target = m.age < 24 ? 24 : 35;
    let care = pts.find(function (p) { return p.age === target && !used[p.age]; }) || null;
    for (let i = pts.length - 1; !care && i >= 0; i -= 1) { if (!used[pts[i].age]) care = pts[i]; }
    return [
      { theme: "실수령 극대화형", p: max },
      bal ? { theme: "경력·수익 균형형", p: bal } : null,
      care ? { theme: "집중 돌봄형", p: care } : null
    ].filter(Boolean);
  }

  /* 테마 카드에 붙일 근거 (계산값): 금액 차이, 복직 시기 차이, 휴직 급여 개월, 특례, 집에서 돌보는 기간, 3월 신학기 */
  function themeFacts(m, t, max) {
    const pts = m.curve;
    const facts = [];
    if (t.p.age === max.age) {
      const gain = max.cash - pts[0].cash;
      facts.push(gain > 0 ? "바로 복직보다 현금 +" + won(gain) : "가장 많이 받는 시점");
    } else {
      facts.push(t.p.cash === max.cash ? "최대와 같은 금액" : "최대보다 현금 " + won(max.cash - t.p.cash) + " 적게");
      const gap = max.age - t.p.age;
      facts.push(gap > 0 ? gap + "개월 일찍 복직" : (-gap) + "개월 더 돌봄");
    }
    const s = Plan.monthlySchedule(CATALOG, m.answers, { today: TODAY, horizon: m.horizon, returnAge: t.p.age });
    const ls = leaveStats(s);
    if (ls && ls.count) facts.push("휴직 급여 " + ls.count + "개월");
    const lp = leaveProgram();
    const start = m.answers.leaveStartAge == null ? 0 : m.answers.leaveStartAge;
    if (lp && lp.timeline.leavePay.special && m.answers.wage && m.answers.spouseLeave === "yes" && start < lp.timeline.leavePay.special.withinChildMonths) facts.push("부모 함께 휴직 특례 반영");
    facts.push("집에서 " + (t.p.age - m.age) + "개월 돌봄");
    const mo = Number(dateAtAge(t.p.age).slice(5, 7));
    if (mo === 2 || mo === 3) facts.push("3월 신학기 어린이집 입소 시기");
    return facts;
  }

  function renderTop3(m) {
    const box = $("top3-list");
    clear(box);
    if (!m.simOn || !m.curve) return;
    if (m.curve.every(function (p) { return p.cash === m.curve[0].cash; })) {
      box.appendChild(el("li", { class: "top3-flat", text: "복직 시점을 옮겨도 받는 지원금 합계가 같아서 순위를 매기지 않았어요." }));
      return;
    }
    const themes = top3Themes(m);
    const max = themes[0].p;
    const baseRow = m.curve.find(function (p) { return p.age === state.baseAge; });
    themes.forEach(function (t, i) {
      const p = t.p;
      /* 강조는 지금 고른 복직 시점과 같은 카드 하나뿐입니다 (1순위 고정 강조 없음) */
      const isSel = p.age === m.returnAge;
      let diffText = null;
      if (baseRow) {
        const d = p.cash - baseRow.cash;
        diffText = d === 0 ? "비교 기준과 같음" : (d > 0 ? "+" : "−") + won(Math.abs(d));
      }
      box.appendChild(el("li", {}, [el("button", {
        type: "button",
        class: "top3-card" + (isSel ? " is-selected" : ""),
        "aria-pressed": isSel ? "true" : "false",
        "aria-label": (i + 1) + "순위 " + t.theme + ", 아이 " + p.age + "개월 복직, 현금 약 " + won(p.cash) + (isSel ? ", 선택됨" : ", 이 시점 보기"),
        onclick: function () { slider.value = String(p.age); renderResults(false); }
      }, [
        el("span", { class: "top3-top" }, [
          el("span", { class: "top3-badge", text: t.theme }),
          el("span", { class: "top3-state" }, isSel ? [icon(ICONS.check, "ico-sm"), "선택됨"] : ["이 시점 보기"])
        ]),
        el("strong", { class: "top3-age", text: "아이 " + p.age + "개월 복직" }),
        el("span", { class: "top3-when", text: approxMonthLabel(dateAtAge(p.age)) + " 예정" }),
        el("span", { class: "top3-when", text: themeFacts(m, t, max).join(" · ") }),
        el("span", { class: "top3-bottom" }, [
          el("span", { class: "top3-cap", text: "35개월까지 현금 합계" }),
          el("span", { class: "top3-row" }, [
            el("span", { class: "top3-cash", text: "약 " + won(p.cash) }),
            diffText ? el("span", { class: "top3-diff", text: diffText }) : null
          ])
        ])
      ])]));
    });
    /* 고른 복직 시점 기준 D-Day 준비 일정이 일정에 들어갔음을 알려 줌 (두 기능이 이어지는 지점) */
    const prep = m.evs.filter(function (e) { return e.type === "dday"; });
    if (prep.length) {
      box.appendChild(el("li", { class: "top3-flat" }, [
        "아이 " + m.returnAge + "개월 복직 기준 준비 일정 " + prep.length + "건(어린이집 대기·보육료 전환 등)을 일정에 넣었어요. ",
        el("button", { type: "button", class: "btn-ghost-sm", text: "일정에서 보기", onclick: function () { ui.calView = "grid"; ui.calKey = monthKey(prep[0].date); renderCalendar(ui.lastModel); goTo("sec-events", "#cal-detail"); } })
      ]));
    }
  }
""", required=False)


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

    _ui = texts.get(UI)
    if _ui is not None and "function top3Themes" not in _ui:
        problems.append(UI + ": Top 3 화면(renderTop3)이 목록형·카드형 어느 쪽과도 달라 테마 추천을 넣지 못함")

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
