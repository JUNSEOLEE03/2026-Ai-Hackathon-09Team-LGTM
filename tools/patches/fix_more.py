#!/usr/bin/env python3
"""
fix_more.py — 점검에서 나온 세 가지 정리
  ① 공고문 AI 분석 카드에 '개인정보 가린 PDF 받기' 버튼 (서버 /api/mask 사용, AI에 보내지 않음, 새 CSS 없음)
  ② 오류 안내가 화면에 없는 '샘플 버튼'을 가리키던 문장 고치기
  ③ 휴대폰처럼 좁은 화면에서 상단 바가 결과 화면의 섹션 메뉴를 가리던 문제
     (상단 바의 실제 높이만큼 섹션 메뉴를 내리고, 메뉴로 이동할 때도 그만큼 띄움. PC 화면은 그대로)

사용법 (EC2):  cd ~/wonju-on-cloud/backend && python3 fix_more.py
두 번 실행해도 안전하고, 고칠 곳을 모두 찾은 뒤에만 파일을 바꿉니다.
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
UI = "static/js/plan-ui.js"
CSS = "static/css/plan.css"
HTML = "static/plan.html"
MAIN = "app/main.py"
PATCHES = []


def patch(path, desc, old, new):
    PATCHES.append((path, desc, old, new))


# ---------------------------------------------------------------- ① 개인정보 가린 PDF 받기
patch(UI, "개인정보 가리기 버튼 만들기",
"""    const urlBtn = el("button", { type: "button", class: "msg-act", text: "주소로 분석" });
""",
"""    const urlBtn = el("button", { type: "button", class: "msg-act", text: "주소로 분석" });
    const maskBtn = el("button", { type: "button", class: "msg-act", text: "개인정보 가린 PDF 받기" });
""")

patch(UI, "분석 중에는 개인정보 가리기 버튼도 잠그기",
"""      fileBtn.disabled = urlBtn.disabled = true;""",
"""      fileBtn.disabled = urlBtn.disabled = maskBtn.disabled = true;""")

patch(UI, "분석이 끝나면 개인정보 가리기 버튼도 풀기",
"""        fileBtn.disabled = urlBtn.disabled = false;""",
"""        fileBtn.disabled = urlBtn.disabled = maskBtn.disabled = false;""")

patch(UI, "개인정보 가리기: 고른 PDF를 /api/mask로 보내 가린 PDF 내려받기",
"""    urlBtn.addEventListener("click", goUrl);
""",
"""    /* 개인정보 가린 PDF 받기: 주민번호·전화번호·계좌번호를 검은 칸으로 가린 PDF를 돌려받아 내려받음 (AI에 보내지 않음) */
    maskBtn.addEventListener("click", function () {
      const f = fileIn.files && fileIn.files[0];
      if (!f) { show("개인정보를 가릴 PDF 파일을 먼저 골라 주세요.", "error"); fileIn.focus(); return; }
      if (!/\\.pdf$/i.test(f.name)) { show("개인정보 가리기는 PDF 파일만 할 수 있어요.", "error"); return; }
      if (f.size > DOC_MAX) { show("파일 용량이 너무 커요. 15MB 이하 파일만 올릴 수 있어요.", "error"); return; }
      if (busy) return;
      busy = true;
      fileBtn.disabled = urlBtn.disabled = maskBtn.disabled = true;
      show("PDF에서 개인정보를 찾아 가리고 있어요…", "loading");
      const body = new FormData();
      body.append("file", f, f.name);
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DOC_TIMEOUT);
      fetch("/api/mask", { method: "POST", body: body, signal: ctrl ? ctrl.signal : undefined }).then(function (res) {
        const type = res.headers.get("Content-Type") || "";
        if (res.ok && type.indexOf("application/pdf") >= 0) {
          const n = Number(res.headers.get("X-Masked-Count")) || 0;
          return res.blob().then(function (blob) {
            const url = URL.createObjectURL(blob);
            const a = el("a", { href: url, download: f.name.replace(/\\.pdf$/i, "") + "_개인정보가림.pdf" });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            show(n
              ? "개인정보 " + n + "곳을 가린 PDF를 내려받았어요. 열어서 빠진 곳이 없는지 꼭 확인하세요."
              : "가릴 개인정보를 찾지 못해 원본과 같은 PDF를 내려받았어요. 직접 확인해 주세요.", null);
          });
        }
        return res.json().catch(function () { return null; }).then(function (data) {
          throw new Error(data && data.user_message ? data.user_message : "개인정보를 가리지 못했어요. (HTTP " + res.status + ")");
        });
      }).catch(function (e) {
        show(e && e.name === "AbortError" ? "처리가 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."
          : e instanceof TypeError ? "서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요."
          : e.message, "error");
      }).then(function () {
        clearTimeout(timer);
        busy = false;
        fileBtn.disabled = urlBtn.disabled = maskBtn.disabled = false;
      });
    });
    urlBtn.addEventListener("click", goUrl);
""")

patch(UI, "공고문 분석 카드에 개인정보 가리기 버튼과 안내 넣기",
"""      el("div", { class: "chat-form" }, [urlIn, urlBtn])
    ]));
    box.appendChild(status);""",
"""      el("div", { class: "chat-form" }, [urlIn, urlBtn])
    ]));
    box.appendChild(el("div", { class: "msg-acts" }, [maskBtn]));
    box.appendChild(el("p", { class: "muted", text: "신청서처럼 개인정보가 들어 있는 PDF는 분석 대신 '개인정보 가린 PDF 받기'를 누르세요. 주민번호·전화번호·계좌번호를 검은 칸으로 가린 PDF를 내려받아요. AI에 보내지 않고 서버에서 바로 처리하며 저장하지 않아요." }));
    box.appendChild(status);""")

patch(HTML, "꼬리말 개인정보 안내: 개인정보 가리기 PDF 처리 방식",
"""공고문 AI 분석에 올린 공고문·주소만 서버 AI로 보내며 서버에 저장하지 않습니다.</p>""",
"""공고문 AI 분석에 올린 공고문·주소만 서버 AI로 보내며 서버에 저장하지 않습니다. 개인정보 가리기에 올린 PDF는 AI에 보내지 않고 서버에서 바로 처리하며 저장하지 않습니다.</p>""")

# ---------------------------------------------------------------- ② 오류 안내 문장
patch(MAIN, "오류 안내: 화면에 없는 샘플 버튼 대신 다시 시도 안내",
"""DEFAULT_SUGGESTION = "화면 상단의 '원주시 대표 복지 공고문 샘플' 버튼을 눌러 바로 체험해 보실 수 있어요!\"""",
"""DEFAULT_SUGGESTION = "잠시 후 다시 시도하거나, 다른 공고문 파일(PDF·HWP)이나 공고 페이지 주소로 시도해 보세요.\"""")

# ---------------------------------------------------------------- ③ 좁은 화면의 상단 바 겹침
patch(UI, "좁은 화면: 상단 바 높이를 재서 섹션 메뉴 위치와 이동 위치에 반영",
"""  function quickScrollTo(targetEl, exactTop) {
    if (!targetEl) return;
    const headerOffset = exactTop ? 0 : 76;""",
"""  /* 좁은 화면(1100px 미만)에서는 상단 바가 두 줄이 되고 섹션 메뉴도 위에 붙어 있으므로, 실제 높이만큼 띄움 (PC는 그대로 76px) */
  function syncTopHeight() {
    const top = document.querySelector(".top");
    if (top) document.documentElement.style.setProperty("--top-h", Math.ceil(top.getBoundingClientRect().height) + "px");
  }
  syncTopHeight();
  window.addEventListener("resize", syncTopHeight);

  function stickyOffset() {
    if (window.innerWidth >= 1100) return 76;
    const top = document.querySelector(".top");
    const side = document.querySelector(".r-side");
    const res = document.getElementById("results");
    let h = top ? top.getBoundingClientRect().height : 76;
    if (side && res && !res.hidden) h += side.getBoundingClientRect().height;
    return Math.ceil(h) + 8;
  }

  function quickScrollTo(targetEl, exactTop) {
    if (!targetEl) return;
    const headerOffset = exactTop ? 0 : stickyOffset();""")

patch(CSS, "좁은 화면: 섹션 메뉴를 상단 바 바로 아래에 붙이기",
"""@media (max-width: 860px) { .top3-list { grid-template-columns: minmax(0, 1fr); } }""",
"""@media (max-width: 860px) { .top3-list { grid-template-columns: minmax(0, 1fr); } }

/* 좁은 화면: 상단 바가 두 줄이 되어도 결과 화면의 섹션 메뉴가 가려지지 않게 (높이는 plan-ui.js가 --top-h로 알려 줌) */
@media (max-width: 1099px) {
  .r-side { top: var(--top-h, 84px); }
}""")


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
    for path in {p for p, _ in planned}:
        out = texts[path].replace("\n", "\r\n") if crlf[path] else texts[path]
        with open(os.path.join(BASE, path), "w", encoding="utf-8", newline="") as f:
            f.write(out)
    print(f"완료: {len(planned)}곳 수정. 서버를 다시 켜고(main.py가 바뀜) 브라우저에서 Ctrl+Shift+R 하세요.")


if __name__ == "__main__":
    main()
