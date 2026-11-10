#!/usr/bin/env python3
"""
fix_errcolor.py — 공고문 AI 분석·개인정보 가리기의 오류 안내를 눈에 띄게
  ("복지 공고문이 아닌 것 같아요…"처럼 실패했을 때만 진한 빨간 굵은 글씨, 진행 중 안내는 그대로)

사용법 (EC2):  cd ~/wonju-on-cloud/backend && python3 fix_errcolor.py   (두 번 실행해도 안전)
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PATCHES = [
    ("static/js/plan-ui.js", "오류일 때만 안내 글에 is-error 표시",
     '      status.className = "msg-note"; // 진행·오류 모두 기존 안내 글 모양 (문장으로 구분)',
     '      status.className = "msg-note" + (kind === "error" ? " is-error" : ""); // 오류만 진하게, 진행 안내는 기존 모양'),
    ("static/css/plan.css", "오류 안내 글: 진한 빨간 굵은 글씨",
     "@media (max-width: 1099px) {\n  .r-side { top: var(--top-h, 84px); }\n}",
     "@media (max-width: 1099px) {\n  .r-side { top: var(--top-h, 84px); }\n}\n\n"
     "/* 공고문 AI 분석·개인정보 가리기가 실패했을 때 안내 (진행 중 안내는 기존 연한 글씨 그대로) */\n"
     ".msg-note.is-error { color: var(--danger-text, #B93A3A); font-weight: 700; }"),
]


def main():
    texts, crlf, planned, problems = {}, {}, [], []
    for path, desc, old, new in PATCHES:
        if path not in texts:
            full = os.path.join(BASE, path)
            if not os.path.exists(full):
                print(f"멈춤 — 파일이 없습니다: {path}  (~/wonju-on-cloud/backend 에서 실행하세요)")
                sys.exit(1)
            raw = open(full, encoding="utf-8", newline="").read()
            crlf[path] = "\r\n" in raw
            texts[path] = raw.replace("\r\n", "\n")
        t = texts[path]
        if new in t:
            print(f"  · 이미 고쳐져 있음 — {desc}")
            continue
        if t.count(old) != 1:
            problems.append(f"{path}: 원래 문장을 못 찾음 — {desc} (fix_more.py를 먼저 적용했는지 확인)")
            continue
        texts[path] = t.replace(old, new)
        planned.append((path, desc))
    if problems:
        print("멈춤 — 파일을 하나도 바꾸지 않았습니다.")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    for path in {p for p, _ in planned}:
        out = texts[path].replace("\n", "\r\n") if crlf[path] else texts[path]
        open(os.path.join(BASE, path), "w", encoding="utf-8", newline="").write(out)
    for p, d in planned:
        print(f"  ✓ {p}  {d}")
    print(f"완료: {len(planned)}곳 수정. 브라우저에서 Ctrl+Shift+R 하세요. (서버 재시작은 필요 없어요)")


if __name__ == "__main__":
    main()
