#!/usr/bin/env python3
"""
ai_screen.py — AI 비서 답의 금액을 화면 계산과 맞추기

  화면(규칙 엔진)이 계산한 이번 달 금액·일시금·혜택 목록·합계에서 뺀 제도를 /api/chat에 함께 보내고,
  서버 AI는 그 숫자로만 답합니다. 예전처럼 서버의 4개 제도 목록으로 다시 계산하지 않아서
  "AI 기준 합계"와 "화면 계산"이 달라지는 문제가 없어집니다.
  (screen 값이 없는 요청, 예: 예전 화면은 기존 방식 그대로 동작)

사용법 (EC2)
    cd ~/wonju-on-cloud/backend
    python3 ai_screen.py --check   # 찾기만
    python3 ai_screen.py           # 적용 (고칠 곳을 모두 찾은 뒤에만 파일을 바꿈, 두 번 실행해도 안전)
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
CHECK_ONLY = "--check" in sys.argv
UI = "static/js/plan-ui.js"
HTML = "static/plan.html"
MAIN = "app/main.py"
PATCHES = []


def patch(path, desc, old, new):
    PATCHES.append((path, desc, old, new))


# ---------------------------------------------------------------- 화면
patch(UI, "화면 계산 결과를 서버 AI에 넘길 묶음 만들기",
"""  function askServerAi(text) {
""",
"""  /* 화면이 규칙 엔진으로 계산한 금액과 혜택 목록 (서버 AI는 이 숫자로만 답함 → 화면과 AI 금액 일치) */
  function screenFacts() {
    const m = ui.lastModel;
    if (!m || !m.sched || !m.sched.months.length) return null;
    const m0 = m.sched.months[0];
    return {
      child_months: m.age,
      return_age: m.simOn ? m.returnAge : null,
      this_month_cash: m0.cash,
      this_month_voucher: m0.voucher || 0,
      lump_total: m.sched.lumpTotal || 0,
      cash_total_35: m.sched.cashTotal,
      matched: payRows(m0, m.sched.lumps).map(function (r) { return { title: r.name, amount_text: r.label + " " + won(r.amount) }; }),
      check: (m.excluded || []).map(function (e) { return { title: e.name, reason: e.reason }; })
    };
  }

  function askServerAi(text) {
""")

patch(UI, "서버 AI 요청에 화면 계산 결과 함께 보내기",
"""      body: JSON.stringify({ message: "우리 가족 상황: " + summaryText() + "\\n질문: " + text }),""",
"""      body: JSON.stringify({ message: "우리 가족 상황: " + summaryText() + "\\n질문: " + text, screen: screenFacts() }),""")

patch(UI, "AI 비서 안내: 보내는 내용에 화면 계산 금액 추가",
"""우리 집 조건 요약과 질문만 보내고, 서버에 저장하지 않아요.""",
"""우리 집 조건 요약, 화면에서 계산한 금액과 질문만 보내고, 서버에 저장하지 않아요.""")

patch(UI, "AI 답: 화면 숫자로 답했으면 'AI 기준 합계' 줄 생략",
"""    if (data.total_monthly || data.total_once) {
      box.appendChild(el("p", { class: "msg-sum" }, [
        "AI 기준 합계 ",""",
"""    if (data.source !== "screen" && (data.total_monthly || data.total_once)) {
      box.appendChild(el("p", { class: "msg-sum" }, [
        "AI 기준 합계 ",""")

patch(UI, "AI 답: 화면 숫자로 답했으면 '두 금액이 달라요' 안내 생략",
"""      if ((Number(data.total_monthly) || 0) !== cash0) {""",
"""      if (data.source !== "screen" && (Number(data.total_monthly) || 0) !== cash0) {""")

patch(HTML, "꼬리말 개인정보 안내: 화면 계산 금액도 보냄",
"""AI 비서가 규칙으로 답하지 못한 질문(조건 요약 포함)과""",
"""AI 비서가 규칙으로 답하지 못한 질문(조건 요약과 화면 계산 금액 포함)과""")

# ---------------------------------------------------------------- 서버
patch(MAIN, "/api/chat 요청에 screen(화면 계산 결과) 받기",
"""class ChatRequest(BaseModel):
    message: str
""",
"""class ChatRequest(BaseModel):
    message: str
    screen: Optional[Dict[str, Any]] = None   # 화면(규칙 엔진)이 계산한 금액·혜택 목록
""")

patch(MAIN, "화면 숫자로만 답하는 함수",
"""@app.post("/api/chat")
""",
"""def _int0(v) -> int:
    try:
        return max(0, min(int(float(v)), 10 ** 10))
    except (TypeError, ValueError):
        return 0


def _won(n: int) -> str:
    # 화면과 같은 표기: 3105000 → 310.5만 원, 1000000 → 100만 원
    if n >= 10000:
        v = round(n / 10000, 1)
        return (f"{v:,.0f}" if v == int(v) else f"{v:,.1f}") + "만 원"
    return f"{n:,}원"


def chat_with_screen_numbers(message: str, screen: dict) -> dict:
    \"\"\"[/api/chat + screen] 화면(규칙 엔진)이 계산한 금액·혜택 목록만으로 답변.
    서버에서 금액을 다시 계산하지 않으므로 화면과 AI 답의 금액이 항상 같음.\"\"\"
    def pick(key, field):
        out = []
        for it in (screen.get(key) or [])[:20]:
            if isinstance(it, dict):
                out.append({"title": str(it.get("title", ""))[:80], field: str(it.get(field, ""))[:240]})
        return out

    matched = pick("matched", "amount_text")
    check = pick("check", "reason")
    ra = screen.get("return_age")
    facts = {
        "아이_개월": _int0(screen.get("child_months")),
        "복직_시점_아이_개월": _int0(ra) if ra is not None else "복직 계획 없음 또는 이미 복직",
        "이번_달_현금": _int0(screen.get("this_month_cash")),
        "이번_달_바우처": _int0(screen.get("this_month_voucher")),
        "일시금_합계": _int0(screen.get("lump_total")),
        "아이_35개월까지_현금_합계": _int0(screen.get("cash_total_35")),
        "이번_달_받는_혜택": matched,
        "합계에서_뺀_제도와_이유": check,
    }
    system = (
        "당신은 원주시 육아 혜택 안내 상담원입니다. 아래 [화면 계산 결과]는 공식 자료로 만든 규칙 엔진이 계산한 값입니다. "
        "이 결과에 있는 제도 이름과 금액만 그대로 사용해 사용자의 질문에 3~5문장의 쉬운 존댓말로 답하세요. "
        "금액을 새로 계산하거나 더하거나 바꾸지 말고, 결과에 없는 제도·금액·날짜는 절대 만들지 마세요. "
        "결과로 답할 수 없는 질문이면 그렇다고 말하고 담당 기관 확인을 권하세요."
    )
    user = f"[사용자 질문]\\n{message}\\n\\n[화면 계산 결과]\\n{json.dumps(facts, ensure_ascii=False)}"
    try:
        reply = call_llm(system, user, 0.1, 700)
    except Exception:
        logger.exception("chat(screen) llm failed")
        reply = (f"화면 계산으로는 이번 달 현금 {_won(facts['이번_달_현금'])}"
                 + (f", 일시금 {_won(facts['일시금_합계'])}" if facts["일시금_합계"] else "")
                 + "을 받을 수 있어요. 자세한 내용은 화면의 한눈에 보기와 월별 지급 내역을 확인해 주세요.")
    return {
        "status": "success",
        "source": "screen",
        "reply": reply,
        "matched": matched,
        "check": check,
        "total_monthly": facts["이번_달_현금"],
        "total_once": facts["일시금_합계"],
        "extracted_profile": None,
        "disclaimer": "금액은 화면의 규칙 엔진이 계산한 예상치예요. 정확한 지급 여부는 담당 부서에서 확인해 주세요.",
    }


@app.post("/api/chat")
""")

patch(MAIN, "/api/chat: 화면 계산 결과가 오면 그 숫자로 답하기",
"""            return await run_in_threadpool(chat_with_welfare_bot, req.message[:2000], load_welfare_catalog())""",
"""            if req.screen:
                return await run_in_threadpool(chat_with_screen_numbers, req.message[:2000], req.screen)
            return await run_in_threadpool(chat_with_welfare_bot, req.message[:2000], load_welfare_catalog())""")


def main():
    texts, crlf = {}, {}
    for path, *_ in PATCHES:
        if path in texts:
            continue
        full = os.path.join(BASE, path)
        if not os.path.exists(full):
            print(f"멈춤 — 파일이 없습니다: {path}  (~/wonju-on-cloud/backend 에서 실행하세요)")
            sys.exit(1)
        with open(full, encoding="utf-8", newline="") as f:
            raw = f.read()
        crlf[path] = "\r\n" in raw
        texts[path] = raw.replace("\r\n", "\n")
    for need, msg in ((MAIN, "import json"), (MAIN, "logger = "), (UI, "function payRows")):
        if msg not in texts[need]:
            print(f"멈춤 — {need}에 '{msg}'가 없습니다. 파일을 하나도 바꾸지 않았습니다.")
            sys.exit(1)

    planned, skipped, problems = [], [], []
    for path, desc, old, new in PATCHES:
        t = texts[path]
        if new in t:
            skipped.append(f"{path}: 이미 고쳐져 있음 — {desc}")
            continue
        n = t.count(old)
        if n == 1:
            texts[path] = t.replace(old, new)
            planned.append((path, desc))
        else:
            problems.append(f"{path}: {'원래 문장을 못 찾음' if n == 0 else f'같은 문장이 {n}곳'} — {desc}")

    print("고칠 곳")
    for p, d in planned:
        print(f"  ✓ {p}  {d}")
    if skipped:
        print("건너뜀")
        for s in skipped:
            print(f"  · {s}")
    if problems:
        print("멈춤 — 파일을 하나도 바꾸지 않았습니다.")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    if CHECK_ONLY:
        print("--check: 찾기만 하고 바꾸지 않았습니다.")
        return
    for path in {p for p, _ in planned}:
        out = texts[path].replace("\n", "\r\n") if crlf[path] else texts[path]
        with open(os.path.join(BASE, path), "w", encoding="utf-8", newline="") as f:
            f.write(out)
    print(f"완료: {len(planned)}곳 수정. 서버를 다시 켜고(main.py가 바뀜) 브라우저에서 Ctrl+Shift+R 하세요.")


if __name__ == "__main__":
    main()
